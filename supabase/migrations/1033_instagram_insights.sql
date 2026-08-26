-- 1033_instagram_insights.sql
-- Date: 2026-08-26
-- 목적: /admin/insights 실데이터 — 인스타 게시물·일별 지표 스냅샷·광고 성과(수기).
--   오가닉 지표는 IG Graph API(graph.instagram.com, Instagram Login 토큰)로 동기화하고
--   (app/api/instagram/insights-sync), 광고는 API가 부스트 성과를 안 내려줘서 수기 입력.
--   utm_code는 utm_links.code와 느슨히 연결 — 사이트 전환(link_clicks 인간 클릭) 집계 키.
--   traits(분류·훅·형식·템플릿·커버)는 특성별 참여율 비교용, admin에서 직접 태깅.
-- 멱등: 재실행 안전.
-- 실행: Supabase Dashboard(Caselab-prod) SQL Editor에서 본 파일 전체 Run.

create table if not exists public.instagram_posts (
  ig_media_id text primary key,
  caption text,
  permalink text,
  media_type text,
  thumbnail_url text,
  posted_at timestamptz not null,
  category text,                 -- 콘텐츠 분류 (예: AI 트렌드·케이스·자료실)
  traits jsonb,                  -- { "훅": "...", "형식": "...", "템플릿": "...", "커버": "..." }
  utm_code text,                 -- utm_links.code — 사이트 전환 집계 키 (예: prompt11)
  content_id uuid references public.contents on delete set null,
  synced_at timestamptz not null default now()
);

create table if not exists public.instagram_metrics_daily (
  id uuid default gen_random_uuid() primary key,
  ig_media_id text not null references public.instagram_posts on delete cascade,
  captured_on date not null,
  reach int not null default 0,
  views int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  saves int not null default 0,
  shares int not null default 0,
  total_interactions int not null default 0,
  unique (ig_media_id, captured_on)
);

-- 부스트(광고)는 IG Login 토큰의 media insights에 합산되지 않아 수기로 기록한다.
create table if not exists public.instagram_ads (
  id uuid default gen_random_uuid() primary key,
  ig_media_id text not null references public.instagram_posts on delete cascade,
  status text not null default 'running',   -- running | ended
  spend int not null default 0,             -- KRW
  budget int not null default 0,
  views int not null default 0,
  profile_visits int not null default 0,
  follows int not null default 0,
  link_clicks int not null default 0,
  started_on date,
  ended_on date,
  memo text,
  updated_at timestamptz not null default now()
);

alter table public.instagram_posts enable row level security;
alter table public.instagram_metrics_daily enable row level security;
alter table public.instagram_ads enable row level security;

-- 읽기·쓰기 모두 admin 전용 (동기화는 service role이라 RLS 미적용)
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'instagram_posts' and policyname = 'Admins all instagram_posts') then
    create policy "Admins all instagram_posts" on public.instagram_posts for all using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'instagram_metrics_daily' and policyname = 'Admins all instagram_metrics_daily') then
    create policy "Admins all instagram_metrics_daily" on public.instagram_metrics_daily for all using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'instagram_ads' and policyname = 'Admins all instagram_ads') then
    create policy "Admins all instagram_ads" on public.instagram_ads for all using (public.is_admin());
  end if;
end $$;

-- ===== 검증 =====
-- select ig_media_id, posted_at, utm_code from public.instagram_posts order by posted_at desc;
-- select ig_media_id, captured_on, reach, views, saves from public.instagram_metrics_daily order by captured_on desc limit 20;
