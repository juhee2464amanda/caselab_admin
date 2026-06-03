/**
 * 디자인 토큰 — user/admin 통일 (D59, 2026-06-03)
 *
 * 결정 출처:
 *   docs/04_dev_plan.md §19 D59 — admin도 user mockup index 정합 (D46 폐기)
 *   docs/06_admin_dev_plan.md §4.1 — 단일 set 통일
 *
 * 사용:
 *   - 모든 페이지: `bg-user-base`, `text-user-ink`, `text-user-accent`
 *   - `bg-admin-*`는 하위호환 alias 유지 (점진 마이그레이션)
 *   - 신규 코드는 `bg-user-*` 또는 표준 `bg-bg/text-ink/bg-accent` 사용
 *
 * tailwind.config.ts에서 import해서 colors namespace로 전개.
 */

/** 통일 토큰 — user mockup index 정합 (cool white + Toss Blue) */
export const userTokens = {
  bgBase: '#FFFFFF',
  bgSubtle: '#F7F7F7',
  ink: '#0A0A0A',
  inkMuted: '#8B95A1',
  accent: '#3182F6',
  accentHover: '#1B64DA',
  border: '#E5E8EB',
} as const;

/** @deprecated D59 (2026-06-03) — userTokens로 통합. 기존 import 깨짐 방지 alias */
export const adminTokens = userTokens;

export type DesignTokens = typeof userTokens;
