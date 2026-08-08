import { TOOL_MIN_MATERIAL, toolKindLabel, toolMaterialLength, type ToolRowLite } from '@/lib/cardpress/mapping';

/**
 * 본가 자료실(tools) → 카드 소스 자격 판정.
 *
 * "published = 유저에게 보임"이 아니다. 본가(apps/caselab lib/data)는 화면마다 필터가 다르다:
 *   /guides   category in (guide, context-card) + published
 *   /prompts  category = prompt              + published
 *   /tools    published + categories!inner(subcategory_id) ← 기능분류 없으면 목록에서 빠진다
 * 카드뉴스는 "본가에 실제로 보이는 것"만 소스로 삼아야 한다. 안 보이는 자료로 카드를 만들면
 * 캡션·스레드에 붙는 본가 링크가 404가 되기 때문. 본가 쿼리가 바뀌면 이 파일도 같이 고칠 것.
 */

/** tools에서 카드 소스로 쓰기 위해 읽어야 할 컬럼 (노출 판정 + 재료 추출) */
export const TOOL_SOURCE_SELECT =
  'id, category, name, slug, description, url, thumbnail_url, body, status, subcategory_id';

export type ToolSourceRow = ToolRowLite & {
  status: string;
  subcategory_id: string | null;
};

export type ToolVisibilityRow = Pick<ToolSourceRow, 'category' | 'status' | 'subcategory_id'>;

/** 본가에 안 보이는 이유. 보이면 null. */
export function toolVisibilityIssue(row: ToolVisibilityRow): string | null {
  if (row.status !== 'published') return '본가에 발행되지 않은 자료예요.';
  if (row.category === 'guide' || row.category === 'context-card' || row.category === 'prompt') return null;
  if (!row.subcategory_id) return '기능분류가 없어 본가 /tools 목록에 노출되지 않는 자료예요.';
  return null;
}

/** 카드 본문을 채울 재료가 있는지. 없으면 사유 문자열. */
export function toolMaterialIssue(row: ToolRowLite): string | null {
  return toolMaterialLength(row) < TOOL_MIN_MATERIAL
    ? '본문 재료가 부족해요(외부 링크와 한 줄 설명뿐).'
    : null;
}

/** 목록 UI용 — 소스로 쓸 수 있는지 + 못 쓰면 왜 못 쓰는지 */
export function toolSourceState(row: ToolSourceRow): { usable: boolean; reason: string | null; kind: string } {
  const reason = toolVisibilityIssue(row) ?? toolMaterialIssue(row);
  return { usable: reason === null, reason, kind: toolKindLabel(row.category) };
}
