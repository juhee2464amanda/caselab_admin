# 다음 세션 인수인계 (caselab_admin)

> 작성일: 2026-06-09. 새 세션 첫 메시지로 이 파일 경로를 주거나 내용을 붙여넣으면 됨.

## 한 줄 요약

caselab_admin은 **배포 완료·로그인 작동 중**(caselab-admin.vercel.app). 지금은 **운영 검증(smoke test) Phase 2 진행 중**. 코드 변경은 **이제부터 branch → PR → 머지**.

## 현재 라이브 상태 (전부 main 푸시·배포 완료)

- 배포: https://caselab-admin.vercel.app (Vercel Hobby, main 자동배포)
- DB: Supabase **Caselab-prod** 공유(user app과 동일). 스키마 드리프트 복구 완료(마이그레이션 0010 — topic_suggestions/featured_contents/tags 등 복구).
- 인증: **Google 로그인 + 이메일 allowlist**. `caselab.kr@gmail.com`만 통과(env `ADMIN_EMAILS`, 기본값 코드 내장). `lib/supabase/middleware.ts`
- 루트 `/` → `/admin` redirect(`app/page.tsx`), 로그아웃 버튼(`components/admin/AdminSidebar.tsx`) 추가됨.
- 최신 main: `bcfa8e2`(로그아웃)까지.

## 이어서 할 작업 (우선순위)

### 1. Phase 2 — 읽기 smoke test 마무리 (진행 중)
프로덕션에서 admin 페이지 로드+데이터 렌더 확인. **방금 DB 복구한 `/admin/categories`·`/admin/topics` 우선**, 나머지 빠르게 스캔, 문제 페이지만 기록.
대상 21개: 분석(`/admin` `/analytics` `/utm` `/analytics/search`) · 콘텐츠(`/contents` `/contents/curation`✅확인됨 `/categories` `/topics` `/comments` `/tools` `/guides`) · 회원(`/users` `/users/invite` `/opinions` `/support` `/faq` `/newsletters`) · 매출(`/revenue`(리텐션 "수집중"은 정상) `/ebooks` `/ebooks/new` `/ebooks/customers`) · 운영(`/history` `/settings`)

### 2. Phase 3 — 쓰기 smoke test
`/admin/tools/new`에서 도구 1개 저장: 카테고리=tool 선택 시 **도구 분류 드롭다운 6개**(design/automation/research/writing/presentation/coding) 보이는지 + 카드표시(이모지/가격라벨/유료/사용기) 입력 후 저장 성공 확인 → Supabase `tools` row에 5컬럼+subcategory_id 값 확인. 보조로 `/admin/faq` 1건 추가/삭제(RLS 쓰기 확인).

### 3. Phase 4 — 소규모 정리 (PR 흐름)
- `.env.example`에 `ADMIN_EMAILS=caselab.kr@gmail.com` 명시
- `docs/SESSION_PROMPT.md` 완료 항목 반영(다음 작업 6건 다 끝남)
- (선택) `docs/06_admin_dev_plan.md`의 stale "미구현 라우트 9개"를 구현완료로 정정

### 4. 큐레이션 통일 (별도 PR, caselab **user** repo)
결정됨(2026-06-09): **featured_contents를 정본으로 통일**.
- 라이브 홈(`caselab/app/(public)/page.tsx`)이 현재 `contents.curated` boolean을 읽음(hero limit 3, 실전케이스 track=case limit 4). 이를 `featured_contents`(slot_type hero/highlight/links)에서 읽도록 수정.
- **홈 영역별 렌더 수 ↔ admin 슬롯 수 일치**시킬 것(사용자 요구). admin 슬롯 1~5, hero hint 4슬롯.
- `contents.curated` 폐기/정리(`lib/data/contents.ts`).
- caselab는 라이브(caselab-five.vercel.app)라 PR + 검증 필수.

## 작업 규칙
- caselab_admin: **branch → PR → 머지** (긴급 hotfix만 예외).
- 시크릿은 채팅에 붙여넣지 말 것(.env.local·Vercel UI에서 처리).
- Supabase SQL 붙여넣을 때 첫 글자 잘림 주의(맨 앞 공백/주석 줄로 방어).

## 참고
- 결정 매트릭스·계획 정본: `docs/06_admin_dev_plan.md`, `docs/04_dev_plan.md §19`
- 메모리: `~/.claude/projects/-Users-amanda-Documents-01-side-project-02--caselab-caselab-admin/memory/`
