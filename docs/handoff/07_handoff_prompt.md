# 다른 세션 핸드오프 프롬프트

> 다른 Claude 세션(또는 다른 IDE·다른 사람)에 케이스랩 작업을 인계할 때 그대로 복붙해서 쓰는 프롬프트.
> 최종 갱신: 2026-06-02

---

## 🟦 복붙용 프롬프트 (한 번에 보낼 메시지)

````
나는 케이스랩(Caselab) 매거진 사이트를 출시 준비 중이야. 다른 세션에서 시작한 작업을 이어가려고 해.

## 프로젝트 개요
- 한국 직장인 5명 페르소나에게 "Framework × 단계별 AI 실행 × 솔직한 후기" 매거진을 전하는 사이트
- 핵심 동선: 인스타(@caselab_ai_) → /links → 콘텐츠 → 전자책 신청 (lead-magnet)
- 운영자 1인 (Gmail: caselab.kr@gmail.com)

## 기술 스택
- Next.js 15 (App Router) + TypeScript + Tailwind 3
- Supabase (Postgres + Auth + Storage + Edge Functions, Free)
- Vercel (Hobby 무료 — 무료 서브도메인 caselab.vercel.app 예정)
- Gmail SMTP (전자책 발송, nodemailer 라이브러리)
- GA4 (쿠키 동의 후)
- React 18.3 (peer-dep 충돌로 React 19 RC 안 씀)

## 현재 단계
Day 0 (가입) 완료 가정 → Day 1 (Supabase 셋업) 진행 중 또는 직전.
출시까지 Day 1~12 단계가 docs/05_launch_runbook.md에 정리되어 있어.

## "돈 0원 출시" 모드 — 핵심 결정 (다른 세션에서 헷갈리지 말 것)

| 항목 | 결정 | 출시 후 도입 트리거 |
|---|---|---|
| 도메인 | Vercel 무료 서브도메인 (caselab.vercel.app) | 인스타 유입 안정화 + 브랜드 강화 |
| Cloudflare | 사용 안 함 | 커스텀 도메인 도입 시 |
| Resend | 사용 안 함 → **Gmail SMTP로 대체** (Day 9) | Gmail SMTP 한도 도달 또는 스팸 빈도↑ |
| Anthropic Claude API | **비활성** (env로 토글) | Max 복붙 피로 누적 시 |
| AI 초안 작성 | Claude Max에서 직접 작성 → admin 폼 복붙 | — |
| 발신 메일 | Gmail (caselab.kr@gmail.com) | — |
| 답신·문의 메일 | caselab.kr@gmail.com (Privacy·Footer 표기) | — |
| 인스타 핸들 | @caselab_ai_ | — |

운영비 = 월 $0, 연 $0.

## 참고해야 할 파일 (우선순위)

1. **docs/04_dev_plan.md** — 원본 기획서 + §18 "Decisions Log"가 정본
2. **docs/05_launch_runbook.md** — Day 0~12 단계별 작업 가이드
3. **docs/03_one_page_spec_v3.md** — 페르소나·콘텐츠 톤·핵심 페인 5가지
4. **docs/personas.html** — 페르소나 5명 인터뷰 인용 (콘텐츠 톤 가이드)
5. **lib/constants.ts** — 인스타 핸들·문의 메일 등 외부 상수
6. **.env.example** — 환경변수 템플릿 (출시 결정 반영)
7. **supabase/migrations/0001_init.sql** — DB 스키마 (12개 테이블 + RLS)
8. **types/content.ts** — 콘텐츠 jsonb Zod 스키마 (실전 케이스 4단 / AI 트렌드 3단)
9. **GitHub Issues #1~#10** (https://github.com/juhee2464amanda/caselab/issues) — 외부 콘솔 작업 체크리스트 + 변경 코멘트

