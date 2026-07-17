import { z } from 'zod';

// 카드프레스 슬라이드 스키마 — docs/09_card_press_spec.md §5
// 1단계: 템플릿 4종(C1·B2·B5·O1)만. 나머지 10종은 렌더 파이프라인 검증 후 확장.

export const CardAccentSchema = z.enum(['cat-case', 'cat-trend', 'cat-tool']);
export type CardAccent = z.infer<typeof CardAccentSchema>;

// 텍스트 규칙: title 등은 '\n'으로 명시적 줄바꿈. hl은 title 안의 부분 문자열(형광펜, 슬라이드당 1개).
// 불릿·본문 텍스트는 **강조** 마커로 포인트색 볼드 처리.

export const C1PropsSchema = z.object({
  title: z.string().min(1),          // 커버 제목 (≤17자 권장, '\n' 줄바꿈)
  hl: z.string().optional(),         // title 안의 형광펜 대상 부분 문자열
  sub: z.string().optional(),        // "읽는 데 5분 · 적용 30분"
  tag: z.string().optional(),        // 우상단 태그 (기본: accent별 카테고리명)
  coverImage: z.string().url().optional(), // 배경 사진 url (없으면 그라데이션 폴백)
});

export const B2PropsSchema = z.object({
  page: z.string().optional(),       // "4 / 8"
  banner: z.string().min(1),         // "✓ AI에게 시킨 것"
  bullets: z.array(z.string().min(1)).min(1).max(5), // **강조** 마커 지원
  media: z.string().url().optional(),// 본문 추출 스크린샷 url (없으면 미디어 영역 생략)
});

export const B5PropsSchema = z.object({
  page: z.string().optional(),
  heading: z.string().optional(),    // 기본 '솔직 후기'
  goodLabel: z.string().optional(),  // 기본 '잘된 것'
  badLabel: z.string().optional(),   // 기본 '별로였던 것'
  good: z.array(z.string().min(1)).min(1).max(3),
  bad: z.array(z.string().min(1)).min(1).max(3),
});

export const O1PropsSchema = z.object({
  page: z.string().optional(),
  eyebrow: z.string().optional(),    // 기본 '오늘의 정리'
  title: z.string().min(1),          // '\n' 줄바꿈, hl 지원(흰 반투명 하이라이트)
  hl: z.string().optional(),
  body: z.string().optional(),
  actions: z
    .array(z.object({ icon: z.string(), text: z.string() }))
    .max(3)
    .optional(),                     // 기본: 저장 유도 + 댓글 유도 (팔로우 구걸 ❌)
  handle: z.string().optional(),     // 기본 '@caselab'
});

export const C2PropsSchema = z.object({
  title: z.string().min(1),          // 선언형 문장 ('\n' 줄바꿈, hl 형광펜)
  hl: z.string().optional(),
  eyebrow: z.string().optional(),    // "모두가 유행이라는데"
  sub: z.string().optional(),        // 하단 부연
  pill: z.string().optional(),       // 우상단 필 (기본: accent별 카테고리명)
});

export const C3PropsSchema = z.object({
  title: z.string().min(1),
  hl: z.string().optional(),
  sub: z.string().optional(),
  pill: z.string().optional(),
  logoText: z.string().optional(),   // 로고 배지 안 글자 (예: "N") — 이미지 로고는 v2
});

export const C4PropsSchema = z.object({
  eyebrow: z.string().optional(),    // "이미지 생성, 뭐가 더 낫나"
  vsA: z.object({ name: z.string(), by: z.string().optional() }),
  vsB: z.object({ name: z.string(), by: z.string().optional() }),
  sub: z.string().optional(),
  pill: z.string().optional(),
});

export const B1PropsSchema = z.object({
  page: z.string().optional(),
  lead: z.string().optional(),       // 도입 문장 (**강조** 지원)
  heading: z.string().min(1),        // "먼저 일 푸는 순서부터"
  hl: z.string().optional(),
  rows: z.array(z.object({ term: z.string(), desc: z.string().optional() })).min(2).max(5),
});

