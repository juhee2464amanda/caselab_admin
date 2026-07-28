-- 1023_content_cards_cta_covers.sql
-- Date: 2026-07-18
-- 목적: ① 콘텐츠 성격별 CTA 유형 — info_save(정보 제공·저장 유도) / comment_dm(댓글 참여→DM, ManyChat 연동)
--       ② 커버 이미지 후보 자동 수급(Unsplash, 메타포 검색어 기반) 저장 — 검수 UI 원클릭 적용

alter table public.content_cards
  add column if not exists cta_type text not null default 'comment_dm'
    check (cta_type in ('info_save','comment_dm')),
  add column if not exists cta_keyword text,                          -- 댓글 트리거 키워드 (예: '프롬프트')
  add column if not exists cover_candidates jsonb not null default '[]'::jsonb; -- [{thumb,full,credit,creditLink}]

-- 실행: Supabase Dashboard SQL Editor (멱등)
