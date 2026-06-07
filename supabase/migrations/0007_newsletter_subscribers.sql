-- 0007_newsletter_subscribers.sql
-- Date: 2026-06-07
-- 목적: 비로그인 방문자의 뉴스레터 구독 수집 전용 테이블.
--       기존 SubscribeModal이 opinions(피드백 테이블)에 임시 저장하던 핵을 정리.
--       로그인 유저는 profiles.newsletter(트리거 trg_sync_brevo_contact) 경로 유지.
--       Brevo 동기화는 Day 9에 동일 패턴 트리거로 연결 (이 테이블 → Edge Function).

create table if not exists public.newsletter_subscribers (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  name text,
  source text not null default 'modal',            -- modal | ebook | footer
  consented boolean not null default false,          -- 약관/수신 동의
  status text not null default 'pending' check (status in ('pending','confirmed','unsubscribed')),
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

-- 익명 방문자도 구독 가능 (insert만)
create policy "Anyone subscribe"
  on public.newsletter_subscribers for insert with check (true);

-- 목록 조회는 admin만
create policy "Admins read subscribers"
  on public.newsletter_subscribers for select using (public.is_admin());

create index if not exists idx_newsletter_subscribers_created
  on public.newsletter_subscribers(created_at desc);

-- 실행: supabase db push (Caselab-prod 링크됨) 또는 Dashboard SQL Editor Run.
