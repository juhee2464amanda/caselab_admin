import { z } from 'zod';

// 카드프레스 슬라이드 스키마 — docs/09_card_press_spec.md §5
// O1(마무리 CTA)은 2026-08-13 삭제 — 포인트색 배경+이모지 액션 필이 캐러셀 톤과 어긋남(운영자). CTA는 캡션 전담.

export const CardAccentSchema = z.enum(['cat-case', 'cat-trend', 'cat-tool']);
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
};

export const C1PropsSchema = z.object({
  ...StyleOverrideFields,
  kicker: z.string().optional(),     // 헤드라인 위 프레이밍 한 줄 ("~의 경제학") — 벤치마크 4층 구조
  title: z.string().min(1),          // 커버 제목 (≤17자 권장, '\n' 줄바꿈)
  hl: z.string().optional(),         // title 안의 형광펜 대상 부분 문자열
  sub: z.string().optional(),        // "읽는 데 5분 · 적용 30분"
  tag: z.string().optional(),        // 우상단 태그 (기본: accent별 카테고리명)
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

export const B5PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
  heading: z.string().optional(),    // 기본 '솔직 후기'
  goodLabel: z.string().optional(),  // 기본 '잘된 것'
  badLabel: z.string().optional(),   // 기본 '별로였던 것'
  good: z.array(z.string().min(1)).min(1).max(3),
  bad: z.array(z.string().min(1)).min(1).max(3),
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
  lines: z.array(z.string()).min(1).max(8), // 핵심 3~4줄 맛보기 ('#'주석색, [변수]=초록)
  effect: z.string().optional(),     // 기대 효과 한 줄 ("방향 잡는 시간 ⅓")
  ctaLine: z.string().optional(),    // 시스템 주입 — cta_type에 따라 댓글→DM / 프로필 링크
  // legacy (구 레이아웃 저장분 렌더 호환)
  heading: z.string().optional(),
  hl: z.string().optional(),
  tip: z.string().optional(),
});

export const B9PropsSchema = z.object({
  ...StyleOverrideFields,
  page: z.string().optional(),
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
  resolve: z.string().min(1),
  footer: z.string().optional(),
});

export const RenderSlideSchema = z.discriminatedUnion('template', [
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
};
