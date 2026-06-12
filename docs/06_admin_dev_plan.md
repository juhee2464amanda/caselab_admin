# 케이스랩 (Caselab) — Admin 개발 계획서

> **작성일**: 2026-06-02
> **위상**: caselab admin 영역(운영자 페이지·관리 시스템)의 개발 정본.
> **출처**: `docs/03_one_page_spec_v3.md` (MVP 기획 v3) · `docs/04_dev_plan.md` §1~§19 (개발 계획 + 결정 매트릭스) · `docs/05_launch_runbook.md` (Day 0~12) · `docs/personas.html` (페르소나 1568건 인용) · `docs/design_mockup/admin/ADMIN_SESSION_NOTES.md` (admin 디자인 원형) · 2026-06-02 Phase A-0.2 인터뷰 7개 영역.
> **본문 ↔ 결정표**: 본 문서는 admin 영역의 **본문**. 결정 항목 D1~D49의 **결정 매트릭스**는 [[docs/04_dev_plan.md]] §19 (정본).
> **변경 절차**: admin 영역 새 결정은 §19에 D50+로 추가한 뒤, 본 문서의 해당 § 본문에 반영. [[feedback_4_location_protocol]] 준수.

---

## 1. Context — admin이 풀어야 할 운영 문제

### 1.1 케이스랩의 운영자 1명 가정

기획서 §9 ([[docs/03_one_page_spec_v3.md]])에 정의된 운영자 포지션:
- 13년 외국계·대기업 실무 (영업·마케팅·고객조사·전략·데이터 분석)
- 톤: "나도 배우는 중인데, 직접 써봤더니 이렇더라" — 1인칭 따뜻함
- 출시 시점 운영자 = **1명** (=이 문서를 읽는 분). 게스트 기고는 D47로 P0 채용 가능

이 1명이 다음 책임을 동시에 짊어짐:
1. **콘텐츠 생산** — 케이스 격주~월간, 트렌드 주간, 자료실 등록
2. **콘텐츠 운영** — 발행 게이트 통과 / 페르소나 검증 / 모바일 확인
3. **고객 관리** — 의견 답장, 댓글 모더레이션, 신규 가입 관찰
4. **분석 의사결정** — 어떤 콘텐츠가 잘 되는지 / 어떤 직무·페르소나가 끌리는지 / 다음 달 뭘 만들지
5. **수익 관리** — 무료 전자책 발송 / Phase 4 PG 도입 시점 판단
6. **인프라 운영** — Brevo 발신 한도 / Vercel·Supabase 사용량 / Day 11 1회 DB 설정

→ admin은 **이 1명의 한 두뇌가 동시에 6가지를 할 수 있게 압축**하는 도구. 페이지마다 "지금 운영자가 다음에 뭘 결정해야 하는지" 단 한 화면으로 보여줘야 함.

### 1.2 페르소나가 admin에 시키는 일

[[docs/personas.html]] 1568건 인용에서 도출된 5 페르소나 (A 박지현 마케팅 기획자 / B 이민준 전략팀 / C 김소연 1인 사업 / D 최현수 영업팀장 / E 정다은 스타트업 마케터). 공통 페인:
- 자기의심 ("다들 쓰는데 나만 못 쓰는 것 같다")
- 결과물이 "그럴듯하지만 쓸 수 없다"
- AI가 오히려 시간을 잡아먹는다
- 강의·콘텐츠 자체에 대한 깊은 불신

→ admin에 부과되는 요구:
- (A·D) **시간 라벨이 정확한가** — 5분 콘텐츠가 진짜 5분인가. 자동 검증
- (B·C) **"별로 사례 ≥30%"가 진짜 30%인가** — 자동 검증 + 발행 게이트
- (B) **AI 정당화 깨기 framework이 노출되는가** — RebuttalBox 컴포넌트 적용 확인
- (C) **광고·강의 결제 요구 0이 보장되는가** — 외부 링크 화이트리스트 자동 검사
- (D) **"본인 것으로 만드는 4단계"가 4개인가** — 발행 게이트
- (E) **step별 의도(intent)가 빠짐없이 명시되는가** — IntentBox 자동 검증

이 모든 자동 검증은 발행 게이트(§12)에 들어가고, 게이트 통과 결과가 KPI(prompt_copy·deep_read)와 매칭되는지 admin/analytics에서 자가 검증(D36).

### 1.3 admin의 정체성 = 운영자의 외장 두뇌

운영자가 잠들어도, 어제 결정한 사항을 기억하고, 페르소나가 뭘 원했는지 잊지 않고, 다음 행동을 제시하는 도구. 이를 위해:
- **결정 매트릭스 §19**가 자가 변천 — admin이 그 결정의 source of truth
- **history (audit_logs)**가 운영자 활동 + 시스템 자동 액션을 영구 기록 (D44)
- **알림 (D16 + D48)**이 운영자가 놓치면 안 되는 시그널 (의견 미답·신고 댓글·실패 결제 등)을 다중 채널로 깨움

---

## 2. 결정 사항 요약 — 출시 결정 vs 기획 원본

### 2.1 §18 출시 시점 결정 (admin에 직접 영향)

| 항목 | §1~§17 기획 | 출시 결정 (정본) |
|---|---|---|
| 이메일 인프라 | Resend | **전자책 발송 = Gmail SMTP(nodemailer)** (`caselab.kr@gmail.com`, 2026-06-12 §18.16). admin/opinions 답장·비번재설정 SMTP·Brevo Contact 동기화 = Brevo |
| 도메인 | `caselab.kr` | **Vercel 무료 서브도메인** (`caselab.vercel.app`) until 구독자 500명 (D42 PG 트리거와 동일) |
| AI 초안 | Anthropic Claude API | **비활성** (Claude Max 구독 직접 사용 → admin 폼 복붙) |
| 답신 메일 | `official@<도메인>` | **`caselab.kr@gmail.com`** Privacy/Footer 직접 표기 |
| Kakao OAuth | Day 2 필수 | Day 2 선택 |

### 2.2 §18.7~§18.10 추가 결정 (admin 직결)

- §18.7 자료실(`/admin/tools`) CRUD 출시 전 진행 (Day 3~7) — Day 12 출시까지 자료실 비어있지 않게
- §18.8 admin 모바일 일괄 적용 — AdminSidebar 드로어 + 8개 페이지 패딩·테이블 overflow + 폼 헤더 wrap
- §18.9 Analytics 보강 — D21~D24 (GA4 매핑 / Vercel WA 보류 / ecommerce Phase 4 / Speed Insights P0)
- §18.10 UTM Builder + 채널 마스터 — D25~D26 (`/admin/utm` P1 + categories 테이블 신설)

### 2.3 2026-06-02 Phase A-0.2 인터뷰 (D27~D49)

영역 7개 인터뷰로 추가 결정 22건 + 정합 갱신 4건. 핵심:
- **categories·tags 풀 분류 (D13)** — content_subcategory + tool_subcategory + utm_channel + 가로지르는 tags
- **북극성 = prompt_copy UV 주간 확정 (D5/D32)**
- **§5-5 admin 유입 패널 출시 P0 (D33)** — GA4 Data API 연동
- **history audit_logs 단일 테이블 영구 (D44/D45)**
- **editor 게스트 기고 P0 + 이메일 초대 (D47)** + §5-7 발행자 UI 부활 (D27)
- **profiles 컬럼 확장 (D37)** + 페르소나 자동 매핑 (D39)
- **전자책 hybrid 전달 (D41)** — 이메일 + web reader
- **D18·D20 폐기**

---

## 3. Admin Scope — 7 영역 매트릭스

사용자 명시 scope ("데이터 분석 · 컨텐츠 분석 · 고객 관리 및 분석 · 수익 관리 · history · 컨텐츠 등록 및 관리 + 고도화")를 작업 단위 7개로 매핑.

| # | 영역 | 책임 | 출시 시점 ✅ | P1 | P2 |
|---|---|---|---|---|---|
| 1 | **데이터 분석** | 북극성 + KPI 5종 + 가드레일 5종 + 알림 + UTM funnel | D5/D16/D21/D24/D25/D26/D32/D33/D34 | D22 | — |
| 2 | **컨텐츠 분석** | 콘텐츠별 KPI + 4종 breakdown + 게이트↔KPI 매칭 | D35/D36 | 콘텐츠 50건 후 분석 view 확장 | — |
| 3 | **고객 관리·분석** | profiles 확장 + 페르소나 매핑 + 풀 설정 + 슬라이드 패널 | D37/D38/D39 | D4/D6 | 다중 운영자 RLS 분리 (D49) |
| 4 | **수익 관리** | 주문/발송/리텐션/완독률 + hybrid 전달 + PG 대비 | D8/D14/D40/D41/D43 | — | D42 PG 도입 (구독 500 / 결제 요청 N건) / D23 ecommerce / D33 ecommerce purchase |
| 5 | **history** ⭐ NEW | audit_logs + /admin/history + 영역 패널 | D44/D45 | — | 백업 자동화 강화 |
| 6 | **컨텐츠 등록·관리** | CRUD + 발행 게이트 8 + 카테고리·태그 + 답장 + 폴리시 | D1/D7/D9/D10/D13/D15/D17/D19/D27/D28/D29/D30/D31 | 자동 추출 프롬프트 (§5-3) | tools.category → categories 이관 |
| 7 | **고도화** | 디자인 토큰 분리 + 게스트 기고 초대 + 운영자 알림 + 백업 | D46/D47/D48/D49(메모) | D48(c) 카카오톡 | D49 다중 협업 RLS |
| 8 | **사용자 페이지 운영** ⭐ NEW | guides/prompts 단축 URL + support·FAQ + Featured 큐레이션 + Newsletter 발송 + SEO 메타 + 검색 키워드 + /links 큐레이션 | D50/D51/D52/D53/D54/D55/D56 | — | — |

---

## 4. 디자인 원칙

