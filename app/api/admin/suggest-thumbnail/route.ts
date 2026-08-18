import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { callModel } from '@/lib/ai-draft';
import { extractJson } from '@/lib/claude-cli';
import { QUERY_LADDER_RULES, dropCliches, searchThumbnailPhotos, type PhotoCandidate } from '@/lib/image-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Hobby 한도 300 초과 시 배포가 조용히 실패한다 (admin-prod-deploy 참고)
export const maxDuration = 60;

// 자료실(프롬프트·가이드·도구) 썸네일 후보 찾기.
//
// 왜 별도 경로인가: /api/admin/suggest-images(이미지 채우기)는 "공식 사이트를 크롤해 실사용 화면을 찾는" 도구다.
// 프롬프트·가이드에는 캡처할 사이트가 없어서 랜딩 히어로·가격표 같은 무관한 컷이 썸네일로 올라온다.
// 여기서는 제목·설명·본문을 읽고 카드뉴스와 같은 검색어 사다리로 Unsplash 사진을 고른다.
//
// AI 호출이 실패해도(CLI 없음·타임아웃) 폴백 검색어로 계속 진행한다 — 검색어는 화면에서 고칠 수 있다.

const CATEGORY_HINT: Record<string, string> = {
  prompt: 'AI 프롬프트(복사해서 바로 쓰는 지시문)',
  guide: 'AI 활용 가이드 문서',
  tool: 'AI 도구 소개',
  'context-card': 'AI 맥락 카드',
};

const SYSTEM = `당신은 콘텐츠 편집자를 돕는 이미지 리서처입니다.
한국어 자료(프롬프트·가이드·도구 소개)의 제목·설명·본문을 읽고, 목록 카드 썸네일로 쓸 **스톡 사진 검색어(영어)**를 만듭니다.

[검색어 사다리 — 카드뉴스 커버와 같은 규칙]
${QUERY_LADDER_RULES}

[핵심 키워드를 고르는 법 — 여기서 대부분의 사고가 난다]
자료가 "무엇에 대한 것인지"를 찍어야지, "무엇으로 만들어졌는지"를 찍으면 안 됩니다.
- "회의록 정리 프롬프트" → 핵심 키워드는 프롬프트·AI가 아니라 **회의록**
- "맥 절전 방지 도구" → 도구·앱이 아니라 **잠들지 않는 화면/밤샘 작업**
- 프롬프트·AI·챗봇·자동화·도구 같은 **매체어를 핵심 키워드로 삼지 말 것**. 그걸로 검색하면
  홀로그램 로봇·회로 기판 같은 무관한 스톡이 나옵니다.

[치환표는 정답표가 아니라 예시입니다 — 여기서 사고가 가장 많이 납니다]
표의 항목을 그대로 베끼지 마세요. 실측하면 서로 다른 자료 3개가 전부 "steel chain macro",
"dark green matrix code"로 수렴합니다 — 자료마다 다른 그림이 나와야 목록이 구분됩니다.
- 표의 항목은 **그 개념이 이 자료의 중심일 때만** 씁니다. 아니면 핵심 키워드에 맞는 사물을 직접 고르세요.
- 검색어 4개는 **서로 다른 사물**이어야 합니다. (노트 → 노트 → 노트 금지)

[썸네일이라서 추가로 지키는 것]
- ❌ 추상어 검색 금지: productivity, workflow, automation, artificial intelligence, business,
  teamwork, innovation, technology, digital transformation — 악수하는 정장·홀로그램 그래픽이 나옵니다.
- ❌ AI 클리셰 금지: matrix code, binary code, circuit board, robot hand, glowing brain, hologram, neon data.
  AI를 다루는 자료라도 AI를 찍지 말고, 그 자료가 **해결하는 일**을 찍으세요.
- ❌ 화면 캡처·UI·로고·글자가 화면을 채우는 사진 금지 (카드가 작아 글자는 안 읽힙니다).
- ❌ 정면 얼굴 금지. 사람이 필요하면 뒷모습·손·실루엣·군중만.
- ⭕ 촬영 스타일 단어는 **그림체**를 가리키는 말입니다: macro / close up / overhead / flat lay /
  minimal / soft light / backlit / silhouette. desk·office·workspace는 장소지 스타일이 아닙니다.
- ⭕ 흰 카드 위에 얹히는 가로 16:10 이미지입니다. 어둡게 몰지 말고, 피사체가 한쪽에 있고
  여백이 있는 차분한 컷을 노리세요. (톤 단어 dark/moody는 소재가 흐려질 때가 많아 필요할 때만)

[출력 — JSON 하나만, 설명·코드펜스 없이]
{"keyword":"핵심 키워드(한국어 한두 단어)","reason":"왜 이 장면인지 한 줄(한국어)","queries":["1순위 리터럴","2순위 은유","3순위 장면","4순위 텍스처"]}`;

interface Suggestion {
  keyword: string;
  reason: string;
  queries: string[];
}

