# 인스타그램 연결 런북 (로컬 전용 · 비용 0원)

> 작성일: 2026-08-15
> 전제: **혼자 쓴다 · 로컬에서만 돌린다 · 돈 안 낸다**
> 범위: ① `/admin/cardnews` [발행] ☑ Instagram (우리 코드가 직접 발행) ② 리틀리(litt.ly) 댓글→자동DM
> 코드: `lib/cardpress/publish.ts` `publishInstagramCarousel()` · `app/api/cardpress/publish/route.ts`

---

## 0. 먼저 — 로컬에서 돌려도 발행이 되는 이유

"내 맥에서 도는 dev 서버인데 인스타가 이미지를 어떻게 가져가지?"가 당연한 의문이고,
여기서 막힐 거라 지레 포기하기 쉽다. **안 막힌다.**

```
내 맥 (localhost:3000)          Supabase (인터넷)              Meta
  ├ 슬라이드 PNG 렌더  ──업로드──▶  cardpress 버킷 (Public)
  └ Graph API 호출 ─────────────────────────────────────▶  "이 공개 URL들로 캐러셀 만들어"
                                        ▲                        │
                                        └────────이미지 가져감─────┘
```

Meta가 접근하는 건 `localhost`가 아니라 **Supabase 공개 URL**
(`https://<프로젝트>.supabase.co/storage/v1/object/public/cardpress/...`)이다.
내 맥은 "렌더하고 명령만 내리는" 역할이라 외부 노출이 전혀 필요 없다.
ngrok·터널링·배포 **전부 불필요**.

> 확인 완료: `cardpress` 버킷은 Public 상태 (`supabase/migrations/1020_content_cards.sql:79`).
> **이 버킷을 나중에 Private으로 바꾸면 그날로 발행이 실패한다** — 유일한 전제조건이니 건드리지 말 것.

## 0-2. 비용 — 전부 0원

| 항목 | 비용 | 비고 |
|---|---|---|
| Meta 개발자 계정 · 앱 생성 | **0원** | 전화번호 인증만. 심사 없음 |
| Instagram Graph API 발행 | **0원** | 24시간 100건 무료 쿼터 |
| 리틀리 자동DM | **0원** | 건수·기간 제한 없이 무료 |
| 앱 검수(App Review) | — | **안 받는다.** 내 계정에만 발행하므로 불필요 |
| 사업자 인증 서류 | — | **불필요.** 검수를 안 받으니 요구되지 않음 |
| Vercel | — | **안 쓴다.** 로컬 전용이라 배포 자체를 건너뜀 |
| AI 카드 생성 | **0원** | `.env.local`이 이미 `AI_PROVIDER=subscription` (Claude CLI 구독 사용, API 과금 없음) |
| Supabase 스토리지 | 0원 (무료 1GB) | 아래 주의 |

**유일하게 돈이 샐 수 있는 곳**: Supabase 무료 스토리지 1GB. 카드 1건당 PNG 10장 ≈ 10MB라
100건쯤 쌓이면 한도에 닿는다. 발행 끝난 카드의 `cardpress/{카드id}/` 폴더는 주기적으로 지우면 된다
(인스타에 이미 올라간 게시물은 영향 없음 — Meta가 자기 서버로 복사해 간다).

---

## 0-3. 뭘 등록해야 하나 — 두 기능 비교

| | 카드뉴스 자동발행 | 리틀리 자동DM |
|---|:---:|:---:|
| IG 프로페셔널 계정 (비즈니스·크리에이터 무관) | **필수** — ✅ 완료 | **필수** — ✅ 완료 |
| 페이스북 페이지 연결 | **필수** | 권장 |
| **내 Meta 개발자 앱** | **필수** | **불필요** |
| 토큰 직접 발급 | **필수** | 불필요 (OAuth 승인만) |
| 앱 검수 | 불필요 | 불필요 |

리틀리는 *이미 검수받은 리틀리의 앱*으로 내 계정을 대신 조작한다 — 나는 권한만 주면 된다.
카드뉴스는 *내 맥이 직접* Graph API를 호출하므로 내 이름의 앱과 토큰이 필요하다.
**자동DM 때문에 Meta 등록을 추가로 할 일은 없다.**

