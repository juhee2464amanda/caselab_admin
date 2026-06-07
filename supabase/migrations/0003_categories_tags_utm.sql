-- ============================================================
-- CaseLab 0003_categories_tags_utm.sql
-- 작성일: 2026-06-02
-- 의존성: 0001_init.sql + 0002_admin_p0.sql 적용 완료
-- 멱등성: if not exists / on conflict do nothing / add column if not exists
-- 적용 후 실패 시 0003만 롤백 가능 (0001/0002 영향 없음)
-- ============================================================
-- 통합 결정 (docs/04_dev_plan.md §19):
--   D9  comments.report_count + auto_hide_comment 트리거
--   D13 categories + tags + content_tags + tool_tags + RLS + bump_tag_usage
--   D25 utm_links 테이블
--   D26 utm_channel seed 10건 (categories에 통합)
--   D37 profiles 컬럼 확장 (job_title, interests, ai_tools, persona)
--   D39 map_persona() 함수 + 트리거
--   D43 purchases 컬럼 확장 (resend_token, send_attempts, last_error, discount_code, coupon_id)
--   D44 audit_logs 테이블 + log_audit() + 13개 테이블 trigger 부착
--   D51 faqs 테이블 + support_tickets 테이블
--   D52 featured_contents.slot_type 컬럼 추가
--   D53 newsletter_campaigns 테이블
--   D54 contents.og_title / og_description / og_image 컬럼 추가
-- ============================================================


-- ============================================================
-- §1. D13/D26 — categories + tags + 관계 테이블
-- ============================================================

-- 1-1. categories (content_subcategory / tool_subcategory / utm_channel 통합)
create table if not exists public.categories (
  id uuid default gen_random_uuid() primary key,
  type text not null check (type in ('content_subcategory','tool_subcategory','utm_channel')),
  parent_track text,                                  -- contents.track('case'|'trend') / tools.category('tool'|'prompt'|'guide'|'context-card') / null(utm_channel)
  slug text not null,
  label text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,        -- utm_channel: {source, medium, content_template}
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, parent_track, slug)
);

create index if not exists idx_categories_type_active on public.categories(type) where is_active;
create index if not exists idx_categories_parent on public.categories(type, parent_track) where is_active;

alter table public.categories enable row level security;

drop policy if exists "Anyone reads active categories" on public.categories;
create policy "Anyone reads active categories"
  on public.categories for select using (is_active or public.is_editor());

drop policy if exists "Editor manages categories" on public.categories;
create policy "Editor manages categories"
  on public.categories for all
  using (public.is_editor()) with check (public.is_editor());

-- updated_at 트리거 (0002 set_updated_at 재사용)
drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- 1-2. tags (가로지르는 주제 태그)
create table if not exists public.tags (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null,
  label text not null,
  description text,
  usage_count int not null default 0,                 -- bump_tag_usage 트리거로 자동 업데이트
  created_at timestamptz not null default now()
);

create index if not exists idx_tags_usage on public.tags(usage_count desc);

alter table public.tags enable row level security;

drop policy if exists "Anyone reads tags" on public.tags;
create policy "Anyone reads tags" on public.tags for select using (true);

drop policy if exists "Editor manages tags" on public.tags;
create policy "Editor manages tags"
  on public.tags for all
  using (public.is_editor()) with check (public.is_editor());

-- 1-3. contents·tools에 category_id 추가
alter table public.contents
  add column if not exists category_id uuid references public.categories(id) on delete set null;

alter table public.tools
  add column if not exists subcategory_id uuid references public.categories(id) on delete set null;
-- tools.category enum은 ①타입 역할로 유지

