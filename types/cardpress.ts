import { z } from 'zod';

// 카드프레스 슬라이드 스키마 — docs/09_card_press_spec.md §5
// O1(마무리 CTA)은 2026-08-13 삭제 — 포인트색 배경+이모지 액션 필이 캐러셀 톤과 어긋남(운영자). CTA는 캡션 전담.

// 자료실 소스는 category(tool|prompt|guide|context-card)마다 배지·해시태그가 달라야 한다 —
// 전에는 전부 'cat-tool'이라 프롬프트 카드에도 "AI 도구" 배지가 박혔다(2026-08-17 수정).
export const CardAccentSchema = z.enum(['cat-case', 'cat-trend', 'cat-tool', 'cat-prompt', 'cat-guide']);
export type CardAccent = z.infer<typeof CardAccentSchema>;

// 텍스트 규칙: title 등은 '\n'으로 명시적 줄바꿈. hl은 title 안의 부분 문자열(형광펜, 슬라이드당 1개).
// 불릿·본문 텍스트는 **강조** 마커로 포인트색 볼드 처리.


// 캔버스 편집용 스타일 오버라이드 — 검수 UI에서 조정, 발행 렌더에도 그대로 반영
export const StyleOverrideFields = {
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), // 슬라이드별 포인트색 오버라이드
  overlay: z.number().min(0).max(0.9).optional(),                // 사진 오버레이 어둡기 (커버류)
  coverPos: z.string().optional(),                                // 배경 위치 "50% 30%" (사진 팬)
  hlColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),      // 형광펜 배경색 (기본: 포인트색)
  titleAnchor: z.enum(['top', 'center', 'bottom']).optional(),    // 커버 텍스트 앵커 (C1)
  // 형광펜 표현 — box(배경 박스·기본) / text(글자색만) / underline(밑줄).
  // 커버가 매번 같은 "색 박스"로만 나가면 시리즈가 한 장처럼 보인다(벤치마크 6종 중 박스는 1종뿐).
  hlStyle: z.enum(['box', 'text', 'underline']).optional(),
  // 글자 크기 배율 — 템플릿의 기준 크기에 곱한다(1 = 기본). 분량 맞춤(fitBlock) 템플릿은
  // 배율을 올려도 넘치면 자동으로 되줄어들지만, 고정 크기 템플릿은 그대로 커지므로 상한을 둔다.
  textScale: z.number().min(0.8).max(1.25).optional(),
};

// C1 커버 유형 — 벤치마크(인스타 상위 계정 커버 6종) 분해 결과. 텍스트가 늘 좌하단에만 붙어 있으면
// 어떤 소재를 넣어도 같은 카드로 보인다. 네 자리 중 하나를 고르는 방식으로 넓혔다.
//   bottom : 좌하단 정렬 (기존 기본값 — 회귀 없이 그대로)
//   center : 가운데 정렬 포스터형 (상단 태그 중앙 · 하단 워드마크) — 사진이 약하거나 대칭 소재
//   band   : 상단 사진 + 하단 검은 밴드(레터박스) — 인물·스크린샷처럼 글자가 묻히는 사진에 안전
//   giant  : 상단을 비우고 하단 절반에 초대형 2줄 — 짧고 센 헤드라인
//   v3     : 잠금 규격 (2026-08-18 도입) — 아래 CoverArt로만 다양성을 낸다
export const CoverLayoutSchema = z.enum(['bottom', 'center', 'band', 'giant', 'v3']);
export type CoverLayout = z.infer<typeof CoverLayoutSchema>;