### 순서 (2026-08-15 현재 진행 상황)

```
A. 인스타 계정 공사 ........ ✅ 완료 (2026-08-15)
   A1 프로페셔널 전환 ..... ✅ 크리에이터 / 디지털 크리에이터
   A2 페이스북 페이지 연결 . ✅ 페이지 "Caselab" ↔ @caselab_ai_ (개인 FB 계정 소유)
   A3 확인 ................ ✅ Settings → Linked accounts 에 연결 확인
B. Meta 개발자 앱 .......... ✅ 완료 (앱 caselab-cardpress · Instagram use case)
C. 토큰 → 스크립트 ......... ✅ 완료 — @caselab_ai_ (id 28235322696154850, BUSINESS)
                              발행 쿼터 0/100 확인 · 토큰 60일 · 만료일 .env.local 기록
D. 첫 발행 ................. 🔸 dryRun 통과(9장 렌더·업로드·공개 URL 200). 실게시만 남음
F. 리틀리 자동DM (5분)      ⬜ 지금 바로 가능 (A만 필요 · B·C와 독립)
```

**연결은 끝났다.** 남은 건 실제 게시 버튼과 리틀리(F)뿐.

> **가장 중요한 교훈**: 대시보드에서 `instagram_business_content_publish` **Add가 계속 실패했지만
> 권한은 실제로 붙어 있었다.** 화면 상태를 믿지 말고 `--verify`(content_publishing_limit 실호출)로
> 판정할 것. Add 오류에 매달리느라 한 시간을 썼다.

> **경로 확정(2026-08-15)**: Facebook Login이 아니라 **Instagram Login(`graph.instagram.com`)**.
> 이유와 막다른 길은 C장 머리말 참고. A장의 페이지 연결은 이 경로에선 발행에 쓰이지 않지만
> 리틀리·인사이트에서 쓸모가 있으니 그대로 둔다.

(E단계였던 Vercel 반영은 로컬 전용이라 삭제. 나중에 필요해지면 맨 아래 부록)

---

# A. 인스타 계정 공사 (공통 · 10분)

> 대상 계정: `@caselab_ai_` (`lib/constants.ts` `INSTAGRAM_URL`)

### A1. 프로페셔널 계정으로 전환 — ✅ 완료 (2026-08-15)

`@caselab_ai_` = **크리에이터 계정 / 카테고리 "디지털 크리에이터"**.

**크리에이터 그대로 두면 된다. 비즈니스로 바꿀 필요 없다.**
발행 API는 계정 유형이 아니라 "프로페셔널인가"만 본다 — 비즈니스·크리에이터 둘 다 지원된다.
카테고리도 발행과 무관하니 그대로 둔다.

> 참고(개인 계정에서 시작하는 경우): Instagram 앱 → ☰ → 설정 및 개인정보 →
> 크리에이터 도구 및 관리 옵션 → 프로페셔널 계정으로 전환. 무료 · 팔로워 조건 없음 · 되돌리기 가능.

### A2. 페이스북 페이지 연결 ← **지금 남은 유일한 수동 작업**

> ⚠️ **결과적으로 이 단계는 발행에 필수가 아니었다.** 최종 경로가 Instagram Login으로 바뀌면서
> 페이지 연결은 발행 사슬에서 빠졌다(C장 머리말). 다만 **리틀리 자동DM·인사이트·나중에 Facebook
> Login으로 되돌아갈 때** 쓰이므로 만들어둔 걸 되돌릴 필요는 없다.
> 아래는 페이지가 필요해질 때를 위해 남겨둔 절차다 — 처음부터 다시 한다면 **A2를 건너뛰고 B로 가도 된다.**

원래 의도: Facebook Login 경로(`graph.facebook.com`)는
**"IG 프로페셔널 계정 ← 연결 → FB 페이지 ← 관리 → 내 페이스북 계정"** 사슬로 권한을 확인하고,
페이지는 그 사슬의 고리일 뿐이다. 게시물은 어느 경로든 **인스타에만** 올라간다.

#### 현재 상태 (2026-08-15 확인)

비즈니스 스위트가 **인스타그램 전용 포트폴리오**로 열려 있다 — 아바타에 IG 배지만, "Edit Instagram
Profile"만, 팔로워 카운트도 인스타 하나. **페이지는 아직 없다.**

