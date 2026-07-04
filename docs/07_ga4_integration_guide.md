# GA4 연동 가이드 (본가 수집 → admin 읽기)

> 작성 2026-07-02. 유저 사이트(본가)의 실제 방문자 GA4 데이터를 admin 대시보드에서
> 읽어오기까지의 전체 작업 순서와, 각 프로젝트에서 줄 프롬프트.

---

## 🧭 큰 그림: 누가 "수집"하고 누가 "읽는가"

```
┌─────────────────────┐         ┌──────────────────────┐
│   본가 (유저 사이트)   │  수집    │   admin (caselab_admin)│
│  실제 방문자 트래픽    │ ──────▶ │   운영자만 접속         │
│  → gtag가 GA4로 발사  │  같은    │   → GA4 Data API로     │
│                     │  GA4     │      읽어서 대시보드     │
└─────────────────────┘ property └──────────────────────┘
```

**결정적 사실 2가지**
1. GA4 데이터는 **본가에서만** 생긴다. 실제 유저가 본가에 있으니, gtag가 본가에
   진짜 measurement ID로 켜져 있어야 데이터가 쌓인다. admin의 gtag는 운영자만
   측정하므로 유저 분석 소스가 아니다.
2. GA4는 **소급(backfill)이 안 된다.** 트래킹 켠 시점부터만 쌓인다.
   → 본가 수집을 가장 먼저 켜는 게 최우선.

---

## 📊 현재 상태 (2026-07-02 확인)

| | 본가 (caselab) | admin (caselab_admin) |
|---|---|---|
| gtag 트래킹 인프라 | ✅ 이미 구축됨 (`GA4Provider` layout 마운트, `lib/analytics/ga4.ts`·`track.ts`) | ✅ 코드 있음 (운영자 측정용) |
| Measurement ID | ⚠️ `G-XXXXXXXXXX` placeholder → **꺼짐** | ⚠️ placeholder → 꺼짐 |
| GA4 Data API 읽기 | — (해당 없음) | ❌ 미구현 (`docs/06_admin_dev_plan.md` §7.1.5 / D33 계획만) |

→ **본가는 인프라는 있으나 "ID 교체 + 동의 브리지 수정" 2가지가 필요하다.**
→ admin은 Data API 읽기를 새로 구현해야 한다.

### ⚠️ 정밀 점검에서 드러난 함정 2가지 (2026-07-02)
1. **placeholder가 truthy** — `G-XXXXXXXXXX`는 빈 문자열이 아니라서 `if(!GA_ID)` 가드를
   통과한다. 즉 지금 상태는 "안 켜짐"이 아니라 **가짜 ID로 조용히 무효 전송** 중.
   반드시 실제 `G-` ID로 교체해야 정상.
2. **동의(consent) 브리지 끊김** — `GA4Provider`는 `setAnalyticsConsent()`
   (localStorage + `gtag('consent','update')`)를 기다리는데, 이를 호출하는 곳이 없다.
   `ProfileForm`의 `analytics_consent` 토글은 DB 컬럼만 갱신하고 GA4엔 연결 안 됨.
   CookieConsent 배너도 없음 → consent 영구 `denied` → 진짜 ID를 넣어도 **쿠키리스
   모델링만** 됨. 정식 쿠키 수집을 하려면 이 브리지를 배선해야 한다.

---

## 📋 작업 순서 (3단계)

### STEP 0 — Google 콘솔 세팅 (코드 아님 · 사람이 클릭 · 30분)
| # | 작업 | 위치 | 산출물 |
|---|------|------|--------|
| 0-1 | GA4 property 생성(없으면) | analytics.google.com | **Measurement ID** `G-XXXX`, **Property ID**(숫자) |
| 0-2 | 서비스 계정 생성 + Key JSON 발급 | GCP → IAM | `service-account.json` |
| 0-3 | GA4 → Admin → Account access에 서비스 계정 email 추가 (**Viewer**) | GA4 콘솔 | admin 읽기 권한 |

### STEP 1 — 본가 수집 켜기 🔴 최우선
> 작업 프로젝트: **caselab (본가)**. 인프라는 있으나 아래 1·2가 실제 blocker.
1. `.env.local` + **Vercel env**의 `NEXT_PUBLIC_GA_MEASUREMENT_ID`를 진짜 `G-XXXX`로 교체
   (placeholder 잔존 금지 — 위 함정①)
