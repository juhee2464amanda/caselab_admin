# 케이스랩 (Caselab) — 04 개발 계획서 v2

> 작성일: 2026-05-28
> 기획서: `docs/03_one_page_spec_v3.md` (MVP v3 확정)
> 디자인 목업: `docs/design_mockup/` (user 20개 + admin 9개 + supabase-schema.sql)
> 페르소나: `docs/personas.html` (5명 · 인터뷰 1568건 인용 기반)
> v1 → v2 변경: 점검 결과 반영 (jsonb 스키마 구체화, AI 초안 Phase 1로 이동, 댓글 MVP 포함, 누락 페이지 7개 추가, 페르소나 컴포넌트 보강 등)

---

## Context — 왜 만드는가

**문제**: "AI, 다들 쓰는데 나만 못 쓰는 것 같다"는 자기의심 루프에 빠진 5개 페르소나(기획자·전략팀·1인 사업·영업팀장·스타트업 마케터)가 공유하는 4가지 페인 — ① 그럴듯하지만 쓸 수 없는 결과물, ② AI가 오히려 시간을 잡아먹음, ③ "AI 티 나면 끝"의 사회적 시선, ④ 강의·콘텐츠 자체에 대한 깊은 불신.

**해결 가설**: 단순 프롬프트 모음이 아니라 **"일을 푸는 framework × 단계별 AI 실행 × 솔직한 후기"** 짝으로 풀어내는 매거진형 웹사이트. 콘텐츠 본문에 **시간 라벨·직무 태그·step별 의도(intent) 라벨·"별로였던 사례 ≥30%"·"본인 것으로 만드는 4단계"** 를 구조적으로 박아 페르소나 신뢰 임계를 통과한다.

**이 계획서의 결과물**: 4 Phase + 사이 스프린트(2.5)로 끊은 실행 가능 단계, Supabase 스키마 확정안, jsonb 블록 스키마, 페르소나 검증 체크리스트(자동 6 + 수동 4), Phase별 검증 방법.

---

## 결정 사항 요약

| 결정 | 선택 | v1 → v2 변경 |
|---|---|---|
| MVP 범위 | 목업 전부 포함 | 유지 |
| 콘텐츠 저장 | Supabase `contents.body` jsonb | jsonb 블록 스키마 구체 정의 추가 (4장) |
| 이메일 인프라 | Resend + Supabase Edge Function | PDF는 **Signed URL 다운로드**로 전환 |
| 개발 단계 | Phase 0~3 + 2.5 콘텐츠 스프린트 | **2.5 신설** (출시 콘텐츠 10개 작성) |
| AI 초안 버튼 | **Phase 1 포함** | v1에서 Phase 1.5로 미뤘던 것을 끌어올림 |
| 댓글 시스템 | **MVP 포함 (공개 댓글)** | v1엔 없었음 |
| 유료 전자책 PG | **출시 후 결정 (TBD)** | Phase 2/2.5 미정 |
| 첫 콘텐츠 | **계획서에 후보 3개 나열, 작업 시점 최종 결정** | 라인업 명시 |
| 언어 토글 (EN/KR) | **MVP 제외** | 목업의 GNB 토글은 비활성 |
| 다크 모드 | MVP 제외 | — |

---

## 1. 기술 스택

