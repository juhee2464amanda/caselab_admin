# 핸드오프: Featured Hero 예약노출 입력 UI (admin)

> 이 문서를 caselab_admin 프로젝트에서 Claude Code에게 그대로 전달하세요.
> 맥락: 본사이트(caselab) PR #46에서 공개 Hero를 `featured_contents`의 예약창
> (`featured_from <= now <= featured_until`)으로 노출하게 재배선함. 그런데 admin의
> `CurationManager`는 예약 기간을 **저장하지 않아서**(표시용 `sort_label`만 씀) 예약 기능이
> 비어 있고, 공개 Hero가 항상 `curated` 폴백으로만 뜸. 이 입력 UI를 채워야 예약노출이 실제로 동작함.

## 목표 (한 줄)
`CurationManager`에서 hero 슬롯에 **예약 노출 기간**을 입력하면
`featured_contents.featured_from / featured_until` 에 저장되게 한다.

## 반드시 지켜야 할 사실 (본사이트와의 계약)
- 테이블: `public.featured_contents`. 컬럼 **이미 존재** — `featured_from timestamptz`,
  `featured_until timestamptz` (admin 마이그레이션 `0011_admin_curation_product_view.sql`). **마이그레이션 불필요.**
- 의미: `null = 상시 노출`. 둘 다 채우면 그 기간에만 노출. 본사이트는
  `featured_from <= now() <= featured_until`(null은 무한대 취급) + `active=true` + `slot_type='hero'` +
  published content만 필터해서 slot 순으로 Hero에 노출.
- 본사이트 `lib/data/contents.ts`의 `listFeaturedContents()`가 위 규칙으로 읽음 — **이 컬럼들을 admin이 채워야** 예약이 작동.
- `sort_label`은 **표시용 라벨일 뿐 예약창이 아님** — 별개. 예약은 반드시 `featured_from/until`로.

## 요구사항
1. `CurationManager`의 hero 슬롯 영역에 **예약 기간 입력** 추가.
   - 최소: 시작일(`featured_from`) / 종료일(`featured_until`) 날짜 입력 2개.
   - 권장 UX: **프리셋 버튼**("상시", "1주", "2달") — 누르면 from=now, until=now+기간 자동 채움. "상시"는 둘 다 null.
2. 저장 시 해당 hero 슬롯 entry들의 `featured_from / featured_until` 업데이트.
   - 현재 `sort_label` 저장 패턴(`CurationManager.tsx`의 hero 날짜 저장 로직, 약 84~88줄
     `supabase.from('featured_contents').update({ sort_label }).in('id', heroIds)`)과 동일 구조로,
     같은 update에 `featured_from / featured_until` 추가하면 됨.
3. 현재 설정된 기간을 화면에 표시(편집 시 기존 값 prefill). 기간 밖/만료면 "현재 비노출(폴백)" 같은 힌트.

## 재사용 포인트
- 파일: `components/admin/CurationManager.tsx`
  - hero 날짜 state: 약 `36~37줄` (`add`, `heroDate`)
  - hero 저장 함수: 약 `84~88줄` (`sort_label` update) ← 여기에 from/until 추가
- 저장 클라이언트: 기존대로 `createSupabaseBrowserClient()` (admin RLS 통과).
- UI: `components/ui/` (shadcn Input[type=date]/Button/Label).

## 완료 기준 (Acceptance)
1. admin에서 hero 예약 기간(또는 프리셋) 설정 → `featured_contents` hero row들의
   `featured_from / featured_until` 가 채워짐(또는 "상시" 선택 시 null).
2. 본사이트 홈 Hero가 **설정 기간 안에서만** 그 콘텐츠 노출, 기간 밖이면 `curated` 폴백.
3. SQL 확인: `select slot, featured_from, featured_until, active from public.featured_contents where slot_type='hero' order by slot;`

## 주의 (스키마 drift)
- 본사이트(caselab) repo의 `0010` 마이그레이션은 `featured_contents.slot` / `unique(slot)`만 있고,
  prod/admin은 `slot_type` / `unique(slot_type, slot)` 사용. **현재 prod·admin 스키마(`slot_type`)가 기준.**
  이 작업은 admin·prod 기준대로 진행. (caselab repo 정합 마이그레이션은 본사이트 쪽 별도 후속)

## 범위 밖
- 본사이트 `listFeaturedContents()` 수정(이미 PR #46에 됨).
- `sort_label` 제거/변경(표시용으로 유지).
