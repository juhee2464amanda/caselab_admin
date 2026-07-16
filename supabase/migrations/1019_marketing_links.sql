-- 1019 — 마케팅: ManyChat/인스타 숏링크 + 클릭 로그 (utm_links 확장)
--
-- 배경: ManyChat DM으로 발송하는 콘텐츠 링크의 유입을 추적한다.
-- 인스타 인앱 브라우저에서 GA4가 유실될 수 있어, 본가(공개앱)의
-- /l/{code} 리다이렉트 핸들러가 클릭을 서버측에서 직접 적재한 뒤
-- UTM 파라미터가 붙은 full_url로 302 리다이렉트한다.
--
-- code IS NULL = 기존 일반 UTM 링크 (기존 행 무영향).

alter table public.utm_links
  add column if not exists code        text,                        -- 숏링크 슬러그 (/l/{code})
  add column if not exists kind        text not null default 'utm', -- 'utm' | 'manychat'
  add column if not exists ig_post_url text,                        -- 인스타 게시물 URL
  add column if not exists keyword     text,                        -- DM 트리거 댓글 키워드
  add column if not exists flow_name   text,                        -- ManyChat 플로우 이름
  add column if not exists memo        text,
  add column if not exists is_active   boolean not null default true;

create unique index if not exists idx_utm_links_code
  on public.utm_links(code) where code is not null;
create index if not exists idx_utm_links_kind on public.utm_links(kind);

-- 클릭 로그. events와 별도 테이블인 이유: 서버측 리다이렉트 클릭은
-- 세션/유저 개념이 없고 referer·UA만 남긴다 (IP는 저장하지 않음).
create table if not exists public.link_clicks (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references public.utm_links(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  referer    text,
  user_agent text,
  is_bot     boolean not null default false   -- UA 기반 판정 (링크 프리뷰 봇 집계 제외용)
);
create index if not exists idx_link_clicks_link_time
  on public.link_clicks(link_id, clicked_at desc);

alter table public.link_clicks enable row level security;
drop policy if exists "Admin reads link_clicks" on public.link_clicks;
create policy "Admin reads link_clicks" on public.link_clicks
  for select using (public.is_admin());
-- insert 정책 없음: 본가 redirect handler가 service-role로 적재 (RLS 우회)
