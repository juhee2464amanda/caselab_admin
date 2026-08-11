import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { runClaudeSubscription, extractJson } from '@/lib/claude-cli';
import { captureSources, cleanupCapture, type Candidate } from '@/lib/site-capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Hobby 한도 300 초과 시 배포가 조용히 실패한다 — 절대 올리지 말 것 (admin-prod-deploy 참고)
export const maxDuration = 300;

// 초안 기준 이미지 자동 채움(로컬 전용).
// 공식 사이트(랜딩+하위페이지)와 그 안에 박힌 이미지, 선택 시 외부 리뷰·문서까지 후보로 모아
// Claude(구독 CLI)가 직접 열어보고 기능과 매칭 → 채택된 것만 content-images 버킷에 업로드.
// Playwright·Claude CLI가 내 Mac에만 있으므로 Vercel에서는 400으로 막는다(③ 로컬 작업장 모델).

const BUCKET = 'content-images';

interface FeatureInput {
  title: string;
  desc?: string;
}

interface MatchResult {
  thumbnail: { candidate: number | null; useOg: boolean };
  features: { title: string; candidate: number | null; alt: string; caption: string }[];
}

/** OG 대표 이미지 URL만 최소로 추출 (fetch-og 라우트의 축약판 — 서버 내부용) */
async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CaselabBot/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
    });
    const html = (await res.text()).slice(0, 300_000);
    const m =
      html.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ??
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (!m?.[1]) return undefined;
    return new URL(m[1].trim(), url).toString();
  } catch {
    return undefined;
  }
}

