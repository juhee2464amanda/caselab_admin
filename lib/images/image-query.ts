// 스톡 사진 검색어 규칙 + Unsplash 검색 — 자료실/콘텐츠 썸네일용.
//
// 규칙의 원본은 카드뉴스 커버·슬라이드 검색어(lib/cardpress/generate.ts §이미지 검색어 공통 규칙)다.
// 카드뉴스는 "추상어로 검색하면 스톡티한 사진이 나온다"는 실측 끝에 4단 사다리(리터럴→은유→장면→텍스처)와
// 톤 단어 강제로 자리를 잡았고, 썸네일도 같은 문제를 겪는다(제목만 넣으면 productivity·AI 같은
// 추상어 검색 → 무관한 사진). 그래서 같은 사다리를 쓰되 규격만 썸네일에 맞춘다.
//   커버 1080×1350 portrait  →  썸네일 1200×750 landscape(본가 카드 16:10)
// ⚠️ 사다리·치환표를 고치면 lib/cardpress/generate.ts의 같은 규칙도 함께 고칠 것(두 곳 정의).

/** 개념→사물 치환표 — generate.ts SUBSTITUTION_TABLE의 미러 */
export const SUBSTITUTION_TABLE = `병목·약한 고리→steel chain macro / 집중→dartboard bullseye / 니치·작은 시장→ant macro /
  불확실성→foggy mountain / 관문·심사→old door knocker / 유입 경로→fishing net silhouette /
  성장·시작→seedling soil / 함정·손실→mousetrap / 데이터·AI→matrix code dark, server room dark /
  계약·법→contract fountain pen / 돈·가격→coins macro / 방치·묵힘→dusty notebook shelf dark /
  반복 확인→stopwatch macro dark / 협업→hands on desk from above / 완성·출시→ribbon cutting scissors`;

/** 4단 사다리 — 커버·슬라이드·썸네일이 공유하는 검색어 생성 규칙 */
export const QUERY_LADDER_RULES = `먼저 **핵심 키워드**를 뽑는다: 그 자료가 말하는 것 중 "눈에 보이는 것 하나". 그다음 4단 우선순위로 검색어를 만든다.
1순위 리터럴: 텍스트에 등장하는 구체 사물 그대로 (meeting notes notebook, rolex watch macro)
2순위 은유: 개념을 설명하는 관용적 사물 — 치환표: ${SUBSTITUTION_TABLE}
3순위 장면: 이야기의 분위기 컷 (old office desk night, contract signing) — 사람은 back view·hands·crowd·distant 강제
4순위 텍스처: 무드 배경 (dark green matrix code, old world map dark)
규칙: 영어 2~4단어 + 구체 명사 필수 + 촬영 스타일 단어 1개(macro/close up/dark/moody/silhouette/minimal).
검색어는 **1→2→3→4순위 순서로** 낸다 — 앞이 실패하면 다음 순위로 내려간다.`;

// ── Unsplash 접근 ────────────────────────────────────────────
// License: 상업적 사용 무료. 단 API Guidelines는 별개로 구속한다 —
//  ① 채택(다운로드) 시 download_location 1회 호출  ② 사진가·Unsplash 출처 표기(UTM 포함)
//  ③ 유료(Unsplash+) 자산 배제. (자세한 배경은 generate.ts의 라이선스 주석)
export const UNSPLASH_UTM = 'utm_source=caselab&utm_medium=referral';

// 촬영 스타일 단어가 없으면 서버가 붙인다 — 검색어 의미는 그대로 두고 그림체만 좁힌다.
// (스타일 단어가 없으면 광고 같은 연출 스톡이 먼저 걸린다)
const TONE_WORDS = [
  'dark', 'moody', 'macro', 'close up', 'closeup', 'silhouette', 'minimal',
  'night', 'shadow', 'overhead', 'from above', 'flat lay', 'backlit', 'soft light',
];

