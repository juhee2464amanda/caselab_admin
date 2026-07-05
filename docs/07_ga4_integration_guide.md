# GA4 연동 가이드 (본가 수집 → admin 읽기)

> 작성 2026-07-02 · 최종 갱신 2026-07-05. 본가에서 수집한 실제 방문자 GA4 데이터를
> admin 대시보드에서 읽어오는 구조와 실제 구축 내역. **✅ 연동 완료 + 라이브 검증됨.**

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
   → 본가 수집을 가장 먼저 켜는 게 최우선이었다.

---

## ✅ 연동 상태: 완료 (2026-07-05 라이브 검증)

| | 본가 (caselab) | admin (caselab_admin) |
|---|---|---|
| gtag 수집 | ✅ 실 measurement ID `G-Z1HD…` 활성 · **고지 기반 자동수집** | — (운영자용, 유저 분석 소스 아님) |
| GA4 Data API 읽기 | — | ✅ main 반영 (PR #20). property `544018475` |
| 서비스 계정 | — | `ga4-reader@caseload-dashboard.iam.gserviceaccount.com` (Viewer) |

**라이브 리드 테스트 (admin 자격증명 → 실제 GA4 호출):** 실시간 activeUsers 감지 ✅,
인증·Viewer 권한·property 매칭 정상 ✅ → **본가 수집 → property 544018475 → admin
Data API 읽기** 전 구간 작동 확인.

---

## 📌 채택한 동의(consent) 방식 — 고지 기반 (동의 배너 없음)

초기엔 CookieConsent 배너/`ProfileForm` 토글로 `setAnalyticsConsent()`를 호출하는
"동의 브리지"를 검토했으나, **최종적으로 동의 UI를 제거하고 개인정보처리방침 고지 기반
자동수집으로 전환**했다 (§18.20).

- `GA4Provider`가 `gtag('consent','default', { analytics_storage: 'granted' })`를 기본으로 config.
  광고 스토리지(`ad_storage` 등)는 계속 `denied`.
- `components/analytics/CookieConsent.tsx`, `PageviewTracker.tsx` **제거됨.**

→ 이 문서 이전 버전의 "동의 브리지 배선" 지시는 **폐기**됐다. 지금은 브리지가 없다.

---

## 🏗️ 구축 내역

### 본가 (수집측)
- `.env.local` + Vercel env: 실제 `NEXT_PUBLIC_GA_MEASUREMENT_ID` (`G-Z1HD…`)
- `components/analytics/GA4Provider.tsx`: `granted` 기본 + `send_page_view:false`.
  pv는 라우트 변경 시 event 방식으로 1회만 발화 (**config 재호출 이중발화 제거**)
- `lib/analytics/track.ts`: EventType → GA4 event name 매핑
  (`page_view`/`deep_read`/`prompt_copy`/`save`/`search`…). `prompt_copy` 호출부 보강
- 관련 커밋: `bd5bea5`(계측 정합) · `9bcda4e`/PR #63(동의 UI 제거)

### admin (읽기측) — PR #20으로 main 머지
- `@google-analytics/data ^6.1.0`
- `lib/analytics/ga4-data-api.ts`: `server-only` + base64 서비스 계정 인증 + `getInflow()`
  (env 미설정 시 `null` 반환 가드)
- `components/admin/InflowPanel.tsx`: 채널·캠페인별 activeUsers/engagedSessions 표,
  미연동 시 안내. `app/admin/analytics/page.tsx`에 마운트
- `.env`: `GA4_PROPERTY_ID=544018475` · `GA4_SERVICE_ACCOUNT_JSON`(base64)

---

## 🔑 인증 세팅 (재현·키 로테이션용)
1. GCP → IAM → 서비스 계정(`ga4-reader@caseload-dashboard`) → Key JSON 발급
2. `base64 -i service-account.json` → `GA4_SERVICE_ACCOUNT_JSON`에 저장 (admin `.env.local` + Vercel)
3. GA4 property `544018475` → Admin → Account access에 서비스 계정 email을 **Viewer**로 추가

---

## ⚙️ 운영 노트 / 후속
- **소급 없음**: 켠 시점(2026-07-04)부터만 누적. 켠 직후 유입 데이터 희소는 정상.
- **scroll**: `scroll_25/50/100`이 GA4에선 `scroll` 하나로 합쳐진다 → 완독률(100%)은
  `depth` 파라미터 기준 별도 쿼리 필요 (후속).
- **미발화 이벤트**: `react_down`·`ebook_read_page`·`ebook_finish`는 매핑만 존재.
  `ebook_download`는 서버에서 DB-only 적재라 GA4로는 안 나감.
- **다음 확장**: `/admin/revenue`·메인 대시보드의 `—` 빈칸 GA4 보강, UTM(§7.1.6) 채널 결합.

## 🔍 검증 방법 (재현)
admin repo에서 `.env.local`의 `GA4_PROPERTY_ID`/`GA4_SERVICE_ACCOUNT_JSON`으로
`runRealtimeReport`(활성 사용자)·`runReport`(채널별 7일) 호출 → 행이 반환되면 정상.
`PERMISSION_DENIED`면 서비스 계정 Viewer 미부여 또는 property ID 불일치.

관련: `docs/06_admin_dev_plan.md` §7.1.5(D33) · §7.1.6(UTM) · §5-5 · §18.20(동의 제거)