-- 1-4. content_tags / tool_tags m:n
create table if not exists public.content_tags (
  content_id uuid not null references public.contents(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (content_id, tag_id)
);

create table if not exists public.tool_tags (
  tool_id uuid not null references public.tools(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tool_id, tag_id)
);

create index if not exists idx_content_tags_tag on public.content_tags(tag_id);
create index if not exists idx_tool_tags_tag on public.tool_tags(tag_id);

alter table public.content_tags enable row level security;
alter table public.tool_tags enable row level security;

drop policy if exists "Public reads content_tags" on public.content_tags;
create policy "Public reads content_tags" on public.content_tags for select using (true);
drop policy if exists "Editor writes content_tags" on public.content_tags;
create policy "Editor writes content_tags"
  on public.content_tags for all
  using (public.is_editor()) with check (public.is_editor());

drop policy if exists "Public reads tool_tags" on public.tool_tags;
create policy "Public reads tool_tags" on public.tool_tags for select using (true);
drop policy if exists "Editor writes tool_tags" on public.tool_tags;
create policy "Editor writes tool_tags"
  on public.tool_tags for all
  using (public.is_editor()) with check (public.is_editor());

-- 1-5. bump_tag_usage 트리거
create or replace function public.bump_tag_usage()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update public.tags set usage_count = usage_count + 1 where id = new.tag_id;
  elsif tg_op = 'DELETE' then
    update public.tags set usage_count = greatest(usage_count - 1, 0) where id = old.tag_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_content_tags_usage on public.content_tags;
create trigger trg_content_tags_usage
  after insert or delete on public.content_tags
  for each row execute function public.bump_tag_usage();

drop trigger if exists trg_tool_tags_usage on public.tool_tags;
create trigger trg_tool_tags_usage
  after insert or delete on public.tool_tags
  for each row execute function public.bump_tag_usage();


-- ============================================================
-- §2. D37/D39 — profiles 컬럼 확장 + 페르소나 자동 매핑
-- ============================================================

alter table public.profiles
  add column if not exists job_title text,
  add column if not exists interests text[] not null default array[]::text[],
  add column if not exists ai_tools text[] not null default array[]::text[],
  add column if not exists persona text check (persona in ('A','B','C','D','E') or persona is null);

create index if not exists idx_profiles_persona on public.profiles(persona) where persona is not null;
create index if not exists idx_profiles_job on public.profiles(job) where job is not null;

-- map_persona(): 온보딩 답변 기반 페르소나 추론
-- 0001 profiles.job enum: 기획 / 마케팅 / 영업 / 디자인 / 개발 / 기타 (한국어)
create or replace function public.map_persona(
  p_job text,
  p_interests text[] default array[]::text[],
  p_ai_tools text[] default array[]::text[]
) returns text language plpgsql immutable as $$
begin
  -- E 정다은: 스타트업 마케터 (도구·관심 다양) — 마케팅 안에서 가장 활발한 사용자
  if p_job = '마케팅'
     and coalesce(array_length(p_ai_tools, 1), 0) >= 2
     and coalesce(array_length(p_interests, 1), 0) >= 3 then
    return 'E';
  end if;
  -- A 박지현: 마케팅 기획자 (관심 단순)
  if p_job = '마케팅' then
    return 'A';
  end if;
  -- B 이민준: 대기업 전략팀
  if p_job = '기획' then
    return 'B';
  end if;
  -- D 최현수: 영업팀장
  if p_job = '영업' then
    return 'D';
  end if;
  -- C 김소연: 1인 사업/프리랜서 — 0001에 별도 enum 없음. 추후 job_type 도입 시 매핑 보강
  -- (현재는 fallback null)
  return null;  -- 운영자가 admin/users에서 수동 override
end $$;

-- 트리거: profiles.{job | interests | ai_tools} 변경 시 persona 재계산
-- 단, 운영자가 수동 override한 경우(metadata에 manual_persona_override 표시)는 자동 매핑 skip
create or replace function public.trg_auto_map_persona() returns trigger language plpgsql security definer as $$
begin
  -- 수동 override 안 된 경우만 자동 매핑
  if tg_op = 'INSERT' or
     new.job is distinct from old.job or
     new.interests is distinct from old.interests or
     new.ai_tools is distinct from old.ai_tools then
    new.persona := public.map_persona(new.job, new.interests, new.ai_tools);
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_auto_persona on public.profiles;
create trigger trg_profiles_auto_persona
  before insert or update of job, interests, ai_tools on public.profiles
  for each row execute function public.trg_auto_map_persona();


-- ============================================================
-- §3. D43 — purchases 컬럼 확장 (재발송·시도·에러·할인·쿠폰)
-- ============================================================

alter table public.purchases
  add column if not exists resend_token text,
  add column if not exists send_attempts int not null default 0,
  add column if not exists last_error text,
  add column if not exists discount_code text,
  add column if not exists coupon_id uuid;
-- coupon_id는 향후 coupons 테이블 신설 시 FK 추가 (Phase 4 PG 도입 시)

create index if not exists idx_purchases_resend_token on public.purchases(resend_token) where resend_token is not null;


-- ============================================================
-- §4. D54 — contents.og 메타 컬럼
-- ============================================================

alter table public.contents
  add column if not exists og_title text,
  add column if not exists og_description text,
  add column if not exists og_image text;
-- null이면 자동 default (title / summary / thumbnail_url) 사용. generateMetadata()에서 처리


-- ============================================================
-- §5. D52 — featured_contents.slot_type
-- 0002 featured_contents 스키마: id / content_id / slot(1~5) / active / sort_label
-- → slot_type 컬럼 추가 + unique(slot) → unique(slot_type, slot)
-- ============================================================

alter table public.featured_contents
  add column if not exists slot_type text not null default 'hero';

-- slot_type check constraint
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'featured_contents_slot_type_check') then
    alter table public.featured_contents
      add constraint featured_contents_slot_type_check check (slot_type in ('hero','highlight','links'));
  end if;
