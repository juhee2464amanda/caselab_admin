-- 0014_content_seeds_scoring.sql
-- Date: 2026-06-29
-- 목적: HERMES 씨앗을 무작위 backlog가 아니라 "목적 버킷 + top-rated 큐레이션"으로 다룬다.
--       로컬 작업장의 AI 채점 패스가 raw 씨앗을 분류·채점해 아래 컬럼을 채운다.
--       /admin/seeds 큐레이션 화면은 버킷별 72h·점수순 top5를 노출.
--   bucket        : 'trend' | 'service' | 'painpoint' | 'etc'  (null = 미채점)
--   score         : 0~100 (4축 가중합: 시의성·실무가치·적합성·신뢰도)
--   score_reason  : 점수 근거 한 줄
--   suggested_angle: 콘텐츠화 각도 한 줄(케이스/트렌드 생성 시 프리필)
--   scored_at     : 채점 시각(미채점 판별 = scored_at is null)

alter table public.content_seeds
  add column if not exists bucket text,
  add column if not exists score int,
  add column if not exists score_reason text,
  add column if not exists suggested_angle text,
  add column if not exists scored_at timestamptz;

-- 버킷별 72h·점수순 조회 최적화
create index if not exists idx_content_seeds_bucket_score
  on public.content_seeds(bucket, score desc);
