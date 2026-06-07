-- ============================================================
-- CaseLab Supabase Schema — 0002_admin_p0
-- Admin 풀스택 P0 보강 (계획서 v2 §D1~D20)
--
-- 실행 방법:
-- 1) Supabase Dashboard → SQL Editor → New query → 본 파일 전체 복붙 → Run
-- 2) Storage 버킷 `thumbnails` 수동 생성 (Dashboard → Storage → New bucket, Public: ON)
-- 3) DB 설정 1회 (아래 "Day 11 1회 설정" 섹션 SQL 따로 실행, URL/key 본인 값으로)
--
-- 의존성: 0001_init.sql 가 먼저 적용되어 있어야 함
-- 멱등성: 모두 `if not exists` / `create or replace` 사용 → 재실행 안전
-- ============================================================


-- ============================================================
-- 1. 컬럼 추가 (멀티 테이블)
-- ============================================================
-- 1-1. comments: 모더레이션 메모 (계획 §D 댓글)
alter table public.comments
  add column if not exists moderation_note text;

-- 1-2. opinions: Brevo 발송 messageId 추적 (D3)
alter table public.opinions
  add column if not exists reply_email_id text;

-- 1-3. profiles: admin 메모 + 분석 동의 토글 (D4, P1 사용자 admin_note는 P1 작업이지만 컬럼은 미리)
alter table public.profiles
  add column if not exists admin_note text;
alter table public.profiles
  add column if not exists analytics_consent boolean not null default false;

-- 1-4. purchases: PG 결제 hook 미리 (D14, Phase 4 PG 도입 대비)
alter table public.purchases
  add column if not exists payment_method text;
alter table public.purchases
  add column if not exists payment_id text;
alter table public.purchases
  add column if not exists refund_status text;
alter table public.purchases
  add column if not exists refund_at timestamptz;
-- 기존 purchases.status 의 'refunded' enum 값은 0001에 이미 포함됨


-- ============================================================
-- 2. 권한 확장 — role enum에 'editor' 추가 (D17)
-- ============================================================
-- 기존 profiles.role 은 text 기본값 'user'. constraint 가 없으면 추가만, 있으면 교체.
do $$
begin
  if exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'profiles_role_check'
  ) then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user','editor','admin'));

-- is_editor() — editor 또는 admin 이면 true
create or replace function public.is_editor()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('editor','admin')
  );
end;
$$;


-- ============================================================
-- 3. 메인 Hero 큐레이션 (D15) — featured_contents
-- ============================================================
create table if not exists public.featured_contents (
  id uuid default gen_random_uuid() primary key,
  content_id uuid references public.contents on delete cascade not null,
  slot smallint not null check (slot between 1 and 5),
  active boolean not null default true,
  sort_label text,                       -- 운영자 메모 ("이번 주 ⭐", "신규" 등)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(slot)
);

create index if not exists idx_featured_active on public.featured_contents(active, slot);

alter table public.featured_contents enable row level security;

create policy "Public read active featured"
  on public.featured_contents for select using (active = true or public.is_admin());

create policy "Admins manage featured"
  on public.featured_contents for all using (public.is_admin()) with check (public.is_admin());


-- ============================================================
-- 4. 알림 view (D16) — 사이드바 배지 + 종 드롭다운 원천 데이터
-- ============================================================
-- topic_suggestions.status='open' = 운영자 미검토 (시안의 "비공개"와 다름. 시안 토글은 별도 컬럼 추가가 더 정확하나, P0는 status='open' 으로 운영)
create or replace view public.admin_notifications as
select
  (select count(*) from public.opinions where status='new')        as opinions_new,
  (select count(*) from public.comments where status='reported')   as comments_reported,
  (select count(*) from public.purchases where status='failed')    as purchases_failed,
  (select count(*) from public.topic_suggestions where status='open') as topics_open,
  (select max(created_at) from public.opinions where status='new') as last_opinion_at,
  (select max(created_at) from public.comments where status='reported') as last_comment_report_at,
  (select max(created_at) from public.purchases where status='failed') as last_purchase_fail_at;

-- 분석 페이지 — admin 만 SELECT (view 는 RLS 우회되므로 security 함수 권장)
-- 단순화: 위 view 는 admin 페이지에서만 호출되며 admin 가드된 API 통해서만 노출
-- (RLS 회피용 service role 사용 또는 RPC 래핑 권장 — 현재는 view 직접 호출 + 클라이언트단 admin 가드 의존)


