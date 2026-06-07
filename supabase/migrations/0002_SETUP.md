# 0002_admin_p0.sql 적용 가이드 (운영자 1인용)

> 대상: 계획서 v2 P0 Day 1 작업이 모두 끝난 시점 (출시 전 Day 11~12)
> 소요: ~10분
> 사전: 0001_init.sql 이 이미 적용된 상태

---

## 1단계 — 마이그레이션 SQL 실행

1. Supabase Dashboard → **SQL Editor** → **New query**
2. `0002_admin_p0.sql` 파일 전체 복붙
3. **Run** (성공 시 "Success. No rows returned" 또는 NOTICE 메시지)
4. 에러 시:
   - `extension "pg_net" does not exist` → Database → Extensions → `pg_net` 검색 → Enable
   - `relation already exists` → 멱등성 보호되어 있으나 0001 안 깔린 상태일 수 있음 → 0001 먼저 실행

---

## 2단계 — Storage 버킷 수동 생성

1. Dashboard → **Storage** → **New bucket**
2. 설정:
   - **Name**: `thumbnails`
   - **Public bucket**: ✅ ON (썸네일은 SSR/ISR public URL 노출)
   - File size limit: 5 MB
   - Allowed MIME types: `image/png, image/jpeg, image/webp, image/gif`
3. 저장
4. 다시 SQL Editor 에서:
   ```sql
   -- 0002 의 §9 정책 블록만 다시 실행 (버킷 생성 후 정책 적용)
   -- 또는 0002 전체 재실행해도 안전 (멱등)
   ```
   → 정책 4개 생성 확인 (Storage → Policies)

---

## 3단계 — Day 11 1회 DB 설정 (pg_net 트리거 활성화)

⚠️ **반드시 본인 값으로 치환 후 실행**

```sql
-- <project-ref> 는 Supabase 프로젝트 URL 의 서브도메인 (예: abcdefg)
-- <service_role_key> 는 Settings → API → service_role secret

alter database postgres set app.send_ebook_url  = 'https://<project-ref>.supabase.co/functions/v1/send-ebook';
alter database postgres set app.sync_brevo_url  = 'https://<project-ref>.supabase.co/functions/v1/sync-brevo-contact';
alter database postgres set app.service_role_key = '<service_role_key>';
```

→ 세션 재시작 효과를 위해 Supabase Dashboard 좌하단 프로젝트 메뉴 → Restart project (선택적, 보통 자동 반영)

---

## 4단계 — 검증

### A. role enum 확인
```sql
select role, count(*) from public.profiles group by role;
-- user, admin, (아직 editor 없으면 OK)
```

### B. 새 view 확인
```sql
select * from public.admin_notifications;
-- opinions_new | comments_reported | purchases_failed | topics_open ... 1행
```

### C. RPC 확인
```sql
select * from public.get_north_star();
-- weekly_uv | prev_uv | delta_pct (events 없으면 0|0|0)

select * from public.get_daily_trend(7);
-- 7일치 day | pv | saves
```

### D. featured_contents 확인
```sql
select * from public.featured_contents;
-- 빈 결과 (운영자가 admin/home-curation 에서 슬롯 채울 예정)
```

### E. pg_net trigger 확인 (선택 — 전자책 테스트할 때 함께)
```sql
-- 1) products 에 테스트 row 미리 있다는 전제
-- 2) purchases insert
insert into public.purchases (product_id, name, email, status)
values ((select id from public.products limit 1), '테스트', 'caselab.kr@gmail.com', 'pending');
-- → 30초 내 본인 메일함 도착 확인
-- → 도착 안 하면: pg_net 활성화 + 설정 1회 SQL 재확인
```

### F. Brevo Contact 동기화 (sync-brevo-contact Edge Function 배포 후)
```sql
-- newsletter true 인 사용자 신규 가입 시 자동 동기화
-- Brevo Dashboard → Contacts → Lists 에서 신규 row 확인
```

---

## 5단계 — middleware 재배포 확인

`lib/supabase/middleware.ts` 가 0002 와 함께 role-aware 로 수정됨.

- 시크릿 창에서 user 계정 → `/admin` → `/` 로 redirect (✓ 기존과 동일)
- editor role 계정 (테스트용으로 update 가능) → `/admin` 진입 가능, `/admin/users` → `/admin` 으로 redirect

---

## 롤백 (드물게 필요 시)

```sql
-- 1) 트리거 제거
drop trigger if exists send_ebook_after_purchase on public.purchases;
drop trigger if exists sync_brevo_on_newsletter on public.profiles;
-- ... (updated_at 트리거들도)

-- 2) 새 객체 제거
drop view if exists public.weekly_kpi;
drop view if exists public.admin_notifications;
drop function if exists public.get_north_star();
drop function if exists public.get_daily_trend(int);
drop function if exists public.is_editor();
drop function if exists public.trg_send_ebook_on_purchase();
drop function if exists public.trg_sync_brevo_contact();
drop function if exists public.set_updated_at();
drop table if exists public.featured_contents;

-- 3) 컬럼 제거 (데이터 손실 — 신중히)
alter table public.comments drop column if exists moderation_note;
-- ...

-- 4) role enum 원복
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('user','admin'));
```

---

## 다음 작업 (계획서 v2 Day 2 ~ Day 12)

- Day 2: `lib/analytics/track.ts` + 컴포넌트 4개 트리거
- Day 3~4: 분석 페이지 P0
- Day 5: 사용자 슬라이드 패널
- Day 6: 의견함 답장
- Day 7~8: 콘텐츠 폼 안전망 6개
- Day 9~10: 댓글·후보·자료실·전자책 폴리시
- Day 11: 본 가이드 단계들 실행 + Kakao OAuth 배포 (`supabase/functions/kakao-oauth/README.md`)
- Day 12: 출시
