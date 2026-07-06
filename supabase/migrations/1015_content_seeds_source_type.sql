-- 씨앗 출처(provenance)를 1급 컬럼으로. bucket(용도)과 별개.
-- 소스별 전용 Slack lane → source_type으로 채워짐(app/api/slack/hermes-brief/route.ts).
-- ⚠️ 공유 prod는 db push 금지 — 대시보드 SQL Editor에서 멱등 적용(if not exists).
alter table public.content_seeds add column if not exists source_type text;
create index if not exists idx_content_seeds_source_type on public.content_seeds(source_type);
comment on column public.content_seeds.source_type is 'youtube|community|blog|instagram|ai-briefing|service-scout|slack-brief|manual — 씨앗 출처(provenance). bucket(용도)과 별개.';
