-- 1034_instagram_posts_manual_metrics.sql
-- Date: 2026-08-26
-- 목적: /admin/insights 수기 보정 2종.
--   own_comments — IG API comments 지표는 내(ai_caselab) 답글까지 합산하는데, 댓글 목록
--     API는 일반 계정 작성자를 가려서(빈 배열) 자동 제외가 불가. 운영자가 내 댓글 수를
--     입력하면 표시·참여율 계산에서 차감한다.
--   reposts — IG Insights Media API 미지원 지표(실측: "does not support the metrics:
--     reposts"). 앱 인사이트 값을 수기 입력.
-- 멱등: 재실행 안전.
-- 실행: Supabase Dashboard(Caselab-prod) SQL Editor에서 본 파일 전체 Run.

alter table public.instagram_posts
  add column if not exists own_comments int not null default 0,
  add column if not exists reposts int not null default 0;

comment on column public.instagram_posts.own_comments is
  '내(운영 계정) 댓글 수 — API comments에서 차감해 순수 참여만 남긴다. 수기 입력';
comment on column public.instagram_posts.reposts is
  '리포스트 수 — IG API 미제공, 앱 인사이트 값 수기 입력';

-- ===== 검증 =====
-- select ig_media_id, own_comments, reposts from public.instagram_posts;
