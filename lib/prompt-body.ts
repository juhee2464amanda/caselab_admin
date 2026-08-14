import { z } from 'zod';
import { RichSectionSchema } from '@/types/content';

/**
 * 본가(caselab) types/prompt.ts PromptItem 계약의 미러 스키마 — 프롬프트판 lib/tool-body.ts.
 *
 * 본가 /prompts는 tools(category='prompt', status='published')의 body에서
 * prompt·promptCategory·source·sourceUrl·images·sections만 읽는다(본가 lib/data/prompts.ts::mapPromptRow).
 * 계약 밖 키(구 초안의 howToUse·example)는 화면에 아예 안 나오고, prompt가 비면
 * 복사 박스가 빈 카드로 발행된다 — 발행 게이트에서 차단한다.
 * 본가 스키마 변경 시 이 파일도 같이 갱신할 것.
 *
 * admin 쪽 프롬프트 분류 상수의 단일 출처이기도 하다(PromptManager·assets/ingest·ai-draft가 공유).
 */

// 순서 = 본가 /prompts 탭 순서(작업 흐름 순). 본가 types/prompt.ts와 반드시 동일하게 유지할 것 —
// 본가가 모르는 키로 발행하면 상세·목록에서 'think'로 잘못 묶인다(본가 mapPromptRow 폴백).
export const PROMPT_CATEGORIES = ['think', 'organize', 'make', 'verify', 'refine'] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export const PROMPT_CATEGORY_LABELS: Record<PromptCategory, string> = {
  think: '사고하기',
  organize: '정리하기',
  make: '만들기',
  verify: '검증하기',
  refine: '다듬기',
};

/** 분류별 판정 기준 — AI 초안 프롬프트와 화면 안내에 같은 문구를 쓴다. 서로 겹치지 않게 배제 조건을 넣었다. */
export const PROMPT_CATEGORY_CRITERIA: Record<PromptCategory, string> = {
  think: '답이 없는 상태에서 생각을 끌어내는 것(리서치 방향, 아이디어 발산, 판단 기준 세우기)',
  organize: '이미 있는 원문·자료를 읽고 쓸 수 있는 형태로 추려내는 것(회의록·긴 문서·자료 뭉치 → 요약·구조화·표)',
  make: '원문 없이 새 결과물을 써내는 것(초안, 코드, 카피, 설정)',
  verify: '이미 있는 것을 점검·검증하는 것(리뷰, 오류 찾기, 사실 확인)',
  refine: '이미 있는 것을 고쳐 더 좋게 만드는 것(톤 교정, 압축, 리팩터링)',
};

export function isPromptCategory(v: unknown): v is PromptCategory {
  return typeof v === 'string' && (PROMPT_CATEGORIES as readonly string[]).includes(v);
}

export const PromptBodySchema = z
  .object({
    /** 복사 대상 전문. 본가 상세의 복사 박스(북극성 prompt_copy 계측) 내용 그 자체. */
    prompt: z.string().trim().min(1, '복사할 프롬프트 전문이 필요해요'),
    /** 카테고리 배지·브레드크럼·목록 그룹 (없으면 본가가 think로 폴백 → 오분류) */
    promptCategory: z.enum(PROMPT_CATEGORIES),
    /** 출처 라벨 (예: "Anthropic 공식", "Caselab 제작") */
    source: z.string().optional(),
    /** 출처 외부 링크 — 있으면 출처 칩이 새 탭 링크가 된다 */
    sourceUrl: z.string().optional(),
    /** 참고 이미지 — 상세에서 프롬프트 아래 노출 */
    images: z.array(z.object({ url: z.string(), caption: z.string().optional() })).optional(),
    /** 자유 리치 섹션 — 상세 하단 */
    sections: z.array(RichSectionSchema).optional(),
  })
  .strict();

export type PromptBody = z.infer<typeof PromptBodySchema>;

/** 프롬프트(category='prompt') body 검사. 통과하면 null, 아니면 첫 위반 사유를 반환. */
export function lintPromptBody(body: unknown): string | null {
  const r = PromptBodySchema.safeParse(body);
  if (r.success) return null;
  // 계약 밖 키를 먼저 알린다 — 누락 필드는 폼 입력칸으로 바로 보이지만,
  // 남아 있는 옛 키(howToUse·example)는 화면 어디에도 안 나타나 원인을 못 찾는다.
  const stray = r.error.issues.find((i) => i.code === 'unrecognized_keys') as { keys?: string[] } | undefined;
  if (stray?.keys?.length) return `본가가 읽지 않는 필드: ${stray.keys.join(', ')} (지워 주세요)`;
  const issue = r.error.issues[0];
  return `${issue.path.join('.') || '(root)'}: ${issue.message}`;
}