export const B3PropsSchema = z.object({
  page: z.string().optional(),
  badge: z.string().optional(),      // 기본 '30초 개념'
  term: z.string().min(1),           // 큰 용어 (96px)
  termEn: z.string().optional(),
  lead: z.string().min(1),           // 한 줄 정의
  body: z.string().optional(),       // 부연 (**강조** 지원)
});

export const B4PropsSchema = z.object({
  title: z.string().min(1),          // 사진 위 한 문장 ('\n' 줄바꿈, hl 형광펜)
  hl: z.string().optional(),
  attribution: z.string().optional(),// "— 실험 3주차의 기록"
  coverImage: z.string().url().optional(),
});

export const B6PropsSchema = z.object({
  page: z.string().optional(),
  heading: z.string().min(1),        // "이렇게 세팅했어요"
  hl: z.string().optional(),
  steps: z.array(z.object({ title: z.string(), desc: z.string().optional() })).min(2).max(4),
});

export const B7PropsSchema = z.object({
  page: z.string().optional(),
  big: z.string().min(1),            // "40"
  unit: z.string().optional(),       // "%"
  cap: z.string().min(1),            // 캡션 ('\n' 줄바꿈, **강조**→포인트 컬러)
  sub: z.string().optional(),
});

export const B8PropsSchema = z.object({
  page: z.string().optional(),
  heading: z.string().optional(),    // 기본 '복사해서 쓰는 프롬프트'
  hl: z.string().optional(),         // 기본 '프롬프트'
  lines: z.array(z.string()).min(1).max(8), // '#'로 시작=주석색, [변수]=초록
  tip: z.string().optional(),        // 기본 '📌 저장해두고 그대로 붙여넣기'
});

export const B9PropsSchema = z.object({
  page: z.string().optional(),
  lead: z.string().optional(),       // "화면에서 **여기**만 보면 됩니다."
  shot: z.string().url(),            // 스크린샷 url (필수 — 없으면 이 슬라이드를 안 씀)
  callouts: z
    .array(z.object({ text: z.string(), pos: z.enum(['tl', 'tr', 'bl', 'br']) }))
    .max(4)
    .optional(),
});

export const RenderSlideSchema = z.discriminatedUnion('template', [
  z.object({ template: z.literal('C1'), accent: CardAccentSchema, props: C1PropsSchema }),
  z.object({ template: z.literal('C2'), accent: CardAccentSchema, props: C2PropsSchema }),
  z.object({ template: z.literal('C3'), accent: CardAccentSchema, props: C3PropsSchema }),
  z.object({ template: z.literal('C4'), accent: CardAccentSchema, props: C4PropsSchema }),
  z.object({ template: z.literal('B1'), accent: CardAccentSchema, props: B1PropsSchema }),
  z.object({ template: z.literal('B2'), accent: CardAccentSchema, props: B2PropsSchema }),
  z.object({ template: z.literal('B3'), accent: CardAccentSchema, props: B3PropsSchema }),
  z.object({ template: z.literal('B4'), accent: CardAccentSchema, props: B4PropsSchema }),
  z.object({ template: z.literal('B5'), accent: CardAccentSchema, props: B5PropsSchema }),
  z.object({ template: z.literal('B6'), accent: CardAccentSchema, props: B6PropsSchema }),
  z.object({ template: z.literal('B7'), accent: CardAccentSchema, props: B7PropsSchema }),
  z.object({ template: z.literal('B8'), accent: CardAccentSchema, props: B8PropsSchema }),
  z.object({ template: z.literal('B9'), accent: CardAccentSchema, props: B9PropsSchema }),
  z.object({ template: z.literal('O1'), accent: CardAccentSchema, props: O1PropsSchema }),
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
