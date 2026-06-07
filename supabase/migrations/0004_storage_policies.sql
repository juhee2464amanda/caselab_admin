-- ============================================================
-- CaseLab 0004_storage_policies.sql
-- 작성일: 2026-06-02
-- 의존성: 0001 + 0002 + 0003 적용 완료 + 7개 버킷 수동 생성
--   기존: thumbnails (Public) / ebooks (Private) — 0002에 정책 있음
--   신규: avatars (Public) / content-images (Public) / newsletter-assets (Public)
--         / support-files (Private) / audit-exports (Private)
-- 멱등성: drop policy if exists + create policy
-- 적용 전 필수: Supabase Dashboard → Storage에서 위 5개 버킷 모두 생성
-- ============================================================
-- 결정 출처 (plan §16 옵션 C 확정):
--   profiles.avatar_url (0001) — avatars 버킷
--   콘텐츠 본문 jsonb 이미지 / D7 alt 누락 검증 — content-images
--   D53 newsletter_campaigns.body_markdown 이미지 — newsletter-assets
--   D51 support_tickets·faqs 첨부 — support-files
--   D44 audit_logs export 백업 — audit-exports
-- ============================================================


-- ============================================================
-- §1. avatars — 사용자 프로필 사진
-- 경로 규칙: {auth.uid()}/avatar.{ext}
-- ============================================================

do $$
begin
  if exists (select 1 from storage.buckets where id = 'avatars') then

    drop policy if exists "Anyone reads avatars" on storage.objects;
    create policy "Anyone reads avatars"
      on storage.objects for select
      using (bucket_id = 'avatars');

    drop policy if exists "Authenticated users upload own avatar" on storage.objects;
    create policy "Authenticated users upload own avatar"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'avatars'
        and auth.uid()::text = (storage.foldername(name))[1]
      );

    drop policy if exists "Users update own avatar" on storage.objects;
    create policy "Users update own avatar"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'avatars'
        and auth.uid()::text = (storage.foldername(name))[1]
      );

    drop policy if exists "Users delete own avatar" on storage.objects;
    create policy "Users delete own avatar"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'avatars'
        and auth.uid()::text = (storage.foldername(name))[1]
      );

    drop policy if exists "Admins manage all avatars" on storage.objects;
    create policy "Admins manage all avatars"
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'avatars' and public.is_admin());

  end if;
end $$;


-- ============================================================
-- §2. content-images — 콘텐츠 본문 안 이미지
-- 경로 규칙: {content_id 또는 운영자 폴더}/{filename}
-- ============================================================

do $$
begin
  if exists (select 1 from storage.buckets where id = 'content-images') then

    drop policy if exists "Anyone reads content-images" on storage.objects;
    create policy "Anyone reads content-images"
      on storage.objects for select
      using (bucket_id = 'content-images');

    drop policy if exists "Editors upload content-images" on storage.objects;
    create policy "Editors upload content-images"
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'content-images' and public.is_editor());

    drop policy if exists "Editors update content-images" on storage.objects;
    create policy "Editors update content-images"
      on storage.objects for update
      to authenticated
      using (bucket_id = 'content-images' and public.is_editor());

    drop policy if exists "Editors delete content-images" on storage.objects;
    create policy "Editors delete content-images"
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'content-images' and public.is_editor());

  end if;
end $$;


-- ============================================================
-- §3. newsletter-assets — 뉴스레터 본문 안 이미지·배너
-- 경로 규칙: {newsletter_campaign_id}/{filename} 또는 banners/{filename}
-- ============================================================

do $$
begin
  if exists (select 1 from storage.buckets where id = 'newsletter-assets') then

    drop policy if exists "Anyone reads newsletter-assets" on storage.objects;
    create policy "Anyone reads newsletter-assets"
      on storage.objects for select
      using (bucket_id = 'newsletter-assets');

    drop policy if exists "Admins manage newsletter-assets" on storage.objects;
    create policy "Admins manage newsletter-assets"
      on storage.objects for all
      to authenticated
      using (bucket_id = 'newsletter-assets' and public.is_admin())
      with check (bucket_id = 'newsletter-assets' and public.is_admin());

  end if;
end $$;


-- ============================================================
-- §4. support-files — 1:1 문의·FAQ 첨부 (Private)
-- 경로 규칙: tickets/{ticket_id}/{filename} 또는 faqs/{faq_id}/{filename}
-- ============================================================

