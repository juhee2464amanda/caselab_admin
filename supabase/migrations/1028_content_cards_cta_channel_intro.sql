-- 1028_content_cards_cta_channel_intro.sql
-- Date: 2026-08-16
-- 목적: 캡션 CTA 유형에 'channel_intro'(채널 안내형) 추가.
--   기존 2종은 모두 "어딘가로 보내는" CTA였다 — comment_dm(댓글→DM), info_save(프로필 링크).
--   소재가 그 자체로 완결적이면 보낼 곳이 없어 억지 링크 유도가 붙고, 실제로 "원본 링크에서
--   확인해보세요"처럼 인스타에서 클릭도 안 되는 죽은 CTA가 나갔다.
--   채널 안내형은 유입 대신 "이 계정이 뭘 하는 곳인지"를 각인시켜 팔로우로 잇는다.
--   문구 정의는 lib/cardpress/cta-endings.ts (생성 프롬프트와 검수 UI가 공유).
-- 멱등: 재실행 안전 (제약 drop 후 재생성).
-- 실행: Supabase Dashboard(Caselab-prod) → SQL Editor → 본 파일 전체 Run.

alter table public.content_cards drop constraint if exists content_cards_cta_type_check;
alter table public.content_cards
  add constraint content_cards_cta_type_check
  check (cta_type in ('info_save', 'comment_dm', 'channel_intro'));

-- 주의: 아래 comment 문의 문자열에 화살표/가운뎃점 같은 특수문자를 넣지 말 것.
-- Dashboard SQL Editor가 붙여넣기 중 그 문자들 주변을 삼켜 따옴표가 안 닫히고
-- "unterminated quoted string"으로 실패한 적이 있다(2026-08-16). 설명용이라 생략해도 무방하다.
comment on column public.content_cards.cta_type is
  '캡션 마무리 문법. comment_dm=댓글에서 DM 유도(리틀리), info_save=프로필 링크 유도, channel_intro=채널 안내. 문구 정의는 lib/cardpress/cta-endings.ts';

-- ===== 검증 =====
-- select cta_type, count(*) from public.content_cards group by 1;
-- insert 테스트: cta_type='channel_intro' 가 통과해야 함
