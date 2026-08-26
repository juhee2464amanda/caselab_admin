import { z } from 'zod';
import { RichSectionSchema } from '@/types/content';

/**
 * 본가(caselab) types/tool.ts ToolBody 계약의 미러 스키마.
 * 본가 ToolDetail은 이 구조만 렌더하므로, 어긋난 body(예: 구버전 AI 초안의
 * highlights/useCases:string[]/verdict)가 발행되면 상세가 비거나
 * useCases.map의 <Link href={undefined}>로 SSR이 깨진다 — 게이트에서 차단한다.
 * 본가 스키마 변경 시 이 파일도 같이 갱신할 것.
 */
export const ToolBodySchema = z
  .object({
    /** 히어로 카테고리 옆 대상 (예: "마케터·기획자") */
    audience: z.string().optional(),
    /** 추가 히어로 태그 (예: ["한국어 지원"]) */
    tags: z.array(z.string()).optional(),
    /** 소개 — 섹션 제목 + 문단들 */
    about: z
      .object({ heading: z.string().optional(), paragraphs: z.array(z.string()).min(1) })
      .optional(),
    /** 언제 쓰면 좋은가 — 칩 카드 */
    whenToUse: z
      .array(z.object({ icon: z.string().optional(), title: z.string(), desc: z.string() }))
      .optional(),
    /** 주요 기능 — 번호 리스트 */
    features: z
      .array(
        z.object({
          title: z.string(),
          desc: z.string(),
          image: z.object({ url: z.string(), caption: z.string().optional() }).optional(),
        }),
      )
      .optional(),
    /** 가격 — 플랜 카드 */
    pricing: z.array(z.object({ name: z.string(), amount: z.string(), includes: z.string() })).optional(),
    pricingNote: z.string().optional(),
    /** 실전 사용기 — 내부 케이스 링크 카드. href 없는 원소는 본가에서 크래시. */
    useCases: z
      .array(z.object({ href: z.string(), tag: z.string(), title: z.string(), meta: z.string() }))
      .optional(),
    /**
     * 자유 리치 섹션 — 트렌드와 동일한 블록(문단·이미지·갤러리·북마크 등)을
     * 각 섹션에 자유 배치. 본가 ToolDetail이 고정 섹션 뒤에 순서대로 렌더한다.
     */
    sections: z.array(RichSectionSchema).optional(),
    /**
     * 고정 섹션 소제목·라벨 오버라이드 (키=섹션id, 예: when·when.label·features).
     * 비면 기본 문구. 미리보기에서 클릭 편집.
     */
    headings: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type ToolBody = z.infer<typeof ToolBodySchema>;

/** 도구(category='tool') body 검사. 통과하면 null, 아니면 첫 위반 사유를 반환. */
export function lintToolBody(body: unknown): string | null {
  const r = ToolBodySchema.safeParse(body);
  if (r.success) return null;
  const issue = r.error.issues[0];
  return `${issue.path.join('.') || '(root)'}: ${issue.message}`;
}
