-- 1020_content_cards.sql
-- Date: 2026-07-17
-- 목적: 카드프레스(CardPress) — 발행 콘텐츠 → 인스타 캐러셀·캡션·스레드 3종 세트 (docs/09_card_press_spec.md §5)
--       소스는 contents(case/trend) 또는 tools(prompt/guide 등) 폴리모픽 → FK 대신 트리거로
--       "published 콘텐츠만" 제약을 검증한다.
--       슬라이드 PNG는 cardpress 버킷(Public — IG/Threads API가 공개 URL 요구)에 업로드.

create table if not exists public.content_cards (
  id uuid default gen_random_uuid() primary key,
  source_type text not null check (source_type in ('content','tool')),
  source_id uuid not null,
  slides jsonb not null default '[]'::jsonb,          -- [{template,order,enabled,props,sourceSection,required?}]
  accent text not null default 'cat-case'
    check (accent in ('cat-case','cat-trend','cat-tool')),
  extracted_images jsonb not null default '[]'::jsonb, -- 본문에서 추출한 이미지 url 배열
  ig_caption text,                                     -- 캡션 자동 초안 + 해시태그 (편집 가능)
  threads_text text,                                   -- 스레드용 재작성 글 + 본가 URL (편집 가능)
  threads_cover text,                                  -- 커버 1장 url | null
  status text not null default 'auto_draft'
    check (status in ('auto_draft','reviewed','published')),
  published_to jsonb not null default '[]'::jsonb,     -- [{channel,post_id,at}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)                      -- 콘텐츠당 카드 세트 1개
);

-- 소스는 "발행 완료 콘텐츠만" (spec §3-① 제약) — 폴리모픽이라 FK 불가, 트리거로 검증
create or replace function public.check_content_cards_source()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source_type = 'content' then
    if not exists (select 1 from public.contents where id = new.source_id and status = 'published') then
      raise exception 'content_cards source must be a published content (id=%)', new.source_id;
    end if;
  else
    if not exists (select 1 from public.tools where id = new.source_id and status = 'published') then
      raise exception 'content_cards source must be a published tool (id=%)', new.source_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_content_cards_source on public.content_cards;
create trigger trg_content_cards_source
  before insert or update of source_type, source_id on public.content_cards
  for each row execute function public.check_content_cards_source();

alter table public.content_cards enable row level security;

create policy "Admins manage content_cards"
  on public.content_cards for all
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_content_cards_status_created
  on public.content_cards(status, created_at desc);
create index if not exists idx_content_cards_source
  on public.content_cards(source_type, source_id);

-- updated_at 자동 갱신
create or replace function public.touch_content_cards_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_content_cards_updated_at on public.content_cards;
create trigger trg_content_cards_updated_at
  before update on public.content_cards
  for each row execute function public.touch_content_cards_updated_at();

-- ============================================================
-- cardpress 버킷 — 렌더된 슬라이드 PNG (Public: IG/Threads API가 공개 URL 요구)
-- 경로 규칙: {content_cards.id}/{order}_{template}.png
-- ============================================================
insert into storage.buckets (id, name, public)
values ('cardpress', 'cardpress', true)
on conflict (id) do nothing;

drop policy if exists "Anyone reads cardpress" on storage.objects;
create policy "Anyone reads cardpress"
  on storage.objects for select
  using (bucket_id = 'cardpress');

drop policy if exists "Admins manage cardpress" on storage.objects;
create policy "Admins manage cardpress"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'cardpress' and public.is_admin())
  with check (bucket_id = 'cardpress' and public.is_admin());

-- 실행: supabase db push 또는 Dashboard SQL Editor Run.