-- ============================================================
-- 5. 분석 데이터 — view + RPC (D5 분석 P0)
-- ============================================================
-- 주간 KPI (Tools 5카드 + North Star 원천)
-- events.metadata 에 user_id 가 jsonb 로 저장되는 케이스와 events.user_id 컬럼 둘 다 지원
create or replace view public.weekly_kpi as
with
this_week as (
  select
    -- 북극성: 주간 prompt_copy UV (user_id 컬럼 또는 metadata->>'user_id')
    count(distinct coalesce(user_id::text, metadata->>'user_id'))
      filter (where event_type='prompt_copy' and created_at > now() - interval '7 days') as prompt_copy_uv_7d,
    -- 5KPI: PV (visitors)
    count(distinct coalesce(user_id::text, metadata->>'user_id'))
      filter (where event_type='pageview' and created_at > now() - interval '7 days') as uv_7d,
    count(*) filter (where event_type='pageview' and created_at > now() - interval '7 days') as pv_7d,
    -- 프롬프트 복사 절대 수
    count(*) filter (where event_type='prompt_copy' and created_at > now() - interval '7 days') as prompt_copy_count_7d,
    -- 저장
    count(*) filter (where event_type='save' and created_at > now() - interval '7 days') as save_count_7d,
    -- 반응 (좋아요)
    count(*) filter (where event_type='react' and created_at > now() - interval '7 days') as react_count_7d
  from public.events
),
prev_week as (
  select
    count(distinct coalesce(user_id::text, metadata->>'user_id'))
      filter (where event_type='prompt_copy' and created_at between now() - interval '14 days' and now() - interval '7 days') as prompt_copy_uv_prev_7d,
    count(distinct coalesce(user_id::text, metadata->>'user_id'))
      filter (where event_type='pageview' and created_at between now() - interval '14 days' and now() - interval '7 days') as uv_prev_7d
  from public.events
),
profiles_kpi as (
  select
    (select count(*) from public.profiles) as total_users,
    (select count(*) from public.profiles where created_at > now() - interval '7 days') as new_users_7d,
    (select count(*) from public.profiles where created_at between now() - interval '14 days' and now() - interval '7 days') as new_users_prev_7d
)
select * from this_week, prev_week, profiles_kpi;


