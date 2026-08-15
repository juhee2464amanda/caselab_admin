import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renderableImages } from '@/lib/cardpress/mapping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 카드뉴스 이미지 소스 확장 — Unsplash 스톡 말고 "이 콘텐츠의 원본"에서 사진을 찾는다.
// POST { sourceType, sourceId, url? }
//  · url을 주면 그 페이지만 긁는다 (운영자가 참고 링크를 직접 붙여넣는 경우)
//  · 안 주면 소스에 붙어 있는 원본 링크(씨앗 source_url · 콘텐츠 body.sources · 자료실 tool.url)를 찾아 긁는다
// → { images: [{url, from}], links: [{label,url}], notice }
//
// 왜 서버 경유: 브라우저는 CORS로 남의 사이트 HTML을 못 읽는다(=/api/admin/fetch-og와 같은 이유).
// WebP·AVIF는 Satori가 검게 렌더하므로 renderableImages()로 미리 걸러 낸다.

const MAX_IMAGES = 24;
const MAX_PAGES = 3;

/** 사설망·로컬 주소 차단 (관리자 전용 라우트지만 SSRF 통로를 열어두지 않는다) */
function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h === '::1' || h === '[::1]') return false;
  return true;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function abs(u: string | undefined, base: string): string | undefined {
  if (!u) return undefined;
  try {
    return new URL(decode(u.trim()), base).toString();
  } catch {
    return undefined;
  }
}

/** Next.js 이미지 최적화 URL(/_next/image?url=…)이면 원본으로 되돌린다 */
function unwrapNextImage(u: string): string {
  try {
    const parsed = new URL(u);
    if (!parsed.pathname.includes('/_next/image')) return u;
    const inner = parsed.searchParams.get('url');
    if (!inner) return u;
    return inner.startsWith('http') ? inner : new URL(inner, parsed.origin).toString();
  } catch {
    return u;
  }
}

// 로고·아이콘·추적 픽셀은 카드 배경으로 쓸 수 없다 — 경로 힌트로 미리 뺀다
const JUNK_RE = /(favicon|sprite|logo|icon|avatar|profile|emoji|badge|spacer|pixel|tracking|1x1|placeholder|loading|blank)/i;
const RASTER_RE = /\.(png|jpe?g)(\?|$)/i;

function usable(u: string): boolean {
  if (!/^https?:\/\//.test(u)) return false;
  if (JUNK_RE.test(u)) return false;
  if (/\.(svg|gif|ico|bmp)(\?|$)/i.test(u)) return false;
  // 폭 파라미터가 명시적으로 작으면 썸네일·아이콘 — 커버로 쓰기엔 해상도가 모자란다
  const m = u.match(/[?&](?:w|width)=(\d{1,4})/i);
  if (m && Number(m[1]) < 320) return false;
  return true;
}

/** 페이지 HTML에서 og:image + 본문 <img> 후보를 긁는다 */
async function scrapePage(pageUrl: string): Promise<{ images: string[]; error?: string }> {
  if (!isPublicHttpUrl(pageUrl)) return { images: [], error: '허용되지 않는 주소' };
  let html = '';
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CaselabBot/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return { images: [], error: `HTTP ${res.status}` };
    html = (await res.text()).slice(0, 600_000);
  } catch (e) {
    return { images: [], error: (e as Error).name === 'TimeoutError' ? '응답 없음(타임아웃)' : '불러오기 실패' };
  }

  const found: string[] = [];
  const push = (raw?: string) => {
    const a = abs(raw, pageUrl);
    if (a) found.push(unwrapNextImage(a));
  };

  // 1) 대표 이미지 — og:image / twitter:image (양쪽 속성 순서 모두)
  const metaRes = [
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["']/gi,
  ];
  for (const re of metaRes) for (const m of html.matchAll(re)) push(m[1]);

  // 2) 본문 이미지 — src / data-src(지연 로딩) / srcset의 마지막(가장 큰) 후보
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    const tag = m[0];
    const src = tag.match(/\s(?:data-src|data-original|src)=["']([^"']+)["']/i)?.[1];
    push(src);
    const srcset = tag.match(/\s(?:data-srcset|srcset)=["']([^"']+)["']/i)?.[1];
    if (srcset) {
      const last = srcset.split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean).pop();
      push(last);
    }
  }
  for (const m of html.matchAll(/<source[^>]+srcset=["']([^"']+)["']/gi)) {
    const last = m[1].split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean).pop();
    push(last);
  }

  // 확장자가 없는 CDN URL도 있어 raster 조건은 og 계열엔 강제하지 않는다
  const filtered = renderableImages(Array.from(new Set(found)).filter(usable));
  // png/jpg가 확실한 것 → 확장자 불명 순으로 (Satori가 확실히 그리는 것부터 보이게)
  filtered.sort((a, b) => Number(RASTER_RE.test(b)) - Number(RASTER_RE.test(a)));
  return { images: filtered };
}

