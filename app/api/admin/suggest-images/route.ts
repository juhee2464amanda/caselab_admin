import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { runClaudeSubscription, extractJson } from '@/lib/claude-cli';
import { captureSite, cleanupCapture } from '@/lib/site-capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Hobby 한도 300 초과 시 배포가 조용히 실패한다 — 절대 올리지 말 것 (admin-prod-deploy 참고)
export const maxDuration = 300;

// 초안 기준 이미지 자동 채움(로컬 전용).
// 도구 공식 사이트를 캡처 → Claude(구독 CLI)가 기능 블록과 스크린샷을 매칭 →
// 선택된 컷만 content-images 버킷에 업로드 → 썸네일 후보 + 섹션용 이미지 목록 반환.
// Playwright·Claude CLI가 내 Mac에만 있으므로 Vercel에서는 400으로 막는다(③ 로컬 작업장 모델).

const BUCKET = 'content-images';

interface FeatureInput {
  title: string;
  desc?: string;
}

interface MatchResult {
  thumbnail: { shot: number | null; useOg: boolean };
  features: { title: string; shot: number | null; alt: string; caption: string }[];
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

/** PNG/JPEG 바이트를 공개 버킷에 올리고 공개 URL을 반환 (upload-image 라우트와 같은 규약) */
async function uploadBytes(bytes: Buffer, contentType: 'image/png' | 'image/jpeg' | 'image/webp') {
  const admin = createSupabaseAdminClient();
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `content/ai-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`업로드 실패: ${error.message}`);
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function buildMatchingPrompt(name: string, features: FeatureInput[], capture: { title: string; pageText: string; shots: { index: number; path: string; scrollY: number }[] }) {
  const shotList = capture.shots
    .map((s) => `- shot ${s.index}: ${s.path} (scrollY=${s.scrollY}${s.index === 0 ? ' · 페이지 최상단/히어로' : ''})`)
    .join('\n');
  const featureList = features.length
    ? features.map((f, i) => `${i + 1}. ${f.title}${f.desc ? ` — ${f.desc}` : ''}`).join('\n')
    : '(기능 목록 없음 — 대표 화면만 골라주세요)';
  return `도구 이름: ${name}
사이트 제목: ${capture.title}

[기능 목록]
${featureList}

[스크린샷 파일]
${shotList}

[사이트 본문 발췌]
${capture.pageText.slice(0, 2500)}

위 스크린샷 파일들을 Read 도구로 모두 열어 실제 내용을 확인한 뒤, 각 기능을 가장 잘 보여주는 스크린샷을 골라주세요.`;
}

const MATCH_SYSTEM = `당신은 콘텐츠 운영 어시스턴트입니다. 도구 소개 콘텐츠의 기능 설명에 맞는 스크린샷을 고릅니다.

규칙:
- 반드시 Read 도구로 스크린샷 파일을 전부 열어 실제 화면을 확인하고 판단하세요. 파일명·스크롤 위치만으로 추측하지 마세요.
- 기능과 실제로 관련된 화면이 없으면 그 기능의 shot은 null로 두세요(억지 매칭 금지).
- 같은 shot을 여러 기능에 중복 배정하지 마세요(가장 잘 맞는 한 곳에만).
- 썸네일은 도구의 정체성이 한눈에 보이는 컷(보통 히어로)을 고르되, 스크린샷이 모두 부적합하면 useOg=true.
- alt는 화면을 사실대로 묘사(한국어, 1문장), caption은 콘텐츠 독자용 짧은 설명(한국어).

아래 JSON 객체 하나만 출력하세요(설명 없이):
{
  "thumbnail": { "shot": 0 | null, "useOg": false },
  "features": [ { "title": "기능 제목 그대로", "shot": 2 | null, "alt": "…", "caption": "…" } ]
}`;

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

  const { url, name, features } = (await req.json()) as {
    url?: string;
    name?: string;
    features?: FeatureInput[];
  };
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: '도구 공식 URL이 필요해요. 메타의 URL 필드를 먼저 채워주세요.' }, { status: 400 });
  }

  let captureDir: string | null = null;
  try {
    // 3. OG 이미지 + 사이트 캡처 (병렬)
    const [ogImage, capture] = await Promise.all([fetchOgImage(url), captureSite(url)]);
    captureDir = capture.dir;

    // 4. Claude(구독 CLI)가 스크린샷을 실제로 열어 보고 기능과 매칭
    const raw = await runClaudeSubscription({
      system: MATCH_SYSTEM,
      prompt: buildMatchingPrompt(name ?? '', features ?? [], capture),
      allowedTools: ['Read'],
      model: 'opus',
      effort: 'medium',
      timeoutMs: 180_000,
    });
    const parsed = JSON.parse(extractJson(raw)) as MatchResult;

    // 5. 선택된 컷만 업로드 (shot 하나가 여러 곳에 쓰여도 1회만 업로드)
    const wanted = new Set<number>();
    if (typeof parsed.thumbnail?.shot === 'number') wanted.add(parsed.thumbnail.shot);
    for (const f of parsed.features ?? []) if (typeof f.shot === 'number') wanted.add(f.shot);

    const shotUrls = new Map<number, string>();
    for (const idx of wanted) {
      const shot = capture.shots.find((s) => s.index === idx);
      if (!shot) continue;
      const bytes = await readFile(shot.path);
      shotUrls.set(idx, await uploadBytes(bytes, 'image/png'));
    }

    // 썸네일: 스크린샷 선택이 없고 OG를 쓰라면 OG 이미지를 버킷으로 이관(외부 URL 수명 의존 제거)
    let thumbnailUrl: string | null = null;
    let thumbnailSource: 'shot' | 'og' | null = null;
    if (typeof parsed.thumbnail?.shot === 'number' && shotUrls.has(parsed.thumbnail.shot)) {
      thumbnailUrl = shotUrls.get(parsed.thumbnail.shot)!;
      thumbnailSource = 'shot';
    } else if (parsed.thumbnail?.useOg && ogImage) {
      try {
        const res = await fetch(ogImage, { signal: AbortSignal.timeout(8000) });
        const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim();
        if (res.ok && ['image/png', 'image/jpeg', 'image/webp'].includes(ct)) {
          thumbnailUrl = await uploadBytes(Buffer.from(await res.arrayBuffer()), ct as 'image/png');
          thumbnailSource = 'og';
        }
      } catch {
        /* OG 이관 실패 → 썸네일 후보 없이 반환 */
      }
    }

    const matches = (parsed.features ?? [])
      .filter((f) => typeof f.shot === 'number' && shotUrls.has(f.shot!))
      .map((f) => ({ title: f.title, url: shotUrls.get(f.shot!)!, alt: f.alt ?? '', caption: f.caption ?? '' }));

    return NextResponse.json({ ok: true, thumbnail: thumbnailUrl ? { url: thumbnailUrl, source: thumbnailSource } : null, matches });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    if (captureDir) await cleanupCapture(captureDir);
  }
}