// v3 잠금 규격의 배경 아트 — 레이아웃(스크림·2줄 헤드라인·바닥 워드마크)은 고정하고 여기만 바꾼다.
// 피드 상위 계정 분석 결과: 레이아웃을 흔들면 그리드가 흩어지고, 그림을 바꾸면 장르가 넓어진다.
//   photo  : 사진 (기존 소재 그대로)
//   term   : 터미널 로그 — 개발 도구·설정 소재
//   studio : 오브젝트 스튜디오컷(밝음) — 스위치·제품 은유
//   macro  : 매크로 클로즈업(어두움) — 키캡·버튼
//   quote  : 인용·밈 — 사용자 대사
//   iri    : 3D 이리데슨트 블롭 — 트렌드·추상 소재
//   data   : 데이터 차트(밝음) — 숫자가 있는 케이스
//   logos  : 로고 2~3개를 나란히 — "따라하면 되는 레시피"라는 신호 (레퍼런스 최상위 패턴)
//   mask   : 아이콘 자리를 ?로 가림 — 정보를 덜 주는 쪽이 더 눌린다
//   object : 3D 오브젝트 한 개 — coverImage에 PNG(투명배경)를 넣으면 글로우 위에 얹는다
//   numbers: 정밀 숫자 2개 — 끝자리를 살린 숫자가 실제 데이터로 읽힌다($28,367 > 3만)
export const CoverArtSchema = z.enum([
  'photo',
  'term',
  'studio',
  'macro',
  'quote',
  'iri',
  'data',
  'logos',
  'mask',
  'object',
  'numbers',
]);
export type CoverArt = z.infer<typeof CoverArtSchema>;

export const C1PropsSchema = z.object({
  ...StyleOverrideFields,
  coverLayout: CoverLayoutSchema.optional(), // 커버 유형 (기본 bottom)
  coverArt: CoverArtSchema.optional(),       // v3 전용 배경 아트 (기본 photo)
  // 아트 안에 들어가는 글 — term은 로그 줄('>' 프롬프트 / '#' 흐린 줄 / '!' 경고),
  // quote는 인용문, data는 라벨, numbers는 '값|설명' 두 줄. '\n'으로 줄을 나눈다.
  artText: z.string().optional(),
  // logos·mask 아트에 꽂는 브랜드 아이콘. Simple Icons 슬러그('claude') 또는 이미지 URL.
  // 슬러그는 cdn.simpleicons.org로 펼쳐진다(CC0 · 원격 SVG를 Satori가 그대로 렌더).
  // ⚠️ openai·slack·canva는 상표 요청으로 Simple Icons에서 삭제됨 — 그건 URL로 직접 넣어야 한다.
  artIcons: z.array(z.string().min(1)).max(9).optional(),
  // 스크림·글자 톤. 기본은 아트에서 자동 결정(studio·data는 light, 나머지 dark).
  // 하이라이트 색도 여기서 갈린다 — dark는 블루, light는 라임. 색을 사람이 고르지 않는 게 요점.
  tone: z.enum(['dark', 'light']).optional(),
  kicker: z.string().optional(),     // 헤드라인 위 프레이밍 한 줄 ("~의 경제학") — 벤치마크 4층 구조
  title: z.string().min(1),          // 커버 제목 (≤17자 권장, '\n' 줄바꿈)
  hl: z.string().optional(),         // title 안의 형광펜 대상 부분 문자열
  sub: z.string().optional(),        // "읽는 데 5분 · 적용 30분"
  tag: z.string().optional(),        // 우상단 태그 (기본: accent별 카테고리명)
  label: z.string().optional(),      // band형 캡슐 라벨 ("AI TOOL | GENERAL") — 없으면 tag/카테고리
  footer: z.string().optional(),     // 좌하단 초소형 @개념 영문 ("@BLINDSPOT PASS")
  coverImage: z.string().url().optional(), // 배경 사진 url (없으면 그라데이션 폴백)
});

// C5 빅넘버 커버 — 사진이 실패해도 되는 폴백형 (벤치마크: 사진을 텍스처 수준으로 죽이고 숫자/단어로 승부)
export const C5PropsSchema = z.object({
  ...StyleOverrideFields,
  kicker: z.string().optional(),     // 맥락 1줄
  big: z.string().min(1),            // 거대 숫자/단어 ("10배", "FOCUS")
  resolve: z.string().min(1),        // 해소 1줄 ('\n' 허용, **강조** 지원)
  footer: z.string().optional(),
  coverImage: z.string().url().optional(), // 있으면 텍스처 수준(강한 오버레이)으로 깔림
});

