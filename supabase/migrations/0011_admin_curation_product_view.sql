-- ============================================================
-- 0011_admin_curation_product_view.sql
-- 작성일: 2026-06-08
-- 목적: admin 피드백 인터뷰(2026-06-08) 반영 스키마.
--   #3 큐레이션 Hero 예약 노출 — featured_contents.featured_from / featured_until
--   #6 ebook 조회 추적     — events.product_id (product_view 이벤트 집계용)
-- 의존: 0010_repair_missing_tables 적용 후 (featured_contents 존재 전제)
-- 멱등: add column if not exists / create index if not exists  → 재실행 안전
-- 실행: Supabase Dashboard(Caselab-prod) → SQL Editor → 본 파일 전체 Run.
-- ============================================================

-- ===== #3. Hero 예약 노출 기간 =====
-- null이면 상시 노출. admin '대표 날짜 프리셋(1주/2달)'이 featured_from~until로 적용.
alter table public.featured_contents
  add column if not exists featured_from  timestamptz,
  add column if not exists featured_until timestamptz;

comment on column public.featured_contents.featured_from is
  '예약 노출 시작 (null=상시). hero 대표 날짜 프리셋 적용';
comment on column public.featured_contents.featured_until is
  '예약 노출 종료 (null=무기한)';

create index if not exists idx_featured_schedule
  on public.featured_contents(slot_type, featured_from, featured_until)
  where active;

-- ===== #6. events.product_id (product 대상 이벤트) =====
-- events.content_id는 contents FK라 product를 담을 수 없음 → 별도 product_id 컬럼.
-- product_view 이벤트: insert into events(event_type='product_view', product_id, user_id).
alter table public.events
  add column if not exists product_id uuid references public.products(id) on delete set null;

create index if not exists idx_events_product
  on public.events(event_type, product_id, created_at desc)
  where product_id is not null;

comment on column public.events.product_id is
  'product 대상 이벤트(product_view 등). contents 대상은 content_id 사용';

-- ===== 검증 =====
-- select column_name from information_schema.columns
--   where table_name='featured_contents' and column_name in ('featured_from','featured_until');  -- 2
-- select column_name from information_schema.columns
--   where table_name='events' and column_name='product_id';                                       -- 1
-- ============================================================
-- 0011 끝
-- ============================================================
