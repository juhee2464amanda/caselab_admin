-- 1022_content_cards_edge.sql
-- Date: 2026-07-18
-- 목적: 콘텐츠 엣지(차별점) 한 줄 저장 — AI가 정의하고 검수 UI에서 수정, 재생성의 축.
--       (카드에서 "앤트로픽 엔지니어 검증" 같은 엣지가 죽는 문제의 처방)

alter table public.content_cards
  add column if not exists edge text;

-- 실행: Supabase Dashboard SQL Editor (멱등)