end $$;

-- 기존 unique(slot) → unique(slot_type, slot)로 변경
-- (같은 slot 번호가 hero·highlight·links 안에서 각각 등장 가능)
alter table public.featured_contents drop constraint if exists featured_contents_slot_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'featured_contents_slot_type_slot_key') then
    alter table public.featured_contents
      add constraint featured_contents_slot_type_slot_key unique (slot_type, slot);
  end if;
end $$;

create index if not exists idx_featured_slot_type on public.featured_contents(slot_type, slot) where active;


-- ============================================================
-- §6. D9 — comments.report_count + auto_hide_comment 트리거
-- ============================================================

alter table public.comments
  add column if not exists report_count int not null default 0;

-- auto_hide_comment: report_count >= 3 도달 시 자동 status='hidden'
create or replace function public.auto_hide_comment() returns trigger language plpgsql security definer as $$
begin
  if new.report_count >= 3 and (old.report_count is null or old.report_count < 3) and new.status = 'visible' then
    new.status := 'hidden';
  end if;
  return new;
end $$;

drop trigger if exists trg_auto_hide_comment on public.comments;
create trigger trg_auto_hide_comment
  before update of report_count on public.comments
  for each row execute function public.auto_hide_comment();


-- ============================================================
-- §7. D51 — faqs + support_tickets
-- ============================================================