do $$
begin
  if exists (select 1 from storage.buckets where id = 'support-files') then

    drop policy if exists "Admins read support-files" on storage.objects;
    create policy "Admins read support-files"
      on storage.objects for select
      to authenticated
      using (bucket_id = 'support-files' and public.is_admin());

    drop policy if exists "Admins manage support-files" on storage.objects;
    create policy "Admins manage support-files"
      on storage.objects for all
      to authenticated
      using (bucket_id = 'support-files' and public.is_admin())
      with check (bucket_id = 'support-files' and public.is_admin());

  end if;
end $$;


-- ============================================================
-- §5. audit-exports — audit_logs 백업 export (Private)
-- 경로 규칙: {YYYY-MM}/{filename}.csv|json
-- ============================================================

do $$
begin
  if exists (select 1 from storage.buckets where id = 'audit-exports') then

    drop policy if exists "Admins read audit-exports" on storage.objects;
    create policy "Admins read audit-exports"
      on storage.objects for select
      to authenticated
      using (bucket_id = 'audit-exports' and public.is_admin());

    drop policy if exists "Admins manage audit-exports" on storage.objects;
    create policy "Admins manage audit-exports"
      on storage.objects for all
      to authenticated
      using (bucket_id = 'audit-exports' and public.is_admin())
      with check (bucket_id = 'audit-exports' and public.is_admin());

  end if;
end $$;


-- ============================================================
-- §6. thumbnails (legacy, 0002에서 정책 정의했으나 적용 시점 버킷 없어서 skip됨)
-- 멱등성: drop + create
-- ============================================================

do $$
begin
  if exists (select 1 from storage.buckets where id = 'thumbnails') then

    drop policy if exists "Anyone read thumbnails" on storage.objects;
    create policy "Anyone read thumbnails"
      on storage.objects for select
      using (bucket_id = 'thumbnails');

    drop policy if exists "Editors insert thumbnails" on storage.objects;
    create policy "Editors insert thumbnails"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'thumbnails' and public.is_editor());

    drop policy if exists "Editors update thumbnails" on storage.objects;
    create policy "Editors update thumbnails"
      on storage.objects for update to authenticated
      using (bucket_id = 'thumbnails' and public.is_editor());

    drop policy if exists "Editors delete thumbnails" on storage.objects;
    create policy "Editors delete thumbnails"
      on storage.objects for delete to authenticated
      using (bucket_id = 'thumbnails' and public.is_editor());

  end if;
end $$;


-- ============================================================
-- §7. ebooks (Private, 0002에 정책 정의 없음 — 본 파일에서 신설)
-- 정책: service_role만 INSERT/UPDATE (Edge Function send-ebook 전용)
--      admin은 SELECT (목록 확인용)
--      일반 사용자는 Signed URL로만 접근 (정책 없이 발급된 URL 사용)
-- ============================================================

do $$
begin
  if exists (select 1 from storage.buckets where id = 'ebooks') then

    drop policy if exists "Admin reads ebooks" on storage.objects;
    create policy "Admin reads ebooks"
      on storage.objects for select to authenticated
      using (bucket_id = 'ebooks' and public.is_admin());

    drop policy if exists "Service role writes ebooks" on storage.objects;
    create policy "Service role writes ebooks"
      on storage.objects for insert
      with check (bucket_id = 'ebooks' and auth.role() = 'service_role');

    drop policy if exists "Service role updates ebooks" on storage.objects;
    create policy "Service role updates ebooks"
      on storage.objects for update
      using (bucket_id = 'ebooks' and auth.role() = 'service_role');

    drop policy if exists "Admin deletes ebooks" on storage.objects;
    create policy "Admin deletes ebooks"
      on storage.objects for delete to authenticated
      using (bucket_id = 'ebooks' and public.is_admin());

  end if;
end $$;


-- ============================================================
-- §8. 검증용 코멘트
-- ============================================================
-- 적용 후 다음 SQL 실행:
--   select bucket_id, count(*) as policy_count
--     from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--          and policyname ilike '%avatars%' or policyname ilike '%content-images%'
--          or policyname ilike '%newsletter-assets%' or policyname ilike '%support-files%'
--          or policyname ilike '%audit-exports%'
--    group by bucket_id;
--
-- 또는 storage 정책 전체:
--   select policyname from pg_policies
--    where schemaname='storage' and tablename='objects'
--    order by policyname;
--
-- 기대: 5개 신규 버킷에 각 정책 (avatars 5개 / content-images 4개 / newsletter-assets 2개 /
--      support-files 2개 / audit-exports 2개) = 약 15개 신규 정책

-- ============================================================
-- 0004 끝
-- ============================================================