/** AI 없이도 후보를 뽑기 위한 폴백 — 제목의 라틴 낱말만 건져 작업 장면으로. */
function fallbackSuggestion(name: string): Suggestion {
  const latin = (name.match(/[A-Za-z][A-Za-z0-9+.-]{1,}/g) ?? []).slice(0, 2).join(' ');
  return {
    keyword: latin || name.slice(0, 12),
    reason: '검색어를 직접 고쳐서 다시 찾아보세요.',
    queries: [
      latin ? `${latin} desk close up` : 'notebook and pen macro',
      'open notebook and coffee overhead',
      'hands writing in notebook close up',
      'paper texture minimal',
    ],
  };
}

function parseSuggestion(raw: string, name: string): Suggestion {
  const parsed = JSON.parse(extractJson(raw)) as Partial<Suggestion>;
  const queries = (parsed.queries ?? [])
    .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    .map((q) => q.trim())
    .slice(0, 4);
  const fb = fallbackSuggestion(name);
  return {
    keyword: parsed.keyword?.trim() || fb.keyword,
    reason: parsed.reason?.trim() || '',
    queries: queries.length ? queries : fb.queries,
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const input = (await req.json()) as {
    name?: string;
    description?: string;
    category?: string;
    promptCategory?: string;
    /** 본문 발췌(프롬프트 전문·가이드 앞부분) — 무엇을 다루는 자료인지 파악용 */
    excerpt?: string;
    /** 운영자가 고친 검색어. 있으면 AI 단계를 건너뛴다(재검색). */
    queries?: string[];
  };
  const name = (input.name ?? '').trim();
  const manual = (input.queries ?? []).map((q) => q.trim()).filter(Boolean);
  if (!name && !manual.length) {
    return NextResponse.json({ error: '제목을 먼저 입력해 주세요.' }, { status: 400 });
  }

  // ── 1. 검색어 (운영자 지정 > AI > 폴백)
  let suggestion: Suggestion;
  let aiNotice: string | null = null;
  if (manual.length) {
    suggestion = { keyword: '', reason: '', queries: manual.slice(0, 6) };
  } else {
    try {
      const raw = await callModel(
        SYSTEM,
        `[자료 종류] ${CATEGORY_HINT[input.category ?? 'prompt'] ?? input.category ?? ''}${
          input.promptCategory ? ` (분류: ${input.promptCategory})` : ''
        }
[제목] ${name}
[설명] ${(input.description ?? '').slice(0, 600) || '(없음)'}
[본문 발췌] ${(input.excerpt ?? '').slice(0, 900) || '(없음)'}`,
        // 웹 리서치 불필요 — 주어진 텍스트를 검색어로 바꾸는 작업이라 가볍게.
        { allowedTools: [], model: 'sonnet', effort: 'low', timeoutMs: 45_000 },
      );
      suggestion = parseSuggestion(raw, name);
    } catch (e) {
      suggestion = fallbackSuggestion(name);
      aiNotice = `AI 검색어 생성을 건너뛰었어요 (${(e as Error).message.slice(0, 80)}).`;
    }
  }

  // ── 2. Unsplash 검색 — 사다리 순위를 유지한 채 검색어별로 나눠 담는다
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    return NextResponse.json({
      ...suggestion,
      results: [],
      aiNotice,
      notice: 'UNSPLASH_ACCESS_KEY 미설정 — unsplash.com에서 직접 찾아 이미지를 올려 주세요.',
    });
  }
  // 운영자가 직접 넣은 검색어는 그대로 존중하고, AI가 낸 것만 클리셰를 건다.
  const [queries, dropped] = manual.length ? [suggestion.queries, []] : dropCliches(suggestion.queries);
  if (dropped.length) suggestion.queries = queries;
  const perQuery = queries.length > 3 ? 4 : 6;
  const settled = await Promise.allSettled(
    queries.map((q, i) => searchThumbnailPhotos(q, i, perQuery, key)),
  );

  const seen = new Set<string>();
  const results: PhotoCandidate[] = [];
  // 검색어별 1등 → 2등 … 순으로 섞는다. 1순위(리터럴) 검색어 결과가 항상 앞에 오되
  // 한 검색어의 비슷한 사진이 첫 줄을 다 먹지 않게 한다.
  const lists = settled.map((s) => (s.status === 'fulfilled' ? s.value : []));
  for (let i = 0; i < perQuery; i++) {
    for (const list of lists) {
      const r = list[i];
      if (!r || seen.has(r.id)) continue;
      seen.add(r.id);
      results.push(r);
    }
  }
  const failed = settled.filter((s) => s.status === 'rejected').length;
  const notices = [
    dropped.length ? `AI 클리셰 검색어를 걸렀어요: ${dropped.join(', ')}` : null,
    failed ? `검색어 ${failed}개는 실패했어요 (Unsplash 오류·한도).` : null,
    results.length ? null : '검색 결과가 없어요 — 검색어를 고쳐서 다시 찾아보세요.',
  ].filter(Boolean);

  return NextResponse.json({
    ...suggestion,
    results: results.slice(0, 12),
    aiNotice,
    notice: notices.length ? notices.join(' · ') : null,
  });
}
