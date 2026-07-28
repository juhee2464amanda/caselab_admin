-- 수집 요청 큐 — admin '지금 수집 요청' 버튼 → 클라우드 큐 → 로컬 HERMES 폴러가 소진.
-- 랩톱이 켜지는 아무 때나 로컬 폴러가 claim → 수집 → /api/seeds/ingest → complete.
-- 9시 고정 크론 의존을 없애고, 버튼은 폰에서도 눌러 요청만 남긴다(요청은 클라우드에 영속).
-- ⚠️ 공유 prod는 db push 금지 — 대시보드 SQL Editor에서 멱등 적용(if not exists).
create table if not exists public.seed_collect_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  lanes text[] not null default '{}',            -- 요청 레인(비면 전체). seed-sources.SeedSource 키.
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'done', 'error')),
  claimed_at timestamptz,                          -- 로컬 폴러가 집어간 시각
  completed_at timestamptz,
  result_count int,                                -- 적재된 씨앗 건수(done)
  error text                                       -- 실패 사유(error)
);

-- 미완료 요청 조회(POST 중복 방지)·claim(가장 오래된 pending) 공용 인덱스.
create index if not exists idx_seed_collect_requests_status_created
  on public.seed_collect_requests (status, created_at);

-- service-role로만 접근(API 라우트: 세션 인증 후 admin client, 또는 토큰 인증).
-- RLS 켜고 정책 없음 → anon/authenticated 직접 접근 차단, service-role은 우회.
alter table public.seed_collect_requests enable row level security;

-- 원자적 claim — 가장 오래된 pending 1건을 claimed로 전환하며 반환.
-- for update skip locked: 폴러가 여러 개여도 같은 행 중복 claim 방지.
-- ⚠️ stale claimed 회수: 폴러가 claim 직후 crash하면(예: 랩톱 절전·프로세스 강제종료)
--    /complete를 못 호출해 요청이 'claimed'로 영구 고착 → UI가 "수집 중"을 무한 표시하고
--    이후 요청도 못 들어간다(실제 2일 정지 발생). 봇 1개 타임아웃이 30분이므로 claimed된 지
--    45분 넘은 요청은 죽은 것으로 보고 다시 집어간다.
create or replace function public.claim_collect_request()
returns setof public.seed_collect_requests
language sql
as $$
  update public.seed_collect_requests
     set status = 'claimed', claimed_at = now()
   where id = (
     select id from public.seed_collect_requests
      where status = 'pending'
         or (status = 'claimed' and claimed_at < now() - interval '45 minutes')
      order by created_at
      limit 1
      for update skip locked
   )
  returning *;
$$;