- **프레임워크**: Next.js 15 (App Router) + TypeScript + Tailwind CSS 3
- **UI 컴포넌트**: shadcn/ui (Dialog, Select, Textarea, Tabs, Toast) + Lucide Icons
- **폼**: React Hook Form + Zod (jsonb 직렬화)
- **렌더링**: 메인·트랙 목록·콘텐츠 상세 ISR + **On-Demand Revalidation** (`revalidateTag`), Admin·마이페이지 SSR/CSR
- **백엔드**: Supabase (Postgres + Auth + Storage + Edge Functions)
- **인증**: Google OAuth (Supabase 공식 Provider) · **Kakao OAuth (Custom: Supabase Auth + Edge Function 프록시)**
- **이메일**: Resend (API) + Supabase Edge Function 트리거 · **PDF는 Signed URL 다운로드**
- **분석**: GA4 (페이지뷰·클릭) + `events` 테이블 (비즈니스 이벤트: deep_read·copy·save·react)
- **AI 초안**: Anthropic Claude API (운영자 admin 폼) — Phase 1
- **호스팅**: Vercel + Supabase Cloud
- **에셋**: Pretendard 400/500/600/700/**800** (Bunny Fonts) — D58 (2026-06-03)로 Noto Serif KR 폐기, Pretendard 단일
- **마크다운/PDF**: remark + rehype (콘텐츠 자유 서술 블록), react-pdf (전자책 뷰어 — 필요 시)

---

## 2. 디자인 토큰 (기획서 기준으로 통일)

| 항목 | 적용 |
|---|---|
| 배경 | `#FAFAF7` |
| 본문 | `#0A0A0A` |
| 강조 | 인디고 `#1E40AF` |
| 제목 | **Pretendard 800** (D58, 2026-06-03 갱신 — 원안 Noto Serif KR 폐기, mockup 정합) |
| 본문 | Pretendard 400 |

`tailwind.config.ts`의 `colors.bg`, `colors.ink`, `colors.accent` 글로벌 토큰화. 목업의 `#191F28`, `#3182F6`, Playfair Display는 폐기. **2026-06-03 D58**: Noto Serif KR 폐기 — Pretendard 단일 로드(800 weight 추가). `font-serif` 클래스는 하위 호환 유지(매핑만 Pretendard).

---

## 3. 라우팅 전체 맵

### 유저 (`app/(public)/`)
```
/                          메인 (Hero 캐러셀 + 두 트랙 최신 + 후보 투표 미리보기)
/cases                     실전 케이스 목록
/cases/[slug]              실전 케이스 상세 (4단)
/trends                    AI 트렌드 목록
/trends/[slug]             AI 트렌드 상세 (3단)
/tools                     자료실 — 도구 카탈로그
/tools/[slug]              도구 상세
/prompts                   자료실 — 프롬프트
/guides                    자료실 — 가이드
/ebooks                    전자책 목록
/ebooks/[slug]             전자책 상세 (3D 북 디스플레이)
/ebooks/[slug]/order       전자책 주문서 (무료 = 이메일 발송 / 유료 = TBD)
/topics                    "이런 거 어때요" 후보 투표 + 제안
/opinions/new              의견 보내기 (콘텐츠 상세 모달에서도 호출)
/search                    통합 검색
/links                     인스타 → 웹 진입용 랜딩 (linktree 대체)
/login                     로그인
/onboarding                첫 로그인 후 직무 선택 + 환영
/mypage                    리다이렉트 → /mypage/profile
/mypage/profile            프로필 편집
/mypage/saved              저장 목록
/mypage/liked              좋아요 목록
/mypage/subscriptions      구독 관리
/mypage/ebooks             구매한 전자책
/mypage/support            고객센터 (1:1 문의 + FAQ + 이력)
```

### Admin (`app/admin/`)
```
/admin                     콘텐츠 목록 (필터: 발행/초안/큐레이션)
/admin/contents/new        콘텐츠 작성 (2-track 폼 + AI 초안 버튼)
/admin/contents/[id]       편집
/admin/contents/[id]/preview?token=...   Draft Preview (JWT 일회용)
/admin/users               사용자 + 상세 슬라이드 패널
/admin/opinions            의견함 (읽음 표시, 답장)
/admin/comments            댓글 모더레이션
/admin/analytics           핵심 메트릭 + Funnel
/admin/ebooks              전자책 관리 + 배송 재발송
/admin/topics              후보 카드 관리
/admin/tools               자료실 카탈로그 CRUD (tools/prompts/guides 통합)
```

**제외 (MVP)**: 언어 토글(EN/KR), 다크 모드 — 목업 UI는 보이되 비활성/숨김.

---

## 4. 콘텐츠 jsonb 블록 스키마 (확정)

`contents.body`는 다음 Zod discriminated union을 직렬화한 jsonb. **Phase 1 시작 전 필수 확정**.

```typescript
// types/content.ts
const TimeMetaSchema = z.object({ readMin: z.number(), applyMin: z.number() });
const JobTagsSchema = z.array(z.enum(['planning','marketing','sales','solo','strategy','analysis']));

const PersonaCoverageSchema = z.array(z.enum(['A','B','C','D','E']));

// 공통 블록 타입
const TextBlockSchema = z.object({ type: z.literal('text'), markdown: z.string() });
const HeadingBlockSchema = z.object({ type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3)]), text: z.string() });
const PromptBlockSchema = z.object({ type: z.literal('prompt'), label: z.string(), prompt: z.string() });
const ResultCompareBlockSchema = z.object({ type: z.literal('result-compare'), good: z.string(), bad: z.string() });
const RoleCardBlockSchema = z.object({ type: z.literal('role-card'), human: z.string(), ai: z.string() });
const IntentBoxBlockSchema = z.object({ type: z.literal('intent'), step: z.number(), text: z.string() });
const EvaluationBoxBlockSchema = z.object({ type: z.literal('evaluation'), good: z.string(), bad: z.string() });
const RebuttalBoxBlockSchema = z.object({ type: z.literal('rebuttal'), hypothesis: z.string(), counter: z.string() });
const FrameworkRefBlockSchema = z.object({ type: z.literal('framework-ref'), name: z.string(), url: z.string().optional() });
const ContextCardBlockSchema = z.object({ type: z.literal('context-card'), title: z.string(), fields: z.array(z.object({ label: z.string(), value: z.string() })) });
const FailureSectionBlockSchema = z.object({ type: z.literal('failure'), title: z.string(), blocks: z.array(z.lazy(() => BlockSchema)) });
const ChecklistBlockSchema = z.object({ type: z.literal('checklist'), title: z.string(), items: z.array(z.string()) });

const BlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema, HeadingBlockSchema, PromptBlockSchema, ResultCompareBlockSchema,
  RoleCardBlockSchema, IntentBoxBlockSchema, EvaluationBoxBlockSchema, RebuttalBoxBlockSchema,
  FrameworkRefBlockSchema, ContextCardBlockSchema, FailureSectionBlockSchema, ChecklistBlockSchema,
]);

// 실전 케이스 4단
const CaseBodySchema = z.object({
  kind: z.literal('case'),
  essence: z.array(BlockSchema),        // 1. 본질
  framework: z.array(z.object({         // 2. Framework 단계 배열
    name: z.string(),
    description: z.string(),
    intent: z.string(),                 // step별 의도(intent) — 필수
    blocks: z.array(BlockSchema),       // human/ai/prompt/result 등
  })),
  failures: z.array(BlockSchema),       // 3. 별로였던 사례 (≥30% 분량 강제)
  review: z.array(BlockSchema),         // 4. 솔직한 후기
  customization: z.array(z.string()),   // "본인 것으로 만드는 4단계" (필수, 4개)
});

// AI 트렌드 3단
const TrendBodySchema = z.object({
  kind: z.literal('trend'),
  whats_new: z.array(BlockSchema),      // 1. 뭐가 나왔나
  experiment: z.array(BlockSchema),     // 2. 직접 실험
  verdict: z.object({                   // 3. 언제 쓸만/별로
    useful: z.array(BlockSchema),
    notUseful: z.array(BlockSchema),
  }),
});

const ContentBodySchema = z.discriminatedUnion('kind', [CaseBodySchema, TrendBodySchema]);
```

**렌더러**: `lib/content-render.tsx`에서 `block.type` 기반 컴포넌트 매핑. TypeScript 타입 안전성 + 발행 전 자동 게이트(7장)가 이 스키마를 검증.

---

## 5. Supabase 스키마 (확정안)

기존 `docs/design_mockup/supabase-schema.sql`을 확장. `likes`는 `reactions`로 흡수, 외래키와 `is_admin()` 함수 추가.

### 테이블

| 테이블 | 핵심 컬럼 | 비고 |
|---|---|---|
| `profiles` | id(uuid PK→auth.users), name, email, job, role('user'\|'admin'), **onboarded(bool)**, newsletter, avatar_url | onboarded 플래그 추가 — 미들웨어에서 강제 |
| `contents` | id(uuid PK), slug(unique), track('case'\|'trend'), title, summary, **body(jsonb)**, job_tags(text[]), persona_coverage(text[]), read_min, apply_min, status('draft'\|'published'\|'archived'), curated(bool), thumbnail_url, published_at, **author_quote(text)** | author_quote = 헤더에 노출되는 1인칭 톤 인용 |
| `reactions` | id, user_id(uuid FK), content_id(uuid FK→contents), type('like'\|'up'\|'down'), unique(user_id, content_id, type) | 기존 likes 흡수 |
| `saves` | id, user_id(uuid FK), content_id(uuid FK), unique(user_id, content_id) | 기존 유지, content_id 타입 정정 |
| `comments` | id, user_id(uuid FK), content_id(uuid FK), parent_id(uuid nullable), body, status('visible'\|'hidden'\|'reported'), created_at | **신규** — 1단 reply 허용 |
| `opinions` | id, user_id(uuid nullable), content_id(uuid nullable), body, status('new'\|'read'\|'replied'), reply_body, replied_at | **익명 허용** (user_id null) — 페르소나 C |
| `events` | id, user_id(uuid nullable), content_id(uuid nullable), event_type, metadata(jsonb), created_at | 월별 파티셔닝 |
| `products` | id, slug, title, type('ebook'), price(int=0 무료), pdf_path(Storage), thumbnail_url, status | price>0은 출시 후 결정 |
| `purchases` | id, user_id(uuid FK nullable), product_id(uuid FK), name, phone, email, status('pending'\|'sent'\|'failed'), sent_at | Edge Function이 sent 처리 |
| `tools` | id, slug, name, category('tool'\|'prompt'\|'guide'\|'context-card'), description, url, pricing_tier, status | 자료실 통합 — 페르소나 C의 "맥락 카드"는 'context-card' 카테고리로 |
| `topic_suggestions`, `topic_votes` | 기존 유지 | content_id 외래키 추가 |

### 함수 / 정책

```sql
-- admin 권한 캐싱
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN (SELECT role='admin' FROM profiles WHERE id=auth.uid()); END;
$$;

-- 익명 의견 허용
CREATE POLICY "anon opinions" ON opinions FOR INSERT WITH CHECK (true);

-- 발행된 콘텐츠만 익명 SELECT
CREATE POLICY "published content" ON contents FOR SELECT USING (status='published' OR is_admin());

-- 사용자는 본인 row만, admin은 전체
CREATE POLICY "own saves" ON saves USING (user_id = auth.uid() OR is_admin());
-- (reactions, opinions, purchases, topic_votes 동일 패턴)

-- 댓글 — 공개 SELECT, 작성자만 수정/삭제, admin은 모더레이션
CREATE POLICY "visible comments" ON comments FOR SELECT USING (status='visible' OR is_admin() OR user_id=auth.uid());
```

**핸들러**: 기존 `handle_new_user()` 트리거 유지 + `onboarded=false` 기본값.

**뷰**: 기존 `admin_stats`, `content_stats`를 `reactions` 기반으로 재작성.

**파일**: `supabase/migrations/0001_init.sql` (기존 SQL + 보강안 통합)

---

## 6. 페르소나 검증 컴포넌트 매핑

콘텐츠 상세 페이지에 강제로 들어가는 컴포넌트:

| Spec / 페르소나 | 컴포넌트 | 위치 |
|---|---|---|
| 시간 라벨 (A·D) | `<TimeBadge readMin applyMin />` | 헤더 고정 |
| 직무 태그 (D) | `<JobTags />` + 목록에 **5/10/30분 칩 필터** | 헤더 + 목록 |
| 페르소나 커버리지 (전원) | `<PersonaCoverageBadge />` (A·B·C 등) | 헤더 |
| 운영자 1인칭 인용 (A) | `<AuthorQuote />` (contents.author_quote) | 첫 문단 위 |
| step별 의도 (E) | `<IntentBox step text />` | 본문 step마다 |
| 평가 기준 잘됨/별로 (E) | `<EvaluationBox good bad />` | step 안 또는 결과 비교 옆 |
| 정당화 깨기 (B) | `<RebuttalBox hypothesis counter />` | 가설 검증 케이스에 |
| 별로였던 사례 (B·C) | `<FailureSection>` (배경 강조, ≥30% 분량) | 본문 별도 섹션 |
| 맥락 카드 (C) | `<ContextCard>` | 콘텐츠 본문 + 자료실(`/tools`에 'context-card' 카테고리로) |
| 본인 것으로 만드는 4단계 (D) | `<CustomizationChecklist items />` | 콘텐츠 말미 |
| 추천 콘텐츠 (B·E) | `<RelatedSidebar>` (직무 태그 매칭) + `<RelatedCarousel>` (하단 가로) | 상세 페이지 |
| 광고 0 (C) | 본문 외부 링크 화이트리스트 정규식 검사 (발행 게이트) | 7장 |
| 공유 (전원) | `<ShareButtons>` (카카오·X·링크 복사) | 헤더 우측 |
| 댓글 (전원) | `<CommentThread>` (1단 reply, 신고) | 상세 하단 |

---

## 7. 발행 전 자동 검증 게이트 (Linter)

Admin 발행 버튼이 다음 검사를 통과해야만 활성화. `lib/content-lint.ts` 신규.

**자동 (6개)** — 통과 안 되면 발행 불가
- [ ] 시간 라벨: `read_min ≥ 1 && apply_min ≥ 1`
- [ ] 직무 태그: `job_tags.length ≥ 1`
- [ ] 페르소나 커버리지: `persona_coverage.length ≥ 1`
- [ ] 의도 라벨: framework step 수 = `IntentBox` 블록 수
- [ ] 별로 사례: failures 블록의 문자 수 ≥ 전체의 30%
- [ ] 본인 것으로 만드는 4단계: `customization.length === 4`
- [ ] 광고 링크 0: body 내 외부 URL이 허용 도메인 화이트리스트 안에만 있음

**수동 (3개)** — 발행 버튼 옆 체크박스 강제
- [ ] 1인칭 톤 ("저도 어려웠어요" 류 인용)
- [ ] 추천 사이드바·하단 캐러셀 작동 시각 확인
- [ ] 모바일 1회 직접 확인

---

## 8. Phase 0 — 인프라 (1주)

**목표**: 로컬에서 페이지 뼈대가 뜨고, Supabase Auth로 로그인이 되는 상태.

1. **Next.js 프로젝트 셋업** (`/app`, `/components`, `/lib`, `/types`)
2. **Supabase 프로젝트 + `0001_init.sql` 마이그레이션** (5장 스키마)
3. **인증**
   - Google OAuth (Supabase 공식 Provider)
   - **Kakao OAuth**: Supabase Auth + Edge Function 프록시로 구현 (Phase 0 끝에 PoC 완료해야 스케줄 리스크 제거)
   - `handle_new_user()` 트리거 + `onboarded=false` 기본
4. **미들웨어**: `/admin/*` 403 검증, 로그인 유저의 `onboarded=false`면 `/onboarding` 강제 리다이렉트
5. **공통 컴포넌트 이식**: GNB(메가메뉴 포함), Footer, Subscribe Modal, Hero Carousel을 React로
6. **shadcn/ui 셋업** + 디자인 토큰 박기

**검증**
- `npm run dev` → 메인 빈 레이아웃 + GNB
- Google·Kakao 로그인 → `profiles` row 생성 → `/onboarding` 강제
- RLS: 익명/유저/admin SELECT 각 케이스 SQL Editor에서 확인

---

## 9. Phase 1 — 콘텐츠 시스템 + AI 초안 (3주)

**목표**: 운영자가 콘텐츠 1개를 admin 폼으로 작성·발행하면 유저가 메인 → 목록 → 상세 → 저장/반응/댓글까지 흘러갈 수 있는 상태.

### 작업
1. **`contents` jsonb 블록 스키마 Zod 정의** (4장)
2. **렌더러** `lib/content-render.tsx` — block.type → React 컴포넌트
3. **목록 페이지** (`/cases`, `/trends`) — 사이드바 필터 (직무·기간) + **5/10/30분 칩**
4. **상세 페이지** (`/cases/[slug]`, `/trends/[slug]`) — TOC, RelatedSidebar, RelatedCarousel, ShareButtons, CommentThread
5. **저장 / 반응 / 댓글** — DB 연동
6. **온보딩** (`/onboarding`) — 직무 선택 → `profiles.job + onboarded=true`
7. **마이페이지 6개 패널**
8. **검색 페이지** (`/search`) — title·summary·tags 전문 검색 (Postgres full-text)
9. **인스타 → 웹 랜딩** (`/links`) — UTM 파싱 + 콘텐츠 추천
10. **GNB 메가메뉴 + 모바일 햄버거**
11. **AI 초안 버튼 (Admin)** — Anthropic Claude API 호출, 트랙별 4단/3단 jsonb 초안 생성, 운영자 검수 후 저장
12. **On-Demand Revalidation**: 발행 시 `revalidateTag('content-${id}')`, `revalidateTag('list-${track}')`, `revalidateTag('home')`

### 검증
- Admin 폼 → AI 초안 → 검수 → 발행 → 메인·목록·상세 즉시 반영(60초 대기 X)
- **페르소나 검증 체크리스트 자동 6개 통과**
- 댓글 작성·신고 → admin moderation에서 보임

---

## 10. Phase 2 — 전자책 + 의견함 + 후보 투표 (1.5주)

**목표**: 리드 마그넷(무료 전자책)으로 이메일 수집, 운영자 ↔ 유저 양방향 흐름 가동.

1. **무료 전자책 흐름**: `/ebooks` → `/ebooks/[slug]` (3D 북 디스플레이) → `/ebooks/[slug]/order` → `purchases` insert → Edge Function → **Resend로 Signed URL 다운로드 링크 발송** (PDF 첨부 X)
2. **PDF 저장**: Supabase Storage `ebooks/` 버킷 + 7일 Signed URL
3. **의견함**: `opinions` 테이블 + 콘텐츠 상세에서도 모달 호출 + **익명 허용**
4. **후보 투표**: `topic_suggestions`·`topic_votes` + 메인 노출
5. **고객센터** (`/mypage/support`): FAQ + 1:1 문의 (의견함과 통합) + 이력
6. **이메일 템플릿** (Resend React Email): 운영자 1인칭 톤 — "저도 처음엔..." 인사말 통일
7. **DKIM/SPF 도메인 설정** (caselab 도메인)

**검증**: 본인 이메일로 주문 → 30초 내 Signed URL 도착 → 다운로드 성공

---

## 11. Phase 2.5 — 콘텐츠 작성 dry-run 스프린트 (1주, 신설)

**목표**: 출시 콘텐츠 10개를 Admin 폼으로 실제로 작성하면서 폼 UX·자동 게이트·렌더링을 검증.

### 첫 콘텐츠 후보 3개 (작업 시점에 운영자 최종 결정)
1. **"빈 입력칸 앞에서 머리가 하얘질 때 — 같이 첫 한 줄 쓰는 5단계"** (페르소나 1순위 ⭐, A·B·C·D·E 5명 전원 커버)
2. **"AI가 정당화만 한다? 반박시키는 4가지 지시법"** (페르소나 2순위, B·D 커버)
3. **"클라이언트 제안서 — 매번 새로 쓰지 말고 '맥락 카드' 만들기"** (페르소나 3순위, C·D 커버)

→ 운영자가 가장 자신 있는 케이스로 최종 결정.

### 작업
- 콘텐츠 10개 작성 (운영자 직접, AI 초안 활용)
- 작성 중 발견되는 폼 UX 이슈 → 즉시 fix (자동저장, 임시저장 복구, 키보드 단축키)
- 발행 전 자동 게이트 통과 확인
- 각 콘텐츠마다 페르소나 검증 체크리스트 수동 3개 통과

**검증**: 10개 모두 `status='published'` 상태로 메인 노출, 페르소나 5명 각각 "내 페인 풀어주나?" 더블체크

---

## 12. Phase 3 — Admin + 분석 + 자료실 (2주)

**목표**: 운영자가 GUI로만 콘텐츠·자료실·전자책·의견·댓글·분석 모두 운영.

1. **2-Track 콘텐츠 입력 폼** (admin/new.html UX 재현)
   - 자동: slug, 읽기시간 계산, 본문 키워드 기반 태그 제안
   - Preview 모달 (데스크톱/모바일)
   - 자동저장 (localStorage + DB draft) + 임시저장 복구
   - **Draft Preview** (JWT 일회용 토큰 URL)
   - **글 톤 가이드 사이드바** (페르소나별 인용 예시)
2. **자료실 CRUD** — tools/prompts/guides + 'context-card' 카테고리 통합 관리
3. **사용자 상세 슬라이드 패널** (저장·열람·구매 이력)
4. **의견·댓글 모더레이션**
5. **분석 대시보드** — Funnel (PV → deep_read → copy → save → react)
   - `deep_read` 정의: Intersection Observer 본문 70% 이상 + 10초 체류
6. **이메일 답장** (Resend Reply To)
7. **자동 검증 게이트(linter)** (7장)

**검증**: 신규 콘텐츠 작성 → 자동 게이트 통과 → 발행 → ISR 재검증 → 유저 페이지 노출

---

## 13. 폴더 구조

```
caselab/
├── app/
│   ├── (public)/             메인·cases·trends·tools·prompts·guides·ebooks·topics·opinions·search·links·login·onboarding·mypage
│   ├── admin/                contents·users·opinions·comments·analytics·ebooks·topics·tools
│   ├── api/                  revalidate·ai-draft·resend-webhook
│   └── auth/callback/
├── components/
│   ├── content/              TimeBadge, JobTags, PersonaCoverageBadge, AuthorQuote,
│   │                         IntentBox, EvaluationBox, RebuttalBox, FailureSection,
│   │                         ContextCard, CustomizationChecklist, PromptBlock, ResultCompare,
│   │                         RoleCard, FrameworkRef, RelatedSidebar, RelatedCarousel,
│   │                         ShareButtons, CommentThread
│   ├── layout/               GNB, MegaMenu, MobileNav, Footer, SubscribeModal, HeroCarousel
│   ├── admin/                TrackForm, FrameworkStepEditor, AIDraftButton,
│   │                         PreviewModal, LinterGate, ToneGuideSidebar
│   └── ui/                   shadcn/ui 베이스
├── lib/
│   ├── supabase/             server.ts, client.ts, admin.ts
│   ├── content-render.tsx    jsonb body → React 트리
│   ├── content-lint.ts       발행 전 자동 검증 (6개)
│   ├── ai-draft.ts           Anthropic Claude API 호출 (트랙별 프롬프트)
│   ├── email/                Resend client + React Email 템플릿
│   └── analytics/            deep_read observer, GA4 wrapper
├── types/
│   └── content.ts            BlockSchema, ContentBodySchema (Zod)
└── supabase/
    ├── migrations/0001_init.sql
    └── functions/
        ├── kakao-oauth/      Custom OAuth proxy
        └── send-ebook/       PDF Signed URL 이메일
```

---

## 14. 페르소나 검증 체크리스트 (출시 전 필수)

자동 6개 + 수동 4개 + 운영 원칙 2개 = **12개**.

**자동 (linter)**:
1. [ ] 읽기/적용 시간 라벨 노출 (A·D)
2. [ ] 직무 태그 ≥1 + 5/10/30분 칩 필터 작동 (D)
3. [ ] step별 IntentBox 수 = step 수 (E)
4. [ ] FailureSection 분량 ≥ 30% (B·C)
5. [ ] CustomizationChecklist 4개 항목 (D)
6. [ ] 광고/유료 강의 외부 링크 0 (C)

**수동**:
7. [ ] 운영자 1인칭 톤 (AuthorQuote + 본문) (A)
8. [ ] RelatedSidebar/Carousel 작동 (B·E)
9. [ ] 모바일에서 본문/CommentThread/ShareButtons 정상 (전원)
10. [ ] PersonaCoverageBadge가 콘텐츠 실 효용과 일치 (전원)

**운영 원칙**:
11. [ ] 출시 시 콘텐츠 10개 발행 완료 (Phase 2.5)
12. [ ] 인스타 → `/links` → 콘텐츠 동선 1회 직접 테스트

---

## 15. 검증 방법 (End-to-End)

### Phase 0
- 메인 빈 레이아웃 + GNB · Google·Kakao 로그인 · `/onboarding` 강제 · RLS 401 확인

### Phase 1
- Admin 폼 → AI 초안 생성 → 검수 후 발행 → 메인·목록·상세 즉시 반영
- 자동 6개 게이트 통과 + 댓글·공유·반응 동작
- Lighthouse: 콘텐츠 상세 Performance ≥85, Accessibility ≥95

### Phase 2
- 본인 이메일로 무료 전자책 주문 → 30초 내 Signed URL 도착 → 다운로드
- 익명 의견 작성 → Supabase Studio row 확인 → admin 답장
- 후보 카드 투표 → vote_count 증가 + 재방문 시 토글 유지

### Phase 2.5
- 콘텐츠 10개 발행 + 각 콘텐츠 페르소나 검증 12개 통과
- 메인이 안 비어 보이는 시각 검수

### Phase 3
- 시크릿 창 일반 계정 `/admin` → 403
- Admin 신규 작성 → linter 게이트 통과 → 발행 → ISR 재검증 확인
- Funnel 차트가 실제 events와 일치 · 이메일 답장 동작

### 출시 전 최종
- 페르소나 검증 12개 모두 통과 (콘텐츠 10개 × 12개 = 120체크)
- 모바일 직접 확인 (iPhone Safari · Android Chrome)
- 인스타 프로필 → `/links` → 콘텐츠 동선 1회 직접 테스트

---

## 16. 향후 (출시 이후)

- **유료 전자책 PG 결제**: 토스페이먼츠 또는 포트원, 같은 order 흐름에 결제 단계 추가 (운영 데이터 보고 시점 결정)
- **뉴스레터 발송**: 페르소나 B·D 인스타 밖 채널 대응
- **언어 토글 (EN/KR)**: 글로벌 검토 시
- **콘텐츠 추천 알고리즘 고도화**: 직무·상황·시간 매칭
- **다크 모드**: 사용자 요청 시
- **댓글 1단 → 멀티 스레드 확장**: 활성도 보고

---

## 17. 첫 한 주 우선순위

1. Supabase 프로젝트 + `0001_init.sql` (5장 스키마 그대로)
2. Next.js + shadcn/ui + 디자인 토큰
3. GNB + 메인 + 로그인 3개 페이지 동작
4. **Google + Kakao OAuth PoC 완료** (Kakao 스케줄 리스크 제거)
5. `onboarded` 미들웨어
→ Phase 1 진입

---

## 18. Decisions Log — 출시 시점 결정 변경 (2026-06-02)

> 본 문서 §1~§17은 **원본 기획 의도**. 아래는 출시를 앞두고 “운영비 부담·우선순위·리스크”를 따져 변경한 **실제 출시 시점 결정**. 코드·런북은 이 결정을 반영함. 다른 세션에서 컨텍스트 파악할 때 **이 섹션 + `docs/05_launch_runbook.md`가 최신 정본**.

### 18.1 “돈 0원 출시” 모드 — 외부 SaaS 결정

| 항목 | §1~§17 기획 | **출시 결정 (정본)** | 이유 |
|---|---|---|---|
| 도메인 | `caselab.kr` 또는 `caselab.co` | **Vercel 무료 서브도메인** (`caselab.vercel.app`) | 운영자 1년 운영비 $0 달성. 사이트 자리잡으면 그때 도메인 검토 |
| Cloudflare | 사용 (Registrar+DNS) | **사용 안 함** | 도메인 없으니 불필요 |
| Resend (이메일 발송) | Phase 2 도입 | **사용 안 함** → **Brevo 단일 발신자 인증으로 대체** (Day 9) | 자체 도메인 없이 Resend 사용 불가. Brevo는 단일 발신자 인증으로 도메인 없이 외부 발송 가능 + 트랜잭션/캠페인 통합 + 무료 9k/월 |
| Anthropic Claude API (AI 초안) | Phase 1 포함 (§9 11번 항목) | **비활성** (`NEXT_PUBLIC_AI_DRAFT_ENABLED='true'` 시만 활성) | 운영자가 Claude Max 구독 보유. Max에서 직접 초안 작성 → admin 폼 복붙 워크플로우로 대체 |
| 발신 메일 | `official@<도메인>` | (없음) | Resend 미사용 |
| 답신·문의 메일 | `official@<도메인>` reply-to | **`caselab.kr@gmail.com`** (직접 표기) | 운영자 보유한 유일한 메일. Privacy/Footer에도 직접 노출 |
| Kakao OAuth | Day 2 필수 | Day 2 선택 (출시 직전 또는 출시 후) | Edge Function 배포 단계 줄여 출시까지 단축 |

### 18.2 그대로 유지되는 결정 (§1~§17 기획대로)

- Next.js 15 (App Router) + TypeScript + Tailwind 3
- Supabase (Postgres + Auth + Storage + Edge Functions) — 무료 플랜
- Vercel (Hobby 무료 플랜)
- Google OAuth
- GA4 (쿠키 동의 후 활성)
- 페르소나 검증 12개 체크리스트 (§14)
- 콘텐츠 jsonb 블록 스키마 (§4)
- Supabase 스키마 (§5) — `0001_init.sql` 그대로
- 발행 게이트 자동 6 + 수동 3 (§7)
- “1인칭 톤 × Framework × failures ≥ 30% × customization 4단계” 콘텐츠 구조

### 18.3 출시 후 도입 결정 트리거

| 항목 | 도입 시점 |
|---|---|
| 커스텀 도메인 (Cloudflare 또는 가비아) | 인스타 유입 안정화 + 브랜드 강화 필요 시 |
| Brevo 도메인 인증 (DKIM/SPF로 격상) | 구독자 500명 / 월 발송 8,000건 / 스팸 불만 / 딜리버러빌리티 < 80% 도달 시 (도메인 구입 동반) |
| Resend (이메일 발송 인프라 강화) | Brevo 한도(월 9k) 초과 + 도메인 도입 후 추가 전환 검토 |
| Anthropic Claude API (AI 초안) | 콘텐츠 월 5건+ 안정화 + Max 복붙 피로 누적 |
| 카드뉴스·외부 채널 (Brunch·LinkedIn) | 출시 +1~6개월, 인스타 채널 안정화 후 |
| Lighthouse 90+ 폴리싱 | 출시 +1주, GA4·events 데이터 보고 |

### 18.4 핵심 추가 사항 (§1~§17 외)

- **인스타그램 핸들**: `@caselab_ai_` (URL: `https://instagram.com/caselab_ai_`)
- **사이트 → 인스타 동선**: GNB 우상단 아이콘 + Footer 2곳 노출 (`lib/constants.ts`에서 중앙 관리)
- **보강 SEO**: `app/icon.tsx`, `app/opengraph-image.tsx`, `app/robots.ts`, `app/sitemap.ts`
- **법무 페이지**: `/legal/privacy`, `/legal/terms` (코드 직접 수정 방식, admin GUI 편집기는 보류)
- **분석**: GA4 + `events.deep_read` (Intersection Observer 70% + 10s)
- **쿠키 동의 배너**: `components/analytics/CookieConsent.tsx` — 동의 후 GA4 활성

### 18.5 결정 변경 이력 (요약)

- 2026-05-28: 본 dev plan v2 작성
- 2026-05-30~31: Phase 0+1 코드 작성 완료, GitHub Issue #1~#10 등록, 런북 `docs/05_launch_runbook.md` 작성
- 2026-06-01: 도메인 caselab.kr → caselab.co → Vercel 무료 서브도메인. Cloudflare 사용 안 함. Anthropic 비활성. 운영비 $0 모드 확정
- 2026-06-02: Resend → Gmail SMTP로 교체 (전자책 1건이라도 발송되도록). 인스타 `@caselab_ai_` 핸들 확정 + 사이트 노출
- 2026-06-02: **Gmail SMTP → Brevo로 재전환**. 사유: 약관(개인 Gmail 자동 발송 회색지대) + 딜리버러빌리티(Gmail은 자기 도메인 DKIM 못 박음). Brevo 단일 발신자 인증으로 caselab.kr@gmail.com 발신 유지, 일 300건/월 9k 무료, Edge Function 아키텍처 유지(denomailer → Brevo HTTP API fetch)
- 2026-06-02: **자료실(`/admin/tools`) CRUD 우선 진행 결정** — §18.7 참조
- 2026-06-02: **Admin 영역 모바일 일괄 적용** — §18.8 참조 (AdminSidebar 드로어 + 8개 페이지 패딩·테이블 overflow + 폼 헤더 wrap)

### 18.6 다른 세션에서 컨텍스트 파악 시 우선순위

1. **`docs/04_dev_plan.md` §18** (본 섹션) — 출시 시점 결정 변경 요약
2. **`docs/05_launch_runbook.md`** — Day 0~12 단계별 작업 (정본)
3. **`docs/07_handoff_prompt.md`** — 다른 세션에 컨텍스트 한 번에 전달용 프롬프트
4. **GitHub Issue #1~#10** — 외부 콘솔 작업 체크리스트 + 변경 코멘트
5. `lib/constants.ts` — 인스타 핸들·문의 메일 등 외부 상수 중앙 관리
6. `.env.example` — 환경변수 템플릿 (출시 결정 반영)

### 18.7 자료실 (`/admin/tools`) CRUD 우선 진행 결정

**결정 일자**: 2026-06-02

**배경**: §12 Phase 3에 "자료실 CRUD"가 포함되어 있으나, 원래 페이지 자체가 빈 스켈레톤(`app/admin/tools/page.tsx` 코드 주석 "Phase 3에서 추가")이라 운영자는 Supabase Studio에서 직접 행 편집해야 했음. 출시 전 콘텐츠 작성(Day 3~7) 흐름과 병행해서 도구·프롬프트·가이드를 등록할 수 없으면 출시 초기 자료실이 비어 있는 채로 노출됨.

**결정**: Phase 3에서 다루기로 한 자료실 CRUD를 **출시 전(Day 3~7 콘텐츠 작성과 병행)**으로 당김. 작업 범위:
- `components/admin/ToolForm.tsx` (신설) — Case/Trend 패턴 축약 폼
- `app/admin/tools/new/page.tsx` + `app/admin/tools/[id]/page.tsx` (신설)
- `app/admin/tools/page.tsx` (수정) — "+ 새 자료" 링크 + 행 클릭 이동
- `app/api/revalidate/route.ts` (수정) — `kind: 'tool'` 분기 추가

**미포함**: 사용자 패널 슬라이드(`/admin/users`), 댓글 모더레이션 풀세트, ISR 결과 가시화 등 §12의 나머지는 출시 후 진행.

### 18.8 Admin 영역 모바일 일괄 적용

**결정 일자**: 2026-06-02

**배경**: §7 발행 게이트 수동 검사·§14 페르소나 검증·runbook Day 11에 "모바일 1회 직접 확인" 명시되어 있으나, admin 영역은 사이드바(`w-56` 고정) + 페이지 패딩(`p-8` 고정) + 테이블(`overflow-x-auto` 없음) 패턴이 일괄적으로 모바일 미대응. 자료실 CRUD 추가하면서 동일 패턴이 새 코드에도 들어가는 문제 발견.

**결정**: Admin 영역 모바일 대응 일괄 적용.
- `components/admin/AdminSidebar.tsx` — 데스크탑(`hidden lg:block`) + 모바일 햄버거 상단 바 + 슬라이드 드로어 분기
- `app/admin/layout.tsx` — `flex` → `lg:flex`로 변경
- `app/admin/{page,comments,users,opinions,analytics,topics,ebooks,tools}/page.tsx` — `p-8` → `p-4 sm:p-8`, 테이블 `overflow-x-auto` + `min-w-[640~720px]`, 헤더 `flex-col sm:flex-row`
- `components/admin/{TrackForm,ToolForm}.tsx` — 동일 패턴 적용

**미포함**: 모바일 전용 UI/UX 재설계(컬럼 우선순위 조정, 행 액션 메뉴 등)는 출시 후 데이터 보고 점진 개선.

### 18.9 Analytics 보강 — GA4 명시 매핑 + Consent Mode v2 + Speed Insights

**결정 일자**: 2026-06-02

**배경**: §14 페르소나 검증·§4 콘텐츠 액션(`prompt_copy`, `deep_read`, `save`, 전자책 주문)이 자체 `events` 테이블로만 적재되고 GA4 event name 매핑이 코드 곳곳에 흩어져 있음 (`lib/analytics/deep-read.ts` 안에 `track('deep_read', ...)` 인라인). GA4 표준 ecommerce 매핑·Consent Mode v2·Lighthouse 실측 보강이 출시 전 비어 있음.

**결정 표 (4건)**:

| # | 결정 | 슬롯 | 영향 |
|---|---|---|---|
| **D21** | events 적재 wrapper(`lib/analytics/track.ts`)에 GA4 event name 매핑을 한 곳에 정의. `prompt_copy → 'prompt_copy'`, `ebook_order → 'purchase'` (Phase 4부터), `deep_read → 'deep_read'`, `cta_click → 'cta_click'`, `scroll_25/50/100 → 'scroll'` | **P0 (Day 2-B)** | 기존 `deep-read.ts`의 인라인 `track()` 호출을 wrapper 경유로 점진 이전. cross-cutting (`scroll_25/50/100` EventType 신설) |
| **D22** | Vercel Web Analytics 도입 **보류** (출시 후 재검토) | P1 (검토만) | GA4와 ~80% 중복. Hobby 2,500 events/월 한도가 트래픽 1,000 DAU만 넘어도 초과. Consent Mode v2가 GA4 cookieless modeling을 보강해줘서 별도 도입 효용 낮음 |
| **D23** | GA4 ecommerce `purchase` event fire 시점 = **Phase 4 (PG 도입)** | Phase 4 | 현재 전자책은 price=0 무료라 'purchase' 의미가 약함. PG 도입 시점에 `value`, `currency`, `transaction_id` 정식 매핑 |
| **D24** | Vercel Speed Insights **P0 도입** (`<SpeedInsights />` 1줄) | **P0 (Day 2-B, 1줄)** | Lighthouse(`§18.3`)는 합성 측정, Speed Insights는 실 사용자 측정. 운영자 "사이트 느림" 신호 자체 감지 |

**미포함**:
- D23 ecommerce는 Phase 4 PG 도입 시 다시 다룸. 출시 시점엔 전자책 주문이 events.ebook_order로만 적재됨
- GA4 server-side measurement (Measurement Protocol)은 검토 안 함

**영향받는 파일**:
- `lib/analytics/track.ts` (신설)
- `lib/analytics/utm.ts` (신설, [[D25]]와 연동)
- `lib/analytics/scroll-tracker.ts` (신설)
- `components/analytics/GA4Provider.tsx` (Consent Mode v2 패치 — default denied → update granted)
- `app/layout.tsx` (`<SpeedInsights />` 추가)
- `package.json` (`@vercel/speed-insights` 추가)
- `lib/analytics/deep-read.ts` (점진 — wrapper 경유로 변경, 이번 세션엔 보류)

### 18.10 UTM Builder + 채널 마스터 (categories 테이블 신설)

**결정 일자**: 2026-06-02

**배경**: 운영자가 인스타·뉴스레터·카카오톡 등에 URL을 뿌릴 때 매번 UTM 파라미터를 손으로 조합하면 표기 불일치(`Instagram`/`instagram`/`IG`)로 GA4 통계가 분산됨. 또한 `/admin/analytics`에서 채널별 conversion rate 분석이 불가능. 한편 §3 라우팅 맵에 `categories` 테이블이 명시적으로 없고, 콘텐츠/도구 카테고리는 `tools.category text` 컬럼으로 분산되어 있음.

**결정 표 (2건)**:

| # | 결정 | 슬롯 | 영향 |
|---|---|---|---|
| **D25** | UTM Builder admin 페이지 **중간 수준** (생성 폼 + 히스토리 + 클릭 수) 신설 — `/admin/utm` | **P1 (1일)** | `utm_links` 테이블 + Server Action + 히스토리 테이블 + 클릭 수 = `events.metadata->>'utm_campaign'` GROUP BY. QR 코드/시각화/conversion rate는 P2 |
| **D26** | 채널 마스터 = **`categories` 테이블 신설** + `type='utm_channel'` + `metadata jsonb`에 `{source, medium, content_template}` 매핑. 초기 10건 seed | **0003 마이그레이션** | `categories` 테이블 자체는 신설 (현재 코드 0001/0002에 없음). type 컬럼으로 향후 확장 가능 (`'content'`, `'tool'` 등으로 D13 자유도 통합 여지) |

**미포함 (P2 / 향후)**:
- QR 코드 생성 (`qrcode.react`)
- 채널별 시각화 차트
- conversion rate 계산 (`utm_campaign` → `ebook_order` funnel)
- `tools.category` → `categories` 마이그레이션 (현재 enum text 그대로 유지. D13 작업 시점에 이관)

**영향받는 파일**:
- `supabase/migrations/0003_utm.sql` (신설)
- `app/admin/utm/page.tsx` (신설)
- `app/admin/utm/UtmBuilderForm.tsx` (신설, Client Component)
- `app/admin/utm/actions.ts` (신설, Server Action `createUtmLink`)
- `lib/utm/build-url.ts` (신설, pure function)
- `lib/supabase/middleware.ts` (`ADMIN_ONLY_PREFIXES` 또는 editor 허용 분기 — 자료실 운영자 권한 결정)
- `docs/05_launch_runbook.md` Day 1 Step 3 (0003 적용 라인 추가)

**핵심 파이프라인 (자동 연결)**:

1. 운영자 → `/admin/utm` 채널 선택 → 캠페인 입력 → [링크 생성]
2. `utm_links` row 저장 + 완성 URL 복사
3. 운영자 → 인스타/뉴스레터에 URL 뿌림
4. 사용자 URL 클릭 → 사이트 진입 → `utm.ts`가 URL 파싱 → sessionStorage 저장
5. 사용자 액션(view/copy/save) → `track.ts` wrapper가 `events.metadata`에 `utm_source/medium/campaign` 자동 병합 적재
6. `/admin/utm` 히스토리 → `events` GROUP BY `metadata->>'utm_campaign'` → 클릭 수 자동 표시
7. `/admin/analytics`에서 채널별 conversion 분석 가능

---

## 19. Admin 풀스택 결정 매트릭스 (정합본)

**결정 일자**: 2026-05-28 ~ 2026-06-02 (점진)
**최신 갱신**: 2026-06-02 — Phase A-0.2 인터뷰 7개 영역 완료. D7/D13/§5-7 갱신, D18/D20 폐기, D27~D49 신규.

> **본 §19의 위상**: 출시 전 admin 영역 전체에 들어가야 할 결정 매트릭스의 **정합본**. 본 표가 admin 결정의 source of truth. 본문은 [[docs/06_admin_dev_plan.md]] (admin 개발 계획서)에서 풀어 씀.
>
> **신뢰도 표기**:
> - ✅ = 0002 SQL / 0003 SQL / 코드에 결정 결과 살아있음 (high confidence)
> - 📋 = roadmap·캡처에 흐름만 (medium confidence)
> - 🆕 = 인터뷰 결정, 코드 미적용 (Phase 4 실행 예정)
> - ⛔ = 폐기 (단서 없음, 새 결정으로 대체 안 함)

### 19.1 결정표 D1~D68

| # | 영역 | 결정 | 슬롯 | 신뢰도 / 출처 |
|---|---|---|---|---|
| D1 | 댓글 | `comments.moderation_note` 컬럼 + 모더레이션 UI (admin/comments) | P0 | ✅ 0002 §1-1 |
| D2 | 의견함 | `/admin/opinions` 답장 = **Edge Function + Brevo Transactional API** (0002 §6 send-ebook 패턴 재사용). D3 messageId 자동 저장 | P0 (Day 6) | 🆕 영역 6 인터뷰. D31에서도 본문 명세 |
| D3 | 의견함 | `opinions.reply_email_id` Brevo messageId 추적 | P0 | ✅ 0002 §1-2 |
| D4 | 사용자 | `profiles.admin_note` (운영자 메모) + `analytics_consent` (분석 동의 토글) | **P0 (Day 5, D6과 함께 출시 포함)** ⬆ | ✅ 0002 §1-3 + 🆕 영역 3 → 2026-06-02 격상 |
| D5 | 분석 | **북극성 = 주간 prompt_copy UV** (저장률·도움률은 보조). KPI 5종 view/RPC (`weekly_kpi` view, `get_north_star()`, `get_daily_trend()`) | P0 (Day 3~4) | ✅ 0002 §5 + 🆕 영역 1 (북극성 확정) |
| D6 | 사용자 | 사용자 슬라이드 패널 (`/admin/users/[id]`) — 행동·구매·동의·admin_note 한눈에 | **P0 (Day 5, 출시 포함)** ⬆ | 📋 0002_SETUP roadmap → 2026-06-02 격상 |
| D7 | 콘텐츠 | 콘텐츠 폼 안전망 **8개** = 자동 저장 / 슬러그 충돌 체크 / 미리보기 / 발행 게이트 시각화 / **이미지 alt 누락 경고** / **필수 메타 미입력 잠금** / **본문 변경 unsaved 경고** / **동시 편집 충돌 감지(updated_at 비교)** | P0 (Day 7~8) | 🆕 영역 1 인터뷰 (8개 다 채택) |
| D8 | 전자책 | DB Trigger 전자책 자동 발송 (`purchases` insert → `send-ebook` Edge Function `pg_net.http_post`) | P0 | ✅ 0002 §6 |
| D9 | 폴리시 | 댓글 폴리시 = **신고 N건 누적 시 자동 `status='hidden'`** (N=3 임시) + admin/comments 차고 알림 + 운영자 'visible' 환원 또는 제거. RLS 동반 | P0 (Day 9~10) | 🆕 영역 6 + 📋 0002_SETUP roadmap |
| D10 | 폴리시 | 후보 카드 (`/admin/topics`) / 자료실 (`/admin/tools`) / 전자책 (`/admin/ebooks`) 폴리시 — RLS + 모더레이션 + 워크플로우 | P0 (Day 9~10) | 📋 §18.7 (tools) + roadmap |
| D11 | 운영 | Day 11 1회 DB 설정 (`alter database postgres set app.send_ebook_url = ...` × 3) | P0 (Day 11) | ✅ 0002 §끝 |
| D12 | 출시 | Day 12 출시 게이트 = 페르소나 검증 12개 + 자동 **8** / 수동 3 게이트 (D7 8개로 확장) | P0 (Day 12) | ✅ §14 + runbook Day 12 + 🆕 영역 1 |
| D13 | 콘텐츠/도구 | **카테고리·태그 풀 분류** — ①타입(`contents.track` + `tools.category` 유지) + ②세부 카테고리(`categories` 테이블 `type='content_subcategory'/'tool_subcategory'` + `parent_track`) + ③주제 태그(`tags` + `content_tags`/`tool_tags` m:n). **운영자 전용** (사용자 메뉴 노출 X). | P0 (0003) | 🆕 영역 1 인터뷰 + D26 통합 (§19.6) |
| D14 | 결제 | `purchases` PG 결제 hook 컬럼 미리 (`payment_method`, `payment_id`, `refund_status`, `refund_at`) | P0 (Phase 4 PG 대비) | ✅ 0002 §1-4 |
| D15 | 운영 | `featured_contents` Hero 큐레이션 테이블 + 슬롯 12개 (1: hero, 2~4: highlight, 5~12: 일반) | P0 (Day 5) | ✅ 0002 §3 |
| D16 | 운영 | `admin_notifications` view — 사이드바 배지 + 종 드롭다운 원천. **발화 조건 7건** = 의견 미답 / 신고 댓글 / 실패 결제 / 열린 후보 + 신규 가입자 N명/일·주 + 전자책 주문 신규(건별) + 특정 카테고리·태그 prompt_copy 급등 | P0 | ✅ 0002 §4 + 🆕 영역 1 (추가 3건) |
| D17 | 권한 | `role` enum 확장: `user \| editor \| admin`. editor = 콘텐츠/자료실/토픽 운영. admin = 전체 + 분석/사용자/매출/설정. middleware `ADMIN_ONLY_PREFIXES` 분기 | P0 | ✅ 0002 §2 + `lib/supabase/middleware.ts` |
| ~~D18~~ | ⛔ 폐기 | 단서 없음. 영역 7 인터뷰 결과 새 결정으로 대체 안 함. 향후 메모 발견 시 신규 번호(D50+)로 박음 | — | ⛔ |
| D19 | 메일 | DB Trigger Brevo Contact 자동 동기화 (`profiles.newsletter=true` 사용자 → Brevo Contact API 등록) | P0 (Day 9 연계) | ✅ 0002 §7 |
| ~~D20~~ | ⛔ 폐기 | 단서 없음. 영역 7 인터뷰 결과 새 결정으로 대체 안 함 | — | ⛔ |
| D21 | 분석 | events 적재 wrapper(`lib/analytics/track.ts`) GA4 매핑 한 곳 정의 | P0 (Day 2-B) | §18.9 ✅ |
| D22 | 분석 | Vercel Web Analytics 도입 보류 | P1 (검토만) | §18.9 ✅ |
| D23 | 분석 | GA4 ecommerce `purchase` fire 시점 = Phase 4 (PG) | Phase 4 | §18.9 ✅ |
| D24 | 분석 | Vercel Speed Insights P0 도입 | P0 (Day 2-B) | §18.9 ✅ |
| D25 | 운영 | UTM Builder admin 페이지 중간 수준 (`/admin/utm`) | **P0 (Day 11, 출시 포함)** ⬆ | §18.10 ✅ → 2026-06-02 격상 |
| D26 | 운영 | 채널 마스터 = `categories` 테이블 신설 + `type='utm_channel'` seed 10건 | P0 (0003) | §18.10 ✅ + D13과 통합 |
| D27 | 콘텐츠/권한 | **§5-7 발행자 필드 = 출시부터 UI 부활** (admin/new·edit 발행자 드롭다운, 운영자 default + editor 선택 가능). DB 컬럼 유지. D47 editor 게스트 기고 P0와 정합 | P0 | 🆕 영역 1+7 정합 |
| D28 | 댓글 | D9 자동 hide 임계치 N=3 (운영 데이터 보고 조정) | P0 | 🆕 영역 6 |
| D29 | 운영 | `/admin/topics` 후보 카드 → **'draft 변환' 버튼** (수동, 1클릭 contents draft 복사). 자동 변환은 P2 | P0 (Day 9~10) | 🆕 영역 6 |
| D30 | 콘텐츠/도구 | categories·tags 신설 UX = **둘 다** (`/admin/categories` 관리 페이지 + TrackForm·ToolForm 즉석 입력) | P0 (Day 7~8) | 🆕 영역 6 |
| D31 | 의견함 | D2 답장 = **Edge Function + Brevo Transactional API** (D3 messageId 자동 저장) | P0 (Day 6) | 🆕 영역 6 |
| D32 | 분석 | D5 북극성 = 주간 prompt_copy UV 확정 (저장률·도움률 보조). D5 row에 통합 표시 | P0 | 🆕 영역 1 (D5와 동치) |
| D33 | 분석 | §5-5 admin 유입 패널 = **출시 시점 P0 — GA4 Data API 연동**. admin/analytics 안에 채널·UTM 패널 | P0 (Phase 4 작업) | 🆕 영역 1 |
| D34 | 운영 | D16 알림 추가 조건 3건 (D16 row에 통합 표시) | P0 | 🆕 영역 1 (D16과 동치) |
| D35 | 분석 | 콘텐츠 분석 화면 **4종 breakdown 다 P0** = 개별 표 + 타입×세부카테고리 + 태그별 + 페르소나별 | P0 | 🆕 영역 2 |
| D36 | 분석 | 발행 게이트(자동 8) ↔ KPI 매칭 그래프 P0 — "failures ≥30% 통과" 콘텐츠 평균 prompt_copy·deep_read 비교 | P0 | 🆕 영역 2 |
| D37 | 사용자 | profiles 컬럼 확장 = `job_category` 필수 + `job_title text` / `interests text[]` / `ai_tools text[]` / `persona text` 선택 (0003 alter table) | P0 | 🆕 영역 3 |
| D38 | 사용자 | `/mypage/profile` **풀 설정 페이지 출시 포함** — 온보딩 4종 + 뉴스레터 + 분석 동의 | P0 | 🆕 영역 3 |
| D39 | 사용자 | 페르소나 A~E 자동 매핑 — 온보딩 답변 기반 `profiles.persona` 트리거 + 운영자 수동 override (admin/users 패널) | P0 | 🆕 영역 3 |
| D40 | 수익 | 무료 전자책 시점 수익 관리 화면 = 5종 (주문 건수+추이 / 발송 성공률 / 직무·페르소나 분포 / 리텐션 / 완독률) | P0 | 🆕 영역 4 |
| D41 | 수익/콘텐츠 | 전자책 **hybrid 전달** = (a) 이메일 Signed URL (D8 trigger 유지) + (b) `/mypage/ebooks/[slug]/read` web reader (PDF.js/react-pdf). 완독률 = web reader 사용자 한정 측정 | P0 (web reader 신규) | 🆕 영역 4 |
| D42 | 수익 | Phase 4 PG 트리거 = 구독자 500명 도달 OR 사용자 결제 요청 N건 (N=10 임시) | Phase 4 | 🆕 영역 4 |
| D43 | 결제 | purchases 추가 컬럼 (`resend_token text` + `send_attempts int` + `last_error text` + `discount_code text` + `coupon_id uuid`) — 0003에 alter table | P0 (0003) | 🆕 영역 4 |
| D44 | history | `audit_logs` 단일 테이블 + JSON metadata. 스키마: `id, actor_id, actor_type('user'\|'system'), action_type, entity_type, entity_id, metadata jsonb, created_at`. RLS = admin only. 영구 보존 | P0 (0003) | 🆕 영역 5 |
| D45 | history | 노출 = **둘 다** — `/admin/history` 단일 페이지(전체 timeline + 필터) + 각 영역 패널(콘텐츠/사용자/주문 timeline) | P0 | 🆕 영역 5 |
| D46 | 디자인 | 🚫 **폐기 (D59로 대체, 2026-06-03)** — 원안: §5-8 `lib/tokens.ts` user/admin set 분리 P0. 사용자가 admin UI를 user mockup index와 전면 정합(cool white + 토스 블루 + Playfair Display) 결정 → adminTokens 폐기 | ~~P0~~ | ~~🆕 영역 7~~ |
| D47 | 권한 | editor 게스트 기고 P0 + **이메일 초대 매커니즘 P0**. Supabase `inviteUserByEmail` + Brevo 발송 + `profiles.role='editor'` 자동. `/admin/users/invite` 폼 신설 | P0 | 🆕 영역 7 + §5-7 정합 |
| D48 | 운영 | 운영자 알림 다중 채널 — (a) 사이드바 종 D16 (b) Brevo 이메일 (D16 조건) (c) 카카오톡 P1 (채널/알림톡 검토) | P0 (a,b) / P1 (c) | 🆕 영역 7 |
| D49 | 운영 | Supabase 자동 백업 (Free=7일 / Pro=매일) + **운영자 메모 주 1회** (runbook 명시). 다중 운영자 협업은 editor 권한으로 부분 대응. RLS 분리 본격은 P2 | P0 (메모) / P2 (협업) | 🆕 영역 7 |
| D50 | 콘텐츠/도구 | guides/prompts admin = **/admin/tools 필터 default + /admin/guides·/admin/prompts 단축 URL** (filtered redirect). 사이드바 3개 메뉴. tools 테이블 스키마 단일 유지 | P0 | 🆕 영역 8 |
| D51 | 의견함/지원 | `/admin/support` 별도 + `/admin/faq` 별도. support = `opinions.type='support'` (또는 `support_tickets` 신설). FAQ = `faqs` 테이블 신설 (question, answer, category, sort_order, is_published) + admin CRUD | P0 | 🆕 영역 8 |
| D52 | 운영 | Featured 큐레이션 = **/admin/contents 안 '큐레이션' 탭**. featured_contents.slot_type 확장 (`hero` / `highlight` / `links`). 12 슬롯 drag-and-drop. D15 정합 | P0 | 🆕 영역 8 + D15 확장 |
| D53 | 운영 | `/admin/newsletters` = **admin 안 segment 발송 (Brevo API)** — 제목·본문·segment(직무·페르소나) 입력 → Brevo Email Campaign API POST. 발송 이력·오픈율·클릭수 admin 표시. middleware `ADMIN_ONLY_PREFIXES` 그대로 | P0 | 🆕 영역 8 |
| D54 | SEO | 콘텐츠 SEO 메타 = **자동 생성 + 수동 override**. default = 제목/summary/썸네일 (`opengraph-image.tsx`). TrackForm 안 "SEO 고급 설정" 접어 펴기 → `contents.og_title`, `og_description`, `og_image` (0003에 컬럼 추가) 수동 입력 가능 | P0 | 🆕 영역 8 |
| D55 | 분석 | 검색 키워드 분석 = **P0**. EventType에 `search` 추가 + admin/analytics 안 '인기 키워드' 패널 (일/주/월 top N). `/search` 페이지 query param + filter 발화 시 이벤트 적재 | P0 | 🆕 영역 8 |
| D56 | 운영 | `/links` 페이지 = **admin 안 큐레이션**. D52 '큐레이션' 탭의 `slot_type='links'` 슬롯을 인스타→웹 랜딩에 노출. 자연 정합 | P0 | 🆕 영역 8 |
| D57 | 운영/Storage | **Storage 7 버킷 풀 옵션** — 기존 `thumbnails` (Public) + `ebooks` (Private) + 신규 `avatars` (Public, 본인만 write) + `content-images` (Public, editor write) + `newsletter-assets` (Public, admin write) + `support-files` (Private, admin only) + `audit-exports` (Private, admin only). 정책은 `0004_storage_policies.sql`에 분리 | P0 (Day 1) | ✅ 0004 + plan §16 (2026-06-02 옵션 C 확정) |
| D58 | 디자인 토큰 | **폰트 결정 갱신 — Noto Serif KR 폐기, Pretendard 통일** (mockup 정합, 2026-06-03). §2 원안 "제목=Noto Serif KR / 본문=Pretendard"이 mockup·실제 코드(globals.css)와 어긋남을 발견 → mockup 채택. `tailwind.config.ts` `fontFamily.serif`를 Pretendard로 매핑(하위 호환), `globals.css` Bunny Fonts import에서 noto-serif-kr 제거, Pretendard 800 weight 추가. 기존 `font-serif` 클래스는 그대로 사용 가능 | P0 | ✅ 코드 패치 완료 + §2 갱신 (plan §19) |
| D59 | 디자인 | **UI 전면 정합 — admin도 user mockup index 통일 (D46 폐기, 2026-06-03)**. cool white `#fff` + Toss Blue `#3182f6` + Playfair Display italic "Caselab" 로고. `lib/tokens.ts` adminTokens 제거, tailwind config `admin-*` 클래스 제거(또는 user-*로 alias), 모든 admin 페이지 `bg-admin-* text-admin-*` → `bg-user-* text-user-*` 일괄 마이그레이션 | P0 (Day 3) | 🆕 plan §21 사용자 결정 (옵션 A 전면 정합) |
| D60 | 디자인/IA | **사이드바 5 카테고리 재구조 (2026-06-03)** — 운영+소통 2 그룹 → **분석 / 콘텐츠 / 회원관리 / 매출 / 운영(보조)** 5 그룹. plan §21.3 매핑: 분석=대시보드·analytics·utm·검색 / 콘텐츠=목록·new·큐레이션·categories·topics·comments·tools·ebooks / 회원관리=users·invite·opinions·support·faq·newsletters / 매출=revenue·orders / 운영=history·settings | P0 (Day 3) | 🆕 plan §21 사용자 결정 (5 카테고리 권장) |
| D61 | 분석 | **대시보드 시각화 7 위젯 격상 (2026-06-03, 똑시 가이드 정합)** — (1) 사이트 퍼널 (방문→가입→첫 액션→재방문 + 단계별 전환율) (2) 추이 막대 그래프 (7/14/30일 토글 + 최고일 강조) (3) 콘텐츠 Top N 가로 막대 + 상태 배지 (4) 페르소나 도넛 + 다음 콘텐츠 후보 (5) 유형(페르소나)×채널(UTM) 히트맵 (6) 리텐션 패널 (재방문·완독·구독유지) (7) AI 진단 자연어 인사이트 박스. tremor 또는 recharts 라이브러리 도입. 현 "KPI 5종 카드 = 숫자 나열" 폐기 → "시각화 + 자연어 인사이트" 패턴 | P0 (Day 3~4 + Day 13) | 🆕 plan §21 사용자 결정 (P0 7건 전체) — `docs/design_mockup/admin/똑시님 대시보드 강연/` 자료 기반 |
| D62 | 분석 | **콘텐츠 전환율 정의 + 상태 배지 알고리즘 (2026-06-03)** — 콘텐츠별 "전환율" = `prompt_copy_count / deep_read_count`. 상태 배지 4종: **키워봐요**(deep_read 많음 + prompt_copy 낮음 = 액션 유도 보강 필요) / **그대로**(prompt_copy 많고 페르소나 다양 = 효자 콘텐츠) / **새콘텐츠**(최근 7일 발행) / **주춤**(직전 14일 대비 액션 -30%). 0005 마이그레이션 또는 content_stats view 보강 | P0 (Day 7) | 🆕 plan §21 (D61과 묶음) |
| D63 | 분석 | 🅿️ **보류 (의미 재논의)** — AARRR Referral 메커니즘. 사용자가 친구추천 기능 도입에 회의적 (2026-06-03). 케이스랩 무료 단계에서 "referral"이 토스식 친구추천인지·다른 형태(공유 클릭 추적만 등)인지 명확화 필요. 다음 차수 재논의 | 보류 | 🆕 plan §22 |
| D64 | 분석 | **잠정 P0 — 가설·실험 트래킹 (활용 시나리오 미정)** — `experiments` 테이블 + `/admin/experiments` 페이지. 출시 P0 포함이나 "이걸로 뭘 할 수 있는지" 활용 시나리오 합의 후 정식 task 등재. 시나리오 A(텍스트 일지+가입 그래프 오버레이) / B(자동 A/B) / C(타임스탬프 변화 자동 감지) 중 선택. plan §22.11 참조 | 잠정 P0 | 🆕 plan §22 (시나리오 미정) |
| D65 | 분석 | 🅿️ **보류** — 가입 폼 `referral_source` 질문 ("어디서 알게 되셨나요?"). D63과 연동 | 보류 | 🆕 plan §22 |
| D66 | 분석 | **잠정 P0 — 사용자당 가치(Value per User) 카드 (정의 미정)** — 무료 시기 객단가 변형. 정의 후보: `(30일 prompt_copy 총합) / (30일 활성 UV)`. 활용처: ① 신규 가입자 질 모니터링 / ② 콘텐츠 품질 점검 / ③ 유료 전환 readiness. 출시 P0 포함이나 정의·활용처 합의 후 정식 task. plan §22.11 참조 | 잠정 P0 | 🆕 plan §22 (정의 미정) |
| D67 | 분석/Dev | 🅿️ **보류** — 0005 dev seed 마이그레이션 (시각화 검증용 더미 데이터). 사용자: "해당없음" — 출시 후 실제 데이터로 검증 | 보류 | 🆕 plan §22 |
| D68 | 분석 | **북극성 KPI 정책 (2026-06-03 확정)** — 현 prompt_copy UV 유지 (D5 확정). 사용자: "이후에 사이트가 어떻게 될지 모르는데 장기 지표 결정은 아직 어렵다. 하면서 바꿀 수 있으니까". **출시 후 운영 데이터 4~8주 보고 재검토 가능** — "30일 활성 가입자" 또는 "가입자당 prompt_copy"로 격상 후보 | P0 (정책 문서) | 🆕 plan §22 |

