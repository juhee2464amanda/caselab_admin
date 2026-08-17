-- 1030_content_cards_accent_prompt_guide.sql
-- Date: 2026-08-17
-- 목적: 자료실 소스 카드의 accent를 카테고리별로 분리한다.
--       기존엔 tools 소스면 category(tool|prompt|guide|context-card)와 무관하게 전부 'cat-tool' →
--       "바로쓰는 프롬프트" 콘텐츠 카드에도 우상단 배지가 "AI 도구"로 박히고 해시태그도 #AI도구가 붙었다.
--       accent는 배지 라벨(DEFAULT_TAGS)·포인트색(ACCENTS)·분류 해시태그(CATEGORY_TAGS)의 단일 축이라
--       값 자체를 늘리는 게 맞다.

alter table public.content_cards drop constraint if exists content_cards_accent_check;
alter table public.content_cards add constraint content_cards_accent_check
  check (accent in ('cat-case','cat-trend','cat-tool','cat-prompt','cat-guide'));

-- 이미 만들어진 자료실 카드 중 소스가 프롬프트/가이드인 것을 교정 (발행 완료분 포함 — 재생성 없이 배지만 맞춘다)
update public.content_cards c
set accent = case
      when t.category = 'prompt' then 'cat-prompt'
      else 'cat-guide'
    end
from public.tools t
where c.source_type = 'tool'
  and c.source_id = t.id
  and t.category in ('prompt','guide','context-card')
  and c.accent = 'cat-tool';
