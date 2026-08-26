# 케이스랩 출시 런북 (Launch Runbook)

> 작성: 2026-05-30 · 최종 갱신: 2026-06-01
> 대상 독자: 클라우드 배포 처음인 운영자 1인
> 모드: **돈 0원 출시** (도메인·이메일 발송·AI 모두 출시 후 도입)

## 이 문서를 읽는 법

- **순서대로 따라가기**. 각 “Day”는 앞 단계에 의존하니 건너뛰지 마세요.
- 각 Day마다 4가지 블록 반복:
  - ✅ **끝났을 때 동작해야 하는 것**
  - 📋 **체크리스트** — 클릭/입력할 항목
  - 🚨 **의사결정 트리거** — Claude(저)에게 “Day N 시작/막힘” 알려주시면 옵션 띄워드려요
  - 🛠️ **자주 막히는 지점**
- 외부 콘솔 작업의 자세한 체크리스트는 [GitHub Issue #1~#10](https://github.com/juhee2464amanda/caselab/issues) 참고. 런북은 화면 흐름·의사결정 중심.

---

## ✅ 최종 결정값 한눈에 (2026-06-01 확정)

| 항목 | 값 | 활성 시점 |
|---|---|---|
| 도메인 | **Vercel 무료 서브도메인** (예: `caselab.vercel.app`) | Day 10 Vercel 가입 시 결정 |
| 운영자 메일 | `caselab.kr@gmail.com` | Day 0 (이미 보유) |
| 전자책 발송(트랜잭션) | **Gmail SMTP / nodemailer** (발신: `caselab.kr@gmail.com`, ~500통/일, INBOX 도달, 2026-06-12 §18.16) | Day 9 |
| 뉴스레터 명단 동기화 | **Brevo Contacts API** (`sync-brevo-contact`) | Day 9 |
| Cloudflare | **사용 안 함** | — |
| Resend | **사용 안 함** | — |
| Brevo | **사용** (뉴스레터 명단 동기화 + 비번재설정 SMTP) | Day 9 |
| Anthropic API (AI 초안) | **출시 후 도입 예정** | — |
| Supabase | 사용 (Free) | Day 1 |
| Vercel | 사용 (Hobby 무료) | Day 10 |
| Google OAuth | 사용 | Day 2 |
| Kakao OAuth | 사용 (선택) | Day 2 |
| GA4 | 사용 (무료) | Day 8 |
| 첫 콘텐츠 | 후보 1번 “빈 입력칸…” | Day 3 |

**연간 운영비 = $0**. 사이트가 자리잡고 매출/필요 생기면 그때 도메인·Resend·Anthropic 도입.

---

## 준비물 (Day 0)

| 항목 | 상태 |
|---|---|
| 노트북 | ☐ |
| Gmail (`caselab.kr@gmail.com`) | ✅ 보유 |
| Google 계정 + Kakao 계정 (운영자 본인 — 일반 사용용 OK) | ☐ |
| 인스타 프로필 편집 권한 | ☐ |
| GitHub `juhee2464amanda/caselab` 권한 | ☐ |
| 로컬 클론 + `npm install --legacy-peer-deps` 성공 | ☐ |

> 💡 **이번 모드는 결제카드 등록 안 해도 됨**. 모든 외부 서비스가 무료 플랜만 사용.

---

## Day 0 — 가입만 (5분)

### ✅ 끝났을 때
- Supabase, Vercel 가입만 완료 (가입 메일은 `caselab.kr@gmail.com`)
- 다음 Day들에서 바로 진입 가능

### 📋 체크리스트
- [ ] [Supabase Sign up](https://supabase.com/dashboard) — Google 로그인 가능
- [ ] [Vercel Sign up](https://vercel.com/signup) — GitHub 로그인 권장 (Day 10에 GitHub 연결 필요하니 미리 연결)
- [ ] [Brevo Sign up](https://www.brevo.com/) — Day 9 발신자 인증·API Key 생성용 (지금 가입만 해두면 Day 9 빠름)
- [ ] 모두 무료 플랜으로 가입. 결제 카드 등록 안 해도 됨.

### 건너뛰는 가입 (이번 모드)
- ❌ Cloudflare — 도메인 사용 안 하니까 가입 X
- ❌ Anthropic — AI 초안 출시 후 도입
- ❌ Resend — Brevo로 대체. Brevo 한도 도달 + 도메인 도입 시 재검토
- ❌ Kakao 디벨로퍼스 (Day 2 결정에 따라 가입)
- ❌ Google Cloud Console (Day 2)

---

## Day 1 — Supabase 풀 셋업 (2026-06-02 갱신: 0001~0004 + Storage 7 + Auth)

### ✅ 끝났을 때
- 새 프로젝트 `Caselab-prod` 생성 + API 키 3종 → `.env.local`
- 마이그레이션 4개 적용: `0001_init.sql` + `0002_admin_p0.sql` + `0003_categories_tags_utm.sql` + `0004_storage_policies.sql`
- DB 객체: 테이블 ~20개 / view 2개 / 함수 ~10개 / 트리거 ~22개 / Storage 정책 ~19개
- Storage 버킷 7개: `thumbnails` `ebooks` `avatars` `content-images` `newsletter-assets` `support-files` `audit-exports`
- Authentication: Email 가입 ON + **Confirm email OFF** ([[project_auth_confirm_off]] 영구 정책)
- `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 박힘

### 📋 Step 1~10 (90~120분 예상)

#### Step 1 — 새 프로젝트 생성 (~5분)
[supabase.com/dashboard](https://supabase.com/dashboard) → New Project
- Project name: `Caselab-prod`
- Database password: 강한 비밀번호 → **반드시 비밀번호 관리자에 저장** (재발급 불가)
- Region: **Northeast Asia (Seoul, ap-northeast-2)** ⚠️
- Plan: Free
- Security: **`Enable automatic RLS` 체크 ON** (안전 마진)
- Create new project → 2~3분 프로비저닝 대기

#### Step 2 — API 키 3종 (~2분)
Settings → API:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role secret** ("Reveal" 클릭) → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ 채팅·git에 절대 노출 금지

#### Step 3 — `.env.local` 갱신 (~3분)
```bash
cp .env.example .env.local      # 없으면 생성
open -a "TextEdit" .env.local   # 또는 cursor/code/nano
```
3개 키 박고 저장. 다른 변수(`NEXT_PUBLIC_SITE_URL` 등)는 그대로.

#### Step 4 — `pg_net` Extension 활성화 (~1분)
Database → Extensions → `pg_net` 검색 → 토글 ON

> 0002의 `pg_net.http_post()` 함수 호출이 trigger 안에 있어서 미리 활성화 권장. 함수 생성 자체는 활성화 없어도 통과하지만 Day 11 실제 trigger 발동 시 필요.

#### Step 5 — `0001_init.sql` 적용 (~3분)
SQL Editor → `+` New query → 0001 전체 복붙 → Run → "Success. No rows returned"

**검증 SQL** (별도 query):
```sql
select table_name from information_schema.tables
where table_schema='public' order by table_name;
```
→ 12 테이블 + 2 view (admin_stats, content_stats) = **14 row** 나와야 함

#### Step 6 — `0002_admin_p0.sql` 적용 (~3분)
SQL Editor → `+` New query → 0002 전체 복붙 → Run → "Success"

**검증**:
```sql
select public.get_north_star();   -- (0,0,0) 정상 (데이터 없음)
```

#### Step 7 — `0003_categories_tags_utm.sql` 적용 (~5분)
SQL Editor → `+` New query → 0003 전체 복붙 (560줄) → Run → "Success"

**검증**:
```sql
select
  (select count(*) from public.categories where type='utm_channel') as utm_seed,
  (select count(*) from information_schema.columns
   where table_name='profiles' and column_name in ('job_title','interests','ai_tools','persona')) as new_cols,
  (select count(*) from information_schema.triggers
   where trigger_schema='public' and trigger_name like 'trg_audit_%') as audit_triggers;
```
→ 기대 결과: **utm_seed=10 / new_cols=4 / audit_triggers=37** (37 = 13 trigger 정의 × INSERT·UPDATE·DELETE 이벤트 row 분리)

#### Step 8 — Storage 버킷 7개 생성 (~10분)
Storage → New bucket × 5번 (`thumbnails` `ebooks`는 이미 만들었거나 0002 후 자동, 아래 표는 추가 5개):

| Bucket name | Public | 용도 |
|---|---|---|
| `thumbnails` | **ON** | 콘텐츠·도구·전자책 썸네일 |
| `ebooks` | **OFF** | 전자책 PDF (Signed URL 발급) |
| `avatars` | **ON** | 사용자 프로필 사진 |
| `content-images` | **ON** | 콘텐츠 본문 안 이미지 |
| `newsletter-assets` | **ON** | 뉴스레터 본문 이미지·배너 |
| `support-files` | **OFF** | 1:1 문의·FAQ 첨부 (admin only) |
| `audit-exports` | **OFF** | audit_logs 백업 export (admin only) |

→ Storage 화면에 **7개 버킷** 보이면 OK.

#### Step 9 — `0004_storage_policies.sql` 적용 (~3분)
SQL Editor → `+` New query → 0004 전체 복붙 (206줄) → Run → "Success"

**검증**:
```sql
select count(*) as total_storage_policies
from pg_policies where schemaname='storage' and tablename='objects';
```
→ 약 **15~25개** (0002의 ebooks/thumbnails 4 + 0004의 신규 15)

#### Step 10 — Authentication 설정 (~5분)
Authentication → **Providers** → Email:
- Enabled ON ✅
- **Confirm email OFF** ⛔ ([[project_auth_confirm_off]] 영구 정책)
- Save changes

Authentication → **URL Configuration**:
- Site URL: `http://localhost:3000` (출시 후 `https://caselab.vercel.app`로 변경)
- Redirect URLs: `http://localhost:3000/**` (와일드카드)
- Save changes

> Google/Kakao OAuth는 Day 2-A에서 처리.

### 🔍 최종 검증
- 로컬: `npm run dev` → http://localhost:3000 진입 (200 응답)
- DB: 위 Step 5/6/7/9의 검증 SQL 모두 기대치 일치

### 🛠️ 막히는 곳
- **0003 적용 시 `column does not exist` 에러**: 0001/0002의 실제 컬럼명과 0003의 가정이 다른 경우 (예: `profiles.job` ≠ `job_category`). 디스크 SQL을 정정 후 fresh 파일로 재시도
- **TextEdit 옛 버전 캐시**: 0003 수정 후에도 TextEdit이 옛 내용 표시 → 종료 후 fresh copy(`cp 0003.sql 0003_FRESH.sql`)를 다시 open
- **클립보드 pbcopy 실패**: `pbpaste | wc -c`가 너무 작은 숫자면 TextEdit에서 직접 Cmd+A + Cmd+C 권장
- **Run 안 누름**: SQL Editor에 붙여넣은 다음 우측 하단 초록색 **Run** 버튼 확실히 클릭. 결과 영역에 "Success" 보이는지 확인
- **옛 query 탭 재사용**: Supabase SQL Editor가 query 탭마다 내용 자동 저장. 새 SQL은 반드시 **`+` New query**로 빈 탭에서 시작

---

## Day 2-A — Google + Kakao 인증 ([Issue #2](https://github.com/juhee2464amanda/caselab/issues/2), [#3](https://github.com/juhee2464amanda/caselab/issues/3))

### ✅ 끝났을 때
- `/login`에서 Google 버튼 → 본인 계정 → `/onboarding` 강제
- (선택) Kakao 동일 흐름
- `profiles` 테이블에 본인 row 보임

### 🚨 의사결정 트리거
**Kakao OAuth 도입할지?** — 권장: Day 2엔 Google만, Kakao는 출시 직전에. 단계 줄임.

### 📋 Google OAuth (최소)
1. [console.cloud.google.com](https://console.cloud.google.com) → 새 프로젝트 `caselab-prod`
2. APIs & Services → OAuth consent screen → External, 앱 이름 `Caselab`, 지원 이메일 본인
3. Scopes: `email`, `profile`, `openid`
4. Credentials → Create Credentials → OAuth client ID
   - Type: Web application
   - Authorized redirect URIs:
     - `https://<supabase-project-ref>.supabase.co/auth/v1/callback`
     - `http://localhost:3000/auth/callback`
5. Supabase Dashboard → Authentication → Providers → Google → Enable → 키 입력 → Save

### 📋 Kakao OAuth (선택)
Issue #3 본문 참고 + Edge Function 배포 필요. Day 0에서 Cloudflare 안 쓰니까 Kakao OAuth 셋업도 Day 10 이후로 미뤄도 OK.

### 🔍 검증
- `npm run dev` → `/login` → Google 로그인 → `/onboarding`
- Supabase Studio → profiles → 본인 row ✓

---

## Day 2-B — Analytics 인프라 + events.search 적재 + editor 초대 (2026-06-02 신설)

### ✅ 끝났을 때
- `lib/analytics/track.ts` wrapper (events 테이블 + GA4 매핑)
- `lib/analytics/utm.ts` (URL 파싱 → sessionStorage)
- `lib/analytics/scroll-tracker.ts` (25/50/100% scroll → GA4 fire)
- `components/analytics/GA4Provider.tsx` Consent Mode v2 패치 (default denied → update granted)
- `app/layout.tsx`에 `<SpeedInsights />` 추가 (D24)
- EventType에 `search` 추가 (D55 인기 검색어 적재)
- `/admin/users/invite` 페이지 + Supabase `inviteUserByEmail` + role=editor 자동 (D47)
- `package.json`에 `@vercel/speed-insights` 추가

### 🎯 결정 출처
§18.9 (D21~D24) + §19 (D47 editor 초대 격상) + 영역 1 (§5-5 인기 검색어 P0)

### 📋 체크리스트
1. `npm i @vercel/speed-insights pdfjs-dist react-pdf` (Speed Insights + Day 12~13 web reader 라이브러리 미리 설치)
2. `lib/analytics/track.ts` 신설 — EventType union + GA4_MAP + track() wrapper
3. `lib/analytics/utm.ts` 신설 — parseUtmFromUrl / saveUtmToSession / getUtm / attachUtmToMetadata
4. `lib/analytics/scroll-tracker.ts` 신설 — useScrollTracker hook (IntersectionObserver)
5. `components/analytics/GA4Provider.tsx` 패치 — `gtag('consent', 'default', { all: 'denied' })` 먼저 호출, CookieConsent 동의 시 update granted
6. `app/layout.tsx` — `<SpeedInsights />` 1줄 추가
7. EventType에 `search` 케이스 추가 + `/search` 페이지에서 `track('search', { keyword, results_count, filter })` 발화
8. `app/admin/users/invite/page.tsx` + `actions.ts` 신설 — Supabase Auth `inviteUserByEmail` + Brevo 발송 + handle_new_user 트리거 수정해서 `raw_user_meta_data.invite_role` 읽기

### 🔍 검증
- `npm run build` 타입 에러 0
- `npm run dev` → DevTools Network에 GA4 collect 요청 (denied 모드로 modeling)
- URL에 `?utm_source=test&utm_medium=test&utm_campaign=test` 붙이고 진입 → DevTools Application → sessionStorage → `caselab_utm` 키 JSON 저장
- 콘텐츠 페이지 스크롤 → gtag debug에 scroll event
- `/admin/users/invite`에서 본인 다른 이메일로 초대 → 메일 수신 → 가입 후 `profiles.role='editor'` 확인

### 🛠️ 막히는 곳
- **gtag undefined**: GA4Provider 마운트 전에 track() 호출. 동적 로드 또는 client-only 컴포넌트로 격리
- **PDF.js worker URL**: `pdfjs-dist`의 worker는 별도 setup 필요. `react-pdf` 가이드 참조

---

## Day 3 — Admin 부여 + 첫 콘텐츠 작성 시동

### ✅ 끝났을 때
- 본인 계정으로 `/admin` 접근 가능
- `/admin/contents/new` 폼이 뜨고 “초안 작성 워크플로우” 사이드바 보임
- Claude Max로 첫 콘텐츠 초안 1편 작성 완료

### 📋 Admin 부여
Supabase Dashboard → SQL Editor:
```sql
update public.profiles
set role = 'admin', onboarded = true
where email = 'caselab.kr@gmail.com';
```

### 📋 Claude Max로 첫 콘텐츠 초안
1. claude.ai 새 대화 열기
2. 시스템 프롬프트(아래 “톤·스키마 프롬프트” 참고)
3. 주제 입력: “빈 입력칸 앞에서 머리가 하얘질 때 — 같이 첫 한 줄 쓰는 5단계”
4. 본문 JSON 받기 (kind: case, framework 5단계, customization 4개 포함)
5. 로컬 `/admin/contents/new` → 본문 JSON 영역에 붙여넣기
6. 메타·태그·페르소나·시간 라벨 채우기
7. 발행 게이트 자동 6 통과 확인 → 발행

### 톤·스키마 프롬프트 (Claude Max에 복붙용)
```
당신은 케이스랩(caselab) 매거진의 운영자 어시스턴트입니다.
케이스랩은 한국 직장인 5인 페르소나(기획자/전략팀/1인사업/영업팀장/스타트업 마케터)에게
"일을 푸는 framework × 단계별 AI 실행 × 솔직한 후기"를 1인칭 톤으로 제공.

다음 JSON 스키마와 정확히 일치하는 객체만 반환:
{
  "kind": "case",
  "essence": [{"type":"text","markdown":"..."}],
  "framework": [
    {
      "name": "Step 1...",
      "description": "...",
      "intent": "이 단계의 의도 한 줄",
      "blocks": [
        {"type":"intent","step":1,"text":"의도 다시"},
        {"type":"text","markdown":"..."},
        ... (role-card, prompt, result-compare, evaluation 등)
      ]
    },
    ... (총 4~6 step)
  ],
  "failures": [...],   // 별로였던 사례 — 전체 분량의 30% 이상
  "review": [...],     // 솔직한 후기
  "customization": ["1단계 ...","2단계 ...","3단계 ...","4단계 ..."]
}

규칙:
- 한국어, 1인칭 ("저도 처음엔...", "이게 진짜 별로였던 게...")
- 각 step의 intent 한 줄 명확히
- failures 분량 ≥ 30%
- customization 정확히 4개
- 광고/유료 강의 링크 X

주제: <여기 입력>
요약: <여기 입력>
```

### 🔍 검증
- `/admin/contents/new` 폼 → JSON 영역에 Max 응답 복붙
- 우측 사이드바 “발행 게이트 자동 6” 모두 ✓
- 수동 확인 3개 체크 → 발행
- `/cases` 가서 발행한 콘텐츠 확인

### 🛠️ 막히는 곳
- **JSON parse 에러**: Max가 가끔 ```json ... ``` 코드 블록으로 감싸요. 백틱 빼고 순수 JSON만 붙여넣기
- **failures 분량 < 30%**: 별로였던 사례를 더 길게 적게 요청

---

## Day 5 — Mockup freeze 데드라인 (2026-06-03 신설, plan §20)

**컨텍스트**: user mockup 18개·admin 9개가 modified 상태. 코드와 mockup 동시 작업 중 → 충돌 방지 위해 freeze 시점 박음 (~2026-06-08).

### ✅ 끝났을 때 (사용자 손)
- `docs/design_mockup/user/`·`admin/` 모든 HTML freeze (더 이상 디자인 변경 없음)
- mockup HTML 측 D58 동기화 완료 (Playfair Display 제거, font-serif → font-sans+font-bold)
- freeze 직후 `git status` 캡처 1회 → 변경분 인벤토리 보관

### 📋 워크플로우
1. 사용자: mockup 잔여 작업 마감 (콘텐츠 상세·도구 상세·이북 상세 등)
2. 사용자: mockup HTML에서 font-serif·Playfair Display 잔존 제거
3. 사용자: `git status` 결과 캡처 → 다음 세션 시작 시 공유
4. freeze 후 mockup 변경 발생 시 = P2 이월 (즉시 코드 반영 X)

### 🛠️ freeze 미달성 시
- Day 6에 freeze 연장 또는 일부 mockup-코드 disparity 수용 결정. plan §20.8 참조

### 🔗 freeze 후 즉시 처리할 task
- T-N (Day 6): 콘텐츠 상세 TOC 좌측 sticky 마이그레이션 (U1)
- T-O (Day 7~8): `/tools/[slug]` hero·featured 보강 (U3, P0 격상)
- T-M (Day 3~4 진행 중): AdminSidebar 메뉴 mockup 정합

---

## Day 4~7 — 콘텐츠 10개 작성

### ✅ 끝났을 때
- `status='published'` 콘텐츠 10개
- 메인 페이지 Hero + 두 트랙 카드 영역 안 비어 보임
- 페르소나 5명 각각 흥미가지는 콘텐츠 최소 1개씩

### 📋 워크플로우 (콘텐츠 1개당 1~2시간)
1. Claude Max에서 새 대화 + 위 “톤·스키마 프롬프트”
2. 주제·요약 입력 → JSON 받기
3. JSON 검수 + 1인칭 톤 다듬기
4. `/admin/contents/new` → 메타·태그·페르소나·시간 채우기
5. 발행 게이트 자동 6 통과 확인 → 발행

### 🛠️ 막히는 곳
- **AI 톤이 일반론적**: 주제를 더 구체적인 1인칭으로 — “AI를 잘 쓰는 법” → “저도 분명 시간 줄이려고 AI 썼는데 오히려 두 배 걸렸던 이야기”
- **자동저장 안 됨**: localStorage 저장. 같은 브라우저면 복구됨

---

## Day 8 — 보강 코드 검수 + GA4 ([Issue #7](https://github.com/juhee2464amanda/caselab/issues/7))

이전 turn에 코드 추가 끝남. 운영자 작업 = GA4 ID 등록 + 텍스트 검수.

### ✅ 끝났을 때
- 브라우저 탭에 favicon
- `/legal/privacy`, `/legal/terms`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image` 모두 200
- GA4 측정 ID 등록 후 동의하면 실시간에 본인 방문 보임

### 🚨 의사결정 트리거
**쿠키 배너 표시?** — 권장: 표시 + 동의 후 GA4. 한국 가이드 권고.

### 📋 GA4
1. [analytics.google.com](https://analytics.google.com) → 관리 → 속성 만들기
   - 속성 이름: `Caselab`
   - 시간대: Asia/Seoul
2. 데이터 스트림 → 웹 → `http://localhost:3000` (도메인 결정 전이라 임시) → 측정 ID 복사
3. `.env.local`에 `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-...`

### 📋 약관 검수
- `app/(public)/legal/privacy/page.tsx` — “운영자: 개인 운영자” 부분 본인 이름 또는 운영명으로 변경
- `app/(public)/legal/terms/page.tsx` 본문 읽기

### 🔍 검증
```bash
npm run dev
open http://localhost:3000/legal/privacy   # 200
open http://localhost:3000/robots.txt
open http://localhost:3000/sitemap.xml
```

---

## Day 9 — Brevo + 전자책 발송 ([Issue #5](https://github.com/juhee2464amanda/caselab/issues/5))

> ⚠️ 2026-06-12 최신 결정: **전자책 발송 = Gmail SMTP(nodemailer)**. Brevo가 gmail 발신자를 Gmail에 silent-drop해서 인박스 미도달 → Gmail 자체 SMTP로 전환(INBOX 도달 검증). 사유는 메인 레포 `caselab/docs/04_dev_plan.md` §18.16 참조. 아래 Brevo 설정은 **뉴스레터 명단 동기화·비번재설정 SMTP**에만 해당.

### ✅ 끝났을 때
- 발신 Gmail 계정 2단계 인증 + 앱 비밀번호 발급 → secrets `GMAIL_USER/GMAIL_APP_PASSWORD/GMAIL_SENDER_NAME` 등록
- `send-ebook` Edge Function 배포 (Gmail SMTP / nodemailer 사용)
- 본인 Gmail로 전자책 주문 → 1분 내 PDF 다운로드 링크 INBOX 도착
- (뉴스레터 명단 동기화용) Brevo 가입 + API Key + `BREVO_NEWSLETTER_LIST_ID` 등록

### 📋 Brevo 단일 발신자 인증 (~5분)
1. [brevo.com](https://www.brevo.com/) 가입 (Google 로그인 가능). Day 0에 이미 가입했으면 패스.
2. Dashboard → **Senders, Domains & Dedicated IPs** → **Senders** → **Add a sender**
   - From name: `케이스랩`
   - From email: `caselab.kr@gmail.com`
3. 등록 즉시 `caselab.kr@gmail.com`으로 인증 메일 도착 → **Confirm** 클릭
4. Senders 목록에 `Verified ✓` 표시되면 완료

### 📋 Brevo API Key 발급 (~2분)
1. Dashboard 우상단 프로필 → **SMTP & API** → **API Keys** 탭
2. **Generate a new API key** → name: `caselab-edge` → Generate
3. **`xkeysib-...`로 시작하는 키 복사·메모** (한 번만 표시)

### 📋 Supabase Edge Function 배포 (~5분)
```bash
# Day 1에서 supabase login + link 이미 했다는 전제
supabase secrets set BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxx
supabase secrets set BREVO_SENDER_EMAIL=caselab.kr@gmail.com
supabase secrets set BREVO_SENDER_NAME=케이스랩
supabase secrets set SITE_URL=https://<your>.vercel.app   # Day 10 후 갱신
supabase functions deploy send-ebook
```

### 📋 전자책 PDF 업로드 (첫 책 한 번)
1. PDF 준비 (직접 작성 또는 콘텐츠 10편 합본 PDF)
2. Supabase Dashboard → Storage → ebooks 버킷 → Upload → `ebook-volume-1.pdf`
3. Table Editor → products → Insert:
   - `slug`: `volume-1`
   - `title`: `AI로 일이 풀린 케이스 30개`
   - `price`: `0`
   - `pdf_path`: `ebook-volume-1.pdf`
   - `status`: `active`

### 🔍 검증
1. `/ebooks/volume-1/order` → 본인 이름·이메일 입력 → 신청
2. Supabase Studio → purchases → `status='pending'` row 확인
3. 수동 트리거:
   ```bash
   curl -X POST "https://<project>.supabase.co/functions/v1/send-ebook" \
     -H "Authorization: Bearer <service_role_key>" \
     -H "Content-Type: application/json" \
     -d '{"purchase_id": "<위 row의 id>"}'
   ```
4. 본인 메일함에서 1분 내 도착 확인 (**스팸/프로모션 탭도 꼭 확인**). 발신: `케이스랩 <caselab.kr@gmail.com>` (`via brevo.com` 꼬리표 표시될 수 있음)
5. PDF 다운로드 링크 클릭 → 다운로드 성공
6. Supabase Studio에서 row `status='sent'`, `sent_at` 채워짐 확인

### 🛠️ 자주 막히는 지점
- **단일 발신자 인증 메일 안 옴**: Gmail 모든 폴더(받은편지함·소셜·프로모션·스팸) 검색. 5분 지나도 없으면 Brevo Senders 화면에서 Resend 클릭
- **`api-key` 401**: 키 복사 시 앞뒤 공백·줄바꿈 포함 여부 확인. `xkeysib-`로 시작하는지
- **Brevo 응답 400 `Invalid sender`**: 단일 발신자 인증 완료 후 `BREVO_SENDER_EMAIL`이 인증된 주소와 정확히 동일한지 확인
- **스팸/프로모션 탭으로 빠짐**: 본인 inbox에서 "스팸 아님" 표시 + 발신주소 주소록 추가. 첫 발송은 흔함. 도메인 도입 시(§18.3) DKIM/SPF 추가하면 격감
- **일 300건 한도 초과**: 운영자 1인 + 출시 직후엔 도달 안 함. 도달 시 도메인 구입 + Brevo 도메인 인증(DKIM/SPF)으로 격상

### Brevo 단일 발신자 인증의 트레이드오프 (인지하고 진행)
- 발신: `caselab.kr@gmail.com` (도메인 인증이 아니라 단일 발신자 인증 → 인박스에 `via brevo.com` 꼬리표 표시 가능)
- 일부 수신자(특히 기업 outlook·국내 daum/naver 일부 정책)에서 프로모션/스팸 탭으로 분류 가능 (~20%)
- → 대신 **연 운영비 $0** + 도메인 없이 즉시 사용 + 일 300건/월 9k 무료 + 뉴스레터 캠페인 UI 동봉
- **전환 트리거** (§18.3): 구독자 500명 / 월 발송 8k / 스팸 불만 / 딜리버러빌리티 < 80% 도달 시 → 도메인 구입 + Brevo 도메인 인증(DKIM/SPF)으로 격상

---

## Day 10 — Vercel 배포 ([Issue #6](https://github.com/juhee2464amanda/caselab/issues/6))

### ✅ 끝났을 때
- `https://caselab.vercel.app` (또는 Vercel이 자동 부여한 서브도메인) 메인 페이지 200
- HTTPS 자동 발급
- 로그인 + 콘텐츠 발행 → 1분 내 메인 반영

### 🚨 의사결정 트리거
**Vercel 프로젝트 이름** — 권장: `caselab` (가능하면). 점유 시 `caselab-mag` 또는 `caselab-kr` 등.

### 📋 Vercel
1. [vercel.com](https://vercel.com) → New Project → `juhee2464amanda/caselab` Import
2. Framework: Next.js (자동)
3. **Install Command 변경**: `npm install --legacy-peer-deps` ⚠️ 필수
4. Environment Variables 등록 (Production·Preview·Development 모두):
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   NEXT_PUBLIC_SITE_URL=https://<your-vercel-subdomain>.vercel.app
   DRAFT_PREVIEW_SECRET            # openssl rand -hex 32
   NEXT_PUBLIC_GA_MEASUREMENT_ID
   ```
   (Brevo·Anthropic·Kakao 변수는 Vercel에 등록 안 함 — Supabase Edge Function secret로만 등록)
5. Deploy → 2~3분
6. Settings → Domains → 기본 `xxx.vercel.app` 도메인 확인. 마음에 안 들면 프로젝트 rename
7. **`NEXT_PUBLIC_SITE_URL`은 최종 서브도메인으로 업데이트** → Redeploy

### 📋 다른 콘솔 URL 업데이트
- **Supabase**: Authentication → URL Configuration
  - Site URL: `https://<your>.vercel.app`
  - Redirect URLs: `https://<your>.vercel.app/auth/callback`
- **Google OAuth**: Cloud Console → OAuth client → Authorized redirect URIs에 production URL 추가

### 🔍 검증
```
https://<your>.vercel.app/             # 200 + Hero
https://<your>.vercel.app/login        # 200 + 로그인 가능
https://<your>.vercel.app/admin        # 비로그인 → /login redirect
https://<your>.vercel.app/sitemap.xml  # 200
```

---

## Day 11 — 페르소나 검증 12개 ([Issue #10](https://github.com/juhee2464amanda/caselab/issues/10))

### 자동 6 (각 콘텐츠 발행 시 Admin Linter 통과 확인)
- [ ] 1. 읽기/적용 시간 라벨
- [ ] 2. 직무 태그 ≥ 1 + 5/10/30분 칩 필터
- [ ] 3. step별 IntentBox 수 = step 수
- [ ] 4. FailureSection ≥ 30%
- [ ] 5. CustomizationChecklist 4개
- [ ] 6. 광고 외부 링크 0

### 수동 (배포 사이트에서 직접)
- [ ] 7. 운영자 1인칭 톤
- [ ] 8. RelatedSidebar/Carousel 작동
- [ ] 9. 모바일에서 본문/CommentThread/ShareButtons
- [ ] 10. PersonaCoverageBadge가 콘텐츠 실효용과 일치

### 운영 원칙
- [ ] 11. 콘텐츠 10편 발행 완료
- [ ] 12. 인스타 → `/links` → 콘텐츠 동선 1회 직접 테스트 (모바일)

---

## Day 12 — 출시

### ✅ 끝났을 때
- 인스타 프로필 “웹사이트” 칸에 `https://<your>.vercel.app/links` URL
- 인스타 첫 공지 포스트 발행

### 📋
1. 인스타 프로필 편집 → 웹사이트 URL
2. 첫 포스트 (Reels 또는 캐러셀) — 콘텐츠 1편 예고
3. 모니터링:
   - Supabase Logs (실시간 에러)
   - Vercel Deployments → Logs

### 첫 24시간 KPI
- `events.deep_read` ≥ 5건
- 가입자 ≥ 3명
- 에러 로그 0건

---

## 출시 이후 — 도입 로드맵

| 항목 | 도입 트리거 |
|---|---|
| Kakao OAuth | 한국 사용자 비중 70%↑ 확인 시 |
| 커스텀 도메인 | 인스타 유입 안정화 + 브랜드 강화 필요 시 |
| Brevo 도메인 인증(DKIM/SPF 격상) | 구독자 500명 / 월 발송 8k / 스팸 불만 / 딜리버러빌리티 < 80% 도달 시 (도메인 구입 동반) |
| Resend 전환 검토 | Brevo 월 9k 한도 초과 + 도메인 도입 후 추가 인프라 필요 시 |
| Anthropic AI 초안 | 콘텐츠 월 5건 이상 + Max 복붙 피로 |
| Lighthouse 90+ 폴리싱 | 데이터로 사용자 이탈 지점 확인 후 |
| 카드뉴스 자동 생성 | 출시 +1개월 |
| Brunch·LinkedIn 외부 채널 | 출시 +3~6개월 |

---

## 부록 — 환경변수 체크리스트

| 변수 | 어디서 | Day | 비고 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API | Day 1 | 필수 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase API | Day 1 | 필수 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase API | Day 1 | 필수 |
| `NEXT_PUBLIC_SITE_URL` | Vercel 서브도메인 | Day 10 | 필수 |
| `DRAFT_PREVIEW_SECRET` | `openssl rand -hex 32` | Day 10 | 필수 |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GA4 | Day 8 | 선택 |
| `KAKAO_REST_API_KEY` (Edge Function secret) | Kakao 디벨로퍼스 | Day 2 (선택) | Kakao 도입 시 |
| `KAKAO_CLIENT_SECRET` (Edge Function secret) | Kakao 디벨로퍼스 | Day 2 (선택) | 동일 |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` / `GMAIL_SENDER_NAME` (Edge Function secret) | 발신 Gmail + 앱비번 16자리 | Day 9 | 필수 (전자책 발송) |
| `BREVO_API_KEY` (Edge Function secret) | Brevo → SMTP & API → API Keys (`xkeysib-...`) | Day 9 | 필수 (뉴스레터 명단 동기화) |
| `BREVO_SENDER_EMAIL` (Edge Function secret) | `caselab.kr@gmail.com` (Brevo 단일 발신자 인증 완료한 주소) | Day 9 | 필수 |
| `BREVO_SENDER_NAME` (Edge Function secret) | `케이스랩` | Day 9 | 필수 |
| `ANTHROPIC_API_KEY` | Anthropic Console | **출시 후** | 보류 |
| `NEXT_PUBLIC_AI_DRAFT_ENABLED` | `true` | **출시 후** | 보류 (AI 초안 버튼 토글) |

---

> 막힐 때 Claude에게 “Day N 막혔어요, {증상}” 형식으로 알려주시면 그 시점 옵션 또는 트러블슈팅을 같이 봐드릴게요.