### 19.2 보강 완료 (이전 ⚠️ 항목)

- ✅ **D7 세부 8개**: 영역 1 답으로 8개 다 채택 (4개 후보 외 alt 누락 / 필수 메타 잠금 / unsaved 경고 / 동시 편집 추가)
- ✅ **D2 답장 발송 메커니즘**: Edge Function + Brevo Transactional API (D31)
- ⛔ **D18, D20**: 폐기. 향후 메모 발견 시 D50+ 신규 번호

### 19.3 ADMIN_SESSION_NOTES §5 결정 정합

| 참조 | 항목 | 결정 / 출처 |
|---|---|---|
| §5-1 | 콘텐츠 타입 확장 | ✅ **D13으로 확정** (①+②+③ 풀 분류) |
| §5-2 | 도구 데이터 모델 | ✅ tools 별도 테이블 유지 (§18.7) |
| §5-3 | 프롬프트 자동 추출 | ✅ **수동 등록** (`tools.category='prompt'`). 자동 추출은 P2 |
| §5-4 | 온보딩 데이터 | ✅ **D37로 확정** (job_category 필수 + job_title/interests/ai_tools 선택) |
| §5-5 | admin 유입 패널 | ✅ **D33으로 확정** (출시 P0, GA4 Data API) |
| §5-6 | 풀 설정 페이지 | ✅ **D38로 확정** (출시 포함) |
| §5-7 | 발행자 필드 | ✅ **D27로 확정** (UI 부활, D47 editor 게스트 기고와 정합) |
| §5-8 | 디자인 토큰 분리 | ✅ **D46으로 확정** (tokens.ts user/admin set 분리) |