export const B2PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),       // "4 / 8"
  banner: z.string().min(1),         // "✓ AI에게 시킨 것"
  // 개요(오버뷰) 슬라이드의 핵심 한 줄 — 있으면 큰 패널 + 번호 목록으로 렌더(개요 모드).
  // 모든 항목이 같은 굵기의 불릿이면 "무엇이 제일 중요한지"가 안 보여서 도입한 위계 필드.
  lead: z.string().optional(),       // **강조** 마커 지원
  bullets: z.array(z.string().min(1)).min(1).max(5), // **강조** 마커 지원
  media: z.string().url().optional(),// 본문 추출 스크린샷 url (없으면 미디어 영역 생략)
});

// B5 — 2026-08-14 다크 편집형으로 재디자인(파스텔 패널+아이콘 배지는 "제품 UI" 인상이라 폐기)
export const B5PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  heading: z.string().optional(),    // 기본 '솔직 후기'
  goodLabel: z.string().optional(),  // 기본 '잘된 것'
  badLabel: z.string().optional(),   // 기본 '별로였던 것'
  good: z.array(z.string().min(1)).min(1).max(3),  // **강조** 마커 지원
  bad: z.array(z.string().min(1)).min(1).max(3),
  // split=사진 밴드+상하 2단 / versus=좌우 대비. 미지정 시 항목 길이로 자동(≤26자면 versus)
  layout: z.enum(['split', 'versus']).optional(),
  image: z.string().url().optional(), // split 레이아웃의 상단 사진 (없으면 그라데이션)
});

export const C2PropsSchema = z.object({
  ...StyleOverrideFields,
  title: z.string().min(1),          // 선언형 문장 ('\n' 줄바꿈, hl 형광펜)
  hl: z.string().optional(),
  eyebrow: z.string().optional(),    // "모두가 유행이라는데"
  sub: z.string().optional(),        // 하단 부연
  pill: z.string().optional(),       // 우상단 필 (기본: accent별 카테고리명)
});

export const C3PropsSchema = z.object({
  ...StyleOverrideFields,
  title: z.string().min(1),
  hl: z.string().optional(),
  sub: z.string().optional(),
  pill: z.string().optional(),
  logoText: z.string().optional(),   // 로고 배지 안 글자 (예: "N") — 이미지 로고는 v2
});

export const C4PropsSchema = z.object({
  ...StyleOverrideFields,
  eyebrow: z.string().optional(),    // "이미지 생성, 뭐가 더 낫나"
  vsA: z.object({ name: z.string(), by: z.string().optional() }),
  vsB: z.object({ name: z.string(), by: z.string().optional() }),
  sub: z.string().optional(),
  pill: z.string().optional(),
});

export const B1PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  lead: z.string().optional(),       // 도입 문장 (**강조** 지원)
  heading: z.string().min(1),        // "먼저 일 푸는 순서부터"
  hl: z.string().optional(),
  rows: z.array(z.object({ term: z.string(), desc: z.string().optional() })).min(2).max(5),
});

export const B3PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  badge: z.string().optional(),      // 기본 '30초 개념'
  term: z.string().min(1),           // 큰 용어 (96px)
  termEn: z.string().optional(),
  lead: z.string().min(1),           // 한 줄 정의
  body: z.string().optional(),       // 부연 (**강조** 지원)
});

export const B4PropsSchema = z.object({
  ...StyleOverrideFields,
  title: z.string().min(1),          // 사진 위 한 문장 ('\n' 줄바꿈, hl 형광펜)
  hl: z.string().optional(),
  attribution: z.string().optional(),// "— 실험 3주차의 기록"
  coverImage: z.string().url().optional(),
});

export const B6PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  heading: z.string().min(1),        // "이렇게 세팅했어요"
  hl: z.string().optional(),
  steps: z.array(z.object({ title: z.string(), desc: z.string().optional() })).min(2).max(4),
});