> Meta는 인스타 계정만으로도 비즈니스 스위트를 열어준다. 그래서
> **"비즈니스 스위트 세팅 완료" ≠ "페이지 만듦"** 이다. 예전에 한 건 여기까지일 가능성이 크다.
> 확실히 하려면: 좌측 하단 **Settings → 비즈니스 자산** 의 **페이지** 항목이 비어 있는지 확인.

#### 순서 (이 순서를 지켜야 덜 꼬인다)

**1) 페이스북 개인 계정으로 페이지 생성**

지금 비즈니스 스위트는 *인스타 계정으로* 로그인된 상태다. 페이지는 페이스북 계정 소유여야 하므로
**계정을 바꿔서** 시작한다.

1. [facebook.com](https://facebook.com) 에 **페이스북 개인 계정**으로 로그인
2. [facebook.com/pages/create](https://facebook.com/pages/create)
3. 페이지 이름 `Caselab` / 카테고리 아무거나(예: 교육) / 소개 생략
4. **페이지 만들기** — 프로필 사진·커버·팔로우 유도 등 이후 단계는 전부 **건너뛰기**

**2) 인스타그램 앱에서 그 페이지에 연결** ← 이쪽이 성공률이 높다

1. Instagram 앱 → 프로필 → **프로필 편집**
2. **페이지** (크리에이터는 **공개 비즈니스 정보 → 페이지** 아래일 수 있음)
3. **기존 페이지 연결** → 페이스북 로그인 → 1)에서 만든 `Caselab` 선택

> 페이지 쪽에서 거는 방법(페이지 → 설정 → 연결된 계정 → Instagram)도 되지만,
> 인스타가 이미 자기 포트폴리오를 갖고 있는 지금 상태에선 앱에서 거는 쪽이 충돌이 적다.

#### 2-B) 프로필 편집에 "페이지" 항목이 없을 때 ← **실제로 이 케이스였음 (2026-08-15)**

크리에이터 계정에서 흔하다. 계정 문제가 아니다. **연결은 반대쪽(페이지)에서 걸면 된다.**

**경로 A (권장) — 페이스북 페이지 설정에서**

