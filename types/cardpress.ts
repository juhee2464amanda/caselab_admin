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

export const RenderSlideSchema = z.discriminatedUnion('template', [
  z.object({ template: z.literal('C1'), accent: CardAccentSchema, props: C1PropsSchema }),
  z.object({ template: z.literal('B2'), accent: CardAccentSchema, props: B2PropsSchema }),
  z.object({ template: z.literal('B5'), accent: CardAccentSchema, props: B5PropsSchema }),
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