export const B7PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  big: z.string().min(1),            // "40"
  unit: z.string().optional(),       // "%"
  cap: z.string().min(1),            // 캡션 ('\n' 줄바꿈, **강조**→포인트 컬러)
  sub: z.string().optional(),
});

// B8 — "복사" 문법(웹)이 아니라 인스타 문법: 패턴을 팔고, 전문은 CTA(댓글→DM/본가)로.
export const B8PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  badge: z.string().optional(),      // "패턴 03" 등 작은 배지 (기본 '프롬프트 패턴')
  patternEn: z.string().optional(),  // 영어 패턴명 원문 ("Blindspot Pass") — 있으면 크게, 한글은 아래 작게
  patternName: z.string().optional(),// 패턴명 (크게) — 있으면 신레이아웃으로 렌더
  when: z.string().optional(),       // 어떤 상황에서 쓰는지 한 줄
  lines: z.array(z.string()).min(1).max(8), // 원문 발췌 3~5줄 ('#'주석색, [변수]=초록)
  linesKo: z.array(z.string()).optional(),  // 영문 원문일 때 줄별 한글 번역 병기 (lines와 같은 길이)
  effect: z.string().optional(),     // 기대 효과 한 줄 ("방향 잡는 시간 ⅓")
  ctaLine: z.string().optional(),    // 시스템 주입 — cta_type에 따라 댓글→DM / 프로필 링크
  // legacy (구 레이아웃 저장분 렌더 호환)
  heading: z.string().optional(),
  hl: z.string().optional(),
  tip: z.string().optional(),
});

/** B12 체크리스트 — ✓박스 항목 3~6개 */
export const B12PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  heading: z.string().min(1),
  hl: z.string().optional(),
  items: z.array(z.string().min(1)).min(3).max(6),
  footer: z.string().optional(),
});

/** B13 Q&A — 큰 질문 하나 + 답변 문단 */
export const B13PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  question: z.string().min(1),          // '\n' 줄바꿈
  hl: z.string().optional(),
  answer: z.string().min(1),
  note: z.string().optional(),
});

/** B14 비교 2열 — A/B를 나란히 (커버 C4의 본문 버전) */
export const B14PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  heading: z.string().optional(),
  aTitle: z.string().min(1),
  bTitle: z.string().min(1),
  aItems: z.array(z.string().min(1)).min(1).max(4),
  bItems: z.array(z.string().min(1)).min(1).max(4),
});

/** B15 다크 인용 — 검정 바탕 거대 따옴표 + 인용 (B4·P4와 달리 사진 없이 타이포로) */
export const B15PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  quote: z.string().min(1),             // '\n' 줄바꿈
  hl: z.string().optional(),
  attribution: z.string().optional(),
  context: z.string().optional(),       // 아래 작은 부연
});

/** B16 스탯 타일 — 숫자 2~3개를 나란히 */
export const B16PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  heading: z.string().optional(),
  hl: z.string().optional(),
  stats: z.array(z.object({ big: z.string().min(1), unit: z.string().optional(), label: z.string().min(1) })).min(2).max(3),
  footer: z.string().optional(),
});

/** B17 세로 타임라인 — 점·선 레일 + 단계 3~5개 (B6 스텝의 세로 버전) */
export const B17PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  heading: z.string().min(1),
  hl: z.string().optional(),
  steps: z.array(z.object({ title: z.string().min(1), desc: z.string().optional() })).min(3).max(5),
});

/** B10 미니 에디토리얼 — 작은 활자 밀도형. 긴 설명을 안 자르고 잡지 칼럼처럼 싣는다 */
export const B10PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  eyebrow: z.string().optional(),    // 헤어라인 라벨
  heading: z.string().min(1),        // 중형 제목 (44px — 다른 B보다 작다)
  hl: z.string().optional(),
  body: z.string().min(1),           // '\n\n' 문단 구분 — 2문단 이상이면 2단 칼럼으로 흐른다
  note: z.string().optional(),       // 하단 각주 한 줄
});

