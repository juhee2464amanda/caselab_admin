-- 0013_content_seeds_tool_link.sql
-- Date: 2026-06-27
-- 목적: seed → 생성 연결에서 "AI 도구"는 contents가 아니라 tools 테이블에 적재된다.
--       기존 content_seeds.content_id(→contents) 만으로는 도구 seed를 역추적할 수 없어
--       tool_id FK를 추가한다. (케이스/트렌드는 기존 content_id 그대로 사용)

alter table public.content_seeds
  add column if not exists tool_id uuid references public.tools(id) on delete set null;

create index if not exists idx_content_seeds_tool_id
  on public.content_seeds(tool_id);
