-- ============================================================
-- CaseLab Supabase Schema — 0001_init
-- 개발계획서 v2 §5 기준
-- ============================================================

-- ============================================================
-- 1. profiles (auth.users 확장)
-- ============================================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  email text,
  job text,
  avatar_url text,
  role text not null default 'user',
  status text not null default 'active',
  onboarded boolean not null default false,
  newsletter boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_role on public.profiles(role);

alter table public.profiles enable row level security;

-- ============================================================
-- 2. is_admin() 함수 (RLS 캐싱)
-- ============================================================
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$;

-- ============================================================
-- 3. 자동 profile 생성 trigger
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar_url, onboarded)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', ''),
    false
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- profiles RLS
create policy "Public profiles viewable"
  on public.profiles for select using (true);

create policy "Users update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Admins update any profile"
  on public.profiles for update using (public.is_admin());


-- ============================================================
-- 4. contents (실전 케이스 + AI 트렌드 통합)
-- ============================================================
create table public.contents (
  id uuid default gen_random_uuid() primary key,
  slug text not null unique,
  track text not null check (track in ('case','trend')),
  title text not null,
  summary text,
  body jsonb not null default '{}'::jsonb,
  job_tags text[] not null default '{}',
  persona_coverage text[] not null default '{}',
  read_min int not null default 0,
  apply_min int not null default 0,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  curated boolean not null default false,
  thumbnail_url text,
  author_quote text,
  view_count int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_contents_track_status on public.contents(track, status);
create index idx_contents_published_at on public.contents(published_at desc) where status='published';
create index idx_contents_curated on public.contents(curated) where curated=true;
create index idx_contents_job_tags on public.contents using gin(job_tags);
-- full-text search (Korean: simple config 사용, 운영 시 pg_trgm 확장 고려)
create index idx_contents_fts on public.contents using gin (
  to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,''))
);

alter table public.contents enable row level security;

create policy "Published contents readable"
  on public.contents for select using (status='published' or public.is_admin());

create policy "Admins manage contents"
  on public.contents for all using (public.is_admin()) with check (public.is_admin());


-- ============================================================
-- 5. reactions (likes 통합: like / up / down)
-- ============================================================
create table public.reactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  content_id uuid references public.contents on delete cascade not null,
  type text not null check (type in ('like','up','down')),
  created_at timestamptz not null default now(),
  unique(user_id, content_id, type)
);

create index idx_reactions_content on public.reactions(content_id);

alter table public.reactions enable row level security;

create policy "Users view own reactions"
  on public.reactions for select using (auth.uid() = user_id or public.is_admin());

create policy "Users insert own reactions"
  on public.reactions for insert with check (auth.uid() = user_id);

create policy "Users delete own reactions"
  on public.reactions for delete using (auth.uid() = user_id);


-- ============================================================
-- 6. saves (북마크)
-- ============================================================
create table public.saves (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  content_id uuid references public.contents on delete cascade not null,
  created_at timestamptz not null default now(),
  unique(user_id, content_id)
);

create index idx_saves_user on public.saves(user_id);

alter table public.saves enable row level security;

create policy "Users view own saves"
  on public.saves for select using (auth.uid() = user_id or public.is_admin());

create policy "Users insert own saves"
  on public.saves for insert with check (auth.uid() = user_id);

create policy "Users delete own saves"
  on public.saves for delete using (auth.uid() = user_id);


