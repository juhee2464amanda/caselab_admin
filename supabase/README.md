# supabase/ — 스키마 추적 (참조용)

이 디렉터리의 마이그레이션(0001~0009)은 **원본 `caselab` repo에서 가져온 스키마 정본 사본**이다.
caselab_admin과 caselab(사용자 사이트)는 **동일한 remote Supabase 프로젝트**(`jsresrgzrsxotopfzpos`)를 공유한다.

## 적용 소유권 (중요)
- **마이그레이션 apply/push 소유자 = `caselab`(본가) repo.** remote DB에는 이미 0001~0009가 적용돼 있다.
- **caselab_admin에서는 `supabase db push`를 실행하지 말 것** (중복 적용 위험). 여기 파일은 **스키마 참조·타입 정합·로컬 재현(`supabase db reset`)** 용도다.
- 새 admin 전용 스키마가 필요하면 본가 repo에 마이그레이션을 추가한 뒤 이 사본을 동기화한다.

## 동기화
본가에서 마이그레이션이 갱신되면:
```
cp "../caselab/supabase/migrations/"*.sql supabase/migrations/
```

(2026-06-07 최초 동기화. 상세: `docs/06_admin_dev_plan.md` §14.1)