1. [facebook.com](https://facebook.com) 에 **페이스북 개인 계정**으로 로그인
2. 우측 상단 프로필 아이콘 → **프로필 전환** → `Caselab` 페이지 선택
   (또는 좌측 메뉴 **페이지** → `Caselab`)
3. 페이지 화면에서 **설정**(Settings)
4. **연결된 계정**(Linked accounts) → **Instagram**
5. **계정 연결** → `@caselab_ai_` 로 인스타 로그인 → 승인

**경로 B — Meta 비즈니스 스위트에서**

1. [business.facebook.com](https://business.facebook.com) 에 **페이스북 계정으로** 로그인
   (지금 인스타 계정으로 로그인돼 있으면 로그아웃 후, 또는 시크릿 창에서)
2. 좌측 상단 포트폴리오 드롭다운에서 **`Caselab` 페이지 쪽**을 선택
3. 좌측 하단 **설정** → **비즈니스 자산** → **Instagram 계정** → **추가**
4. 인스타 로그인 → 페이지와 연결

**경로 C — 인스타 앱의 다른 위치**

프로필 편집 말고 여기에도 있다:
프로필 → **프로페셔널 대시보드** → 아래로 스크롤 → **도구/설정** 계열에서 **Facebook 페이지 연결**

> ⚠️ **함정**: 인스타 설정의 **계정 센터(Accounts Center)** 에서 "페이스북 **프로필** 연결"을 하는 건
> **이것과 다른 기능**이다. 개인 프로필끼리 묶는 것이라 페이지 연결이 되지 않고, 해도 발행 권한이 안 생긴다.
> 반드시 **페이지(Page)** 와 연결해야 한다.

#### 그 밖에 나올 수 있는 에러

| 메시지 | 뜻 | 조치 |
|---|---|---|
| "이미 다른 비즈니스 포트폴리오에 연결된 계정입니다" | 기존 **IG 전용 포트폴리오**가 걸림 | business.facebook.com(인스타로 로그인) → 설정 → 비즈니스 자산 → Instagram 계정 → **제거** → 다시 연결 (인스타 계정 자체가 지워지는 게 아니라 포트폴리오 연결만 끊김) |
| 페이스북 로그인 팝업이 인스타 계정으로 뜸 | 브라우저에 인스타 세션이 남음 | 시크릿 창에서 다시, 또는 로그아웃 후 페이스북 계정으로 |

### A3. 확인 (여기서 막히면 뒤가 전부 막힌다)

[business.facebook.com](https://business.facebook.com) 에 **페이스북 계정으로** 접속했을 때
헤더 아바타에 **페이스북·인스타그램 배지가 둘 다** 보이면 성공이다.
(지금처럼 인스타 배지만 보이면 아직 연결 전)

또는 Settings → **비즈니스 자산** 에 **페이지**와 **Instagram 계정**이 둘 다 있고 서로 묶여 있으면 완료.

- 연결했는데 목록에 안 뜬다 → 몇 분 걸리기도 한다. C2 스크립트가 최종 판정을 하니 일단 진행해도 된다

**A가 끝나면 리틀리(F)는 바로 된다.** 카드뉴스 발행까지 원하면 B로.

> 크리에이터 계정의 발행 가능 여부는 **C3 스크립트의 `content_publishing_limit` 실호출이
> 최종 판정**한다. 거기서 ✅가 뜨면 실제로 발행되는 상태이고, ❌면 계정 유형이 아니라
> 권한(C1) 문제다 — `instagram_business_content_publish` 누락을 먼저 의심할 것.

---

# B. Meta 개발자 앱 (카드뉴스 발행 전용 · 10분)

### B0. 개발자 등록 — ✅ 완료 (2026-08-15)

> 전화번호 인증에서 **한국 통신사가 Meta 국제발신 SMS를 차단**해 한참 막혔다. 재발 시:
> ① 통신사 앱/114에서 **국제발신 문자 차단 해제** ② `Update Mobile Number` 로 +82 형식(앞의 0 제거)
> ③ 10~15분 두고 재시도(연타는 rate limit) ④ 다른 번호.
> 우측 상단이 **아바타 + My Apps** 로 바뀌면 등록 완료.

### B1. 앱 생성

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → 우측 상단 **Create App**
2. 화면 순서는 Meta가 종종 바꾼다. 어느 순서로 나오든 **아래 3개만 맞추면 된다**:

| 항목 | 넣을 값 | 이유 |
|---|---|---|
| **App name** | `caselab-cardpress` | 아무거나 무방 |
| **Business portfolio** | **선택하지 않음**(No business portfolio) | 붙이면 나중에 **사업자 인증 서류**를 요구받을 수 있다 |
| **Use case** | 좌측 필터 **Others** → **"Create an app without a use case"** (2026-08 기준 이름. 예전 "Other") → 앱 유형 **Business** | 앱 생성 시엔 비워둔다. 생성 직후 B2에서 Instagram use case를 붙인다 |

3. **Create app** → 페이스북 비밀번호 재확인

> 생성 후 대시보드에 **Required actions** 배너가 떠도 지금은 무시해도 된다 —
> 검수·라이브 전환 관련이고, 개발 모드 발행에는 영향이 없다.

### B2. Instagram use case 추가

> ⚠️ Meta가 새 앱에서 **"Add product"(제품 추가)를 없앴다.** 좌측에 Products 섹션이 아예 없고
> `Use cases` 만 있다. 옛 문서·블로그의 "제품 추가 → Instagram" 안내는 이제 안 맞는다.

1. 앱 대시보드 → **Add use cases**
2. **"Manage messaging & content on Instagram"** 선택 → 추가

우리에게 필요한 권한 4종이 바로 이 use case에 들어 있다.
(B1에서 이걸 고르지 '않은' 것과 모순처럼 보이지만 다르다 — 앱 생성 시엔 use case가 앱 전체 성격을
묶어버리므로 비워두고, 앱이 만들어진 뒤 필요한 것만 붙이는 순서다.)

**성공 신호**: 좌측 내비에 **`Facebook Login for Business`** 가 나타난다.
> 이게 보이면 Facebook Login 경로가 열린 것처럼 보이지만 **아니다.** 구성(configuration)을
> 만들어 보면 권한 검색에서 `instagram` 이 하나도 안 나온다(C장 머리말). 신규 앱의 실제 경로는
> **Instagram Login** 이다 — 이 항목은 무시하고 C장으로 간다.

#### ⚠️ "Add account" 를 누르면 인스타 로그인 창에 "개발자 역할 권한이 부족합니다"

이 use case의 **"2. Generate access tokens → Add account"** 는 인스타 계정이 **이 앱의 테스터**로
등록돼 있어야 동작한다. 안 되어 있으면 로그인 창이 빈 화면 + 저 문구만 띄우고 끝난다.
(같은 화면 설명문에 조건이 적혀 있지만 눈에 안 들어온다 — "assign the Instagram Tester role in the Roles tab")

**해결 — 초대 보내고, 인스타에서 수락까지 해야 끝난다 (2단계다):**

1. 앱 대시보드 → 좌측 **App roles** → **Roles**
2. **Instagram Testers** 섹션 → **Add people**(또는 Add Instagram Testers)
3. `caselab_ai_` 입력 → 초대 발송 → 상태가 **Pending** 으로 뜬다
4. **인스타 계정으로 수락** ← 여기를 빼먹으면 Pending 그대로라 계속 실패한다
   - 직행: [instagram.com/accounts/manage_access](https://www.instagram.com/accounts/manage_access/)
     → **테스터 초대(Tester invites)** 탭 → **수락**
   - 앱 경로: Instagram 앱 → 설정 및 개인정보 → **웹사이트 권한** / **앱 및 웹사이트** → 테스터 초대
   - ⚠️ 반드시 `@caselab_ai_` 로 로그인한 상태에서 수락할 것
5. 앱 대시보드로 돌아와 **Add account** 다시 → 이번엔 로그인 창이 정상 진행

**무시할 것 2가지** (대시보드에 같이 뜬다):
- **Become a Tech Provider** — App Review·타사 데이터 접근용. 우리는 내 계정만 쓰므로 불필요
- **Publish / Unpublished 배지** — 개발 모드 유지가 우리 방침이다. 그대로 둔다

### B3. 앱 ID · 시크릿 코드 메모

1. 좌측 **앱 설정** → **기본 설정**
2. **앱 ID** 복사
3. **시크릿 코드** 옆 **[보기]** → 비밀번호 재확인 → 복사

> C2에서 단기 토큰을 장기 토큰으로 바꾸는 데 쓴다. **채팅·git에 붙여넣지 말 것.**

### B4. 앱 모드는 "개발 중" 그대로 둔다

- 개발 모드여도 **내 계정에는 정상 발행된다** (내가 앱 관리자이므로)
- **라이브 전환도, 검수 신청도 하지 말 것** — 검수는 몇 주 걸리고, 사업자 인증 서류를 요구받는다.
  혼자 쓰는 한 영원히 필요 없다

---
# C. 토큰 발급 → 스크립트 (5분)

> **2026-08-15 경로 전환**: 원래 Facebook Login(`graph.facebook.com`) 경로로 가려 했으나,
> 신규 앱의 **Facebook Login for Business → Create configuration → Permissions** 에서
> `instagram` 을 검색하면 **"No matching results"** 가 뜬다. 신규 앱에는 인스타 권한이
> 그쪽으로 열리지 않는다(Meta가 Instagram Login으로 몰고 있다).
> → **Instagram Login(`graph.instagram.com`) 경로로 확정.** 발행 엔드포인트가 동일해서
> 코드는 `lib/cardpress/publish.ts` 의 호스트 한 줄만 바뀌었다.
>
> **막다른 길 2개(다시 들어가지 말 것)**
> - Facebook Login for Business 구성 만들기 → 인스타 권한이 없어 쓸모없다
> - App roles → Roles → "Add people" 다이얼로그의 **Instagram Tester** → 저장이 안 된다
>   (설명문에 "required by the Instagram **Basic Display** API" 라고 적혀 있다 = 2024년 종료된 레거시)

### C1. 권한 추가 — `instagram_business_content_publish`

1. 앱 대시보드 → 좌측 **Use cases** → **Manage messaging & content on Instagram** → **Customize**
2. **"1. Add permissions"** 섹션 → **Add all required permissions**
   (`instagram_business_basic` · `..._manage_comments` · `..._manage_messages` 가 들어온다)
3. 같은 화면의 **Permissions and features** 페이지에서 **`instagram_business_content_publish` 추가**
   > ⚠️ 이게 핵심이다. 기본 3종에는 **발행 권한이 없다.**
   > 없으면 프로필 조회·댓글 조회는 다 되는데 **발행만** 실패한다.
   > C3 스크립트가 실호출로 이걸 잡아준다.

### C2. 토큰 발급 — 대시보드에서 직접

그래프 탐색기를 쓰지 않는다. Instagram Login 경로는 대시보드가 토큰을 직접 준다.

1. 같은 Customize 화면의 **"2. Generate access tokens"** → **Add account**
2. 인스타 로그인 창 → `@caselab_ai_` 로 로그인 → 권한 허용
3. 계정이 붙으면 옆의 **Generate token** → 토큰 복사 (`IGAA...`)

**"개발자 역할 권한이 부족합니다" 가 뜨면** — 인스타 계정이 이 앱의 테스터가 아니다.
같은 화면 설명문의 **`Roles`** 링크(← App roles의 "Add people" 다이얼로그가 **아니다**)로 가서
`caselab_ai_` 를 추가하고, **인스타에서 초대를 수락**해야 한다:
[instagram.com/accounts/manage_access](https://www.instagram.com/accounts/manage_access/)
→ **테스터 초대** 탭 → 수락 (`@caselab_ai_` 로 로그인된 상태에서).
초대만 보내고 수락을 안 하면 Pending이라 계속 같은 에러가 난다.

### C3. 스크립트 한 줄

**⚠️ 시크릿을 헷갈리지 말 것 — 앱이 두 개다.**

| | 어디에 있나 | 어디에 쓰나 |
|---|---|---|
| **Facebook 앱** ID/시크릿 | App settings → Basic (주소창 `/apps/{ID}/`) | 여기선 **안 쓴다** |
| **Instagram 앱** ID/시크릿 | Use cases → Customize → **API setup with Instagram login** 상단 | **이걸 쓴다** (`--app-secret`) |

Instagram Login 경로의 토큰 교환(`ig_exchange_token`)은 **Instagram app secret** 을 요구한다.
페이스북 앱 시크릿을 넣으면 교환이 조용히 실패하고 단기 토큰인 채로 진행돼, 몇 시간 뒤에야
"왜 어제는 됐는데"가 된다. 같은 화면의 `Instagram app secret` 옆 **[Show]** 로 확인할 것.

```bash
cd "apps/caselab_admin"

node scripts/instagram-connect.mjs \
  --token "IGAA...C2에서_복사한_토큰" \
  --app-secret "앱_시크릿" \
  --write
```

| 단계 | 하는 일 | 막아주는 사고 |
|---|---|---|
| 1/3 | 단기 → **60일 장기 토큰** 교환 | 오늘 되고 내일 안 되는 토큰 |
| 2/3 | `me` 로 IG id·사용자명 조회 + `content_publishing_limit` **실호출** | 엉뚱한 id / 권한 목록엔 있는데 실제론 없는 경우 |
| 3/3 | `.env.local` 기록 (만료일 포함) | 오타 |

정상 출력:

```
[1/3] 장기 토큰 교환
  ✅ 장기 토큰 확보 — 60일 유효 (IGAAbCdE…9xQZ)

[2/3] 계정 조회 + 발행 권한 확인
  ✅ 계정 조회 성공 — @caselab_ai_ (id 17841... · BUSINESS)
  ✅ 발행 쿼터 0/100 (24시간 기준) — 발행 권한 확인됨

[3/3] 기록
  ✅ .env.local 기록 완료 — dev 서버가 자동 리로드합니다("Reload env" 로그 확인)
```

### C4. 검증 · 갱신

```bash
node scripts/instagram-connect.mjs --verify    # 지금 발행 가능한 상태인가 (만료 임박 경고 포함)
node scripts/instagram-connect.mjs --refresh   # 60일 더 연장 (.env.local 자동 갱신)
```

> **60일 갱신이 이 경로의 유일한 대가다.** Facebook Login의 페이지 토큰은 만료가 없었지만
> 그 경로는 신규 앱에 안 열린다. 발행 전 `--verify` 습관이면 만료 전에 경고를 본다.
> 만료 후에는 `--refresh` 도 안 되고 C2부터 다시 해야 한다.

# D. 첫 발행 (5분)

### D1. dryRun 으로 이미지부터 (토큰 없이도 도는 경로)

발행 전에 렌더+업로드만 돌려 공개 URL을 눈으로 본다. Meta가 실제로 가져갈 그 URL이다.

```bash
curl -s -X POST http://localhost:3000/api/cardpress/publish \
  -H 'content-type: application/json' \
  -H 'x-cardpress-dev: 1' \
  -d '{"cardId":"<카드 id>","dryRun":true}' | jq .
```

→ `images[]` URL을 브라우저로 열어 PNG가 정상인지 확인.
(`x-cardpress-dev: 1` 우회 헤더는 `NODE_ENV!=='production'` 에서만 동작 — 로컬 전용이라 늘 쓸 수 있다)

### D2. 실제 발행

`/admin/cardnews` → 카드 → **[발행]** → ☑ Instagram 만 → 실행.

- 응답 `published_to[0].post_id` 기록 + 카드 status가 `published` 로
- 응답의 **`errors[]` 를 꼭 볼 것** — 채널별 try/catch라 IG가 실패해도 200이 나온다
- 슬라이드 10장 초과면 발행 전에 `캐러셀은 최대 10장인데 활성 슬라이드가 N장입니다` 로 막힌다
  → 검수 UI에서 몇 장 끄기 (zip 다운로드는 전체 장수 그대로)
- 발행하려면 **dev 서버가 켜져 있어야 한다** (당연하지만 로컬 운영의 유일한 제약)

---

# F. 리틀리 자동DM 연결 (5분 · Meta 등록 불필요 · 무료)

> A단계만 끝나 있으면 된다. B·C와 완전히 독립.

### F1. 연결

1. [litt.ly](https://litt.ly) 로그인 → **마케팅** 탭
2. **인스타 DM 자동 발송** (= DM 자동화)
3. **인스타그램 계정 연동** → 팝업에서 로그인 → 권한 허용
   - 여기 뜨는 권한 요청은 **리틀리의 Meta 앱**이 하는 것 — 내 앱을 만들 필요가 없는 이유
   - 크리에이터 계정도 자동DM 대상이다 (A1 완료 상태라 이 단계는 통과한다)
4. **댓글 키워드** 세팅
5. **DM 메시지** 입력 ← 여기에 우리 숏링크를 넣는다 (F2)
6. **댓글 자동 답글** 세팅 (선택)

> 리틀리는 자기들 서버에서 24시간 돌아간다 — **내 맥이 꺼져 있어도 자동DM은 나간다.**
> 로컬 전용인 카드뉴스 발행과 달리 이건 상시 운영이라, 둘의 성격 차이를 알고 있으면 된다

### F2. 우리 시스템과 물리는 지점 — 키워드 3곳을 같은 값으로

| 위치 | 무엇 | 화면 |
|---|---|---|
| ① 카드뉴스 캡션 | `댓글에 '프롬프트' 남기면 DM으로` 문법 생성 | `/admin/cardnews` → CTA **댓글→DM 참여형** → 댓글 키워드 |
| ② 리틀리 트리거 | 이 키워드 댓글에 DM 발송 | 리틀리 → DM 자동화 → 댓글 키워드 |
| ③ 숏링크 | DM 본문에 넣을 `/l/{code}` + 클릭 집계 | `/admin/marketing` → 링크 생성 (keyword 필드) |

**순서**: ③ 숏링크 먼저 만들고 → ② 리틀리 DM 본문에 붙이고 → ① 같은 키워드로 카드뉴스 발행.

- 숏링크는 `https://caselab-five.vercel.app/l/{code}` (본가 정본 주소)
- 클릭 집계는 본가 배포본이 처리 → **내 맥이 꺼져 있어도 집계된다**
- `CardPressManager.tsx:1313` 안내 문구가 아직 "ManyChat 코멘트 자동화에…" 로 돼 있다.
  리틀리로 갈아타면 이 문구만 바꾸면 됨 (기능 영향 없음)

---

## 트러블슈팅 — 에러 메시지별

| 증상 | 원인 | 조치 |
|---|---|---|
| `INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN 미설정` | env 미기록, 또는 드물게 리로드 누락 | C2 실행 → 터미널에 `Reload env` 확인(없으면 재시작) |
| `권한 누락: instagram_content_publish` | 탐색기 권한 체크 누락 | C1-4 다시, 토큰 재생성 |
| `IG 비즈니스 계정이 연결된 페이지를 찾지 못했습니다` | A2 미완 **또는** C1-6에서 페이지 체크 안 함 | A3 확인 → C1 재실행 |
| `Malformed access token` / `code 190` | 토큰 만료(1~2시간) 또는 복사 누락 | C1부터 다시 |
| `Unsupported get request` (발행 시) | IG 계정 id 자리에 페이지 id | 스크립트로 다시 채우기 (`--write`) |
| `발행 쿼터 조회 실패` | 권한은 있으나 실제 부여 안 됨 | B2(Instagram 제품) 확인 후 C1 재실행 |
| `캐러셀은 최대 10장인데...` | 활성 슬라이드 초과 | 검수 UI에서 슬라이드 끄기 |
| 발행 200인데 인스타에 없음 | 채널별 부분 실패 | 응답 `errors[]` 확인 |
| 이미지 로드 실패 계열 | `cardpress` 버킷이 Private으로 바뀜 | Supabase → Storage → cardpress → Public 복구 |
| 리틀리 "프로페셔널 계정이 아닙니다" | 다른 계정으로 로그인함 (A1은 완료 상태) | `@caselab_ai_` 로 로그인했는지 확인 |
| 앱 화면에 "페이지" 항목이 없음 | 크리에이터 계정에서 흔함 | A2 경로 ①(비즈니스 스위트)로 |

## 운영 중 주의 (로컬 전용 기준)

| 항목 | 내용 |
|---|---|
| 토큰 수명 | 페이지 토큰은 만료 없음. 단 **페이스북 비밀번호 변경 · 권한 회수 · 앱 삭제 시 즉시 무효**. 401 뜨면 C1~C2 재실행 |
| 점검 | 발행 전 `--verify` 한 번 = 5초 |
| 발행 쿼터 | 24시간 **100건** |
| 캐러셀 상한 | **10장** — 인스타 앱은 20장까지 되지만 API는 10장에서 막힌다 |
| 버킷 | `cardpress` **Public 유지 필수**. Private으로 바꾸면 그날로 발행 실패 |
| 스토리지 | 무료 1GB. 발행 끝난 카드의 `cardpress/{카드id}/` 는 주기적으로 삭제 |
| dev 서버 | 발행 시점에 켜져 있어야 함. 도는 중 `.next` 삭제 금지 |
| 앱 검수 | **신청하지 말 것.** 혼자 쓰는 한 불필요하고, 신청하면 사업자 인증을 요구받는다 |

---

## 부록 — 나중에 Production을 쓰게 되면

로컬 전용이면 볼 필요 없다. 나중에 Vercel(`caselab-admin`)에서도 발행하고 싶어지면:

```bash
node scripts/instagram-connect.mjs --push-vercel   # .env.local 값을 Vercel에 등록
vercel --prod                                       # 재배포해야 반영
```

- `vercel login` 을 이미 했다면 CLI 저장 토큰을 자동으로 찾아 쓴다
- CLI `vercel env add` 는 stdin 값이 빈 값으로 저장되는 버그가 있어 REST API로 넣는다
- Vercel Hobby는 함수 실행 300초 제한이 있어 슬라이드가 많으면 로컬보다 불리하다 —
  **발행만큼은 로컬이 낫다**

## 부록 — Threads 도 열려면

발행 UI의 ☑ Threads 는 별도 자격증명(`THREADS_USER_ID` / `THREADS_ACCESS_TOKEN`)을 쓴다.
**다른 API**(`graph.threads.net`)라 앱도 따로 만들어야 한다
([Threads API 문서](https://developers.facebook.com/docs/threads)). 무료지만 IG 발행에는 없어도 무방.