## 폴더 구조
```
caselab/
├── app/
│   ├── (public)/         — 메인·cases·trends·tools·ebooks·legal·mypage 등
│   ├── admin/            — 콘텐츠·users·opinions·comments·analytics·ebooks·topics·tools
│   ├── api/              — ai-draft(env 켜야 동작)·revalidate·resend-webhook
│   └── auth/callback/
├── components/
│   ├── ui/               — shadcn 베이스
│   ├── layout/           — GNB(인스타 아이콘)·Footer·HeroCarousel·SubscribeModal
│   ├── content/          — TimeBadge·IntentBox·FailureSection 등 14개
│   ├── analytics/        — GA4Provider·DeepReadTracker·CookieConsent
│   └── admin/            — TrackForm(AI 초안 feature flag)·AdminSidebar
├── lib/
│   ├── supabase/{server,client,middleware,admin}.ts
│   ├── content-render.tsx, content-lint.ts
│   ├── ai-draft.ts       — 사용 안 함 (env 켜야 동작)
│   ├── analytics/{ga4,deep-read}.ts
│   └── constants.ts      — 인스타·문의 메일 상수
├── supabase/
│   ├── migrations/0001_init.sql
│   └── functions/
│       ├── send-ebook/   — Gmail SMTP (nodemailer)
│       └── kakao-oauth/  — Custom OAuth proxy
└── docs/
    ├── 04_dev_plan.md    — 원본 기획서 + §18 Decisions Log
    └── 05_launch_runbook.md  — 출시 런북
```

## 부탁

1. 위 파일들을 읽고 현재 코드/문서가 어떤 상태인지 파악해줘
2. 내가 다음에 해야 할 작업이 뭔지 — Day 1 어디까지 왔는지, 다음 단계가 뭔지 — 정리해줘
3. 잘못된 점·앞뒤가 안 맞는 결정·놓친 부분이 있으면 알려줘
4. 환경변수 .env.local에 채워야 할 값이 있다면 무엇인지 안내해줘

## 진행 중인 의사결정 (있으면 알려줘)
- Supabase 프로젝트 생성 여부:
- .env.local 채워졌는지:
- 0001_init.sql 실행 여부:
- Google OAuth 셋업 여부:
- 다른 세션에서 진행한 추가 변경:
````

---

## 🟩 핸드오프 사용 방법

### 시나리오 A: 새로운 Claude Code 세션
1. 위 코드블록 전체 복붙
2. 마지막 "진행 중인 의사결정" 항목들을 본인 상태에 맞게 채움
3. 보내기

### 시나리오 B: 외부 IDE/Cursor/다른 협업자
1. 코드블록 복붙 + 첫줄에 “현재 working directory: `/path/to/caselab`” 추가
2. 그쪽이 GitHub repo 접근 가능한지 확인 (issue 링크 클릭 가능해야 함)

### 시나리오 C: 며칠 후 본인 다시 진입
1. “현재 Day N 진행 중, {증상}” 만 추가하면 됨
2. 위 코드블록은 안 보내도 됨 — `docs/04_dev_plan.md §18` + `docs/05_launch_runbook.md` 만 보면 됨

---

## 다른 세션이 변경한 내용이 있다면

다른 세션에서도 같은 git repo를 작업하면 변경 사항이 충돌할 수 있어요. 진입 시 항상:

```bash
git status                  # uncommitted 변경 확인
git pull origin main        # 다른 세션의 push 받기
git log --oneline -10       # 최근 커밋 흐름 파악
```

새 변경이 있으면 본 파일(`docs/07_handoff_prompt.md`) + `docs/04_dev_plan.md §18.5 결정 변경 이력`에 한 줄 추가.

---

## 결정 변경 시 동기화 체크리스트 (다른 세션·본인 모두)

새 결정을 내릴 때마다 아래 4곳 갱신:

- [ ] `docs/04_dev_plan.md §18` Decisions Log
- [ ] `docs/05_launch_runbook.md` 영향 받는 Day 섹션
- [ ] `lib/constants.ts` 또는 `.env.example` (코드 변수 영향 시)
- [ ] 관련 GitHub Issue에 변경 코멘트
- [ ] `git add . && git commit -m "..." && git push`
