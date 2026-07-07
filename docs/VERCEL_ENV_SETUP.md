# Vercel `caselab-admin` 환경변수 설정 가이드

> 작성일: 2026-06-07
> 대상: Vercel `caselab-admin` 신규 프로젝트 (caselab-admin.vercel.app)
> 전제: caselab user 프로젝트(`caselab-five.vercel.app`)와 **같은 Supabase 프로젝트**를 공유한다.

---

## 1. Vercel 프로젝트 신설 (선행)

1. https://vercel.com/new
2. **Import Git Repository** → `juhee2464amanda/caselab_admin` 선택
3. Project Name: `caselab-admin` (그대로 권장 → `caselab-admin.vercel.app`)
4. Framework Preset: **Next.js** (자동 인식)
5. Root Directory: `./` (기본값)
6. Build Command / Output Directory / Install Command: **그대로** (Next.js 기본)
7. **Environment Variables는 일단 비워두고 Deploy** — 첫 빌드는 실패할 수 있음 (Supabase 키 없음). 다음 단계에서 채우고 redeploy.

---

## 2. 환경변수 입력 (Settings → Environment Variables)

### 가장 빠른 방법

기존 **`caselab` (user)** 프로젝트의 `Settings → Environment Variables` 페이지를 다른 탭에 띄워두고, 아래 표대로 값을 복사한다. 시크릿은 **채팅창에 붙여넣지 말 것** — 로컬 `.env.local`에 이미 있고, Vercel UI에서 직접 입력하면 됨.

### 필수 키 (4개)

| Key | 값 출처 | 환경 | 비고 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | caselab user와 **동일** | Production, Preview, Development | `https://*.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | caselab user와 **동일** | Production, Preview, Development | `eyJ...` (긴 JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | caselab user와 **동일** | Production, Preview, Development | 시크릿. 절대 채팅·git에 노출 X |
| `NEXT_PUBLIC_SITE_URL` | **admin 전용 값** | Production, Preview, Development | `https://caselab-admin.vercel.app` (Production) / `http://localhost:3000` (Development) |

### 권장 키 (preview 토큰 호환)

| Key | 값 출처 | 환경 | 비고 |
|---|---|---|---|
| `DRAFT_PREVIEW_SECRET` | caselab user와 **동일** | Production, Preview, Development | 같아야 user에서 발급한 preview 토큰이 admin에서도 유효 |

### 옵션 키 (GA / AI 초안 활성 시)

| Key | 값 출처 | 환경 | 비고 |
|---|---|---|---|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | caselab user와 동일 (또는 admin 전용 신설) | Production | admin 트래픽 분리하려면 신설 |
| `ANTHROPIC_API_KEY` | Anthropic 콘솔 | Production | `/api/ai-draft` 활성화 시 필요 |
| `NEXT_PUBLIC_AI_DRAFT_ENABLED` | `true` | Production | 위와 세트 |

### HERMES 직접 적재 키 (씨앗 파이프라인)

| Key | 값 출처 | 환경 | 비고 |
|---|---|---|---|
| `HERMES_INGEST_TOKEN` | `openssl rand -hex 32`로 신규 생성 | Production | `/api/seeds/ingest` Bearer 토큰. HERMES 크론에 같은 값 설정. 시크릿 — 채팅·git 노출 X |

### 생략 가능

- `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET` — admin 로그인은 **비밀번호 only**이므로 불필요
- `BREVO_*` — Brevo는 Supabase Edge Function secrets에서만 관리 (Vercel 환경변수에는 등록 X — 본가와 동일 정책)

---

## 3. 검증 체크리스트

1. Production 환경에서 `NEXT_PUBLIC_SUPABASE_URL`이 user와 같은 값인지 → 같은 Supabase DB를 봐야 함
2. `NEXT_PUBLIC_SITE_URL`이 **admin URL**인지 (`caselab-admin.vercel.app`) — user URL 그대로 두면 redirect 잘못 감
3. `SUPABASE_SERVICE_ROLE_KEY`가 Vercel 환경변수에만 있고, 어떤 commit에도 포함 안 됐는지 (`.env.local`은 .gitignore에 있음 ✅)
4. Redeploy 후 `/login` 정상 (200), `/admin` 미로그인 시 `/login` redirect (307)

---

## 4. Supabase 측 추가 작업 (admin URL 등록 필요)

같은 Supabase 프로젝트라도 **OAuth 콜백 / 허용 도메인**에 admin URL 등록이 필요할 수 있다.

1. Supabase Dashboard → Authentication → URL Configuration
2. **Site URL**: user 그대로 (`https://caselab-five.vercel.app` 또는 caselab.kr)
3. **Redirect URLs**: 다음 추가
   - `https://caselab-admin.vercel.app/auth/callback`
   - `https://caselab-admin.vercel.app/**`
   - `http://localhost:3000/auth/callback` (로컬 개발 호환)

> admin 로그인은 비밀번호 only라 OAuth redirect URL은 엄밀히 필요 없지만, `/auth/callback`은 비밀번호 로그인 후에도 쓰일 수 있으므로 등록 권장.

---

## 5. 첫 배포 후 확인

| 경로 | 기대 |
|---|---|
| `/` | 307 → `/login` |
| `/admin` | 307 → `/login?next=/admin` |
| `/login` | 200 |
| 로그인 (admin role 계정) | `/admin` 진입 성공 |
| 로그인 (user role 계정) | `/login?error=forbidden` redirect + 안내 메시지 |

---

## 6. 미해결 결정 (참고)

- **커스텀 admin 도메인** (`admin.caselab.kr`) — Vercel.app 서브도메인 운영 후 추후 결정
- **admin 인증 분리** (현재는 user Supabase Auth 공유) — magic-link 별도 발급 정책은 plan §22.11 + D63·D64·D66 정합 합의 후
