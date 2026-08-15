-- 1027_content_cards_photo_credits.sql
-- Date: 2026-08-15
-- 목적: 카드에 깔린 사진의 출처 표기 저장.
--   ① Unsplash API Guidelines — 라이선스와 별개로 사진가·Unsplash 출처 표기가 필수(UTM 포함).
--      lib/cardpress/generate.ts가 photoCredits를 계산해 놓고도 저장할 곳이 없어 버려지고 있었다.
--   ② 원본 콘텐츠 스크랩 이미지(/api/cardpress/source-images) — 남의 저작물이라 인용 표기가 필요.
-- 검수 UI가 "실제로 쓰인 사진"만 골라 캡션·스레드 글에 넣는다.

alter table public.content_cards
  add column if not exists photo_credits jsonb not null default '[]'::jsonb;
  -- [{url, credit, creditLink?, source:'unsplash'|'web'}]

-- 실행: Supabase Dashboard SQL Editor (멱등)
