-- 1029_content_cards_cta_default_channel.sql
-- Date: 2026-08-17
-- 목적: cta_type 기본값을 comment_dm → channel_intro 로 변경.
--   댓글→DM은 리틀리 자동화가 켜져 있어야 지킬 수 있는 약속이고, 아직 붙지 않았다.
--   기본값이 comment_dm이면 아무 설정 없이 만든 카드가 "댓글 남기면 DM 보내드려요"를 달고 나간다.
--   채널 안내형은 아무 사전 세팅 없이도 성립하므로 이쪽이 안전한 기본값이다.
--   앱 쪽 기본값(검수 UI·generate·publish·zip)은 코드에서 이미 channel_intro로 맞춰져 있고,
--   이 DDL은 컬럼 기본값이 코드와 어긋난 채 남는 것을 막는 정리다(기존 행은 건드리지 않는다).
-- 멱등: 재실행 안전.
-- 실행: Supabase Dashboard(Caselab-prod) → SQL Editor → 본 파일 전체 Run.

alter table public.content_cards alter column cta_type set default 'channel_intro';

-- ===== 검증 =====
-- select column_default from information_schema.columns
--  where table_name='content_cards' and column_name='cta_type';   -- 'channel_intro'::text 기대
