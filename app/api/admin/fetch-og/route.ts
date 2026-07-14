import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 북마크 블록용 — URL의 OG/메타 태그를 서버에서 긁어 제목·설명·썸네일·파비콘을 돌려준다.
// (브라우저는 CORS로 남의 사이트 HTML을 못 읽으므로 서버 경유)
function pick(html: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decode(m[1].trim());
  }
  return undefined;
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
    return new URL(u, base).toString();
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  try {
    // admin 검증
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { url } = (await req.json()) as { url?: string };
    if (!url || !/^https?:\/\//.test(url)) return NextResponse.json({ error: 'http(s) URL이 필요해요.' }, { status: 400 });

    let html = '';
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CaselabBot/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(8000),
      });
      html = (await res.text()).slice(0, 300_000); // head 위주, 과도한 본문 방지
    } catch {
      // fetch 실패 → URL만 반환(운영자가 수동 입력)
      return NextResponse.json({ url });
    }

    const title =
      pick(html, [/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i, /<title[^>]*>([^<]+)<\/title>/i]) ??
      undefined;
    const description = pick(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    ]);
    // 대표 이미지: og:image → twitter:image → 본문 첫 <img> → apple-touch-icon 순 폴백(노션식).
    let image = abs(
      pick(html, [
        /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      ]),
      url,
    );
    if (!image) {
      const firstImg = html.match(/<img[^>]+src=["']([^"']+\.(?:png|jpe?g|webp|gif)(?:\?[^"']*)?)["']/i);
      image = abs(firstImg?.[1], url);
    }
    if (!image) {
      image = abs(pick(html, [/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i]), url);
    }
    const siteName = pick(html, [/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i]);
    const favicon =
      abs(pick(html, [/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon)["']/i]), url) ??
      abs('/favicon.ico', url);

    return NextResponse.json({ url, title, description, image, siteName, favicon });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
