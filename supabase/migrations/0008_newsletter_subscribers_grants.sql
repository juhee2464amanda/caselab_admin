-- 0008_newsletter_subscribers_grants.sql
-- Date: 2026-06-07
-- 목적: 0007에서 만든 newsletter_subscribers의 anon insert가 42501(RLS 거부)로 막힘.
--       CLI(db push)로 생성된 테이블은 anon/authenticated 역할에 grant·정책 바인딩이
--       누락될 수 있어, 명시적 GRANT + 역할 지정(to anon, authenticated)으로 보강.
--       멱등(IF EXISTS / 재생성).

-- 테이블 레벨 권한 (PostgREST anon/authenticated 역할)
grant insert on public.newsletter_subscribers to anon, authenticated;
grant select on public.newsletter_subscribers to authenticated;

-- insert 정책을 anon·authenticated에 명시적으로 적용 (기존 정책 드롭 후 재생성)
drop policy if exists "Anyone subscribe" on public.newsletter_subscribers;
create policy "Anyone subscribe"
  on public.newsletter_subscribers
  for insert
  to anon, authenticated
  with check (true);

-- 실행: supabase db push (Caselab-prod 링크됨).
