/**
 * 인스타 게시물 분류 = 본가에서 그 게시물이 보내는 상세 메뉴.
 *
 * 자유 텍스트로 두면 "자료실"과 "프롬프트"처럼 캡션만 보고는 구분할 수 없는 값이
 * 손으로 잘못 들어간다(실측: Claude Code 자동 승인 글을 자료실로 오태깅 —
 * 본가에는 /prompts/claude-code-자동-승인-모드-만들기-clauded 로 존재).
 * 그래서 값은 본가 경로에서만 나오게 고정하고, utm_code가 붙어 있으면
 * utm_links.target_url의 첫 경로 조각으로 자동 도출한다.
 */

/** 본가 상세 메뉴 경로 → 분류 라벨 */
export const PATH_TO_CATEGORY: Record<string, string> = {
  trends: 'AI 트렌드',
  cases: '케이스',
  prompts: '프롬프트',
  guides: '가이드',
  tools: '자료실',
};

/** 본가 링크가 없는 게시물(근황·브랜딩 글)용 — 경로에서 도출되지 않는 유일한 값 */
export const NO_LINK_CATEGORY = '브랜딩';

export const INSIGHT_CATEGORIES = [...Object.values(PATH_TO_CATEGORY), NO_LINK_CATEGORY] as const;

/** target_url의 첫 경로 조각으로 분류를 도출한다. 홈(/)이나 미지의 경로는 null. */
export function categoryFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg ? (PATH_TO_CATEGORY[seg] ?? null) : null;
  } catch {
    return null;
  }
}