-- 7-1. faqs (FAQ 관리)
create table if not exists public.faqs (
  id uuid default gen_random_uuid() primary key,
  question text not null,
  answer text not null,
  category text,                                      -- 결제 / 콘텐츠 / 계정 / 기타
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_faqs_published_order on public.faqs(sort_order) where is_published;
create index if not exists idx_faqs_category on public.faqs(category) where is_published;

alter table public.faqs enable row level security;

drop policy if exists "Anyone reads published faqs" on public.faqs;
create policy "Anyone reads published faqs" on public.faqs for select using (is_published or public.is_admin());

drop policy if exists "Admin manages faqs" on public.faqs;
create policy "Admin manages faqs" on public.faqs for all
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_faqs_updated_at on public.faqs;
create trigger trg_faqs_updated_at
  before update on public.faqs
  for each row execute function public.set_updated_at();

-- 7-2. support_tickets (1:1 문의)
create table if not exists public.support_tickets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete set null,
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open','answered','closed')),
  reply_body text,
  reply_email_id text,                                -- Brevo messageId
  replied_by uuid references auth.users on delete set null,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_status on public.support_tickets(status, created_at desc);
create index if not exists idx_support_user on public.support_tickets(user_id, created_at desc);

alter table public.support_tickets enable row level security;

drop policy if exists "User reads own tickets" on public.support_tickets;
create policy "User reads own tickets" on public.support_tickets for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "User creates tickets" on public.support_tickets;
create policy "User creates tickets" on public.support_tickets for insert
  with check (user_id = auth.uid());

drop policy if exists "Admin manages tickets" on public.support_tickets;
create policy "Admin manages tickets" on public.support_tickets for update
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_support_updated_at on public.support_tickets;
create trigger trg_support_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();


-- ============================================================
-- §8. D53 — newsletter_campaigns
-- ============================================================

create table if not exists public.newsletter_campaigns (
  id uuid default gen_random_uuid() primary key,
  subject text not null,
  body_markdown text not null,
  segment_filter jsonb not null default '{}'::jsonb,  -- { job, persona, interests, ai_tools }
  recipient_count int default 0,
  brevo_campaign_id text,
  status text not null default 'draft' check (status in ('draft','sent','failed')),
  sent_at timestamptz,
  open_count int default 0,
  click_count int default 0,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_newsletter_status on public.newsletter_campaigns(status, created_at desc);

alter table public.newsletter_campaigns enable row level security;

drop policy if exists "Admin manages newsletter_campaigns" on public.newsletter_campaigns;
create policy "Admin manages newsletter_campaigns" on public.newsletter_campaigns for all
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_newsletter_updated_at on public.newsletter_campaigns;
create trigger trg_newsletter_updated_at
  before update on public.newsletter_campaigns
  for each row execute function public.set_updated_at();


-- ============================================================
-- §9. D25 — utm_links
-- ============================================================

create table if not exists public.utm_links (
  id uuid default gen_random_uuid() primary key,
  label text not null,
  source text not null,
  medium text not null,
  campaign text not null,
  content text,
  target_url text not null,
  full_url text not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_utm_campaign on public.utm_links(campaign);
create index if not exists idx_utm_created_at on public.utm_links(created_at desc);

alter table public.utm_links enable row level security;

drop policy if exists "Admin manages utm_links" on public.utm_links;
create policy "Admin manages utm_links" on public.utm_links for all
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================
-- §10. D44 — audit_logs + log_audit() + 트리거 부착
-- ============================================================

create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() primary key,
  actor_id uuid references auth.users on delete set null,
  actor_type text not null check (actor_type in ('user', 'system')),
  action_type text not null,                          -- 'content.create' / 'opinion.reply' / 'system.auto_hide' 등
  entity_type text not null,                          -- 'content' / 'opinion' / 'comment' / 'category' / 'tag' / 'profile' / 'purchase' / 'topic' / 'tool' / 'faq' / 'support' / 'newsletter' / 'utm'
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,        -- before/after diff 또는 action 추가 정보
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_created on public.audit_logs(created_at desc);
create index if not exists idx_audit_actor on public.audit_logs(actor_id, created_at desc) where actor_id is not null;
create index if not exists idx_audit_entity on public.audit_logs(entity_type, entity_id, created_at desc) where entity_id is not null;
create index if not exists idx_audit_action on public.audit_logs(action_type, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "Admin reads audit_logs" on public.audit_logs;
create policy "Admin reads audit_logs" on public.audit_logs for select using (public.is_admin());

drop policy if exists "System writes audit_logs" on public.audit_logs;
create policy "System writes audit_logs" on public.audit_logs for insert with check (true);

-- log_audit(): 핵심 테이블의 INSERT/UPDATE/DELETE를 audit_logs에 기록
create or replace function public.log_audit() returns trigger language plpgsql security definer as $$
declare
  v_action text;
  v_entity_type text;
begin
  -- entity_type = trigger 부착 테이블명 (e.g. contents -> 'content')
  v_entity_type := regexp_replace(tg_table_name, 's$', '');  -- 단순 단수화 (contents -> content)
  if tg_op = 'INSERT' then v_action := v_entity_type || '.create';
  elsif tg_op = 'UPDATE' then v_action := v_entity_type || '.update';
  elsif tg_op = 'DELETE' then v_action := v_entity_type || '.delete';
  end if;

  insert into public.audit_logs(actor_id, actor_type, action_type, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    case when auth.uid() is null then 'system' else 'user' end,
    v_action,
    v_entity_type,
    coalesce(new.id, old.id),
    jsonb_build_object(
      'before', case when tg_op != 'INSERT' then to_jsonb(old) end,
      'after',  case when tg_op != 'DELETE' then to_jsonb(new) end
    )
  );

  return coalesce(new, old);
end $$;

-- 11개 핵심 테이블에 audit trigger 부착
drop trigger if exists trg_audit_contents on public.contents;
create trigger trg_audit_contents after insert or update or delete on public.contents
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_tools on public.tools;
create trigger trg_audit_tools after insert or update or delete on public.tools
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_comments on public.comments;
create trigger trg_audit_comments after insert or update or delete on public.comments
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_opinions on public.opinions;
create trigger trg_audit_opinions after insert or update or delete on public.opinions
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles after update on public.profiles
  for each row execute function public.log_audit();
-- profiles는 update만 (INSERT는 handle_new_user에서 처리됨, DELETE는 cascade)

drop trigger if exists trg_audit_categories on public.categories;
create trigger trg_audit_categories after insert or update or delete on public.categories
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_tags on public.tags;
create trigger trg_audit_tags after insert or update or delete on public.tags
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_topic_suggestions on public.topic_suggestions;
create trigger trg_audit_topic_suggestions after insert or update or delete on public.topic_suggestions
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_featured_contents on public.featured_contents;
create trigger trg_audit_featured_contents after insert or update or delete on public.featured_contents
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_purchases on public.purchases;
create trigger trg_audit_purchases after insert or update or delete on public.purchases
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_faqs on public.faqs;
create trigger trg_audit_faqs after insert or update or delete on public.faqs
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_support_tickets on public.support_tickets;
create trigger trg_audit_support_tickets after insert or update or delete on public.support_tickets
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_newsletter_campaigns on public.newsletter_campaigns;
create trigger trg_audit_newsletter_campaigns after insert or update or delete on public.newsletter_campaigns
  for each row execute function public.log_audit();


-- ============================================================
-- §11. D26 — utm_channel seed (10건)
-- ============================================================

insert into public.categories (type, parent_track, slug, label, metadata, sort_order) values
  ('utm_channel', null, 'instagram-bio',     '인스타 프로필 바이오', '{"source":"instagram","medium":"profile","content_template":"bio"}'::jsonb,           10),
  ('utm_channel', null, 'instagram-feed',    '인스타 피드 포스트',   '{"source":"instagram","medium":"social","content_template":"post-{date}"}'::jsonb,    20),
  ('utm_channel', null, 'instagram-story',   '인스타 스토리',        '{"source":"instagram","medium":"social","content_template":"story-{date}"}'::jsonb,   30),
  ('utm_channel', null, 'instagram-reels',   '인스타 릴스',          '{"source":"instagram","medium":"social","content_template":"reels-{date}"}'::jsonb,   40),
  ('utm_channel', null, 'kakaotalk-share',   '카카오톡 공유',        '{"source":"kakaotalk","medium":"share","content_template":"web-share"}'::jsonb,       50),
  ('utm_channel', null, 'newsletter',        '뉴스레터',             '{"source":"newsletter","medium":"email","content_template":"cta-{position}"}'::jsonb, 60),
  ('utm_channel', null, 'brunch',            '브런치 글',            '{"source":"brunch","medium":"referral","content_template":"post-{slug}"}'::jsonb,     70),
  ('utm_channel', null, 'linkedin',          '링크드인',             '{"source":"linkedin","medium":"social","content_template":"post-{date}"}'::jsonb,     80),
  ('utm_channel', null, 'qr-offline',        'QR 코드 (오프라인)',  '{"source":"qr","medium":"print","content_template":"event-{name}"}'::jsonb,           90),
  ('utm_channel', null, 'direct-share',      '직접 공유 링크',      '{"source":"direct-share","medium":"share","content_template":null}'::jsonb,           100)
on conflict (type, parent_track, slug) do nothing;


-- ============================================================
-- §12. 검증용 코멘트
-- ============================================================
-- 적용 후 다음 검증 SQL 실행:
--   select count(*) from public.categories where type='utm_channel';                 -- 10
--   select count(*) from public.tags;                                                 -- 0
--   select column_name from information_schema.columns where table_name='profiles'
--     and column_name in ('job_title','interests','ai_tools','persona');              -- 4
--   select column_name from information_schema.columns where table_name='purchases'
--     and column_name in ('resend_token','send_attempts','last_error','discount_code','coupon_id'); -- 5
--   select column_name from information_schema.columns where table_name='contents'
--     and column_name in ('og_title','og_description','og_image','category_id');      -- 4
--   select * from public.audit_logs where false;                                      -- 컬럼 7개 확인
--   select * from public.faqs where false;                                            -- 컬럼 9개 확인
--   select * from public.support_tickets where false;                                 -- 컬럼 11개 확인
--   select * from public.newsletter_campaigns where false;                            -- 컬럼 12개 확인
--   select * from public.utm_links where false;                                       -- 컬럼 9개 확인

-- ============================================================
-- 0003 끝
-- ============================================================
