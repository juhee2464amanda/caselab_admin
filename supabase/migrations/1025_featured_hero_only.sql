-- ============================================================
-- 1025_featured_hero_only.sql
-- 작성일: 2026-08-07
-- 목적: 홈 배치 슬롯을 slot_type='hero' 하나로 고정.
--   본가 홈(apps/caselab · lib/data/contents.ts listFeaturedContents)은 'hero'만 렌더하는데
--   admin은 highlight/links로도 insert할 수 있었다 → "Highlight에 배치됨" 성공 메시지는 뜨지만
--   홈에도 큐레이션 화면에도 안 보이는 유령 슬롯이 생김. 1018은 데이터만 지웠고 제약·쓰기 경로는
--   그대로여서 재발함. 여기서 제약으로 막아 조용히 죽는 대신 즉시 실패하게 한다.
--   1) 남아 있는 비-hero 슬롯을 빈 hero 슬롯(1~5)으로 승격, 자리가 없으면 삭제
--   2) slot_type check를 'hero' 하나로 축소
-- 멱등: 재실행 안전(비-hero가 없으면 1)은 no-op).
-- 실행: Supabase Dashboard(Caselab-prod) → SQL Editor → 본 파일 전체 Run.
-- ============================================================

begin;

-- ===== 1) 비-hero 슬롯 구제 — 오래된 순으로 빈 hero 슬롯에 채운다 =====
with free_slots as (
  select g.n, row_number() over (order by g.n) as rn
  from generate_series(1, 5) as g(n)
  where not exists (
    select 1 from public.featured_contents f
    where f.slot_type = 'hero' and f.slot = g.n
  )
),
orphans as (
  select id, row_number() over (order by slot_type, slot, id) as rn
  from public.featured_contents
  where slot_type <> 'hero'
)
update public.featured_contents f
   set slot_type = 'hero', slot = fs.n
  from orphans o
  join free_slots fs on fs.rn = o.rn
 where f.id = o.id;

-- 빈 hero 슬롯을 못 얻은 나머지는 렌더되지 않는 죽은 데이터 → 제거
delete from public.featured_contents where slot_type <> 'hero';

-- ===== 2) slot_type = 'hero'만 허용 =====
alter table public.featured_contents drop constraint if exists featured_contents_slot_type_check;
alter table public.featured_contents
  add constraint featured_contents_slot_type_check check (slot_type = 'hero');

alter table public.featured_contents alter column slot_type set default 'hero';

comment on column public.featured_contents.slot_type is
  '항상 ''hero''. 본가 홈이 hero 슬롯만 렌더한다. 새 노출 영역이 필요하면 본가 렌더러부터 만들고 이 제약을 넓힐 것.';

commit;

-- ===== 검증 =====
-- select slot_type, slot, content_id, tool_id, active from public.featured_contents order by slot;
--   → slot_type은 전부 hero, slot 1~5
-- insert into public.featured_contents(content_id, slot_type, slot) values (null, 'highlight', 1);
--   → featured_contents_slot_type_check 위반 에러가 나야 정상
-- ============================================================
-- 1025 끝
-- ============================================================
