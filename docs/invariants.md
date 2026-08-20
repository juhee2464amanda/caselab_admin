# caselab invariants.md — 절대 어기지 않는 불변식

> 어떤 예외 상황(시의성 속보 포함)에서도 우회하지 않는다. 판단 규칙은 [encoding.md](./encoding.md), 여기는 그보다 단단한 바닥.

## 발행 게이트
- 케이스는 분류(워크플로·자동화·제작기) 없이 발행 불가
- 가격·기능 주장은 발행 전 재검증을 통과해야 함
- 발행 버튼은 사람(amanda)만 누른다

## 데이터 이중 정의
- 분류·라벨은 admin↔본가에 이중 정의(상수↔DB seed) — 변경은 반드시 양쪽 동시 수정
- tool 직접 insert 시 subcategory_id 없으면 본가 목록에서 사라진다 — 필수 지정
- push-asset은 prompt|guide만 받는다 (tool은 400)
- is_paid와 pricing_tier는 별개 스위치 — 하나만 바꾸지 않는다

## 채널 주장
- "직접 써본 것만" "검증한" 류의 사실 아닌 주장 문구 금지

## 렌더 검수
- 카드뉴스 1350px 오버플로와 Satori 함정 4종(cover 타일링·WebP 검정·inherit 소실·undefined 크래시)은 **에러 없이** 망가진다 — 픽셀 검수 없이 통과 금지

## git · 인프라
- 공유 워크트리: 커밋 전 git 상태 재확인, 남의 미커밋 파일을 커밋에 포함하지 않는다
- dev 서버는 3000 고정, 실행 중 .next 삭제 금지
- Vercel Hobby: maxDuration≤300 아니면 배포가 조용히 실패한다 — 배포 후 vercel ls로 확인
