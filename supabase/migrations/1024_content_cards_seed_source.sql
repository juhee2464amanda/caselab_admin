-- 1024_content_cards_seed_source.sql
-- Date: 2026-07-21
-- 목적: 카드뉴스 소스 2원화 — 발행 콘텐츠 외에 씨앗 아카이브(content_seeds)에서도
--       카드 세트를 직접 만들 수 있게 source_type='seed' 허용.
--       씨앗은 미발행 원석이므로 published 제약 없이 "존재 + 숨김(rejected) 아님"만 검증.

alter table public.content_cards
  drop constraint if exists content_cards_source_type_check;
alter table public.content_cards
  add constraint content_cards_source_type_check
  check (source_type in ('content','tool','seed'));

create or replace function public.check_content_cards_source()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source_type = 'content' then
    if not exists (select 1 from public.contents where id = new.source_id and status = 'published') then
      raise exception 'content_cards source must be a published content (id=%)', new.source_id;
    end if;
  elsif new.source_type = 'seed' then
    if not exists (select 1 from public.content_seeds where id = new.source_id and status <> 'rejected') then
      raise exception 'content_cards source must be a non-rejected seed (id=%)', new.source_id;
    end if;
  else
    if not exists (select 1 from public.tools where id = new.source_id and status = 'published') then
      raise exception 'content_cards source must be a published tool (id=%)', new.source_id;
    end if;
  end if;
  return new;
end;
$$;

-- 실행: supabase db push 또는 Dashboard SQL Editor Run.
