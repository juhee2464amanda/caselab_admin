-- 1032_content_cards_ending_props.sql
-- Date: 2026-08-25
-- 목적: DM형(comment_dm) 엔딩 카드의 카드별 오버라이드 저장.
--   엔딩은 채널의 것이라 slides에 저장하지 않고 cta_type에서 파생하는데(lib/cardpress/endings.ts),
--   파생 props가 전부 하드코딩이라 포인트색을 못 바꾸고 배경이 항상 민짜 다크였다.
--   기본값은 여전히 파생(포인트색=카테고리색, 배경=커버 이미지)이고, 이 컬럼은
--   카드별로 그 기본을 덮어쓸 때만 채운다. null이면 파생 규칙 그대로.
--   스키마 정의는 types/cardpress.ts EndingPropsSchema (accentColor, image, overlay).
-- 멱등: 재실행 안전.
-- 실행: Supabase Dashboard(Caselab-prod) SQL Editor에서 본 파일 전체 Run.

alter table public.content_cards
  add column if not exists ending_props jsonb;

comment on column public.content_cards.ending_props is
  '엔딩 카드(comment_dm) 카드별 오버라이드. accentColor, image, overlay. null이면 파생 기본값. 정의는 types/cardpress.ts EndingPropsSchema';

-- ===== 검증 =====
-- select id, ending_props from public.content_cards where ending_props is not null;