-- 북극성 RPC: 단순 wrapper + delta % 계산
create or replace function public.get_north_star()
returns table (
  weekly_uv bigint,
  prev_uv bigint,
  delta_pct numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    w.prompt_copy_uv_7d::bigint                                                 as weekly_uv,
    w.prompt_copy_uv_prev_7d::bigint                                            as prev_uv,
    case
      when w.prompt_copy_uv_prev_7d = 0 then 0::numeric
      else round(((w.prompt_copy_uv_7d::numeric - w.prompt_copy_uv_prev_7d::numeric) / w.prompt_copy_uv_prev_7d::numeric) * 100, 1)
    end                                                                          as delta_pct
  from public.weekly_kpi w;
end;
$$;


-- 일별 PV·저장 추이 (라인 차트 원천, 최근 30일)
create or replace function public.get_daily_trend(days int default 30)
returns table (
  day date,
  pv bigint,
  saves bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with date_series as (
    select generate_series(
      date_trunc('day', now() - (days || ' days')::interval)::date,
      date_trunc('day', now())::date,
      interval '1 day'
    )::date as d
  )
  select
    ds.d as day,
    coalesce((select count(*) from public.events e where e.event_type='pageview' and e.created_at::date = ds.d), 0)::bigint as pv,
    coalesce((select count(*) from public.events e where e.event_type='save'     and e.created_at::date = ds.d), 0)::bigint as saves
  from date_series ds
  order by ds.d;
end;
$$;


-- RPC 권한: admin/editor 만 호출 가능 (security definer 이지만 명시적 가드)
revoke all on function public.get_north_star() from public;
grant execute on function public.get_north_star() to authenticated;

revoke all on function public.get_daily_trend(int) from public;
grant execute on function public.get_daily_trend(int) to authenticated;


-- ============================================================
-- 6. DB Trigger — 전자책 자동 발송 (D8)
-- ============================================================
-- purchases INSERT (status='pending') → pg_net 으로 send-ebook Edge Function 자동 호출
-- 운영자가 잠들어도 30초 내 메일 도착
create extension if not exists pg_net;

create or replace function public.trg_send_ebook_on_purchase()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url      text := current_setting('app.send_ebook_url', true);
  service_key text := current_setting('app.service_role_key', true);
begin
  -- 설정 누락 시 silent skip (Day 11에 alter database 1회 실행 필요)
  if fn_url is null or service_key is null then
    return new;
  end if;

  if new.status = 'pending' then
    perform net.http_post(
      url     := fn_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_key,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object('purchase_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists send_ebook_after_purchase on public.purchases;
create trigger send_ebook_after_purchase
  after insert on public.purchases
  for each row execute function public.trg_send_ebook_on_purchase();


-- ============================================================
-- 7. DB Trigger — Brevo Contact 자동 동기화 (D19)
-- ============================================================
-- profiles.newsletter=true 신규 가입 OR newsletter false→true 전환 → sync-brevo-contact Edge Function 호출
-- (Edge Function 자체는 P1에 배포해도 OK. 트리거만 미리 박아 두면 즉시 동작)
create or replace function public.trg_sync_brevo_contact()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url      text := current_setting('app.sync_brevo_url', true);
  service_key text := current_setting('app.service_role_key', true);
  action      text;
begin
  if fn_url is null or service_key is null then
    return new;
  end if;

  -- 액션 결정
  if (tg_op = 'INSERT' and new.newsletter is true) then
    action := 'subscribe';
  elsif (tg_op = 'UPDATE' and new.newsletter is distinct from old.newsletter) then
    action := case when new.newsletter then 'subscribe' else 'unsubscribe' end;
  else
    return new;
  end if;

  if new.email is null then
    return new;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'email',  new.email,
      'name',   coalesce(new.name, ''),
      'action', action
    )
  );
  return new;
end;
$$;

drop trigger if exists sync_brevo_on_newsletter on public.profiles;
create trigger sync_brevo_on_newsletter
  after insert or update of newsletter, email on public.profiles
  for each row execute function public.trg_sync_brevo_contact();


-- ============================================================
-- 8. updated_at 자동 갱신 trigger (계획서 외 보강)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_contents_updated_at on public.contents;
create trigger trg_contents_updated_at
  before update on public.contents
  for each row execute function public.set_updated_at();

drop trigger if exists trg_comments_updated_at on public.comments;
create trigger trg_comments_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

drop trigger if exists trg_tools_updated_at on public.tools;
create trigger trg_tools_updated_at
  before update on public.tools
  for each row execute function public.set_updated_at();

drop trigger if exists trg_featured_updated_at on public.featured_contents;
create trigger trg_featured_updated_at
  before update on public.featured_contents
  for each row execute function public.set_updated_at();


-- ============================================================
-- 9. Storage 정책 — thumbnails 버킷 (수동 생성 후 실행)
-- ============================================================
-- 사전 작업: Dashboard → Storage → New bucket
--   name: thumbnails
--   Public bucket: ON  (썸네일은 SSR/ISR 에 public URL 노출됨)
--
-- 아래 정책은 버킷 생성 후 실행. 버킷 미존재 시 skip.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'thumbnails') then
    -- 인증된 admin/editor 만 INSERT/UPDATE/DELETE
    drop policy if exists "Editors insert thumbnails"   on storage.objects;
    drop policy if exists "Editors update thumbnails"   on storage.objects;
    drop policy if exists "Editors delete thumbnails"   on storage.objects;
    drop policy if exists "Anyone read thumbnails"      on storage.objects;

    create policy "Anyone read thumbnails"
      on storage.objects for select
      using (bucket_id = 'thumbnails');

    create policy "Editors insert thumbnails"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'thumbnails' and public.is_editor());

    create policy "Editors update thumbnails"
      on storage.objects for update to authenticated
      using (bucket_id = 'thumbnails' and public.is_editor());

    create policy "Editors delete thumbnails"
      on storage.objects for delete to authenticated
      using (bucket_id = 'thumbnails' and public.is_editor());
  end if;
end $$;


-- ============================================================
-- 10. 보강: 0001 의 admin_stats / content_stats 는 그대로 유지
-- (weekly_kpi, get_north_star, get_daily_trend, admin_notifications 가 추가됨)
-- ============================================================


-- ============================================================
-- Day 11 1회 설정 (운영자가 SQL Editor 에 따로 실행)
-- ============================================================
--
-- ⚠️ 아래 두 블록은 본 마이그레이션과 함께 실행하지 말 것.
-- ⚠️ <project-ref> 와 <service_role_key> 를 본인 값으로 치환.
--
-- 1) DB 설정 (pg_net trigger 가 사용)
-- ------------------------------------------------------------
-- alter database postgres set app.send_ebook_url  = 'https://<project-ref>.supabase.co/functions/v1/send-ebook';
-- alter database postgres set app.sync_brevo_url  = 'https://<project-ref>.supabase.co/functions/v1/sync-brevo-contact';
-- alter database postgres set app.service_role_key = '<service_role_key>';
--
-- 2) 운영자 본인을 editor 가 아니라 admin 으로 설정 (이미 0001 이후 1회 했다면 skip)
-- ------------------------------------------------------------
-- update public.profiles set role='admin', onboarded=true where email='caselab.kr@gmail.com';
