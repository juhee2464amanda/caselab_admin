import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { callModel } from '@/lib/ai-draft';
import { extractJson } from '@/lib/claude-cli';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Hobby 한도 300 초과 시 배포가 조용히 실패한다 (admin-prod-deploy 참고)
export const maxDuration = 60;

// 자료실(프롬프트·가이드·도구) 썸네일 후보 찾기.
// 제목·설명을 AI가 "사진으로 찍을 수 있는 장면"의 영문 검색어로 바꾸고 Unsplash에서 후보를 모은다.
// 프롬프트·가이드는 캡처할 공식 사이트가 없어서 suggest-images(사이트 크롤) 경로를 쓸 수 없다 — 이 라우트가 그 빈자리를 메운다.
// AI 호출이 실패해도(키 없음·CLI 없음·타임아웃) 제목에서 뽑은 검색어로 계속 진행한다.

const CATEGORY_HINT: Record<string, string> = {
  prompt: 'AI 프롬프트(복사해서 바로 쓰는 지시문) 자료',
  guide: 'AI 활용 가이드 문서',
  tool: 'AI 도구 소개',
  'context-card': 'AI 맥락 카드',
};

const SYSTEM = `당신은 콘텐츠 편집자를 돕는 이미지 리서처입니다.
한국어 자료의 제목·설명을 읽고, 그 자료의 목록 카드 썸네일로 쓸 **스톡 사진 검색어(영어)**를 만듭니다.

검색어 규칙:
- 추상 개념이 아니라 **카메라로 찍을 수 있는 장면**으로. (나쁨: "productivity", "AI automation" / 좋음: "person writing in notebook at desk", "hands typing on laptop in cafe")
- 글자·UI 스크린샷·로고가 화면을 채우는 사진은 피할 것. 썸네일 위에 제목이 겹쳐 나오므로 여백이 있는 장면이 좋다.
- 자료의 주제(무엇을 하는 프롬프트인지)와 정서를 담되, 특정 브랜드명·제품명은 넣지 않는다.
- 서로 다른 각도로 4개. (예: 사람 동작 / 도구·사물 클로즈업 / 작업 공간 전경 / 분위기·질감)

브랜드 카드용 문구:
- cardTitle: 사진 대신 쓸 타이포 카드에 넣을 한국어 한 줄. 제목을 6~16자로 압축(문장부호 없이).
- cardLabel: 그 위에 붙일 짧은 분류 라벨(2~6자, 예: 프롬프트 · 가이드 · 정리하기).

이미지 생성용:
- aiPrompt: 같은 장면을 이미지 생성 모델에 줄 영문 프롬프트 한 문장(사진 스타일, 차분한 자연광, 텍스트 없음).

아래 JSON만 출력하세요(설명·코드펜스 없이):
{"queries":["...","...","...","..."],"cardTitle":"...","cardLabel":"...","aiPrompt":"..."}`;

interface Suggestion {
  queries: string[];
  cardTitle: string;
  cardLabel: string;
  aiPrompt: string;
}

/** AI 없이도 후보를 뽑기 위한 폴백 — 제목에서 라틴 단어만 건져 일반적인 작업 장면 검색어로. */
function fallbackSuggestion(name: string, category: string): Suggestion {
  const latin = (name.match(/[A-Za-z][A-Za-z0-9+.-]{1,}/g) ?? []).slice(0, 2).join(' ');
  const base = latin ? `${latin} workspace` : 'desk workspace';
  return {
    queries: [base, 'person writing in notebook', 'hands typing on laptop', 'minimal calm workspace'],
    cardTitle: name.slice(0, 16),
    cardLabel: category === 'guide' ? '가이드' : category === 'tool' ? '도구' : '프롬프트',
    aiPrompt: `A calm natural-light photograph of a tidy desk workspace, soft shadows, no text`,
  };
}