/** 실사용 스크린샷이 실려 있을 만한 외부 페이지(리뷰·문서·튜토리얼)를 찾는다 */
async function findExternalPages(name: string, url: string): Promise<string[]> {
  try {
    const raw = await runClaudeSubscription({
      system: `당신은 리서치 어시스턴트입니다. 주어진 도구의 "실제 사용 화면 스크린샷"이 실려 있는 웹페이지를 찾습니다.

우선순위: 공식 문서/도움말 > 상세 리뷰 글·튜토리얼 > 소개 기사.
제외: 스크린샷 없이 글만 있는 페이지, 로그인이 필요한 페이지, 영상 전용 페이지(YouTube 등), 애그리게이터 목록 페이지.

WebSearch로 찾고 필요하면 WebFetch로 스크린샷 유무를 확인하세요.
아래 JSON만 출력하세요(설명 없이, 최대 3개):
{"urls": ["https://…", "https://…"]}`,
      prompt: `도구 이름: ${name}\n공식 사이트: ${url}\n\n이 도구의 실제 화면 스크린샷이 포함된 페이지를 찾아주세요.`,
      allowedTools: ['WebSearch', 'WebFetch'],
      model: 'opus',
      effort: 'low',
      timeoutMs: 120_000,
    });
    const parsed = JSON.parse(extractJson(raw)) as { urls?: string[] };
    const official = new URL(url).hostname.replace(/^www\./, '');
    return (parsed.urls ?? [])
      .filter((u) => /^https?:\/\//.test(u))
      // 공식 도메인은 이미 크롤했으므로 외부만
      .filter((u) => {
        try {
          return new URL(u).hostname.replace(/^www\./, '') !== official;
        } catch {
          return false;
        }
      })
      .slice(0, 3);
  } catch {
    return []; // 외부 탐색 실패는 치명적이지 않다 — 공식 후보만으로 진행
  }
}

/** PNG/JPEG/WebP 바이트를 공개 버킷에 올리고 공개 URL을 반환 (upload-image 라우트와 같은 규약) */
async function uploadBytes(bytes: Buffer, contentType: string) {
  const admin = createSupabaseAdminClient();
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const key = `content/ai-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(key, bytes, { contentType, upsert: false });
  if (error) throw new Error(`업로드 실패: ${error.message}`);
  return admin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

function contentTypeOf(file: string): string {
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

const MATCH_SYSTEM = `당신은 콘텐츠 운영 어시스턴트입니다. 도구 소개 콘텐츠의 각 기능에 맞는 이미지를 후보 중에서 고릅니다.

가장 중요한 기준 — **실제로 그 기능을 쓰는 화면**을 고르세요:
- 좋음: 제품 UI, 입력과 결과가 보이는 화면, 설정·대시보드·결과 리포트 등 기능이 실제로 동작하는 모습
- 나쁨: 히어로 카피만 큰 랜딩 상단, 가격표, 고객사 로고 나열, 장식용 일러스트, 다운로드 배너
- 마케팅 컷밖에 없다면 억지로 고르지 말고 null을 반환하세요.

그 외 규칙:
- 반드시 Read 도구로 후보 파일을 전부 열어 실제 화면을 확인하고 판단하세요. 파일명·라벨만으로 추측하지 마세요.
- 같은 후보를 여러 기능에 중복 배정하지 마세요(가장 잘 맞는 한 곳에만).
- 기능과 무관한 화면뿐이면 그 기능의 candidate는 null (억지 매칭 금지).
- 썸네일은 도구의 정체성이 한눈에 보이는 컷을 고르되, 후보가 모두 부적합하면 useOg=true.
- alt는 화면을 사실대로 묘사(한국어, 1문장), caption은 콘텐츠 독자용 짧은 설명(한국어).

아래 JSON 객체 하나만 출력하세요(설명 없이):
{
  "thumbnail": { "candidate": 0 | null, "useOg": false },
  "features": [ { "title": "기능 제목 그대로", "candidate": 2 | null, "alt": "…", "caption": "…" } ]
}`;

function buildMatchingPrompt(
  name: string,
  features: FeatureInput[],
  capture: { title: string; pageText: string; candidates: Candidate[] },
) {
  const list = capture.candidates
    .map((c) => `- candidate ${c.index}: ${c.path}\n    (${c.label} · ${c.kind === 'embedded' ? '페이지에 실린 이미지' : '페이지 캡처'})`)
    .join('\n');
  const featureList = features.length
    ? features.map((f, i) => `${i + 1}. ${f.title}${f.desc ? ` — ${f.desc}` : ''}`).join('\n')
    : '(기능 목록 없음 — 대표 화면만 골라주세요)';
  return `도구 이름: ${name}
사이트 제목: ${capture.title}

[기능 목록]
${featureList}

[이미지 후보]
${list}

[사이트 본문 발췌]
${capture.pageText.slice(0, 2000)}

위 후보 파일을 Read로 모두 열어 실제 내용을 확인한 뒤, 각 기능을 가장 잘 보여주는 후보를 고르세요.`;
}

export async function POST(req: NextRequest) {
  // 1. admin 검증 (upload-image와 동일 패턴)
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // 2. 로컬 전용 가드 — Playwright·Claude CLI는 내 Mac에만 있다
  if (process.env.VERCEL) {
    return NextResponse.json({ error: '이미지 채우기는 로컬 admin에서만 사용할 수 있어요.' }, { status: 400 });
  }

  const { url, name, features, includeExternal } = (await req.json()) as {
    url?: string;
    name?: string;
    features?: FeatureInput[];
    includeExternal?: boolean;
  };
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: '도구 공식 URL이 필요해요. 메타의 URL 필드를 먼저 채워주세요.' }, { status: 400 });
  }

  let captureDir: string | null = null;
  try {
    // 3. 외부 페이지 탐색(옵션) → OG + 공식/외부 캡처
    const externalPages = includeExternal ? await findExternalPages(name ?? '', url) : [];
    const [ogImage, capture] = await Promise.all([
      fetchOgImage(url),
      captureSources({ url, extraUrls: externalPages, maxCandidates: includeExternal ? 24 : 18 }),
    ]);
    captureDir = capture.dir;

    if (capture.candidates.length === 0) {
      return NextResponse.json({ error: '이미지 후보를 찾지 못했어요. 사이트가 로그인 뒤에만 화면을 보여주는 경우일 수 있어요.' }, { status: 422 });
    }

    // 4. Claude(구독 CLI)가 후보를 실제로 열어보고 기능과 매칭
    const raw = await runClaudeSubscription({
      system: MATCH_SYSTEM,
      prompt: buildMatchingPrompt(name ?? '', features ?? [], capture),
      allowedTools: ['Read'],
      model: 'opus',
      effort: 'medium',
      timeoutMs: 300_000,
    });
    const parsed = JSON.parse(extractJson(raw)) as MatchResult;

    // 5. 채택된 후보만 업로드 (하나가 여러 곳에 쓰여도 1회만)
    const wanted = new Set<number>();
    if (typeof parsed.thumbnail?.candidate === 'number') wanted.add(parsed.thumbnail.candidate);
    for (const f of parsed.features ?? []) if (typeof f.candidate === 'number') wanted.add(f.candidate);

    const uploaded = new Map<number, string>();
    for (const idx of wanted) {
      const cand = capture.candidates.find((c) => c.index === idx);
      if (!cand) continue;
      const bytes = await readFile(cand.path);
      uploaded.set(idx, await uploadBytes(bytes, contentTypeOf(cand.path)));
    }

    // 썸네일: 후보 선택이 없고 OG를 쓰라면 OG를 버킷으로 이관(외부 URL 수명 의존 제거)
    let thumbnail: { url: string; source: string } | null = null;
    if (typeof parsed.thumbnail?.candidate === 'number' && uploaded.has(parsed.thumbnail.candidate)) {
      const cand = capture.candidates.find((c) => c.index === parsed.thumbnail.candidate)!;
      thumbnail = { url: uploaded.get(parsed.thumbnail.candidate)!, source: cand.label };
    } else if (parsed.thumbnail?.useOg && ogImage) {
      try {
        const res = await fetch(ogImage, { signal: AbortSignal.timeout(8000) });
        const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim();
        if (res.ok && ['image/png', 'image/jpeg', 'image/webp'].includes(ct)) {
          thumbnail = { url: await uploadBytes(Buffer.from(await res.arrayBuffer()), ct), source: 'OG 이미지' };
        }
      } catch {
        /* OG 이관 실패 → 썸네일 후보 없이 반환 */
      }
    }

    const matches = (parsed.features ?? [])
      .filter((f) => typeof f.candidate === 'number' && uploaded.has(f.candidate!))
      .map((f) => {
        const cand = capture.candidates.find((c) => c.index === f.candidate)!;
        return {
          title: f.title,
          url: uploaded.get(f.candidate!)!,
          alt: f.alt ?? '',
          caption: f.caption ?? '',
          origin: cand.origin,
          sourceUrl: cand.sourceUrl,
          sourceLabel: cand.label,
        };
      });

    return NextResponse.json({
      ok: true,
      thumbnail,
      matches,
      stats: { candidates: capture.candidates.length, pages: capture.visited.length, external: externalPages.length },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    if (captureDir) await cleanupCapture(captureDir);
  }
}