/** 자유 텍스트(씨앗 raw_text 등)에서 이미지 URL 줍기 */
function imagesFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const urls = Array.from(text.matchAll(/https?:\/\/[^\s"'()<>]+\.(?:png|jpe?g)(?:\?[^\s"'()<>]*)?/gi)).map((m) => m[0]);
  return renderableImages(Array.from(new Set(urls)).filter(usable));
}

type Link = { label: string; url: string };

function collectRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** 소스에 붙어 있는 "원본 링크" 후보 */
async function sourceLinks(sourceType: string, sourceId: string): Promise<{ links: Link[]; textImages: string[]; error?: string }> {
  const admin = createSupabaseAdminClient();
  if (sourceType === 'seed') {
    const { data } = await admin
      .from('content_seeds')
      .select('source_url, raw_text')
      .eq('id', sourceId)
      .maybeSingle();
    if (!data) return { links: [], textImages: [], error: '씨앗을 찾을 수 없어요.' };
    const links: Link[] = [];
    if (data.source_url) links.push({ label: '씨앗 원본', url: data.source_url });
    // raw_text 안에 붙어 있는 링크도 후보 (수집 봇이 본문에 URL을 남긴다)
    for (const m of String(data.raw_text ?? '').matchAll(/https?:\/\/[^\s"'()<>]+/g)) {
      const u = m[0].replace(/[.,)]+$/, '');
      if (!/\.(png|jpe?g|webp|gif)(\?|$)/i.test(u) && !links.some((l) => l.url === u)) {
        links.push({ label: '본문 링크', url: u });
      }
    }
    return { links: links.slice(0, MAX_PAGES), textImages: imagesFromText(data.raw_text) };
  }

  if (sourceType === 'tool') {
    const { data } = await admin.from('tools').select('name, url, body').eq('id', sourceId).maybeSingle();
    if (!data) return { links: [], textImages: [], error: '자료를 찾을 수 없어요.' };
    const links: Link[] = [];
    if (data.url) links.push({ label: `${data.name} 공식 페이지`, url: data.url });
    const body = collectRecord(data.body);
    for (const s of Array.isArray(body.sources) ? body.sources : []) {
      const o = collectRecord(s);
      if (typeof o.url === 'string') links.push({ label: String(o.label ?? '출처'), url: o.url });
    }
    return { links: links.slice(0, MAX_PAGES), textImages: [] };
  }

  const { data } = await admin.from('contents').select('title, body').eq('id', sourceId).maybeSingle();
  if (!data) return { links: [], textImages: [], error: '콘텐츠를 찾을 수 없어요.' };
  const body = collectRecord(data.body);
  const links: Link[] = [];
  const fr = collectRecord(body.frameworkReference);
  if (typeof fr.sourceUrl === 'string') links.push({ label: String(fr.sourceTitle ?? '참고 원본'), url: fr.sourceUrl });
  for (const s of Array.isArray(body.sources) ? body.sources : []) {
    const o = collectRecord(s);
    if (typeof o.url === 'string') links.push({ label: String(o.label ?? '출처'), url: o.url });
  }
  return { links: links.slice(0, MAX_PAGES), textImages: [] };
}

export async function POST(req: NextRequest) {
  const devBypass =
    process.env.NODE_ENV !== 'production' && req.headers.get('x-cardpress-dev') === '1';
  if (!devBypass) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { sourceType, sourceId, url } = (await req.json().catch(() => ({}))) as {
    sourceType?: string;
    sourceId?: string;
    url?: string;
  };

  // ① 운영자가 링크를 직접 준 경우 — 그 페이지만 긁는다
  if (url) {
    if (!isPublicHttpUrl(url)) return NextResponse.json({ error: 'http(s) 공개 주소만 가능해요.' }, { status: 400 });
    const { images, error } = await scrapePage(url);
    return NextResponse.json({
      images: images.slice(0, MAX_IMAGES).map((u) => ({ url: u, from: new URL(url).hostname })),
      links: [],
      notice: error
        ? `${new URL(url).hostname}: ${error}`
        : images.length
          ? null
          : '이 페이지에서 쓸 만한 이미지를 못 찾았어요. (WebP·아이콘은 제외됩니다)',
    });
  }

  // ② 소스에 붙어 있는 원본 링크들을 찾아 긁는다
  if (!sourceId) return NextResponse.json({ error: 'sourceId 필요' }, { status: 400 });
  const { links, textImages, error } = await sourceLinks(sourceType ?? 'content', sourceId);
  if (error) return NextResponse.json({ error }, { status: 404 });

  const scraped = await Promise.all(links.map((l) => scrapePage(l.url).then((r) => ({ ...r, link: l }))));

  const seen = new Set<string>();
  const images: Array<{ url: string; from: string }> = [];
  for (const u of textImages) {
    if (seen.has(u)) continue;
    seen.add(u);
    images.push({ url: u, from: '본문' });
  }
  for (const s of scraped) {
    for (const u of s.images) {
      if (seen.has(u) || images.length >= MAX_IMAGES) continue;
      seen.add(u);
      images.push({ url: u, from: new URL(s.link.url).hostname });
    }
  }

  const failed = scraped.filter((s) => s.error).map((s) => `${new URL(s.link.url).hostname}: ${s.error}`);
  return NextResponse.json({
    images,
    links,
    notice: !links.length
      ? '이 소스엔 원본 링크가 없어요. 아래에 참고 링크를 직접 붙여넣어 주세요.'
      : images.length
        ? failed.length
          ? `일부 링크 실패 — ${failed.join(' · ')}`
          : null
        : failed.length
          ? `가져오지 못했어요 — ${failed.join(' · ')}`
          : '원본에서 쓸 만한 이미지를 못 찾았어요. (WebP·아이콘은 제외됩니다)',
  });
}