/** B11 텍스트 그리드 — 항목 3~4개를 2×2 카드 타일로 */
export const B11PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  heading: z.string().min(1),
  hl: z.string().optional(),
  cells: z.array(z.object({ title: z.string().min(1), desc: z.string().optional() })).min(3).max(4),
});

export const B9PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  // 상단 브랜드 줄 숨김 — 엔딩 카드처럼 헤드라인 하나로만 여는 장에 쓴다
  bare: z.boolean().optional(),
  lead: z.string().optional(),       // "화면에서 **여기**만 보면 됩니다."
  shot: z.string().url(),            // 스크린샷 url (필수 — 없으면 이 슬라이드를 안 씀)
  callouts: z
    .array(z.object({ text: z.string(), pos: z.enum(['tl', 'tr', 'bl', 'br']) }))
    .max(4)
    .optional(),
});

// ===== P 계열 — 사진 편집형 본문 (벤치마크 문법: 전 장 사진 + 스크림 + 헤어라인 라벨) =====
// 공통: image 없으면 그라데이션 폴백. 텍스트는 항상 스크림 위 → 밝은 사진에도 대비가 유지된다.
const PhotoFields = {
  ...StyleOverrideFields,
  page: z.string().optional(),
  image: z.string().url().optional(),
};

/** P1 스플릿 + 번호 목록 — 정보량 많은 본문의 기본값 */
export const P1PropsSchema = z.object({
  ...PhotoFields,
  eyebrow: z.string().optional(),                    // 헤어라인 라벨 (기본: 카테고리명)
  lead: z.string().min(1),                           // 이 장의 핵심 한 줄 (**강조** 1구절)
  items: z.array(z.string().min(1)).min(2).max(4),   // 번호 목록 (구분선)
  photoH: z.number().min(420).max(840).optional(),   // 사진 밴드 높이 (기본 660)
});

/** P2 스플릿 + 문단 — 큰 제목 → 부제 → 회색 본문의 3단 위계 */
export const P2PropsSchema = z.object({
  ...PhotoFields,
  eyebrow: z.string().optional(),
  heading: z.string().min(1),
  sub: z.string().optional(),
  body: z.string().min(1),                           // '\n' 줄바꿈 허용
  photoH: z.number().min(420).max(840).optional(),
});

/** P3 풀블리드 + 하단 스크림 — 사진이 주인공. 전환·강조 장 */
export const P3PropsSchema = z.object({
  ...PhotoFields,
  label: z.string().optional(),
  title: z.string().min(1),
  items: z.array(z.string().min(1)).max(3).optional(),
  footer: z.string().optional(),                     // "@LOSS LEADER" 식 개념 영문
});

/** P4 풀블리드 + 인용 */
export const P4PropsSchema = z.object({
  ...PhotoFields,
  quote: z.string().min(1),
  attribution: z.string().optional(),
});

/** P5 블랙아웃(사진=텍스처) + 번호 목록 — 사진 실패·프롬프트 소재 폴백 */
export const P5PropsSchema = z.object({
  ...PhotoFields,
  index: z.string().optional(),                      // "02"
  eyebrow: z.string().optional(),
  lead: z.string().min(1),
  items: z.array(z.string().min(1)).min(2).max(4),
  footer: z.string().optional(),
});

/** P6 블랙아웃 + 빅넘버 — 본문 흐름에서 숫자 한 방 */
export const P6PropsSchema = z.object({
  ...PhotoFields,
  kicker: z.string().optional(),
  big: z.string().min(1),                            // "70%", "10배", "FOCUS"
  bigMax: z.number().min(60).max(230).optional(),    // big 최대 폰트(px) 상한 — 엔딩 카드가 낮춰 쓴다
  // big 바로 위에 붙는 문장 앞머리("댓글에"). 있으면 세 줄이 한 문장으로 읽히게 간격이 좁아진다.
  // kicker(라벨 조판)와 다르다 — 라벨이 아니라 문장의 일부다.
  leadIn: z.string().optional(),
  resolve: z.string().min(1),
  footer: z.string().optional(),
});

