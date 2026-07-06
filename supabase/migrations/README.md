# 마이그레이션 규칙 (caselab_admin)

이 repo는 본가(caselab)와 **같은 Supabase prod(jsresrgzrsxotopfzpos)를 공유**한다.
원격 마이그레이션 이력(supabase_migrations)은 실제 적용 상태와 다르다(초기 일부만 기록,
이후는 대시보드 단발 적용). 그래서:

## 절대 규칙

1. **`supabase db push` 금지.** 이력이 어긋난 상태에서 push하면 다른 내용의
   같은 번호가 조용히 skip되거나 의도치 않은 DDL이 적용될 수 있다.
2. DDL 적용은 **대시보드 SQL Editor에서 파일 내용을 멱등 실행**
   (`if not exists` / `drop ... if exists` 선행). 이 디렉터리의 파일은 기록용 정본.

## 번호 네임스페이스 (2026-07-06 분리)

| 범위 | 소유 | 비고 |
|---|---|---|
| `0001`~`0011` | 공유 베이스 | 본가와 바이트 동일 사본. 여기서 수정 금지 — 본가에서 변경 후 복사 |
| `0012`~`0999` | **본가 전용** | 이 repo에 이 범위 파일을 만들면 CI(migrations-guard)가 실패한다 |
| `1000`~ | **admin 전용** | 새 admin DDL은 `1xxx_이름.sql`로 생성 (현재 1012~1016 = 구 0012~0016 리네임) |

리네임 이력: 0012~0016_content_seeds* → 1012~1016 (내용 무변경, prod 적용 완료 상태).
