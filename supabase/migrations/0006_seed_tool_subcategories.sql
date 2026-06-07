-- 0006_seed_tool_subcategories.sql
-- Date: 2026-06-06
-- 관련: Option C(subcategory_id FK) — tools.category 충돌 정합
-- 목적: tools.html 기능 카테고리 6종을 categories(type='tool_subcategory')로 seed.
--       tools.subcategory_id FK 대상 행 생성. tools.category CHECK 제약은 변경 없음
--       (category는 자료 타입 tool/prompt/guide/context-card 역할 유지).
--       slug/label은 caselab/types/tool.ts TOOL_CATEGORIES / TOOL_CATEGORY_LABELS와 정확히 일치.
--       on conflict (type, parent_track, slug) do nothing 으로 멱등 (재실행 안전).
--
-- 실행: Supabase CLI `supabase db push` (Caselab-prod 링크됨)
--       또는 Dashboard SQL Editor에 본 파일 내용 Run.

insert into public.categories (type, parent_track, slug, label, sort_order, is_active) values
  ('tool_subcategory', 'tool', 'design',       '디자인 / UI',   10, true),
  ('tool_subcategory', 'tool', 'automation',   '자동화',        20, true),
  ('tool_subcategory', 'tool', 'research',     '리서치',        30, true),
  ('tool_subcategory', 'tool', 'writing',      '글쓰기',        40, true),
  ('tool_subcategory', 'tool', 'presentation', '프레젠테이션',  50, true),
  ('tool_subcategory', 'tool', 'coding',       '코딩',          60, true)
on conflict (type, parent_track, slug) do nothing;
