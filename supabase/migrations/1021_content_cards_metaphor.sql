-- 1021_content_cards_metaphor.sql
-- Date: 2026-07-18
-- 목적: 커버 메타포 검색어(AI 제안)를 저장 — 검수 UI의 Unsplash 인라인 검색 원클릭 소스 (spec §3-②)

alter table public.content_cards
  add column if not exists metaphor_queries jsonb not null default '[]'::jsonb;

-- 실행: Supabase Dashboard SQL Editor (멱등)