### 19.4 영향받는 파일 / 페이지

**디스크 반영분**:
- `supabase/migrations/0002_admin_p0.sql` — D1, D3, D4, D5, D8, D11, D14, D15, D16, D17, D19
- `lib/supabase/middleware.ts` — D17 role-aware `ADMIN_ONLY_PREFIXES`
- `app/admin/{layout,page,analytics,comments,contents,tools,ebooks,opinions,topics,users}/` — 일부 구현
- `components/admin/{AdminSidebar,TrackForm,ToolForm}.tsx` — §18.8 모바일 반영

**0003 작성 예정** (D13 + D26 + D37 + D43 + D44 통합):
- `supabase/migrations/0003_categories_tags_utm.sql` — categories + tags + content_tags + tool_tags + utm_links + utm_channel seed + profiles 컬럼 추가 + audit_logs + purchases 컬럼 추가

**신규 페이지/컴포넌트** (Phase 4 작성 예정):
- `app/admin/categories/` (D30) / `app/admin/utm/` (D25) / `app/admin/history/` (D45) / `app/admin/users/invite/` (D47)
- `app/mypage/ebooks/[slug]/read/` (D41 web reader)
- `app/mypage/profile/` 풀 확장 (D38)
- `lib/tokens.ts` (D46) / `lib/analytics/ga4-data-api.ts` (D33) / `lib/analytics/{track,utm,scroll-tracker}.ts` (D21·D24)

