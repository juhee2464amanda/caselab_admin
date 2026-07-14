-- ============================================================
-- 1018_featured_polymorphic.sql
-- 작성일: 2026-07-14
-- 목적: 큐레이션 재구성 —
--   1) 홈 히어로 슬롯(featured_contents)에 tools(도구/프롬프트)도 배치 가능하게 폴리모픽화.
--      기존엔 content_id(→contents) FK만 있어 tools 테이블의 도구/프롬프트는 배치 불가였음.
--   2) 유령/미사용 슬롯 정리: 미발행·제목 빈 콘텐츠가 점유한 슬롯, 홈 미사용 slot_type(highlight/links).
-- 배치 순서는 admin이 slot 번호 고정 + 페이로드 스왑으로 재정렬하므로 슬롯 제약(1~5)·unique는 유지.
-- 멱등: if exists / if not exists 사용 → 재실행 안전.
-- 실행: Supabase Dashboard(Caselab-prod) → SQL Editor → 본 파일 전체 Run.
-- ============================================================

begin;

-- ===== 1) 폴리모픽: content_id | tool_id 중 정확히 하나 =====
alter table public.featured_contents
  alter column content_id drop not null;

alter table public.featured_contents
  add column if not exists tool_id uuid references public.tools(id) on delete cascade;

comment on column public.featured_contents.tool_id is
  '히어로 슬롯이 tools(도구/프롬프트)를 가리킬 때. content_id와 상호배타(정확히 하나).';

-- content_id XOR tool_id
alter table public.featured_contents drop constraint if exists featured_contents_target_chk;
alter table public.featured_contents
  add constraint featured_contents_target_chk
  check (num_nonnulls(content_id, tool_id) = 1);

-- ===== 2) 유령/미사용 슬롯 정리 =====
-- 미발행이거나 제목이 빈 콘텐츠가 점유한 슬롯 제거 (어드민 #1 슬롯을 막던 draft 등)
delete from public.featured_contents fc
  using public.contents c
  where fc.content_id = c.id
    and (c.status <> 'published' or coalesce(btrim(c.title), '') = '');

-- 본가 홈은 slot_type='hero'만 렌더 → highlight/links 슬롯은 죽은 데이터라 정리
delete from public.featured_contents where slot_type in ('highlight', 'links');

commit;

-- ===== 검증 =====
-- select column_name, is_nullable from information_schema.columns
--   where table_name='featured_contents' and column_name in ('content_id','tool_id');  -- content_id nullable, tool_id 존재
-- select slot_type, count(*) from public.featured_contents group by 1;                  -- hero만 남아야 함
-- ============================================================
-- 1018 끝
-- ============================================================
