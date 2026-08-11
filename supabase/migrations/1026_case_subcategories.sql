-- 1026_case_subcategories.sql
-- Date: 2026-08-10
-- 목적: 케이스 트랙 성격 분류 3종을 categories(type='content_subcategory')로 seed.
--       contents.category_id FK(0010에서 생성됨) 대상 행. 분류 기준은 "독자가 가져가는 것":
--         워크플로 = AI와 같이 일하는 반복 업무 방법 (따라 하면 적용 끝)
--         자동화   = 세팅해두면 사람 없이 돌아가는 에이전트·봇·파이프라인
--         제작기   = 게임·앱·업무도구를 만들어 내놓은 여정과 결과물
--       '실험' 성격은 제작기에 흡수 (제작 케이스 대부분이 실험을 겸해 경계가 모호).
--       0006 tool_subcategory seed와 동일 패턴 — on conflict do nothing 멱등.
--
-- 실행: Supabase CLI `supabase db push` (Caselab-prod 링크됨)
--       또는 Dashboard SQL Editor에 본 파일 내용 Run.

insert into public.categories (type, parent_track, slug, label, sort_order, is_active) values
  ('content_subcategory', 'case', 'workflow',   '워크플로', 10, true),
  ('content_subcategory', 'case', 'automation', '자동화',   20, true),
  ('content_subcategory', 'case', 'build',      '제작기',   30, true)
on conflict (type, parent_track, slug) do nothing;