/** Unsplash 검색 — 키가 없으면 빈 배열 + 안내(cardpress/unsplash와 같은 폴백 규약). */
async function searchUnsplash(query: string, perPage: number) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape&content_filter=high`,
    { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(12_000) }
  );
  if (!res.ok) throw new Error(`Unsplash ${res.status}`);
  const data = (await res.json()) as {
    results: Array<{
      id: string;
      alt_description: string | null;
      urls: { raw: string };
      links: { download_location: string };
      user: { name: string; links: { html: string } };
    }>;
  };
  return data.results.map((r) => ({
    id: r.id,
    query,
    alt: r.alt_description ?? '',
    // 목록 카드·히어로는 가로 이미지 — 미리보기는 작게, 반영용은 1200×750(16:10)로 크롭해서 받는다
    thumb: `${r.urls.raw}&w=400&h=250&fit=crop&fm=jpg&q=70`,
    full: `${r.urls.raw}&w=1200&h=750&fit=crop&fm=jpg&q=80`,
    credit: r.user.name,
    creditLink: r.user.links.html,
    // Unsplash API 약관 — 실제로 채택할 때 이 주소를 한 번 호출해야 한다(/api/admin/unsplash-track)
    downloadLocation: r.links.download_location,
  }));
}

export async function POST(req: NextRequest) {
  const devBypass =
    process.env.NODE_ENV !== 'production' && req.headers.get('x-admin-dev') === '1';
  if (!devBypass) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const input = (await req.json()) as {
    name?: string;
    description?: string;
    category?: string;
    promptCategory?: string;
    /** 프롬프트 전문 앞부분 — 무슨 일을 시키는 프롬프트인지 파악용 */
    prompt?: string;
    /** 사용자가 직접 고친 검색어. 있으면 AI 단계를 건너뛴다(재검색). */
    queries?: string[];
  };
  const name = (input.name ?? '').trim();
  if (!name && !input.queries?.length) {
    return NextResponse.json({ error: '제목을 먼저 입력해 주세요.' }, { status: 400 });
  }

  // ── 1. 검색어 (사용자 지정 > AI > 폴백)
  let suggestion: Suggestion;
  let aiNotice: string | null = null;
  const manual = (input.queries ?? []).map((q) => q.trim()).filter(Boolean);
  if (manual.length) {
    suggestion = { ...fallbackSuggestion(name, input.category ?? 'prompt'), queries: manual.slice(0, 6) };
  } else {
    try {
      const raw = await callModel(
        SYSTEM,
        `[자료 종류] ${CATEGORY_HINT[input.category ?? 'prompt'] ?? input.category ?? ''}${
          input.promptCategory ? ` (분류: ${input.promptCategory})` : ''
        }
[제목] ${name}
[설명] ${(input.description ?? '').slice(0, 600) || '(없음)'}
[프롬프트 전문 일부] ${(input.prompt ?? '').slice(0, 800) || '(없음)'}`,
        // 웹 리서치 불필요 — 제목·설명만 읽고 검색어로 바꾸는 작업이라 가볍고 빠르게.
        { allowedTools: [], model: 'sonnet', effort: 'low', timeoutMs: 45_000 }
      );
      const parsed = JSON.parse(extractJson(raw)) as Partial<Suggestion>;
      const fb = fallbackSuggestion(name, input.category ?? 'prompt');
      suggestion = {
        queries: (parsed.queries ?? []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 6),
        cardTitle: parsed.cardTitle?.trim() || fb.cardTitle,
        cardLabel: parsed.cardLabel?.trim() || fb.cardLabel,
        aiPrompt: parsed.aiPrompt?.trim() || fb.aiPrompt,
      };
      if (!suggestion.queries.length) suggestion.queries = fb.queries;
    } catch (e) {
      suggestion = fallbackSuggestion(name, input.category ?? 'prompt');
      aiNotice = `AI 검색어 생성을 건너뛰었어요 (${(e as Error).message.slice(0, 80)}) — 아래 검색어를 직접 고쳐서 다시 찾아보세요.`;
    }
  }

  // ── 2. Unsplash 검색 (검색어별로 나눠 담아 한 각도에 쏠리지 않게)
  if (!process.env.UNSPLASH_ACCESS_KEY) {
    return NextResponse.json({
      ...suggestion,
      results: [],
      notice: 'UNSPLASH_ACCESS_KEY 미설정 — 브랜드 카드 탭을 쓰거나 이미지를 직접 올려 주세요.',
      aiNotice,
    });
  }
  const perQuery = suggestion.queries.length > 3 ? 4 : 6;
  const settled = await Promise.allSettled(suggestion.queries.map((q) => searchUnsplash(q, perQuery)));
  const seen = new Set<string>();
  const results: NonNullable<Awaited<ReturnType<typeof searchUnsplash>>> = [];
  for (const s of settled) {
    if (s.status !== 'fulfilled' || !s.value) continue;
    for (const r of s.value) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      results.push(r);
    }
  }
  const failed = settled.filter((s) => s.status === 'rejected').length;

  return NextResponse.json({
    ...suggestion,
    results,
    aiNotice,
    notice: results.length
      ? failed
        ? `검색어 ${failed}개는 실패했어요 (Unsplash 오류·한도).`
        : null
      : '검색 결과가 없어요 — 검색어를 고쳐서 다시 찾아보세요.',
  });
}
