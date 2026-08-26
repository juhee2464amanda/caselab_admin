-- 1035_instagram_ads_reach.sql
-- Date: 2026-08-26
-- 목적: 광고 도달 수기 기록. 참여(좋아요·저장 등) 카운트는 광고 노출에서 온 것까지
--   합산되는데 API 도달은 오가닉만이라, 광고 게시물의 참여율·전환율이 과대평가된다.
--   광고 도달을 분모에 합산해 참여율 = 참여 ÷ (오가닉 도달 + 광고 도달)로 보정한다.
-- 멱등: 재실행 안전.
-- 실행: Supabase Dashboard(Caselab-prod) SQL Editor에서 본 파일 전체 Run.

alter table public.instagram_ads
  add column if not exists reach int not null default 0;

comment on column public.instagram_ads.reach is
  '광고 도달(계정 수) — 앱 광고 인사이트 값 수기 입력. 참여율·전환율 분모에 합산';

-- ===== 검증 =====
-- select ig_media_id, reach, views from public.instagram_ads;