/** 엔딩 카드(comment_dm) 카드별 오버라이드 — content_cards.ending_props (migration 1032).
 *  전부 optional: 비어 있으면 파생 기본값(포인트색=카테고리색, 배경=커버 이미지)을 쓴다. */
export const EndingPropsSchema = z.object({
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  image: z.string().url().optional(),
  overlay: z.number().min(0).max(0.9).optional(),
  resolve: z.string().optional(), // 키워드 아래 안내문 오버라이드 — ''이면 그 줄을 지운다
});
export type EndingProps = z.infer<typeof EndingPropsSchema>;

/** B18 다크 미니 에디토리얼 — B10의 다크 트윈 (작은 활자 2단, OLED 블랙) */
export const B18PropsSchema = B10PropsSchema;

/** C6 에디토리얼 커버 — 화이트 대여백 + 헤어라인 룰 (사진 없이 성립) */
export const C6PropsSchema = z.object({
  ...StyleOverrideFields,
  kicker: z.string().optional(),
  title: z.string().min(1),             // '\n' 2~3줄
  hl: z.string().optional(),
  sub: z.string().optional(),
  footer: z.string().optional(),
});

/** C7 스플릿 커버 — 좌 다크 타이포 / 우 세로 사진 */
export const C7PropsSchema = z.object({
  ...StyleOverrideFields,
  kicker: z.string().optional(),
  title: z.string().min(1),
  hl: z.string().optional(),
  sub: z.string().optional(),
  coverImage: z.string().url().optional(),
});

/** P8 폴라로이드 — 크림 바탕에 흰 프레임 사진을 살짝 기울여 */
export const P8PropsSchema = z.object({
  ...PhotoFields,
  lead: z.string().min(1),
  caption: z.string().optional(),       // 프레임 안 하단 손글씨 자리
});

/** P9 매거진 스플릿 — 좌 세로 사진 / 우 텍스트 칼럼 */
export const P9PropsSchema = z.object({
  ...PhotoFields,
  eyebrow: z.string().optional(),
  heading: z.string().min(1),           // '\n' 줄바꿈
  hl: z.string().optional(),
  body: z.string().min(1),
});

/** P10 디바이스 프레임 — 스크린샷을 브라우저 창 프레임에 앉히고 아래 리드 */
export const P10PropsSchema = z.object({
  ...PhotoFields,
  frameLabel: z.string().optional(),    // 창 상단 파일명/URL 자리
  lead: z.string().min(1),
  caption: z.string().optional(),
});

/** P11 화이트 매거진 — 상단 풀폭 사진 + 흰 바탕 왼쪽 정렬 제목/문단 (biscit 스타일) */
export const P11PropsSchema = z.object({
  ...PhotoFields,
  heading: z.string().min(1),           // '\n' 줄바꿈 — 볼드 검정
  hl: z.string().optional(),
  body: z.string().min(1),              // '\n' 줄바꿈 · **강조**는 볼드 검정
  credit: z.string().optional(),        // 사진 좌상단 "출처: ..." 작은 표기
});

/** P7 사진 그리드 — 사진 2장을 나란히(1장이면 풀폭 폴백) + 아래 리드 */
export const P7PropsSchema = z.object({
  ...PhotoFields,                                    // image = 첫 번째 사진
  image2: z.string().url().optional(),               // 두 번째 사진 (트레이에서 끌어다 교체)
  eyebrow: z.string().optional(),
  lead: z.string().min(1),
  caption: z.string().optional(),                    // 사진 아래 회색 부연
});

