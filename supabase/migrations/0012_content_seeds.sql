-- 0012_content_seeds.sql
-- Date: 2026-06-26
-- 목적: HERMES 브리퍼 씨앗(seed)을 Notion 대신 Supabase에 적재.
--       운영자가 Notion을 안 써서(너무 복잡), seed triage·생성·발행을 전부 /admin 한 대시보드에서.
--       기존 Notion Seed Backlog는 은퇴(옛날 seed 이관 안 함, 새것부터 여기 쌓임).
--       적재는 webhook(/api/slack/hermes-brief)이 service-role로 수행 → RLS insert 정책 불필요.
--       조회·triage(채택/반려/메모)는 admin만 (browser client + RLS).

create table if not exists public.content_seeds (
  id uuid default gen_random_uuid() primary key,
  title text not null,                               -- "[lane] 첫 줄"
  raw_text text not null,                             -- 브리핑 원문
  source_url text,                                    -- Slack permalink ("p<ts>" 포함)
  origin text not null default 'hermes-slack',        -- hermes-slack | hermes-telegram | manual
  lane text,                                          -- scout | analyst | briefing | weekly
  slack_ts text unique,                               -- Slack 메시지 ts → 멱등성(중복 적재 방지)
  status text not null default 'raw'
    check (status in ('raw','adopted','generating','published','rejected')),
  content_id uuid references public.contents(id) on delete set null,  -- 이 seed가 된 콘텐츠 역추적
  note text,                                          -- triage 메모(각도·실험가설 등)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.content_seeds enable row level security;

-- 조회·수정·삭제는 admin만. (insert는 service-role webhook이 RLS 우회로 수행)
create policy "Admins manage content_seeds"
  on public.content_seeds for all
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_content_seeds_status_created
  on public.content_seeds(status, created_at desc);
create index if not exists idx_content_seeds_lane
  on public.content_seeds(lane);

-- updated_at 자동 갱신
create or replace function public.touch_content_seeds_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_content_seeds_updated_at on public.content_seeds;
create trigger trg_content_seeds_updated_at
  before update on public.content_seeds
  for each row execute function public.touch_content_seeds_updated_at();

-- 실행: supabase db push (Caselab-prod 링크됨) 또는 Dashboard SQL Editor Run.