**디자인 원형**:
- `docs/design_mockup/admin/ADMIN_SESSION_NOTES.md` — Linear 사이드바, 인디고 #1E40AF, 배경 #FAFAF7, KPI 5종/가드레일 5종

### 19.5 정본 보강·실행 (Phase 4)

- Phase A-0.2 인터뷰 7 영역 완료 (Phase 1 산출물)
- Phase 2 §19 정합본 (현재 갱신분)
- **Phase 3 → `docs/06_admin_dev_plan.md` 신설** (admin 개발 계획서 = 본 §19의 본문)
- Phase 4 잔여 실행:
  - 4-1 `0003_categories_tags_utm.sql` 신설
  - 4-2 TrackForm/ToolForm 카테고리·태그 UI + 발행자 부활
  - 4-3 `05_launch_runbook.md` Day 1 Step 3 + Day 2-B 패치
  - 4-4 Day 2-B 인프라 (`lib/analytics/{track,utm,scroll-tracker}.ts` + Consent v2 + SpeedInsights)
  - 4-5 `/admin/utm` 페이지 P0
  - 4-6 GA4 Data API 연동 + admin/analytics 유입 패널 (D33)
  - 4-7 audit_logs + `/admin/history` (D44·D45)
  - 4-8 web reader (`/mypage/ebooks/[slug]/read`, D41)
  - 4-9 editor 이메일 초대 매커니즘 (D47)

### 19.6 D26 ↔ D13 통합 (0003에 함께 박음)

§18.10 D26의 `categories` 테이블이 D13의 ②세부 카테고리와 동일 테이블이 됨. 0003 단일 마이그레이션에서:
- `categories` 테이블 신설 + `type` 컬럼이 `'content_subcategory' | 'tool_subcategory' | 'utm_channel'` 셋 다 담음
- utm_channel seed 10건은 0003에 미리 박음
- content_subcategory · tool_subcategory seed는 운영자가 `/admin/categories` UI(D30, P1)로 생성. 초기 콘텐츠 발행 전 셋업 1회 필요 (runbook Day 7~8에 명시)
- `tools.category` enum은 유지 (①타입 역할). `tools.subcategory_id uuid` 추가로 ②세부 카테고리 연결