export const RenderSlideSchema = z.discriminatedUnion('template', [
  z.object({ template: z.literal('P7'), accent: CardAccentSchema, props: P7PropsSchema }),
  z.object({ template: z.literal('P8'), accent: CardAccentSchema, props: P8PropsSchema }),
  z.object({ template: z.literal('P9'), accent: CardAccentSchema, props: P9PropsSchema }),
  z.object({ template: z.literal('P10'), accent: CardAccentSchema, props: P10PropsSchema }),
  z.object({ template: z.literal('P11'), accent: CardAccentSchema, props: P11PropsSchema }),
  z.object({ template: z.literal('B10'), accent: CardAccentSchema, props: B10PropsSchema }),
  z.object({ template: z.literal('B11'), accent: CardAccentSchema, props: B11PropsSchema }),
  z.object({ template: z.literal('B12'), accent: CardAccentSchema, props: B12PropsSchema }),
  z.object({ template: z.literal('B13'), accent: CardAccentSchema, props: B13PropsSchema }),
  z.object({ template: z.literal('B14'), accent: CardAccentSchema, props: B14PropsSchema }),
  z.object({ template: z.literal('B15'), accent: CardAccentSchema, props: B15PropsSchema }),
  z.object({ template: z.literal('B16'), accent: CardAccentSchema, props: B16PropsSchema }),
  z.object({ template: z.literal('B17'), accent: CardAccentSchema, props: B17PropsSchema }),
  z.object({ template: z.literal('B18'), accent: CardAccentSchema, props: B18PropsSchema }),
  z.object({ template: z.literal('C6'), accent: CardAccentSchema, props: C6PropsSchema }),
  z.object({ template: z.literal('C7'), accent: CardAccentSchema, props: C7PropsSchema }),
  z.object({ template: z.literal('P1'), accent: CardAccentSchema, props: P1PropsSchema }),
  z.object({ template: z.literal('P2'), accent: CardAccentSchema, props: P2PropsSchema }),
  z.object({ template: z.literal('P3'), accent: CardAccentSchema, props: P3PropsSchema }),
  z.object({ template: z.literal('P4'), accent: CardAccentSchema, props: P4PropsSchema }),
  z.object({ template: z.literal('P5'), accent: CardAccentSchema, props: P5PropsSchema }),
  z.object({ template: z.literal('P6'), accent: CardAccentSchema, props: P6PropsSchema }),
  z.object({ template: z.literal('C1'), accent: CardAccentSchema, props: C1PropsSchema }),
  z.object({ template: z.literal('C2'), accent: CardAccentSchema, props: C2PropsSchema }),
  z.object({ template: z.literal('C3'), accent: CardAccentSchema, props: C3PropsSchema }),
  z.object({ template: z.literal('C4'), accent: CardAccentSchema, props: C4PropsSchema }),
  z.object({ template: z.literal('C5'), accent: CardAccentSchema, props: C5PropsSchema }),
  z.object({ template: z.literal('B1'), accent: CardAccentSchema, props: B1PropsSchema }),
  z.object({ template: z.literal('B2'), accent: CardAccentSchema, props: B2PropsSchema }),
  z.object({ template: z.literal('B3'), accent: CardAccentSchema, props: B3PropsSchema }),
  z.object({ template: z.literal('B4'), accent: CardAccentSchema, props: B4PropsSchema }),
  z.object({ template: z.literal('B5'), accent: CardAccentSchema, props: B5PropsSchema }),
  z.object({ template: z.literal('B6'), accent: CardAccentSchema, props: B6PropsSchema }),
  z.object({ template: z.literal('B7'), accent: CardAccentSchema, props: B7PropsSchema }),
  z.object({ template: z.literal('B8'), accent: CardAccentSchema, props: B8PropsSchema }),
  z.object({ template: z.literal('B9'), accent: CardAccentSchema, props: B9PropsSchema }),
]);

export type RenderSlideInput = z.infer<typeof RenderSlideSchema>;
export type CardTemplateId = RenderSlideInput['template'];

// content_cards.slides 원소 (DB jsonb)
export type CardSlide = {
  template: CardTemplateId;
  order: number;
  enabled: boolean;
  props: Record<string, unknown>;
  sourceSection?: string;
  required?: string;
  /** 모션 카드 — 있으면 발행 캐러셀에서 이 칸은 PNG 렌더 대신 이 영상(공개 URL)이 올라간다 */
  motion?: { url: string } | null;
};