2. **동의 브리지 배선** (정식 쿠키 수집 시 필수 — 위 함정②): CookieConsent 배너 추가
   또는 `ProfileForm` 토글이 `GA4Provider`의 `setAnalyticsConsent(true/false)`를 실제
   호출하도록 연결 → `gtag('consent','update',{analytics_storage:'granted'})` 경로 확보
3. 배포 후 **GA4 Realtime 리포트에서 본인 방문이 잡히는지 + 동의 ON 시 granted 전환**
   확인 ← STEP1 완료 판정(체크포인트)
4. (선택) 미발화 이벤트 정리: `react_down`·`ebook_read_page`·`ebook_finish`는 매핑만
   있고 호출부 없음. `ebook_download`는 서버 DB-only라 GA4 미전송. 필요 시 배선.

### STEP 2 — admin에서 읽어오기 (caselab_admin) — ✅ 코드 구현 완료
> 작업 프로젝트: **caselab_admin**. 코드는 구현됨. **env 채우고 체크포인트 이후 검증만 남음.**
- ✅ `@google-analytics/data` 설치
- ✅ `lib/analytics/ga4-data-api.ts` — `server-only` + base64 서비스 계정 인증 + `getInflow()`
  (env 없으면 `null` 반환 가드)
- ✅ `components/admin/InflowPanel.tsx` — 채널·캠페인별 activeUsers/engagedSessions 표,
  미연동 시 안내. `app/admin/analytics/page.tsx`에 마운트됨
- ✅ `.env.local`/`.env.example`에 `GA4_PROPERTY_ID`·`GA4_SERVICE_ACCOUNT_JSON` 추가(빈 값)
- ⬜ **남은 일**: STEP0 산출물로 두 env 채우기 + Vercel 등록 → 체크포인트 이후 `/admin/analytics`에서 실값 확인
- 후속(범위 밖): 완독률/리텐션은 scroll이 GA4에서 `scroll` 하나로 합쳐져 depth 파라미터
  쿼리 별도 필요. `/admin/revenue`·메인 대시보드 `—` 빈칸 보강은 InflowPanel 검증 후.

---

## ✅ 순서 요약

```
STEP0 콘솔세팅(G-ID·서비스계정)
  → STEP1 본가 .env에 진짜 ID 꽂고 배포 → GA4 Realtime 확인 (🔴먼저)
  → [데이터 쌓이기 시작]
  → STEP2 admin Data API 읽기 (§7.1.5 / D33)
```

가장 흔한 실수: **admin부터 붙이는 것.** 본가 수집이 안 켜져 있으면 admin Data API는
빈 응답만 받는다. 반드시 본가 STEP1 → Realtime 확인 → admin STEP2 순서.

---

## 📌 본가(유저 사이트)에 줄 프롬프트 (짧은 버전)

> caselab(본가) repo에서 Claude Code 세션을 열고 붙여넣기. `G-XXXX`만 실제 값으로.

```
이 유저 사이트에 GA4 실측정을 정식으로 켜려고 해. 트래킹 인프라(GA4Provider·
lib/analytics)는 이미 있는데 (a) NEXT_PUBLIC_GA_MEASUREMENT_ID가 placeholder라 꺼져
있고 (b) 동의(consent) 브리지가 끊겨 있어 쿠키 기반 정식 수집이 안 되는 상태야.

1. .env.local의 NEXT_PUBLIC_GA_MEASUREMENT_ID를 G-XXXX(실제)로 교체. (참고: placeholder
   G-XXXXXXXXXX가 truthy라 지금 가짜 ID로 무효 전송 중이니 반드시 실제 값으로.)
2. 동의 브리지 배선 — 지금 GA4Provider의 setAnalyticsConsent()를 아무도 호출하지 않고,
   ProfileForm의 analytics_consent 토글은 DB 컬럼만 갱신함. CookieConsent 배너를 추가
   하거나 그 토글이 setAnalyticsConsent(true/false)를 실제 호출하도록 배선해서
   gtag('consent','update',{analytics_storage:'granted'}) 경로를 만들어줘.
3. deep_read / prompt_copy / save / search 이벤트 호출 지점을 grep해서 커버리지 점검,
   빠진 것 목록화. (admin이 이 이벤트 이름으로 GA4를 해석하니 이름 규약 유지 필수)
4. Vercel 환경변수 등록 + 배포 후 GA4 Realtime에서 방문·동의 granted 전환 확인 절차 정리.

코드 대량 수정 전에 2·3번 점검 결과부터 보고해줘.
```

관련: `docs/06_admin_dev_plan.md` §7.1.5(D33) · §7.1.6(UTM) · §5-5(유입 패널 P0)
