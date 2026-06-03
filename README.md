# 케이스랩 (Caselab)

> 일이 풀리는 AI 사용법 — Framework × 단계별 AI 실행 × 솔직한 후기.

---

## 📍 현재 단계

**Day 1 (Supabase 셋업) 진행 중** — `docs/05_launch_runbook.md` 참고.

## 🗂 문서 우선순위 (다른 세션 진입 시 이 순서로 읽기)

| 우선순위 | 파일 | 내용 |
|---|---|---|
| 1️⃣ | [`docs/07_handoff_prompt.md`](docs/07_handoff_prompt.md) | **다른 세션 인계 프롬프트 (가장 먼저)** |
| 2️⃣ | [`docs/04_dev_plan.md` §18](docs/04_dev_plan.md) | 출시 시점 결정 변경 (Decisions Log) — **정본** |
| 3️⃣ | [`docs/05_launch_runbook.md`](docs/05_launch_runbook.md) | Day 0~12 단계별 작업 가이드 |
| 4️⃣ | [`docs/03_one_page_spec_v3.md`](docs/03_one_page_spec_v3.md) | 페르소나 5명 + 콘텐츠 톤 |
| 5️⃣ | [GitHub Issues #1~#10](https://github.com/juhee2464amanda/caselab/issues) | 외부 콘솔 작업 체크리스트 + 변경 코멘트 |

## 🎯 "돈 0원 출시" 모드 결정 사항 (요약)

| 항목 | 값 |
|---|---|
| 도메인 | Vercel 무료 서브도메인 (`caselab.vercel.app`) |
| 호스팅 | Vercel Hobby (무료) |
| DB | Supabase Free |
| 이메일 발송 | Gmail SMTP (`caselab.kr@gmail.com`, 일 500건) |
| AI 초안 | **비활성** — Claude Max로 직접 작성 → admin 폼 복붙 |
| 인스타 | `@caselab_ai_` |
| 운영비 | 월 $0, 연 $0 |

자세한 결정 변경 이력은 `docs/04_dev_plan.md §18` 참고.

## 🚀 빠른 시작

```bash
# 1. 의존성 (React 19 RC + react-hook-form peer-dep 충돌 우회)
npm install --legacy-peer-deps

# 2. 환경변수
cp .env.example .env.local
# → Day 1에 Supabase URL/Key 채움

# 3. 개발 서버
npm run dev
```

## 📁 폴더 구조

```
caselab/
├── app/
│   ├── (public)/         — 메인·cases·trends·tools·ebooks·legal·mypage·links
│   ├── admin/            — 콘텐츠·users·opinions·comments·analytics·ebooks·topics·tools
│   ├── api/              — ai-draft(비활성)·revalidate·resend-webhook
│   └── auth/callback/
├── components/
│   ├── ui/               — shadcn 베이스 8개
│   ├── layout/           — GNB(인스타 아이콘 포함)·Footer·HeroCarousel·SubscribeModal
│   ├── content/          — TimeBadge·IntentBox·FailureSection 등 14개
│   ├── analytics/        — GA4Provider·DeepReadTracker·CookieConsent
│   └── admin/            — TrackForm(AI 초안 feature flag)·AdminSidebar
├── lib/
│   ├── supabase/{server,client,middleware,admin}.ts
│   ├── content-render.tsx, content-lint.ts
│   ├── ai-draft.ts       — 사용 안 함 (NEXT_PUBLIC_AI_DRAFT_ENABLED='true' 시만)
│   ├── analytics/{ga4,deep-read}.ts
│   └── constants.ts      — INSTAGRAM_URL · CONTACT_EMAIL 등 중앙 관리
├── types/content.ts      — 콘텐츠 jsonb Zod 스키마 (실전 케이스 4단 / AI 트렌드 3단)
├── supabase/
│   ├── migrations/0001_init.sql  — DB 스키마 (12개 테이블 + RLS)
│   └── functions/
│       ├── send-ebook/   — Gmail SMTP (denomailer)
│       └── kakao-oauth/  — Custom OAuth proxy
├── middleware.ts         — /admin 가드 + onboarded 강제
└── docs/
    ├── 03_one_page_spec_v3.md
    ├── 04_dev_plan.md    — 원본 기획서 + §18 Decisions Log
    ├── 05_launch_runbook.md   — 출시 런북
    └── 07_handoff_prompt.md   — 다른 세션 인계 프롬프트
```

## 🎨 디자인 토큰 (dev plan §2)

| 항목 | 값 |
|---|---|
| 배경 | `#FAFAF7` |
| 본문 | `#0A0A0A` |
| 강조 | `#1E40AF` (인디고) |
| 제목 | Noto Serif KR |
| 본문 | Pretendard |

## ✅ 검증

```bash
npm run typecheck    # TS 0 에러
npm run build        # 36 페이지 정적/동적 렌더링 통과
npm run dev          # 로컬 메인 페이지 200 응답
```

## 💬 결정 변경 시

새 결정을 내릴 때마다 4곳 갱신 — 자세한 절차는 `docs/07_handoff_prompt.md` 마지막 체크리스트 참고.
