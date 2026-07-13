# 수집 요청 버튼 + 로컬 폴러 (collect-request)

admin '지금 수집 요청' 버튼 → 클라우드 큐 → 로컬 HERMES 폴러가 소진하는 구조.
9시 고정 크론 의존을 없애고, 랩톱이 켜지는 아무 때나 씨앗을 채운다. 버튼은 폰에서 눌러도 된다
(요청은 클라우드 DB에 영속 → 다음에 랩톱 켜질 때 처리).

## 구성

```
[admin 버튼] --POST--> /api/collect-requests (세션 인증, pending 1건 생성)
                              │
                        seed_collect_requests (Supabase, 큐)
                              │
[로컬 폴러] --POST--> /api/collect-requests/claim (토큰, 가장 오래된 pending claim)
   │  claim되면 각 봇 프로필의 enabled ingest 크론 잡 프롬프트를 재실행
   │  (봇이 스스로 /api/seeds/ingest로 적재)
   └--POST--> /api/collect-requests/{id}/complete (토큰, done/error)

[admin 버튼]은 GET /api/collect-requests를 10초 폴링해 상태 표시:
   지금 수집 요청 → 로컬 작업장 대기 중 → 수집 중 → 수집 완료
```

## 서버(이 저장소)

- `supabase/migrations/1017_seed_collect_requests.sql` — 큐 테이블 + `claim_collect_request()` RPC
- `app/api/collect-requests/route.ts` — POST(생성)·GET(최신, 세션 인증)
- `app/api/collect-requests/claim/route.ts` — POST(claim, HERMES 토큰)
- `app/api/collect-requests/[id]/complete/route.ts` — POST(마감, HERMES 토큰)
- `components/admin/CollectRequestButton.tsx` — SeedCuration 헤더 버튼

인증: 브라우저=세션+`profiles.role='admin'`, 로컬=`HERMES_INGEST_TOKEN`(seeds/ingest 공용, Vercel에 이미 설정).

## 배포 전 필수: DDL 적용

공유 prod는 `db push` 금지 → **대시보드 SQL Editor**에서 `1017_seed_collect_requests.sql` 내용을
멱등 실행(모두 `if not exists`/`create or replace`라 재실행 안전).

## 로컬(HERMES) 설정

폴러: `~/.hermes/scripts/caselab_collect_poller.py` (이 저장소 `scripts/`에 사본 보관).
로스터 하드코딩 없이 `~/.hermes/profiles/*/cron/jobs.json`에서 enabled이고 프롬프트에 ingest 지시가
있는 잡을 자동 발견해 재실행한다(현재 4레인: AI브리핑·서비스·블로그·유튜브).

크론 등록(10분 간격, LLM 없이 스크립트만):

```bash
hermes cron create --name caselab-collect-poller \
  --script caselab_collect_poller.py --no-agent "*/10 * * * *"
```

- 요청이 없으면 즉시 종료(비용 0). claim된 요청이 있을 때만 봇을 돌린다.
- 락파일(`~/.hermes/cron/.caselab_collect_poller.lock`)로 중복 실행 방지.
- 랩톱이 꺼져 있으면 요청은 큐에 남고, 다음에 켜져서 폴러가 돌 때 소진.

### launchd 대안(게이트웨이 tick이 불안정할 때)

hermes 게이트웨이가 항상 떠 있지 않으면, launchd로 `RunAtLoad`(로그인 즉시 1회)+`StartInterval=600`을
걸어 독립 실행할 수 있다. `python3 ~/.hermes/scripts/caselab_collect_poller.py`를 실행하는 LaunchAgent plist.