[[docs/design_mockup/admin/ADMIN_SESSION_NOTES.md]] 디자인 원형 + §18.8 모바일 결정 + D46 토큰 분리 통합.

### 4.1 컬러 토큰 (D59 전면 정합, 2026-06-03 갱신 — D46 폐기)

`lib/tokens.ts` 단일 set. admin도 user mockup index 정합 (브랜드 정체성 통일).

| 토큰 | 통일 (user/admin) |
|---|---|
| 배경 | `#fff` / `#f7f7f7` |
| 본문 | `#0A0A0A` |
| 포인트 | `#3182f6` (토스 블루) |
| border | `#e5e8eb` |
| muted | `#8b95a1` |

**로고**: Playfair Display italic "Caselab" 28px 700 weight (user mockup index 정합, admin도 동일).

**이전 D46 결정 (warm beige + Indigo) 폐기**. [[04_dev_plan.md#19.1]] D59 참조.

### 4.2 타이포 (D58, 2026-06-03 갱신)

- 제목: **Pretendard 800** (extrabold) — mockup 정합. 원안 Noto Serif KR 폐기 ([[04_dev_plan.md#19.1]] D58)
- 본문: Pretendard 400
- 강조: Pretendard 600/700
- 숫자 표 (KPI / 가드레일): tabular-nums (`font-variant-numeric: tabular-nums`)
- `tailwind.config.ts` `fontFamily.serif`를 Pretendard로 매핑(하위 호환). 기존 `font-serif` 클래스는 그대로 사용 가능, 신규는 `font-sans + font-extrabold` 권장

### 4.3 레이아웃

- 사이드바: `w-56` 데스크탑 고정 / `hidden lg:block`. 모바일 햄버거 + 슬라이드 드로어 (`AdminSidebar.tsx`)
- 페이지 패딩: `p-4 sm:p-8` (§18.8 모바일 일괄)
- 테이블: `overflow-x-auto` + `min-w-[640~720px]`
- 폼 헤더: `flex-col sm:flex-row gap-2` (모바일 wrap)

### 4.4 마이크로인터랙션

- 기본: 호버 underline만 (매거진 톤)
- 발행 게이트 통과/미통과: 색상 라벨 (✅ / ❌)
- 알림 종 (D16): unread count badge — admin 인디고
- web reader (D41) 페이지 전환: 부드러운 fade 80ms

### 4.5 사이드바 구조 (D60 5 카테고리 재구조, 2026-06-03 갱신)

```
Playfair "Caselab" 로고 + admin 표기
─────────
📊 분석 (Analytics)
├─ 대시보드             (/admin)                  — 북극성 + 7 위젯 (D61)
├─ 상세 분석            (/admin/analytics)        — 콘텐츠·페르소나·게이트 breakdown (D33/D35/D36)
├─ 유입 (UTM)           (/admin/utm)              — UTM Builder + GA4 채널 (D25/D33)
└─ 검색 키워드          (/admin/analytics/search) — 인기 키워드 top N (D55)
─────────
📝 콘텐츠 (Content)
├─ 콘텐츠 목록          (/admin/contents)         [badge: 초안 N]
├─ 새 콘텐츠            (/admin/contents/new)
├─ 큐레이션             (/admin/contents/curation)— Hero·Highlight·Links 12 슬롯 (D52)
├─ 카테고리·태그        (/admin/categories)       — D30
├─ 후보 카드            (/admin/topics)           — D29 [badge: 열린 N]
├─ 댓글 모더레이션      (/admin/comments)         — D9 [badge: 신고 N]
├─ 자료실               (/admin/tools)            — guides·prompts·context-card (D50)
└─ 전자책               (/admin/ebooks)           [badge: 주문 N]
─────────
👥 회원관리 (Members)
├─ 가입자               (/admin/users)            — D6 슬라이드 + admin_note
├─ editor 초대          (/admin/users/invite)     — D47
├─ 의견함               (/admin/opinions)         — D2/D31 [badge: 미답 N]
├─ 1:1 문의             (/admin/support)          — D51 [badge: 대기 N]
├─ FAQ                  (/admin/faq)              — D51
└─ 뉴스레터              (/admin/newsletters)      — D53
─────────
💸 매출 (Revenue)
├─ 수익 대시보드        (/admin/revenue)          — D40 5종 카드
└─ 주문·발송            (/admin/ebooks/orders)    — D8/D41
─────────
⚙️ 운영 (Ops, 보조)
├─ History              (/admin/history)          — D44/D45 audit_logs
└─ 설정                 (/admin/settings)         — T-H
─────────
🔔 [종 드롭다운]                                  (D16 + D34)
```

→ **출시 전 P0 (Day 11~13, §13·§15.6 격상)**: `app/admin/{categories,utm,history,users/invite,revenue,support,faq,newsletters}/page.tsx` 신설 + `/admin/contents/curation` 큐레이션 탭. (이전 "Phase 4" 표기는 §13/§15.6 P0 격상과 모순되어 정정.)
→ **목업 현황 (2026-06-07)**: 위 페이지 포함 admin 목업 **21종 전부 완성·일관성 감사 PASS**. 구현은 11/23 라우트만 실동작 → 나머지 **구현 대기**. (감사 상세: `docs/design_mockup/admin/ADMIN_SESSION_NOTES.md` §7)

이전 "운영 + 소통 2 그룹" 구조는 D60으로 폐기. [[04_dev_plan.md#19.1]] D60 참조.

---

## 5. 라우팅 맵 (`/admin/*` 전체)

[[docs/04_dev_plan.md]] §3 admin 라우팅 + 추가 페이지.

```
/admin                            대시보드 — D61 7위젯 구현 완료 (2026-06-07): 북극성+스파크라인 / KPI 5종 / 퍼널 / 가드레일 / 콘텐츠 Top5 / 최근 변경 / 직무·페르소나 분포
/admin/contents                   ⭐ 전체 콘텐츠 타입 통합 목록 (contents case/trend + tools 자료실 통합, 타입+상태 필터, 2026-06-07)
/admin/contents/curation          ⭐ D52 — Hero·Highlight·Links 12 슬롯 drag-and-drop (contents 안 탭)
/admin/contents/new               작성 (TrackForm + 카테고리·태그 + 발행자 드롭다운 + SEO 고급 설정)
/admin/contents/[id]              편집
/admin/contents/[id]/preview      Draft Preview (JWT 일회용)
/admin/tools                      자료실 목록 (필터: tool/prompt/guide/context-card)
/admin/tools/new                  자료실 작성 (ToolForm + 세부카테고리·태그)
/admin/tools/[id]                 자료실 편집
/admin/guides                     ⭐ D50 — `/admin/tools?category=guide` filtered redirect (단축 URL)
/admin/prompts                    ⭐ D50 — `/admin/tools?category=prompt` filtered redirect (단축 URL)
/admin/ebooks                     전자책 관리 + 주문/발송 통계
/admin/opinions                   의견함 (답장 폼)
/admin/support                    ⭐ NEW (D51) — 1:1 문의 티켓 (support_tickets 또는 opinions.type='support')
/admin/faq                        ⭐ NEW (D51) — FAQ CRUD (faqs 테이블)
/admin/comments                   댓글 모더레이션 (자동 hide / 환원 / 제거)
/admin/topics                     후보 카드 + 'draft 변환' 버튼 (D29)
/admin/categories                 ⭐ NEW (D30) — content_subcategory / tool_subcategory / utm_channel 통합 관리
/admin/utm                        UTM Builder + 히스토리 + 클릭 수 (D25)
/admin/newsletters                ⭐ NEW (D53) — 제목·본문·segment 입력 + Brevo Campaign API 발송 + 이력
/admin/users                      사용자 목록 + 슬라이드 패널 (D6, P1)
/admin/users/invite               ⭐ NEW (D47) — editor 이메일 초대 폼
/admin/revenue                    ⭐ 통합 — 주문/발송/리텐션/완독률 (D40)
/admin/analytics                  KPI / 가드레일 / 4종 breakdown / 게이트↔KPI 매칭 / 유입 패널(D33) / 인기 검색어(D55)
/admin/history                    ⭐ NEW (D45) — audit_logs 전체 timeline + 필터
/admin/settings                   설정 (Brevo·GA4·Speed Insights 키 표시 + 토큰 한도 모니터링)
```

### 5.1 권한별 접근 (`lib/supabase/middleware.ts`)

- `ADMIN_ONLY_PREFIXES` (admin only): `/admin/users` · `/admin/users/invite` · `/admin/analytics` · `/admin/revenue` · `/admin/settings` · `/admin/ebooks` · `/admin/opinions` · `/admin/comments` · **`/admin/history`** (NEW)
- editor 허용: `/admin/contents` · `/admin/tools` · `/admin/topics` · `/admin/categories` · `/admin/utm`

---

## 6. 결정 매트릭스 — D1~D49 (cross-link)

본 문서의 결정 정본은 [[docs/04_dev_plan.md]] §19. 본 § 6은 색인만:

| 영역 | 결정 번호 |
|---|---|
| 콘텐츠 등록·관리 | D1, D7, D9, D10, D13, D15, D17, D19, D27, D28, D29, D30, D31 |
| 의견함 | D2, D3, D31 |
| 사용자 | D4, D6, D37, D38, D39 |
| 분석 | D5, D16, D21, D22, D23, D24, D32, D33, D34, D35, D36 |
| 전자책·수익 | D8, D14, D40, D41, D42, D43 |
| 운영·인프라 | D11, D12, D15, D16, D19, D48, D49 |
| 권한 | D17, D27, D47 |
| 카테고리·UTM | D13, D25, D26, D30 |
| history | D44, D45 |
| 디자인 | D46 |
| 폐기 | ~~D18, D20~~ |

---

## 7. 영역별 상세

### 7.1 데이터 분석 (영역 1)

#### 7.1.1 북극성 (D5/D32)
**주간 prompt_copy UV** (unique user). 매주 월요일 자동 집계.

쿼리 (0002 `get_north_star()` RPC):
```sql
select count(distinct user_id)
from events
where event_type = 'prompt_copy'
  and created_at >= date_trunc('week', now() - interval '7 days')
  and created_at < date_trunc('week', now());
```

대시보드: 현재 주 + 지난 주 + 4주 이동평균 카드. 증감률 표시.

**선정 이유** (인터뷰 답): "framework × AI 실행" = 적용 신호. save는 페르소나 A의 fake-save 함정 위험.

#### 7.1.2 KPI 5종 (D5)

| KPI | 정의 | 임계 |
|---|---|---|
| 방문자 UV | 일/주 unique 방문자 (cookieless) | — |
| 가입자 | profiles count (신규/누적) | 주 N명 신규 |
| **prompt_copy UV** ⭐ | 주간 unique user | 북극성 |
| 저장률 | save / 콘텐츠 PV | 보조 |
| 도움률 | 👍 / (👍 + 👎) | 보조 |

#### 7.1.3 가드레일 5종 (D5)

| 가드레일 | 정의 | 임계 |
|---|---|---|
| 이탈률 | bounce | > 70% 경고 |
| 부정 반응 | 👎 비율 | > 20% 경고 |
| 체류 시간 | 평균 dwell time | < 2분 경고 |
| 발송 실패율 | purchases.failed / 전체 | > 5% 경고 |
| 로그인 전환율 | OAuth 완료 / login 페이지 방문 | < 30% 경고 |

**임계치 출처**: ADMIN_SESSION_NOTES MVP 임시. 운영 데이터 보고 P1 재조정.

#### 7.1.4 알림 (D16 + D34)

`admin_notifications` view (0002 §4) + 추가 발화 조건:

| # | 조건 | 채널 (D48) |
|---|---|---|
| 1 | 의견 미답 N건 | 사이드바 종 + 이메일 |
| 2 | 신고 댓글 N건 | 사이드바 종 + 이메일 |
| 3 | 실패 결제 N건 | 사이드바 종 + 이메일 (긴급) |
| 4 | 열린 후보 N건 | 사이드바 종 |
| 5 ⭐ | 신규 가입자 N명/일·주 | 사이드바 종 |
| 6 ⭐ | 전자책 주문 신규 (건별) | 사이드바 종 + 이메일 |
| 7 ⭐ | 특정 카테고리·태그 prompt_copy 급등 (남닫이 시그널) | 사이드바 종 |

**N**은 운영 데이터 보고 결정. 임시 = 1 (즉시 알림).

#### 7.1.5 유입 패널 (D33, GA4 Data API)

`lib/analytics/ga4-data-api.ts` 신설 — `@google-analytics/data` SDK 사용. 서비스 계정 인증:
- GCP 콘솔 → IAM → 서비스 계정 생성 → Key JSON 발급
- GA4 property → Admin → Account access → 서비스 계정 email 추가 (Viewer role)
- `.env.local`에 `GA4_PROPERTY_ID=` + `GA4_SERVICE_ACCOUNT_JSON=` (base64)

쿼리 예 (admin/analytics InflowPanel):
```
runReport({
  property: `properties/${propertyId}`,
  dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
  dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionCampaignName' }],
  metrics: [{ name: 'activeUsers' }, { name: 'engagedSessions' }],
});
```

→ admin 화면 = 채널·캠페인별 active users + engaged sessions. D26 UTM과 결합해서 채널별 conversion 분석.

#### 7.1.6 UTM Builder (D25, `/admin/utm`)

이미 [[docs/04_dev_plan.md]] §18.10에 정의. 생성 폼 + 히스토리 + 클릭 수 = `events.metadata->>'utm_campaign'` GROUP BY.

P0 범위: 생성 폼 + URL 저장. P1: 히스토리 + 클릭 수. P2: QR 코드 + 시각화.

### 7.2 컨텐츠 분석 (영역 2)

#### 7.2.1 4종 breakdown (D35)

admin/analytics 내 콘텐츠 분석 탭 = 4개 패널:

**(a) 개별 콘텐츠 표**
| 콘텐츠 | PV | deep_read | prompt_copy | save | 👍/👎 |
|---|---|---|---|---|---|

정렬·필터 (직무·페르소나·태그·날짜). 클릭 시 콘텐츠 상세 패널 슬라이드.

**(b) 타입 × 세부 카테고리** (D13 활용)
```
case
  ├ AI 도구 사용기:  PV 1.2k / copy 230 / save 80
  ├ 워크플로우 개선:  PV 800 / copy 180 / save 50
  └ 팀 협업:         PV 400 / copy 60 / save 30
trend
  └ …
```

**(c) 태그별** (가로지르는 주제)
| 태그 | 콘텐츠 수 | 합 PV | 합 copy | 평균 도움률 |
|---|---|---|---|---|
| 프롬프트 엔지니어링 | 7 | 3.5k | 510 | 78% |
| GPT-5 | 4 | 2.1k | 220 | 65% |

**(d) 페르소나별** (D39 매핑 의존)
| 페르소나 | content_coverage 합 | 평균 도움률 | 평균 prompt_copy |
|---|---|---|---|
| A | 12 콘텐츠 커버 | 80% | 18 |
| B | 8 | 72% | 10 |

→ 운영자가 "이번 달 D 영업팀장 콘텐츠 부족하니 더 만들자" 같은 결정 가능.

#### 7.2.2 게이트 ↔ KPI 매칭 (D36)

발행 게이트 자동 8개 통과한 콘텐츠 평균 vs 미통과·억지 통과 평균 비교:

```
[failures ≥30% 통과 콘텐츠]   평균 deep_read: 65%  / 평균 prompt_copy: 12
[failures <30% 콘텐츠]        평균 deep_read: 42%  / 평균 prompt_copy: 5
```

→ 그래프 노출. 운영자가 "게이트가 진짜 가치를 보장하는가" 자가 검증.

데이터 부족 (콘텐츠 < 10건) 시 표 안 그리고 "데이터 수집 중" 표시.

### 7.3 고객 관리·분석 (영역 3)

#### 7.3.1 profiles 컬럼 확장 (D37)

0003 alter table:
```sql
alter table profiles
  add column if not exists job_title text,        -- 선택. 자유 입력
  add column if not exists interests text[],      -- 선택. 다중 선택 ('프롬프트엔지니어링','지표분석',…)
  add column if not exists ai_tools text[],       -- 선택. 다중 선택 ('Claude','ChatGPT','Notion AI',…)
  add column if not exists persona text;          -- 자동 매핑 결과 ('A'|'B'|'C'|'D'|'E')
```

**필수**: job_category (이미 존재). **선택**: job_title / interests / ai_tools — 온보딩에서 skip 가능. **자동**: persona (D39 트리거).

#### 7.3.2 페르소나 자동 매핑 (D39)

`map_persona(p_job_category text, p_interests text[], p_ai_tools text[])` SQL 함수:

```sql
create or replace function public.map_persona(
  p_job_category text,
  p_interests text[] default array[]::text[],
  p_ai_tools text[] default array[]::text[]
) returns text language plpgsql immutable as $$
begin
  -- A 박지현: 마케팅 기획자
  if p_job_category = 'marketing' and not coalesce(array_length(p_interests, 1) > 3, false) then
    return 'A';
  end if;
  -- B 이민준: 대기업 전략팀
  if p_job_category in ('strategy', 'planning') then
    return 'B';
  end if;
  -- C 김소연: 1인 사업
  if p_job_category = 'solo' then
    return 'C';
  end if;
  -- D 최현수: 영업팀장
  if p_job_category = 'sales' then
    return 'D';
  end if;
  -- E 정다은: 스타트업 마케터 (도구 다양 + 관심 다양)
  if p_job_category = 'marketing' and coalesce(array_length(p_ai_tools, 1) > 1, false) then
    return 'E';
  end if;
  -- fallback
  return null;
end $$;
```

트리거: `profiles.job_category` / `interests` / `ai_tools` update 시 자동 재계산.

운영자 수동 override: `admin/users/[id]` 슬라이드 패널(D6)에서 persona 직접 선택 가능 (자동 매핑 결과 ≠ 의도일 때).

#### 7.3.3 풀 설정 페이지 (D38, `/mypage/profile`)

출시 시점 포함. 항목:
- 직무 (job_category, 필수)
- 직무 세부 (job_title, 선택, 자유 입력)
- 관심 주제 (interests, 선택, 다중)
- 사용 중 AI 도구 (ai_tools, 선택, 다중)
- 뉴스레터 수신 토글 (newsletter)
- 분석 동의 토글 (analytics_consent, D4)

탈퇴는 별도 페이지/플로우 (`/mypage/delete-account`, P1).

#### 7.3.4 사용자 슬라이드 패널 (D6, P1)

`/admin/users/[id]` — Day 5 또는 출시 직후 작업. 컨텐츠:
- profile 기본 (이름·이메일·OAuth provider·가입일·persona·persona 수동 override)
- admin_note 입력 (D4 UI, P1)
- 행동 timeline (views / copies / saves)
- 구매 이력 (purchases)
- 의견·댓글 작성 이력
- audit_logs entity_type='profile' 필터 결과 (D45 영역 패널)

### 7.4 수익 관리 (영역 4)

#### 7.4.1 `/admin/revenue` 화면 (D40)

5종 카드/차트:

1. **주문 건수 + 일자별 추이** — `purchases` group by date(created_at)
2. **발송 성공률** — `sent / (sent + failed)`. 가드레일 임계 5% 연동
3. **직무·페르소나별 주문자 분포** — `purchases × profiles.job_category × profiles.persona`
4. **리텐션** — purchases 받은 사용자 중 7/30일 안에 재방문 비율
5. **완독률** — web reader 사용자 중 90%+ 도달 비율 (다운로드만 한 사용자는 별도 표시)

#### 7.4.2 전자책 hybrid 전달 (D41)

**기존 흐름** (D8 trigger 유지):
1. 사용자 `/ebooks/[slug]/order` → 주문서 제출
2. `purchases` insert
3. `purchases_after_insert` trigger → `pg_net.http_post` → `send-ebook` Edge Function
4. Edge Function → Supabase Storage Signed URL 7일 발급 → Brevo Transactional 메일 발송
5. `purchases.status='sent'` + `sent_at` 기록

**신규 web reader 흐름**:
1. 사용자 `/mypage/ebooks` → 해당 전자책 "보기" 클릭
2. `/mypage/ebooks/[slug]/read` 진입 (PDF.js 또는 react-pdf로 PDF 렌더링)
3. scroll/page 이벤트 → `events.ebook_read_page` (metadata: `{ebook_id, page_num, percent}`)
4. 마지막 페이지 90%+ 도달 → `events.ebook_finish` 발화
5. `/admin/revenue` 완독률 카드 = 사용자별 ebook_finish / web reader 진입 비율

**기술**:
- 라이브러리: `react-pdf` (Mozilla PDF.js wrapper). `npm i react-pdf pdfjs-dist`
- 렌더링: Server Component fetch PDF from Storage (Signed URL) → 전달
- 추적: `useIntersectionObserver`로 페이지 viewport 진입 감지

#### 7.4.3 Phase 4 PG 트리거 (D42)

다음 중 하나라도 도달 시 PG 도입 검토 시작:
- 구독자 500명 (= 도메인 도입 트리거와 동일, [[project_domain_deferred]])
- 사용자 결제 요청 N=10건 이상 (의견함 본문에 "결제" 키워드 검색 + 운영자 수동 카운트)

#### 7.4.4 purchases 추가 컬럼 (D43)

0003 alter table:
```sql
alter table purchases
  add column if not exists resend_token text,       -- 사용자 "다시 보내주세요" 요청 시 admin/ebooks에서 재발송 토큰
  add column if not exists send_attempts int default 0,
  add column if not exists last_error text,         -- 발송 실패 시 마지막 에러
  add column if not exists discount_code text,      -- PG 도입 시 쿠폰
  add column if not exists coupon_id uuid;          -- PG 도입 시 쿠폰 FK
```

### 7.5 history (영역 5, NEW)

#### 7.5.1 audit_logs 스키마 (D44)

```sql
create table public.audit_logs (
  id uuid default gen_random_uuid() primary key,
  actor_id uuid references auth.users on delete set null,
  actor_type text not null check (actor_type in ('user', 'system')),
  action_type text not null,    -- e.g. 'content.publish', 'content.update', 'opinion.reply', 'comment.hide', 'category.create', 'tag.delete', 'role.change', 'admin_note.update', 'ebook.send', 'brevo.contact.sync', 'system.auto_hide', 'category.subcategory.create'
  entity_type text not null,    -- 'content' | 'opinion' | 'comment' | 'tool' | 'category' | 'tag' | 'profile' | 'purchase' | 'topic'
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,    -- action별 추가 정보 (before/after diff 등)
  created_at timestamptz not null default now()
);

create index idx_audit_logs_created on public.audit_logs(created_at desc);
create index idx_audit_logs_actor on public.audit_logs(actor_id, created_at desc);
create index idx_audit_logs_entity on public.audit_logs(entity_type, entity_id, created_at desc);
create index idx_audit_logs_action on public.audit_logs(action_type, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "Admins read audit_logs" on public.audit_logs;
create policy "Admins read audit_logs"
  on public.audit_logs for select using (public.is_admin());

drop policy if exists "System writes audit_logs" on public.audit_logs;
create policy "System writes audit_logs"
  on public.audit_logs for insert with check (true);   -- trigger·server action에서만 호출
```

#### 7.5.2 적재 방식

**핵심 테이블에 trigger 부착** (콘텐츠/도구/댓글/의견/카테고리/태그):

```sql
create or replace function public.log_audit() returns trigger language plpgsql as $$
declare
  v_action text;
  v_entity_type text;
begin
  -- entity_type 추출
  v_entity_type := tg_table_name;
  -- action 추출
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

-- attach to contents
create trigger trg_audit_contents
  after insert or update or delete on public.contents
  for each row execute function public.log_audit();
-- (tools, comments, opinions, categories, tags, profiles, purchases, tool_tags, content_tags 동일)
```

**Edge Function·Server Action에서 명시적 insert** (이메일 발송, Brevo Contact sync 등):
```ts
await supabase.from('audit_logs').insert({
  actor_type: 'system',
  action_type: 'ebook.send',
  entity_type: 'purchase',
  entity_id: purchaseId,
  metadata: { messageId, brevo_response: response.status }
});
```

#### 7.5.3 노출 (D45)

**`/admin/history` 단일 페이지** (admin only):
- 전체 timeline (created_at DESC)
- 필터: action_type / entity_type / actor / 날짜 범위
- 페이지네이션 (50/페이지)
- 각 row 클릭 → metadata jsonb diff 모달 (before/after)

**각 영역 패널**:
- `/admin/contents/[id]` → "이 콘텐츠의 변경 이력" (audit_logs WHERE entity_type='content' AND entity_id=:id)
- `/admin/users/[id]` 슬라이드 패널 (D6) → 사용자 행동 timeline
- `/admin/opinions/[id]` → 답장 발송 시도 이력 (system 자동 발송 + 운영자 수동)
- `/admin/topics/[id]` → 변환 시도 이력 (D29 draft 변환 버튼)

### 7.6 컨텐츠 등록·관리 (영역 6)

#### 7.6.1 발행 게이트 8개 (D7)

`lib/content-lint.ts` 확장 (기존 6개 → 8개):

```typescript
type LintResult = { passed: boolean; messages: string[] };

export function lintContent(content: ContentBody): LintResult {
  const messages: string[] = [];
  // 자동 6개 (§7)
  if (content.read_min < 1 || content.apply_min < 1) messages.push('시간 라벨 누락');
  if (content.job_tags.length < 1) messages.push('직무 태그 ≥1 필요');
  if (content.persona_coverage.length < 1) messages.push('페르소나 커버리지 ≥1 필요');
  if (!intentMatchesStepCount(content)) messages.push('IntentBox 수 = step 수 불일치');
  if (failuresLessThan30Percent(content)) messages.push('failures 분량 <30%');
  if (content.customization.length !== 4) messages.push('CustomizationChecklist 4개 ≠ 현재');
  // 자동 D7 신규 2개
  if (hasImagesWithoutAlt(content)) messages.push('이미지 alt 텍스트 누락');
  if (hasOutsideWhitelistUrls(content)) messages.push('광고/유료 강의 외부 링크');
  return { passed: messages.length === 0, messages };
}
```

UI: TrackForm 우측 사이드바에 8개 체크리스트 + 미통과 시 [발행] 버튼 비활성. 수동 3개 (§7.2)는 체크박스 강제.

추가 안전망 (D7 신규 2개, 행동 안내):
- **본문 변경 unsaved 경고**: `useBeforeUnload` hook + Modal "저장 안 한 변경이 있습니다"
- **동시 편집 충돌 감지**: 폼 진입 시 `contents.updated_at` snapshot → 발행 시 비교 → 다르면 "다른 사용자가 수정했습니다. 새로고침 후 다시 시도"

#### 7.6.2 D13 카테고리·태그 풀 분류

[[docs/04_dev_plan.md]] §19.6 통합. categories 테이블 + content_tags / tool_tags m:n.

**TrackForm** (콘텐츠 작성):
1. 트랙 선택 (case / trend) — `contents.track`
2. 세부 카테고리 (드롭다운) — `categories where type='content_subcategory' and parent_track=:track`. 없으면 "+ 새 카테고리" 버튼 → 즉석 입력 모달 → categories insert
3. 태그 (multi-select, autocomplete) — `tags` 테이블. 없는 태그는 enter로 신규 추가
4. 발행자 드롭다운 (D27) — 운영자 본인 default + editor 사용자 선택 (D17 editor 가능 사용자만)

**`/admin/categories` 페이지** (D30):
- type 탭: content / tool / utm_channel
- 각 탭 안에서 parent_track별 그룹 + 정렬·비활성화
- "+ 새 카테고리" 폼 (label, slug, metadata jsonb)
- usage_count 표시 (categories에 카운트 컬럼 없으므로 view 또는 join count)

**태그 관리**:
- `/admin/categories` 안에 별도 탭 또는 별 페이지 (`/admin/tags`)
- usage_count desc 정렬 (자동 증가 트리거 0003에 있음)
- 통합·이름 변경 가능 (잘못 입력된 태그 정리)

#### 7.6.3 D9 댓글 폴리시 (자동 hide)

```sql
-- comments.report_count 컬럼 + 트리거
alter table comments add column if not exists report_count int not null default 0;

create or replace function public.auto_hide_comment() returns trigger language plpgsql as $$
begin
  if new.report_count >= 3 and new.status = 'visible' then
    new.status := 'hidden';
    -- audit_logs 적재
    insert into audit_logs(actor_type, action_type, entity_type, entity_id, metadata)
    values ('system', 'system.auto_hide', 'comment', new.id, jsonb_build_object('report_count', new.report_count));
    -- admin_notifications view에 자동 노출 (D16)
  end if;
  return new;
end $$;

create trigger trg_auto_hide
  before update of report_count on comments
  for each row execute function public.auto_hide_comment();
```

`/admin/comments`에서 운영자가 검토:
- "환원" → `status='visible'` + `report_count=0`
- "제거" → `status='archived'` (또는 hard delete)

#### 7.6.4 후보 카드 → draft 변환 (D29)

`/admin/topics`에서 각 후보 카드 옆 "draft 변환" 버튼. 클릭 시 server action:

```ts
async function convertTopicToDraft(topicId: string) {
  const topic = await supabase.from('topic_suggestions').select('*').eq('id', topicId).single();
  const { data: content } = await supabase.from('contents').insert({
    track: topic.suggested_track ?? 'case',
    title: topic.title,
    summary: topic.description,
    persona_coverage: topic.target_persona ?? [],
    body: { kind: topic.suggested_track ?? 'case', /* empty blocks */ },
    status: 'draft',
  }).select().single();
  // audit_logs 자동
  redirect(`/admin/contents/${content.id}`);
}
```

#### 7.6.5 D2 의견함 답장 (Edge Function + Brevo)

기존 D8 send-ebook trigger 패턴 그대로:
1. 운영자 `/admin/opinions/[id]` 답장 폼 작성
2. Server Action → Edge Function `send-opinion-reply` POST (body, recipient_email, opinion_id)
3. Edge Function → Brevo Transactional API fetch → `{ messageId, code }` 응답
4. `opinions.reply_email_id = messageId`, `opinions.replied_at = now()`, `opinions.status = 'replied'` (D3)
5. audit_logs 적재 (`opinion.reply`)

이메일 템플릿:
```
안녕하세요, 케이스랩 운영자입니다.

[운영자가 작성한 답변 본문]

좋은 의견 감사합니다. 반영 가능한 경우 콘텐츠로 만들어 보겠습니다.
— 케이스랩
```

### 7.7 고도화 (영역 7)

#### 7.7.1 editor 이메일 초대 (D47)

`/admin/users/invite` 페이지 (admin only):

폼:
- 이메일 input
- role select (`editor` default, admin 가능)
- 초대 메시지 textarea (선택)

Server Action:
```ts
async function inviteUser(email: string, role: 'editor' | 'admin', message?: string) {
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${env.SITE_URL}/auth/callback?invite=1`,
    data: { invite_role: role, invited_by: currentUser.id, message }
  });

  // profiles.role 자동 설정 = handle_new_user trigger에서 raw_user_meta_data.invite_role 읽음
  // (handle_new_user 수정 필요)

  // audit_logs 적재 (action_type='profile.invite')
}
```

`handle_new_user()` trigger 수정 (0003 또는 별도 alter):
```sql
create or replace function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles(id, email, role, onboarded)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data->>'invite_role')::role_type, 'user'),
    false
  );
  return new;
end $$;
```

#### 7.7.2 운영자 알림 다중 채널 (D48)

**(a) 사이드바 종** — 기존 D16 view + 추가 3건 (신규 가입자 / 전자책 주문 / prompt_copy 급등)

**(b) Brevo 이메일** — `lib/notify/admin-email.ts` 신설:
- pg_cron (또는 Vercel Cron) 1시간마다 admin_notifications view 조회
- 새로 발생한 알림 = Brevo Transactional 발송 to `caselab.kr@gmail.com`
- 메일 1통에 여러 알림 묶음 (digest 형식)

**(c) 카카오톡** (P1, 채널/알림톡):
- 카카오 비즈니스 메시지 또는 알림톡 검토
- 운영자 본인 카카오 계정에 알림 전송
- 출시 후 데이터 보고 도입 결정

#### 7.7.3 백업·복원 (D49)

- **Supabase 자동 백업**: Free 플랜 = 일일 자동 백업, 7일 보존. 운영 안정화 후 Pro 플랜으로 (월 매일 + 90일 보존)
- **운영자 메모 주 1회**: runbook(`docs/05_launch_runbook.md`)에 "매주 일요일 운영 노트 작성 — 이번 주 주요 결정·이슈·다음 주 계획" 명시. 본 노트는 audit_logs 외에 별도 markdown 파일 또는 admin/history 위에 "운영자 메모" 페이지 (P1)
- **재해 복구**: 시나리오 — DB 손상 시 7일 내 복원 가능. Storage(전자책 PDF)는 별도 백업 (Vercel CLI 또는 rclone로 월 1회 manual)

#### 7.7.4 다중 운영자 RLS (P2)

editor 권한이 들어가도 본질적으로 단일 운영 체제. 다중 운영자(2~3명 동시 운영) 시점에 RLS 본격 분리:
- editor가 본인 작성 콘텐츠만 수정 가능
- editor는 다른 editor 콘텐츠 read only
- admin은 전체
- → P2 결정 — 운영자 수 늘어나면 P1로

### 7.8 사용자 페이지 운영 (영역 8, NEW)

user mockup 19개 페이지 점검으로 발견된 admin 갭. 출시 시점 P0.

#### 7.8.1 guides·prompts 단축 URL (D50)

스키마는 `tools` 테이블 단일 (D13). 사용자 측에서 별도 페이지로 노출되는 만큼 admin도 단축 URL로 즉시 진입 가능:

- `/admin/guides` → server-side redirect → `/admin/tools?category=guide`
- `/admin/prompts` → server-side redirect → `/admin/tools?category=prompt`
- `/admin/tools` = 전체 + 카테고리 dropdown filter

사이드바에 3개 메뉴 (자료실 / 가이드 / 프롬프트). 운영자가 "오늘 프롬프트 추가" 같은 흐름에서 직관적.

#### 7.8.2 1:1 문의·FAQ (D51)

**1:1 문의 (`/admin/support`)**:
- 사용자 mypage `/mypage/support` 폼 → `support_tickets` 신설 (또는 `opinions.type='support'` 분리)
- 스키마 (별도 테이블 채택 시):
  ```sql
  create table support_tickets (
    id uuid pk,
    user_id uuid references auth.users,
    subject text not null,
    body text not null,
    status text default 'open' check (status in ('open','answered','closed')),
    reply_body text,
    reply_email_id text,   -- Brevo messageId
    replied_by uuid references auth.users,
    replied_at timestamptz,
    created_at timestamptz default now()
  );
  ```
- admin 화면: 상태별 탭(대기/답변완료/종결) + 답장 폼 + Brevo 발송 (D31 패턴 재사용)

**FAQ (`/admin/faq`)**:
- 운영자가 자주 묻는 질문 정리 → mypage support 화면 상단에 노출
- 스키마:
  ```sql
  create table faqs (
    id uuid pk,
    question text not null,
    answer text not null,
    category text,         -- 결제, 콘텐츠, 계정 등 분류
    sort_order int default 0,
    is_published boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
  ```
- admin CRUD + drag-and-drop 순서 변경

#### 7.8.3 Featured 큐레이션 탭 (D52, D56)

`featured_contents` 테이블 (D15) 확장:
```sql
alter table featured_contents add column if not exists slot_type text default 'hero'
  check (slot_type in ('hero', 'highlight', 'links'));
```

**`/admin/contents/curation` 탭** (콘텐츠 목록 안):
- 3개 그룹 분리:
  - **Hero 슬롯** (slot 1, index.html 상단 carousel)
  - **Highlight 슬롯** (slot 2~4, index.html 큐레이션 섹션)
  - **Links 슬롯** (slot 5~12, `/links` 페이지에 노출)
- 각 슬롯 = drag-and-drop으로 콘텐츠 선택 (검색·필터) + 노출 기간 (start/end timestamp) + 정렬 순서
- 운영자가 인스타→웹 동선에 "이번 주 추천" 5건 끌어 올리는 데 1분

**`/links` 페이지** (사용자측, D56):
- Server Component `app/links/page.tsx`
- `featured_contents` WHERE `slot_type='links'` AND now() BETWEEN start AND end ORDER BY sort_order
- 인스타 프로필 바이오 단일 링크 → 이 페이지 → 사용자 선택해서 콘텐츠로 진입

#### 7.8.4 Newsletter 발송 (D53, `/admin/newsletters`)

**기능**:
- 제목 입력
- 본문 작성 (markdown 또는 rich text)
- segment 선택 (직무 × 페르소나 × interests × ai_tools 조합)
- segment 미리보기 (recipient count)
- [발송] 버튼 → Brevo Email Campaign API POST
- 발송 후 admin 안에 이력 row 적재 (newsletter_campaigns 테이블)

**스키마**:
```sql
create table newsletter_campaigns (
  id uuid pk,
  subject text not null,
  body_markdown text not null,
  segment_filter jsonb not null,   -- { job_category: 'marketing', persona: ['A','E'], … }
  recipient_count int,
  brevo_campaign_id text,
  status text default 'draft' check (status in ('draft','sent','failed')),
  sent_at timestamptz,
  open_count int default 0,
  click_count int default 0,
  created_by uuid references auth.users,
  created_at timestamptz default now()
);
```

**Brevo API 호출 패턴**:
```ts
// segment 사용자 이메일 추출
const recipients = await supabase
  .from('profiles')
  .select('email, name, job_category, persona, interests, ai_tools')
  .match(segmentFilter)
  .filter('newsletter', 'eq', true);

// Brevo Campaign 생성 + 발송
const response = await fetch('https://api.brevo.com/v3/emailCampaigns', {
  method: 'POST',
  headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
  body: JSON.stringify({
    name: campaign.subject,
    subject: campaign.subject,
    htmlContent: renderMarkdown(campaign.body_markdown),
    recipients: { emails: recipients.map(r => r.email) },
    type: 'classic'
  })
});
```

오픈율·클릭수 = Brevo Webhook 또는 Campaign Statistics API 조회로 갱신.

#### 7.8.5 SEO 메타 (D54)

**자동 생성 default**:
- `og:title` = `contents.title`
- `og:description` = `contents.summary`
- `og:image` = `contents.thumbnail_url` 또는 `app/opengraph-image.tsx`로 자동 생성

**수동 override** (TrackForm):
- "SEO 고급 설정" 접어 펴기 섹션
- `contents.og_title text` / `og_description text` / `og_image text` (0003에 alter table)
- 비어 있으면 자동 default 사용

**렌더링** (`app/(public)/cases/[slug]/page.tsx`):
```ts
export async function generateMetadata({ params }) {
  const content = await getContent(params.slug);
  return {
    title: content.og_title ?? content.title,
    description: content.og_description ?? content.summary,
    openGraph: {
      title: content.og_title ?? content.title,
      description: content.og_description ?? content.summary,
      images: [content.og_image ?? content.thumbnail_url],
    },
  };
}
```

#### 7.8.6 검색 키워드 분석 (D55)

**적재** — `lib/analytics/track.ts` EventType에 `search` 추가:
```ts
// /search 페이지 query 입력 시
track('search', { keyword, results_count, filter });
```

**admin 패널** (`/admin/analytics` 안 "검색" 탭):
- 일/주/월 단위 top N (default 20)
- 키워드별 검색 횟수 + 결과 0건 비율
- 클릭률 (검색 후 콘텐츠 진입 비율)
- 운영자가 "사용자가 X 주제를 찾는데 콘텐츠 부족 → 다음 달 만들자" 같은 의사결정

쿼리:
```sql
select
  metadata->>'keyword' as keyword,
  count(*) as search_count,
  count(*) filter (where (metadata->>'results_count')::int = 0) as zero_result_count
from events
where event_type = 'search'
  and created_at >= now() - interval '7 days'
group by metadata->>'keyword'
order by search_count desc
limit 20;
```

---

## 8. 권한 모델 (D17)

### 8.1 role enum

```sql
create type role_type as enum ('user', 'editor', 'admin');
alter table profiles add column role role_type not null default 'user';
```

### 8.2 접근 권한 매트릭스

| 경로 / 액션 | user | editor | admin |
|---|---|---|---|
| `/cases`, `/trends`, `/tools`, `/ebooks` 등 user 페이지 | ✅ | ✅ | ✅ |
| `/mypage/*` | ✅ (본인) | ✅ (본인) | ✅ (본인) |
| `/admin/contents` (CRUD) | ❌ | ✅ | ✅ |
| `/admin/tools` (CRUD) | ❌ | ✅ | ✅ |
| `/admin/topics` (CRUD) | ❌ | ✅ | ✅ |
| `/admin/categories` (CRUD) | ❌ | ✅ | ✅ |
| `/admin/utm` (CRUD) | ❌ | ✅ | ✅ |
| `/admin/comments` (모더레이션) | ❌ | ❌ | ✅ |
| `/admin/opinions` (답장) | ❌ | ❌ | ✅ |
| `/admin/users` (조회) | ❌ | ❌ | ✅ |
| `/admin/users/invite` | ❌ | ❌ | ✅ |
| `/admin/revenue` | ❌ | ❌ | ✅ |
| `/admin/analytics` | ❌ | ❌ | ✅ |
| `/admin/history` | ❌ | ❌ | ✅ |
| `/admin/settings` | ❌ | ❌ | ✅ |

### 8.3 middleware 구현

`lib/supabase/middleware.ts`:
```ts
const ADMIN_ONLY_PREFIXES = [
  '/admin/users', '/admin/analytics', '/admin/revenue', '/admin/settings',
  '/admin/ebooks', '/admin/opinions', '/admin/comments', '/admin/newsletters',
  '/admin/history',  // NEW
];

if (pathname.startsWith('/admin')) {
  if (role !== 'admin' && role !== 'editor') return redirect('/login');
  if (ADMIN_ONLY_PREFIXES.some(p => pathname.startsWith(p)) && role !== 'admin') return redirect('/admin');
}
```

`is_admin()` (0002) + `is_editor()` (0002, editor OR admin) SQL 헬퍼는 RLS 폴리시에서 그대로 재사용.

---

## 9. RLS·폴리시

### 9.1 콘텐츠 (contents)

```sql
create policy "published contents read" on contents for select using (status='published' or is_editor());
create policy "editor create" on contents for insert with check (is_editor());
create policy "editor update" on contents for update using (is_editor());
create policy "admin delete" on contents for delete using (is_admin());
```

### 9.2 도구 (tools)
동일 패턴. is_editor()가 CRUD.

### 9.3 카테고리·태그 (categories, tags, content_tags, tool_tags)
- read: 누구나 (is_active 카테고리만)
- write: is_editor()

### 9.4 댓글 (comments)

```sql
create policy "visible comments read" on comments for select using (status='visible' or is_admin() or user_id=auth.uid());
create policy "self write" on comments for insert with check (user_id=auth.uid());
create policy "self update" on comments for update using (user_id=auth.uid());
create policy "admin moderate" on comments for update using (is_admin()) with check (is_admin());
```

자동 hide 트리거 (D9) = `report_count >= 3` 시 시스템이 status='hidden' 변경 (security definer 함수).

### 9.5 의견함 (opinions)
- insert: 누구나 (익명 허용)
- select: 본인 또는 admin
- update (답장 처리): admin only

### 9.6 후보 카드 (topic_suggestions, topic_votes)
- insert: 로그인 사용자
- select: 누구나 (status='open')
- update/delete: admin only (또는 editor가 draft 변환 시 D29 Server Action)

### 9.7 전자책·구매 (products, purchases)
- products select: 누구나 (status='public')
- purchases insert: 누구나 (익명 주문 허용 — D8 trigger 발동)
- purchases select: 본인 + admin

### 9.8 사용자 (profiles)
- select: 본인 + admin
- update: 본인 (admin_note·persona·role 제외) + admin (전체)
- admin_note·persona override: admin only

### 9.9 audit_logs
- select: admin only
- insert: 시스템 (trigger·Edge Function·Server Action). 사용자 직접 insert 0

### 9.10 utm_links
- 전체 CRUD: admin only

---

## 10. 분석·KPI (정합)

§7.1, §7.2와 동일. 본 § 10은 cross-link:
- 북극성 (D5/D32/**D68**): §7.1.1 — **현 prompt_copy UV 유지, 출시 후 4~8주 운영 데이터 보고 재검토 가능** ([[04_dev_plan.md#19.1]] D68, 2026-06-03)
- KPI 5종 (D5): §7.1.2
- 가드레일 5종 (D5): §7.1.3
- 알림 7건 (D16/D34): §7.1.4
- GA4 Data API 유입 패널 (D33): §7.1.5
- UTM Builder (D25): §7.1.6
- 콘텐츠 4종 breakdown (D35): §7.2.1
- 게이트↔KPI 매칭 (D36): §7.2.2
- **잠정 P0 (시나리오 합의 후 정식 task)**: 가설·실험 트래킹 (D64) + 사용자당 가치 카드 (D66). plan §22.11 활용 시나리오 참조

### 10.1 events 적재 wrapper (D21)

`lib/analytics/track.ts`:
```ts
export type EventType = 'pv' | 'deep_read' | 'prompt_copy' | 'save' | 'react_up' | 'react_down'
  | 'cta_click' | 'ebook_order' | 'ebook_download' | 'ebook_read_page' | 'ebook_finish'
  | 'scroll_25' | 'scroll_50' | 'scroll_100';

const GA4_MAP: Record<EventType, string> = {
  pv: 'page_view',
  deep_read: 'deep_read',
  prompt_copy: 'prompt_copy',
  save: 'save',
  react_up: 'react_up',
  react_down: 'react_down',
  cta_click: 'cta_click',
  ebook_order: 'ebook_order',
  ebook_download: 'ebook_download',
  ebook_read_page: 'ebook_read_page',
  ebook_finish: 'ebook_finish',
  scroll_25: 'scroll',
  scroll_50: 'scroll',
  scroll_100: 'scroll',
};

export async function track(eventType: EventType, metadata?: Record<string, unknown>) {
  const utm = getUtm();   // sessionStorage
  const mergedMeta = { ...metadata, ...utm };
  // events 테이블 INSERT
  await supabase.from('events').insert({ event_type: eventType, metadata: mergedMeta });
  // GA4 fire (consent granted 시)
  if (window.gtag && consentGranted()) {
    window.gtag('event', GA4_MAP[eventType], mergedMeta);
  }
}
```

### 10.2 Consent Mode v2 (D24 정합)

`components/analytics/GA4Provider.tsx` 패치 — `gtag('consent', 'default', { all: 'denied' })` 먼저 호출, CookieConsent 동의 후 `gtag('consent', 'update', { analytics_storage: 'granted' })`.

### 10.3 Speed Insights (D24)

`app/layout.tsx` 1줄 추가:
```tsx
import { SpeedInsights } from '@vercel/speed-insights/next';
<SpeedInsights />
```

---

## 11. History·운영 로그 (D44, D45)

§7.5와 동일. 본 §11은 추가 운영 가이드:

### 11.1 운영자가 history를 보는 시나리오

1. **"이 콘텐츠 누가 언제 수정했지"** → `/admin/contents/[id]` timeline 패널
2. **"내가 어제 뭘 했지"** → `/admin/history?actor=me&date=2026-06-01`
3. **"왜 이 사용자 댓글이 hidden이지"** → `/admin/comments/[id]` timeline → `action_type='system.auto_hide'` 발견 → metadata 보면 report_count 확인
4. **"전자책 발송 실패 어떤 에러"** → `/admin/history?entity_type=purchase&action_type=ebook.send` 필터 → metadata.brevo_response 확인
5. **"editor X가 어떤 콘텐츠 손댔지"** → `/admin/history?actor=X`

### 11.2 metadata jsonb 구조 (action별)

| action_type | metadata 필드 |
|---|---|
| `content.create/update/delete` | `before`, `after` (jsonb diff) |
| `content.publish` | `status_from: 'draft', status_to: 'published'` |
| `opinion.reply` | `messageId, brevo_response` |
| `comment.hide / restore` | `from: 'visible', to: 'hidden', report_count` |
| `system.auto_hide` | `report_count, comment_id` |
| `ebook.send` | `messageId, brevo_response, attempt: n` |
| `brevo.contact.sync` | `brevo_contact_id, action: 'create' or 'update'` |
| `role.change` | `from, to` |
| `category.create / update / delete` | `before, after` |
| `profile.invite` | `email, role, message` |

### 11.3 보존 정책

- **영구 보존** (D44 결정). 운영 부담 시 P1에 90일 archive 정책 도입 검토
- 월 row 수 예측: 콘텐츠 10건/월 + 의견 50/월 + 댓글 300/월 + 시스템 자동 100/월 = ~500 row/월 = 6000/년. 부담 없음

---

## 12. 발행·검증 게이트 (자동 8 + 수동 3)

§7.6.1 + [[docs/04_dev_plan.md]] §7 통합.

### 12.1 자동 8개 (D7)

발행 게이트 통과 안 되면 [발행] 버튼 비활성:

| # | 검사 | 출처 |
|---|---|---|
| 1 | 시간 라벨 `read_min ≥ 1 && apply_min ≥ 1` | §7 |
| 2 | 직무 태그 `job_tags.length ≥ 1` | §7 |
| 3 | 페르소나 커버리지 `persona_coverage.length ≥ 1` | §7 |
| 4 | IntentBox 수 = step 수 | §7 |
| 5 | failures 분량 ≥ 30% | §7 |
| 6 | CustomizationChecklist 4개 | §7 |
| 7 | 이미지 alt 누락 0 | D7 NEW |
| 8 | 외부 링크 화이트리스트 안 | §7 (광고 0) |

### 12.2 수동 3개 (§7.2)

발행 버튼 옆 체크박스 강제:
1. 1인칭 톤 (AuthorQuote + 본문)
2. RelatedSidebar / RelatedCarousel 작동 시각 확인
3. 모바일 1회 직접 확인

### 12.3 운영 안전망 4개 (D7 행동 안내, 차단 X)

자동 8개 외 추가 UX 안전망:
1. 자동 저장 (60초 또는 5자 입력마다 localStorage + DB draft)
2. 슬러그 충돌 체크 (`select id from contents where slug=?` real-time)
3. 미리보기 (PreviewModal 데스크탑/모바일)
4. 본문 변경 unsaved 경고 (`useBeforeUnload`)
5. 동시 편집 충돌 감지 (`contents.updated_at` snapshot)

→ 총 D7 = "안전망 8개" = 자동 8 (= 자동 6 + alt 누락 + 동시 편집) + 행동 안내 4 (자동 저장·슬러그·미리보기·unsaved). [[docs/04_dev_plan.md]] §19 D7 row와 정합.

---

## 13. Phase·일정 (Day 0~12 + Phase 4)

[[docs/05_launch_runbook.md]] Day 0~12 + 본 admin 계획 추가 작업.

### 13.1 Day 1~12 (출시 전)

**2026-06-02 일정 갱신**: 격상 7건 출시 P0 포함 결정 → 출시일 Day 12 → **Day 18** (+6일).

| Day | 작업 | admin 관련 |
|---|---|---|
| Day 0 | 기획 정합 | §19 정합본 (본 세션 완료) + 본 문서 (06) 신설 + 격상 결정 |
| Day 1 | Supabase 셋업 + 0001 + 0002 + **0003** + **0004** + **Storage 7 버킷** + Auth | 0003에 D13/D26/D37/D39/D43/D44 + D51/D52/D53/D54 통합. **0004 Storage 정책 분리** (D57). Auth: Email + Confirm email OFF + URL Config |
| Day 2-A | Google + Kakao OAuth | D17 role 분기 + middleware 검증 |
| Day 2-B | Analytics 인프라 + 검색 적재 | D21 track + D24 SpeedInsights + Consent v2 + utm.ts + scroll-tracker.ts + D55 events.search 적재 |
| Day 3~4 | KPI 대시보드 + GA4 Data API + 인기 검색어 패널 | D5 / D32 / D35 / D36 / D33 (GA4 Data API P0) + D55 SearchKeywordPanel |
| Day 5 | Hero 큐레이션 + **D6 사용자 슬라이드 패널 + D4 admin_note UI** ⬆ + /links | D15 / **D6 격상 (행동·구매·동의·admin_note 통합) + D4 격상** / D52 /admin/contents/curation / D56 /links 동적 |
| Day 6 | 의견함 답장 + /admin/support + **알림 이메일 발송** ⬆ | D2/D3/D31 (Edge Function + Brevo) + D51 /admin/support + **D48 b admin-email digest (Vercel Cron)** |
| Day 7 | 콘텐츠 작성 폼 + SEO 메타 | D7 8개 안전망 + D27 발행자 부활 + D30 카테고리·태그 UI + D54 SEO 고급 설정 |
| Day 8 | 콘텐츠 폼 추가 보강 + FAQ | unsaved 경고 + 동시 편집 + 이미지 alt + D51 /admin/faq |
| Day 9~10 | 폴리시 + Brevo Contact + 자동 hide + **newsletters Brevo 발송** ⬆ | D9 (N=3) + D19 + audit_logs trigger 부착 (D44) + **D53 /admin/newsletters (Brevo Campaign API) 격상** |
| Day 11 | 1회 DB 설정 + guides/prompts redirect + **UTM Builder** ⬆ + **editor 이메일 초대** ⬆ | D11 + D50 redirect + **D25 /admin/utm 페이지 P0 격상** + **D47 /admin/users/invite P0 격상** |
| Day 12~13 | **web reader (PDF.js)** ⬆ + audit trigger 완성 + /admin/history 영역 패널 | **D41 /mypage/ebooks/[slug]/read 격상** + D45 영역 패널 + audit_logs entity별 timeline |
| Day 14~15 | Phase 2.5 콘텐츠 10건 작성 + UX 검증 병행 | 발행 게이트 8 자가 통과 + 페르소나 매칭 12개 |
| Day 16~17 | 페르소나 12개 검증 + 모바일 검증 + 발행 게이트 통과 | §12 + §18.8 모바일 일괄 검증 |
| Day 18 | **출시 게이트 통과 + 출시** | D12 + 본 §12 + 격상 7건 모두 포함 |

### 13.2 출시 직후 (Day 19~)

2026-06-02 격상 결정 후 출시 직후 잔여 (모두 P1/P2):
- **카카오톡 알림 (D48 c, P1)** — 카카오 비즈 메시지 검토
- **D29 후보 카드 자동 변환 (P2)** — 점수 임계치 기반 자동 draft
- **D22 Vercel Web Analytics 재검토** — GA4 데이터 충분 시 도입 결정
- **출시 후 UX 버그 정리** — 페르소나 검증 갭, 운영 데이터 보고 게이트 임계치 조정 (D9 N=3 등)

> **Day 18에 7건 격상 모두 P0로 출시 포함 (영역 1·3·4·6·8)**. 출시 직후 1주 이월 항목 없음.

### 13.3 Phase 4 (출시 + N개월)

D42 트리거(구독자 500 OR 결제 요청 10건) 도달 시:
- PG 도입 (토스페이먼츠 또는 포트원)
- D23 GA4 ecommerce purchase fire
- D43 discount/coupon 컬럼 활용
- 도메인 도입 ([[project_domain_deferred]])

---

## 14. 영향받는 파일·신규 컴포넌트

### 14.1 Migration

> ✅ **정합 갱신 (2026-06-07)**: 원본 `caselab`(본가) repo에서 마이그레이션 **0001~0009 전체를 `supabase/migrations/`로 동기화 완료** (db pull 불필요). remote DB에는 본가가 이미 적용함. **apply 소유자 = 본가 repo, admin은 참조·재현용**(중복 `db push` 금지). 상세: `supabase/README.md`.

| 파일 | 결정 |
|---|---|
| `supabase/migrations/0001_init.sql` | D17 role 확장 + 12 테이블 + admin_stats/content_stats view (repo 동기화 ✅) |
| `supabase/migrations/0002_admin_p0.sql` | D1/D3/D4/D5/D8/D11/D14/D15/D16/D17/D19 + `is_admin()`/`is_editor()` + featured_contents + weekly_kpi/admin_notifications view (repo 동기화 ✅) |
| `0003`~`0009` | categories·tags·utm·faqs·support_tickets·newsletter_campaigns·audit_logs·newsletter_subscribers 등 (repo 동기화 ✅) |
| `supabase/migrations/0003_categories_tags_utm.sql` ⭐ NEW | D13 / D26 / D37 / D39 / D43 / D44 / utm_channel seed + **D51 faqs/support_tickets** + **D52 featured_contents.slot_type** + **D53 newsletter_campaigns** + **D54 contents.og_* 컬럼** |
| `supabase/migrations/0004_storage_policies.sql` ⭐ NEW | **D57 Storage 7 버킷 풀 옵션** — avatars/content-images/newsletter-assets (Public) + support-files/audit-exports (Private) + 각 RLS 정책 (anyone read·editor write·admin write·본인 write 패턴 분리) |

### 14.2 Middleware

- `lib/supabase/middleware.ts` — `ADMIN_ONLY_PREFIXES`에 `/admin/history` 추가

### 14.3 Admin 페이지 (신규)

| 경로 | 결정 |
|---|---|
| `app/admin/categories/page.tsx` | D30 |
| `app/admin/utm/{page,UtmBuilderForm,actions}.tsx` + `lib/utm/build-url.ts` | D25 |
| `app/admin/history/page.tsx` | D45 |
| `app/admin/users/invite/page.tsx` + `actions.ts` | D47 |
| `app/admin/revenue/page.tsx` | D40 |
| `app/admin/guides/page.tsx` (redirect) | D50 |
| `app/admin/prompts/page.tsx` (redirect) | D50 |
| `app/admin/support/page.tsx` + `app/admin/support/[id]/page.tsx` + `actions.ts` | D51 |
| `app/admin/faq/page.tsx` + `FaqForm.tsx` + `actions.ts` | D51 |
| `app/admin/contents/curation/page.tsx` (또는 contents page.tsx 안 탭) | D52 |
| `app/admin/newsletters/{page,NewsletterForm,actions}.tsx` | D53 |
| `app/links/page.tsx` 동적 렌더링 (사용자측, D56) | D56 |

### 14.4 사용자 페이지 (admin이 운영하는)

| 경로 | 결정 |
|---|---|
| `app/mypage/profile/page.tsx` 풀 확장 | D38 |
| `app/mypage/ebooks/[slug]/read/page.tsx` ⭐ NEW (web reader) | D41 |

### 14.5 컴포넌트 (admin)

| 파일 | 결정 |
|---|---|
| `components/admin/TrackForm.tsx` 갱신 | D7 / D13 / D27 / D30 / **D54** (SEO 고급 설정 접어 펴기) |
| `components/admin/ToolForm.tsx` 갱신 | D13 / D30 |
| `components/admin/LinterGate.tsx` | D7 자동 8개 + 수동 3개 |
| `components/admin/ToneGuideSidebar.tsx` | 페르소나별 1인칭 인용 |
| `components/admin/CategoryQuickAdd.tsx` ⭐ NEW | D30 즉석 입력 모달 |
| `components/admin/TagAutocomplete.tsx` ⭐ NEW | D30 |
| `components/admin/HistoryTimeline.tsx` ⭐ NEW | D45 영역 패널 |
| `components/admin/InflowPanel.tsx` ⭐ NEW | D33 |
| `components/admin/PersonaBreakdown.tsx` ⭐ NEW | D35 (d) |
| `components/admin/CategoryBreakdown.tsx` ⭐ NEW | D35 (b) |
| `components/admin/GateKpiCorrelation.tsx` ⭐ NEW | D36 |
| `components/admin/CurationSlots.tsx` ⭐ NEW | D52 12 슬롯 drag-and-drop |
| `components/admin/FaqForm.tsx` ⭐ NEW | D51 |
| `components/admin/NewsletterForm.tsx` ⭐ NEW | D53 segment 선택 + Brevo 발송 |
| `components/admin/SearchKeywordPanel.tsx` ⭐ NEW | D55 top N 인기 검색어 |
| `components/admin/SeoMetaSection.tsx` ⭐ NEW | D54 TrackForm 안 접어 펴기 섹션 |

### 14.6 lib (admin 의존)

| 파일 | 결정 |
|---|---|
| `lib/tokens.ts` ⭐ NEW | D46 user/admin set |
| `lib/analytics/track.ts` ⭐ NEW | D21 |
| `lib/analytics/utm.ts` ⭐ NEW | D25 |
| `lib/analytics/scroll-tracker.ts` ⭐ NEW | D21 (scroll_25/50/100) |
| `lib/analytics/ga4-data-api.ts` ⭐ NEW | D33 |
| `lib/notify/admin-email.ts` ⭐ NEW | D48 (b) |
| `lib/content-lint.ts` 확장 | D7 자동 8개 |
| `components/analytics/GA4Provider.tsx` 패치 | D24 Consent v2 |
| `app/layout.tsx` | `<SpeedInsights />` D24 |

### 14.7 Edge Functions

| 파일 | 결정 |
|---|---|
| `supabase/functions/send-ebook/` (이미 존재) | D8 |
| `supabase/functions/send-opinion-reply/` ⭐ NEW | D2 / D31 |
| `supabase/functions/sync-brevo-contact/` (이미 존재 가정) | D19 |

---

## 15. 향후 (출시 이후)

### 15.1 P1 (출시 +1주~+1개월)

- D6 사용자 슬라이드 패널 + D4 admin_note UI (D6 완성)
- D45 `/admin/history` 단일 페이지 + 영역 패널
- D47 editor 이메일 초대 (게스트 1명 채용 시)
- D48 (c) 카카오톡 알림 (운영자 본인 채널)
- D49 운영자 메모 자동화 (admin 안 별도 페이지)

### 15.2 P2 (출시 +1~6개월)

- D29 후보 카드 → 자동 draft 변환 (점수 임계치 기반)
- D49 다중 운영자 RLS 분리
- 콘텐츠 50건 이상 시 분석 view 확장 (D35 카테고리·태그 breakdown 정밀화)
- §5-3 프롬프트 자동 추출 (콘텐츠 body에서 PromptBlock 추출 → /prompts 자동 노출)

### 15.3 Phase 4 (D42 트리거 시)

- PG 결제 도입 (D14/D43 컬럼 활용)
- D23 GA4 ecommerce purchase fire
- 도메인 도입 ([[project_domain_deferred]])
- D33 GA4 Data API ecommerce 보강
- 유료 전자책 + 쿠폰

### 15.4 영역 8 (사용자 페이지 운영) 향후

- **P1**: 큐레이션 자동 추천 (인기 콘텐츠 자동 선택 알고리즘) / FAQ 검색 기능 / newsletter A/B 테스트 (제목·시간 분할)
- **P2**: SEO 메타 LLM 자동 생성 (Claude API 활용 og_description 자동 작성) / 검색 자동완성 / /links 다국어 (EN/KR 토글 도입 시)

### 15.5 Phase 5+ (장기)

- 뉴스레터 자체 발송 (Brevo 초과 시) → Resend 도입
- 글로벌 EN/KR 토글
- 다크 모드 (사용자 요청 시)
- 댓글 멀티 스레드 (활성도 보고)

### 15.6 Mockup ↔ 코드 정합 정책 (2026-06-03, plan §20·§21 결정)

- **mockup freeze 데드라인 = Day 5 종료 (~2026-06-08)**. 그 후 mockup 변경 = P2 이월
- **P0 격상 (출시 전 필수)**:
  - **D59 UI 전면 정합 (admin도 user mockup index 통일)** — Day 3 (T-R). 폰트·로고·색상 다 user 정합. D46 폐기
  - **D60 사이드바 5 카테고리 재구조** — Day 3 (T-P, T-M 폐기로 흡수)
  - **D61 대시보드 시각화 7 위젯** — Day 3~4 + Day 13 (T-Q·T-S·T-T·T-U·T-V·T-W·T-X·T-Y). 똑시 가이드 정합
  - **D62 콘텐츠 전환율 + 상태 배지** — Day 7 (T-U)
  - **U3**: `/tools/[slug]` 상세 페이지 hero·featured 컴포넌트 보강 — Day 7~8 (T-O)
  - **U1**: 콘텐츠 상세 TOC 좌측 sticky 마이그레이션 — Day 6 (T-N)
- **P1 (출시 +1주~+1개월)**:
  - U2: pro/con 카드·pain-card·taking-points 블록 → ContextCard·Checklist 매핑 가이드 TrackForm 안 추가
  - U4: `/ebooks/[slug]` 상세 페이지 mockup(ebook-detail.html) 정합 확인
  - U6: Unsplash 직링크 → 자체 호스팅 전환 ([[project_mockup_external_images]] 정책)
  - M6: TrackForm 상세 UI(파일 업로드·미리보기 탭·키워드 제안) — task #11과 묶음
- **사용자 손 작업 (Day 6)**:
  - mockup HTML 측 D58 동기화 — Playfair Display·font-serif 잔존 제거. mockup 마무리 일환
- **출시 일정**: Day 18 → **Day 21 (~+3일)** — D61 7 위젯 전체 P0 격상으로 안전 마진 확보
- **freeze 미달성 시 처리**: Day 6에 freeze 연장 또는 mockup-코드 disparity 일부 수용 결정. plan §20.8 참조
- 콘텐츠 추천 알고리즘 고도화

---

## 부록 A. Decisions Log (admin 영역만)

| 일자 | 결정 | 출처 |
|---|---|---|
| 2026-05-28 | D1~D17, D19 1차 결정 (역추출) | 0002_admin_p0.sql + ADMIN_SESSION_NOTES |
| 2026-06-02 | §18.9 D21~D24 analytics | 본 세션 이전 작업 |
| 2026-06-02 | §18.10 D25~D26 UTM + categories | 본 세션 이전 작업 |
| 2026-06-02 | Phase A-0.2 7 영역 인터뷰 → D7/D13/D27~D49 확정 + D18/D20 폐기 | 본 세션 |
| 2026-06-02 | `docs/06_admin_dev_plan.md` 신설 (본 문서) | 본 세션 |
| 2026-06-02 | Phase 6 user mockup 갭 점검 → D50~D56 추가 + 영역 8 (사용자 페이지 운영) 확장 | 본 세션 |
| 2026-06-07 | 목업 커버리지 감사 PASS(21p) + 구현 갭(11/23) 기록 + `/admin/contents` 타입 통합 뷰 결정 + §4.5/§5/§14.1 정합 정정 | 본 세션 (ADMIN_SESSION_NOTES §7) |
| 2026-06-07 | 본가 마이그레이션 0001~0009 repo 동기화 + Quick Wins(revenue·guides·prompts) + 미구현 7페이지(categories·faq·support·newsletters·utm·history·curation) 목록 구현 → 구현 18/23. 편집·발송·드래그·Builder는 다음 레이어 | 본 세션 |
| 2026-06-07 | 대시보드 D61 7위젯 구현(북극성 스파크라인·퍼널·Top5·최근변경·직무/페르소나 분포). CSS 바+SVG SSR, get_daily_trend RPC 활용. tremor 미사용 | 본 세션 |
| 2026-06-07 | Mutation 레이어: UTM Builder·FAQ CRUD·카테고리/태그 CRUD(client+RLS). 읽기 페이지: analytics/search 인기검색어 집계·settings 상태. 미구현은 users/invite(Auth Admin API)·support 답변/newsletter 발송(Brevo Edge Function)·curation DnD | 본 세션 |

## 부록 B. 다른 세션에서 본 문서 활용

1. **§19 정합본** (`docs/04_dev_plan.md`) = 결정의 source of truth
2. **본 문서** (`docs/06_admin_dev_plan.md`) = 결정의 본문·이유·구현 가이드
3. **runbook** (`docs/05_launch_runbook.md`) = 일자별 작업 순서
4. 새 admin 결정 발생 시 §19에 D50+ row 추가 → 본 문서의 해당 § 본문 갱신 → [[feedback_4_location_protocol]] 준수
