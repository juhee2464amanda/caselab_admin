-- 1036_instagram_ads_total_engagement.sql
-- Date: 2026-08-26
-- 목적: 광고 포함 참여 합계 수기 기록. 실측 결과 IG Graph API insights는 참여
--   (likes·comments·saved·shares)도 오가닉만 반환한다 — 앤트로픽 게시물 실측:
--   API 저장 1 vs 앱 광고 인사이트 저장 15(광고분 포함 합계). 광고 인사이트 상단
--   아이콘 4종(좋아요·댓글·공유·저장 합계)을 수기 입력하면 대시보드가 광고 게시물의
--   참여를 합계 기준으로 표시·계산한다(0이면 오가닉 값 사용).
-- 멱등: 재실행 안전.
-- 실행: Supabase Dashboard(Caselab-prod) SQL Editor에서 본 파일 전체 Run.

alter table public.instagram_ads
  add column if not exists total_likes int not null default 0,
  add column if not exists total_comments int not null default 0,
  add column if not exists total_shares int not null default 0,
  add column if not exists total_saves int not null default 0;

comment on column public.instagram_ads.total_likes is
  '광고 포함 좋아요 합계 — 앱 광고 인사이트 상단 아이콘 값 수기 입력. 0이면 오가닉 값 사용';

-- ===== 검증 =====
-- select ig_media_id, total_likes, total_comments, total_shares, total_saves from public.instagram_ads;
