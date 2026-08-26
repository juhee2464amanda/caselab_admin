# 새 세션 진입 프롬프트 (caselab_admin)

> 이 파일을 caselab_admin/ 폴더에서 Cursor 새 세션 열고 첫 메시지로 그대로 붙여넣으면 됨.
> 작성일: 2026-06-03

---

## 프롬프트 (복사용)

이 프로젝트는 caselab의 admin 측을 별도 분리한 Next.js 15 + Supabase + Tailwind 앱이야.
- 출처: `~/Documents/01.side_project/02. caselab/caselab/` (user app, 라이브: caselab-five.vercel.app)
- 분리일: 2026-06-03 (이전 세션에서 진행 — plan §26·§27 참조)

**세션 컨텍스트 (시작 전 read)**:
- plan 마스터: `~/.claude/plans/shimmying-herding-hejlsberg.md` (§1~§28 다 읽고 시작)
- admin 개발 계획서 정본: `docs/06_admin_dev_plan.md`
- 결정 매트릭스: `docs/04_dev_plan.md` §19 (D1~D68)
- mockup: `docs/design_mockup/admin/` + 별도 user mockup은 caselab/에 있음
- memory: `~/.claude/projects/-Users-amanda-Documents-01-side-project-02--caselab-caselab/memory/` (caselab user 폴더 기준이라 그대로 참조 가능)

**다음 작업 우선순위**:
1. `package.json` name "caselab" → "caselab_admin"으로 갱신
2. `git init` + GitHub 새 repo (caselab-admin) 연결 + 초기 commit·push
3. Vercel 새 프로젝트 신설 + 환경변수 (SUPABASE_URL/KEY, caselab user와 동일)
4. middleware 간소화 — admin/editor only 단순화 (현재 admin 가드 그대로 살아있지만 user 가드 dead code)
5. (선택) `app/admin/*` → `app/*` 위치 이동 — 도메인 자체가 admin이라 `/admin` URL prefix 제거 가능
6. dev 서버 띄워서 admin 로그인 + 작동 확인

**정합 검증 루틴** (plan §25):
- 각 과제 해결 단위마다 mockup(`http://localhost:8081/user/<page>.html`) 확인
- 그 mockup의 데이터·기능을 admin이 생산·관리·발송·집계 가능한지 점검
- 누락 시 §19에 D row 추가 + 06 본문 갱신

**미해결 결정** (다음 세션 또는 추후):
- 공통 코드 sync 정책 (수동 vs monorepo 격상)
- admin 도메인 (caselab-admin.vercel.app vs admin.caselab.kr)
- admin 인증 분리 (user Supabase Auth 공유 vs magic-link 별도)
- D63·D64·D66 활용 시나리오 합의 (plan §22.11)
- D58 mockup HTML 측 동기화 (Playfair Display·font-serif 잔존)

이전 세션 plan + memory 읽고 다음 작업 들어가자.

---

## 분리 결과 (참고)

| 항목 | 상태 |
|---|---|
| 양쪽 typecheck | ✅ 통과 (2026-06-03) |
| caselab_admin/ 크기 | 625M (node_modules 포함) |
| Supabase 폴더 | ❌ 없음 (caselab/이 single source) |
| .env.local | ✅ 복사됨 (같은 Supabase 프로젝트 — 로컬은 작동) |
| .git | ❌ 없음 (새 git init 필요) |
| 잔존 user import | ❌ 없음 (깨끗) |
| node_modules | ✅ tremor·shadcn·supabase 다 설치됨 |

## 주의 사항

- **package.json name** = "caselab" 그대로. 다음 세션에서 첫 번째로 갱신 권장 (Vercel·npm 충돌 방지)
- **middleware** = `lib/supabase/middleware.ts`에 admin/editor/user 가드 그대로. 사용자 가드 dead code (admin 도메인이라 user 진입 X). 단순화는 추후
- **공통 코드 양쪽 복사 상태**: lib/utils, lib/tokens, types/, components/analytics, components/ui, components/content (콘텐츠 블록 11종 — admin 미리보기 의존)
- **`/admin/*` URL prefix** 현재 그대로. 도메인이 admin이면 `caselab-admin.vercel.app/admin/...`이 됨. prefix 제거하려면 app/admin → app/ 이동 작업 별도 (~30분)