// 카드뉴스는 여기서 'dark moody'를 붙인다 — 커버에 어두운 스크림을 깔고 흰 글씨를 얹기 때문이다.
// 썸네일은 스크림이 없는 흰 카드(16:10)라 어둡게 몰 이유가 없고, 실측상 소재가 흐려진다:
//   "checklist notebook pen desk"          → 노트·펜 (total 136)
//   "checklist notebook pen desk dark moody" → 촛불 켠 테이블·손목시계 (total 73)
//   "terminal command line dark moody"      → 도시 야경·수면 (검색어와 무관)
// 그래서 썸네일 쪽 기본 보정은 'close up' — 소재를 유지하면서 연출 스톡만 걷어낸다.
export function withTone(query: string): string {
  const q = query.toLowerCase();
  return TONE_WORDS.some((t) => q.includes(t)) ? query : `${query} close up`;
}

/** 무료 Unsplash 사진인지 — 유료(Unsplash+)·비사진 자산을 배제 */
function isFreePhoto(r: {
  urls: { raw: string };
  asset_type?: string;
  premium?: boolean;
  plus?: boolean;
}): boolean {
  if (r.premium || r.plus) return false;
  if (r.asset_type && r.asset_type !== 'photo') return false;
  try {
    return new URL(r.urls.raw).host === 'images.unsplash.com';
  } catch {
    return false;
  }
}

// AI 클리셰 — 프롬프트로 금지해도 새어 나온다. 치환표에 "데이터·AI→matrix code dark"가 있어서
// 모델이 4순위(텍스처)를 매번 매트릭스 코드로 채웠다(실측: 서로 다른 자료 3개가 전부 같은 검색어).
// 목록에서 자료를 구분하는 게 썸네일의 일이라 같은 그림이 반복되면 그것만으로 실패다 → 서버에서 건다.
const CLICHE = [
  'matrix code', 'binary code', 'circuit board', 'robot hand', 'robotic hand',
  'glowing brain', 'hologram', 'holographic', 'neon data', 'futuristic',
  'artificial intelligence', 'ai technology', 'digital transformation',
];

/** 클리셰 검색어를 걸러낸다. 반환: [남은 검색어, 걸러낸 검색어] */
export function dropCliches(queries: string[]): [string[], string[]] {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const q of queries) {
    if (CLICHE.some((c) => q.toLowerCase().includes(c))) dropped.push(q);
    else kept.push(q);
  }
  return [kept, dropped];
}

export interface PhotoCandidate {
  id: string;
  /** 어느 검색어에서 나왔는지 — 운영자가 "왜 이 사진인지"를 판단하는 근거 */
  query: string;
  /** 사다리 순위(0=1순위) — 정렬용 */
  rank: number;
  alt: string;
  thumb: string;
  /** 반영용 — 본가 카드 규격(16:10)으로 크롭. fm=jpg 고정(WebP는 렌더 사고가 잦다) */
  full: string;
  credit: string;
  creditLink: string;
  /** 채택 시 한 번 호출해야 하는 주소 (/api/admin/unsplash-track) */
  downloadLocation?: string;
}

interface UnsplashPhoto {
  id: string;
  alt_description: string | null;
  urls: { raw: string };
  asset_type?: string;
  premium?: boolean;
  plus?: boolean;
  links?: { download_location?: string };
  user: { name: string; links: { html: string } };
}

/**
 * 검색어 하나로 가로 썸네일 후보를 받는다. 톤 보정·유료 배제·성인물 필터까지 적용.
 * download_location은 여기서 부르지 않는다 — 약관상 "실제로 쓸 때" 부르는 것이라 반영 시점에 부른다.
 */
export async function searchThumbnailPhotos(
  query: string,
  rank: number,
  perPage: number,
  key: string,
): Promise<PhotoCandidate[]> {
  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(withTone(query))}` +
      `&per_page=${perPage}&orientation=landscape&content_filter=high`,
    { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(12_000) },
  );
  if (!res.ok) throw new Error(`Unsplash ${res.status}`);
  const data = (await res.json()) as { results: UnsplashPhoto[] };
  return data.results.filter(isFreePhoto).map((r) => ({
    id: r.id,
    query,
    rank,
    alt: r.alt_description ?? '',
    thumb: `${r.urls.raw}&w=400&h=250&fit=crop&fm=jpg&q=70`,
    full: `${r.urls.raw}&w=1200&h=750&fit=crop&fm=jpg&q=80`,
    credit: r.user.name,
    creditLink: `${r.user.links.html}?${UNSPLASH_UTM}`,
    downloadLocation: r.links?.download_location,
  }));
}