-- ============================================================
-- 7. comments (공개 댓글 — 1단 reply 허용)
-- ============================================================
create table public.comments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  content_id uuid references public.contents on delete cascade not null,
  parent_id uuid references public.comments on delete cascade,
  body text not null,
  status text not null default 'visible' check (status in ('visible','hidden','reported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_comments_content on public.comments(content_id, created_at desc);
create index idx_comments_status on public.comments(status);

alter table public.comments enable row level security;

create policy "Visible comments readable"
  on public.comments for select using (status='visible' or public.is_admin() or user_id=auth.uid());

create policy "Users insert own comments"
  on public.comments for insert with check (auth.uid() = user_id);

create policy "Users update own comments"
  on public.comments for update using (auth.uid() = user_id);

create policy "Users delete own comments"
  on public.comments for delete using (auth.uid() = user_id or public.is_admin());

create policy "Admins manage comments"
  on public.comments for update using (public.is_admin());


-- ============================================================
-- 8. opinions (의견함 — 익명 허용)
-- ============================================================
create table public.opinions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete set null,
  content_id uuid references public.contents on delete set null,
  email text,
  body text not null,
  status text not null default 'new' check (status in ('new','read','replied')),
  reply_body text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_opinions_status on public.opinions(status, created_at desc);

alter table public.opinions enable row level security;

create policy "Anyone insert opinions"
  on public.opinions for insert with check (true);

create policy "Users view own opinions"
  on public.opinions for select using (
    (user_id is not null and user_id = auth.uid()) or public.is_admin()
  );

create policy "Admins manage opinions"
  on public.opinions for update using (public.is_admin());


-- ============================================================
-- 9. events (비즈니스 이벤트 분석)
-- ============================================================
create table public.events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete set null,
  content_id uuid references public.contents on delete set null,
  event_type text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_events_type_created on public.events(event_type, created_at desc);
create index idx_events_content on public.events(content_id);

alter table public.events enable row level security;

create policy "Anyone insert events"
  on public.events for insert with check (true);

create policy "Admins view events"
  on public.events for select using (public.is_admin());


-- ============================================================
-- 10. products (전자책 등)
-- ============================================================
create table public.products (
  id uuid default gen_random_uuid() primary key,
  slug text not null unique,
  title text not null,
  description text,
  type text not null default 'ebook' check (type in ('ebook')),
  price int not null default 0,
  pdf_path text,
  thumbnail_url text,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "Active products readable"
  on public.products for select using (status='active' or public.is_admin());

create policy "Admins manage products"
  on public.products for all using (public.is_admin()) with check (public.is_admin());


-- ============================================================
-- 11. purchases (전자책 구매/주문 이력)
-- ============================================================
create table public.purchases (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete set null,
  product_id uuid references public.products on delete cascade not null,
  name text not null,
  phone text,
  email text not null,
  amount int not null default 0,
  status text not null default 'pending' check (status in ('pending','sent','failed','refunded')),
  sent_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_purchases_user on public.purchases(user_id);
create index idx_purchases_status on public.purchases(status, created_at desc);

alter table public.purchases enable row level security;

create policy "Users view own purchases"
  on public.purchases for select using (
    (user_id is not null and auth.uid() = user_id) or public.is_admin()
  );

create policy "Anyone insert purchases"
  on public.purchases for insert with check (true);

create policy "Admins update purchases"
  on public.purchases for update using (public.is_admin());


-- ============================================================
-- 12. tools (자료실 통합: tool / prompt / guide / context-card)
-- ============================================================
create table public.tools (
  id uuid default gen_random_uuid() primary key,
  slug text not null unique,
  name text not null,
  category text not null check (category in ('tool','prompt','guide','context-card')),
  description text,
  body jsonb default '{}'::jsonb,
  url text,
  pricing_tier text default 'free' check (pricing_tier in ('free','freemium','paid','custom')),
  job_tags text[] default '{}',
  thumbnail_url text,
  status text not null default 'published' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tools_category on public.tools(category, status);

alter table public.tools enable row level security;

create policy "Published tools readable"
  on public.tools for select using (status='published' or public.is_admin());

create policy "Admins manage tools"
  on public.tools for all using (public.is_admin()) with check (public.is_admin());


-- ============================================================
-- 13. topic_suggestions / topic_votes (후보 투표)
-- ============================================================
create table public.topic_suggestions (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  author_id uuid references auth.users on delete set null,
  content_id uuid references public.contents on delete set null,
  vote_count int not null default 0,
  status text not null default 'open' check (status in ('open','planned','published','rejected')),
  created_at timestamptz not null default now()
);

alter table public.topic_suggestions enable row level security;

create policy "Anyone view suggestions"
  on public.topic_suggestions for select using (true);

create policy "Auth users insert suggestions"
  on public.topic_suggestions for insert with check (auth.uid() is not null);

create policy "Admins update suggestions"
  on public.topic_suggestions for update using (public.is_admin());

create table public.topic_votes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  suggestion_id uuid references public.topic_suggestions on delete cascade not null,
  created_at timestamptz not null default now(),
  unique(user_id, suggestion_id)
);

alter table public.topic_votes enable row level security;

create policy "Users view own votes"
  on public.topic_votes for select using (auth.uid() = user_id or public.is_admin());

create policy "Users insert own votes"
  on public.topic_votes for insert with check (auth.uid() = user_id);

create policy "Users delete own votes"
  on public.topic_votes for delete using (auth.uid() = user_id);

-- vote_count 트리거
create or replace function public.bump_vote_count() returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update public.topic_suggestions set vote_count = vote_count + 1 where id = new.suggestion_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.topic_suggestions set vote_count = greatest(vote_count - 1, 0) where id = old.suggestion_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_bump_vote_count
  after insert or delete on public.topic_votes
  for each row execute function public.bump_vote_count();


-- ============================================================
-- 14. Views (운영 통계)
-- ============================================================
create or replace view public.admin_stats as
select
  (select count(*) from public.profiles) as total_users,
  (select count(*) from public.profiles where created_at > now() - interval '7 days') as new_users_7d,
  (select count(*) from public.profiles where created_at > now() - interval '30 days') as new_users_30d,
  (select count(*) from public.contents where status='published') as published_contents,
  (select count(*) from public.reactions) as total_reactions,
  (select count(*) from public.saves) as total_saves,
  (select count(*) from public.comments where status='visible') as visible_comments,
  (select count(*) from public.opinions where status='new') as new_opinions,
  (select count(*) from public.topic_suggestions) as total_suggestions;

create or replace view public.content_stats as
select
  c.id as content_id,
  c.slug,
  c.title,
  c.track,
  c.status,
  coalesce(r.like_count, 0) as like_count,
  coalesce(s.save_count, 0) as save_count,
  coalesce(cm.comment_count, 0) as comment_count,
  c.view_count
from public.contents c
left join (
  select content_id, count(*) as like_count
  from public.reactions where type='like' group by content_id
) r on r.content_id = c.id
left join (
  select content_id, count(*) as save_count
  from public.saves group by content_id
) s on s.content_id = c.id
left join (
  select content_id, count(*) as comment_count
  from public.comments where status='visible' group by content_id
) cm on cm.content_id = c.id;


-- ============================================================
-- 15. Storage 버킷 (수동: 콘솔에서 ebooks 버킷 만든 후 정책 적용)
-- ============================================================
-- 운영자가 Supabase Dashboard > Storage 에서 'ebooks' 버킷 생성 후
-- 아래 정책 적용:
-- 1) Bucket public: false (Signed URL 만으로 접근)
-- 2) 정책: Edge Function (service role) 만 INSERT/UPDATE
