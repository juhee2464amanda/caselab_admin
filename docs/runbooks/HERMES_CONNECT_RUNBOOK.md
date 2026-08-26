# HERMES 봇 → 콘텐츠 스튜디오 연결 런북

콘텐츠 소스별 HERMES 봇을 admin 씨앗 파이프라인(`/api/seeds/ingest` → 스튜디오 인박스)에 연결하는 절차. API 계약·lane 정의의 정본은 [`etc/seed-source-spec.md`](../etc/seed-source-spec.md), 이 문서는 **HERMES 쪽 셋업과 검증**을 다룬다.

## 구조 한눈에

```
HERMES 봇 (맥 로컬, launchd 게이트웨이, 봇 1개 = 프로필 1개)
  └─ cron 잡: 수집 프롬프트 실행 → curl POST /api/seeds/ingest (Bearer HERMES_INGEST_TOKEN)
       └─ content_seeds (origin='hermes-direct', status='raw', 미채점)
            └─ [로컬 admin] 채점(scoreSeed) → bucket/score/essence
                 └─ /admin/studio 인박스 (72h · score 60↑ · 버킷당 6개+더 보기) → 개요 → 생성 → 발행
```

- 적재만으로는 인박스에 **안 뜬다**. 채점은 로컬 admin(`NEXT_PUBLIC_LOCAL_AI=true`)에서 수동 실행.
- 멱등성: `dedup_key`(권장: 원문 URL) → 같은 소재 재전송은 자동 차단(`inserted`가 줄어드는 건 정상).

## 현재 연결 현황 (2026-07-11)

| 프로필 (텔레그램 봇) | cron 잡 | lane → source_type | 버킷 | 스케줄 | 수집 창 · 전송 건수 |
|---|---|---|---|---|---|
| `ai-briefer` | `ai-briefing-ingest` | `ai-briefing` → `ai-briefing` | 🔵 trend | 매일 09:00 | 최근 72h · 4~8건 |
| `trendy_aiservice_bot` | `service-scout-daily` | `service-scout` → `service-scout` | 🟢 service | 매일 09:00 | 최근 24~72h · 3~6건 |
| `user_painpoint_ai_bot` | `painpoint-blog` | `painpoint-blog` → `blog` | 🟠 painpoint | 월수금 10:00 | 최근 1주 · 3~6건 |
| `user_painpoint_ai_bot` | `painpoint-youtube` | `painpoint-youtube` → `youtube` | 🟠 painpoint | 화목 10:00 | 최근 1~2주 · 2~5건 |
| `ai_casestudy_usage_bot` | `daily-ai-casestudy-usage-8am` | `ai-usecase` → `ai-usecase` | 🟣 usecase | 매일 08:00 | 1~3건(적격 없으면 [SILENT]) |
| `ai_prompt_setting_bot` | `케이스랩 검증 프롬프트 사례 데일리 브리핑` | `prompt-scout` → `prompt-scout` | 🟡 prompt | 매일 08:00 | 최대 3건(억지로 채우지 않음) |

usecase·prompt 2개는 2026-08-15 연결(기존 텔레그램 브리핑 봇에 적재 블록만 덧붙임 — 프로필 신설 없음). 두 잡 모두 실측 적재 검증 완료.

수집 창·건수는 2026-07-11에 확대(인박스 선택권이 버킷당 4건 수준으로 너무 적었음). 당일 최신을 우선하되 창 내 미커버 소식을 함께 추리고, 겹침은 dedup_key가 차단하므로 재전송 걱정 없이 넓게 훑는 방식. "기준 미달을 억지로 채우지 말 것"은 전 잡 공통 유지 — 건수 하한은 목표치지 강제가 아니다.

레거시: default 프로필의 Slack 경유 잡 4개(scout-daily·analyst-daily·weekly-planner·daily-ai-briefing-9am)는 전부 pause. Slack 웹훅(`/api/slack/hermes-brief`)은 하위호환으로만 존치.

## 새 봇(또는 새 lane) 연결 절차

### 0) lane 결정 — admin 쪽 준비

- 기존 lane(`ai-briefing`/`service-scout`/`painpoint-*`)이면 admin 변경 **불필요**.
- 새 lane이면 `lib/seed-sources.ts`의 `LANE_SOURCE`에 한 줄 추가(+ 필요시 `SEED_SOURCES`에 소스 정의·양질 신호) 후 PR. 미등록 lane은 `slack-brief`로 폴백돼 버킷 힌트를 못 받는다.

### 1) HERMES 프로필 준비

```bash
ls ~/.hermes/profiles/            # 기존 프로필 확인 (봇 1개 = 프로필 1개)
```

- 프로필 `.env`(`~/.hermes/profiles/<이름>/.env`)에 `HERMES_INGEST_TOKEN=<Vercel과 동일 값>` 추가.
- 토큰 값은 Vercel(caselab-admin) 환경변수 `HERMES_INGEST_TOKEN`과 반드시 동일해야 한다.

### 2) cron 잡 생성

```bash
cd ~/.hermes/hermes-agent
HERMES_HOME=~/.hermes/profiles/<프로필> venv/bin/python -m hermes_cli.main cron list
HERMES_HOME=~/.hermes/profiles/<프로필> venv/bin/python -m hermes_cli.main cron create ...
# pause / run <잡ID> 도 동일 패턴
```

생성 후 `<프로필>/cron/jobs.json`에서 해당 잡에 아래를 **직접 수정**(CLI create에 옵션 없음):

```json
"enabled_toolsets": ["web", "terminal"]
```

`terminal`이 없으면 curl 전송을 못 해서 수집만 하고 적재에 실패한다. `deliver`는 `origin`(텔레그램 봇 대화로 결과 보고).

### 2.5) 기존 브리핑 봇에 적재를 붙이는 경우 — 필수 3종

이미 텔레그램 브리핑을 하던 봇에 적재만 추가할 때 **전부 걸렸던 함정**이다(2026-08-15, usecase·prompt 연결 시 실측).
증상이 다 "수집은 했는데 적재만 안 됨"이라 원인 구분이 어렵다.

| 필수 | 없으면 생기는 일 | 확인 |
|---|---|---|
| 프롬프트 맨 앞 **크론 preamble** | 에이전트가 프롬프트를 "잡 설정을 이렇게 바꿔줘"로 읽고 **cron edit만 하고 끝낸다**(수집·적재 0). 폴러의 '지금 수집 요청'도 같은 `chat` 경로라 동일하게 당한다 | `prompt`가 `[IMPORTANT: You are running as a scheduled cron job…`으로 시작하는지 |
| **`approvals.mode`가 off** | `terminal` 도구가 `pending_approval`로 전환 → 게이트웨이가 승인 요청을 **텔레그램으로 발송** → 60초(=`approvals.timeout`) 무응답 → `BLOCKED: User denied this command`. 크론 실행에서도 동일 | `config.yaml`의 `approvals.mode`. YAML에서 `false`는 off로 정규화됨(`manual`이면 막힌다) |
| **위임(서브에이전트) 최소화** | 조사 스킬이 서브에이전트를 여럿 띄우면 컨텍스트가 불어나 마지막 **전송 단계를 건너뛴다**. 게다가 "승인이 차단했다"처럼 실행하지도 않은 실패를 지어내 오진을 부른다 | 잡의 `skills`. 무거우면 `cron edit <잡ID> --clear-skills` |

프롬프트에 아래 두 블록을 넣으면 마지막 함정이 재발하지 않는다(실측으로 효과 확인):

```
[단독 실행 규칙] 서브에이전트에 위임하지 마라. 웹검색 N회·원문 M페이지 상한. 조사 끝나면 지체 없이 전송.
[전송 실행 규칙] 전송은 terminal로 실제 실행한다. 실행 전에 "승인 차단"·"환경 제약"으로 실패를 보고하지 마라.
                 받은 HTTP 응답 본문을 그대로 인용하라 — 인용 못 하면 전송한 것이 아니다.
```

마지막 줄이 중요하다. 응답 본문 인용을 의무화하면 봇이 실패를 지어냈는지 실제로 막혔는지 로그만 보고 구분할 수 있다.

### 3) 프롬프트 작성 — 검증된 골격

프롬프트에 토큰 원문을 넣지 말 것. **"Authorization 헤더에는 Bearer 토큰으로 환경변수 HERMES_INGEST_TOKEN 값을 사용한다"** 문구가 검증된 방식이다. 골격(ai-briefing 잡에서 검증됨):

```
[역할] — 어떤 수집가인지 + 타겟 독자(마케터/기획자/PM/1인 창업 준비생)

[수집 기준 — 전부 만족해야 후보] — 신선도·원문 확인·구체 수치·추측 배제
  (해당 lane의 "양질 신호"를 그대로 옮길 것 — etc/seed-source-spec.md 표 참조.
   신호가 빠지면 채점기가 감점해서 인박스 컷(60점)에 못 든다)

[전송 — 소재 1건 = items 원소 1개, 합치지 말 것. N~M건(억지로 채우지 말 것)]
- POST URL: https://caselab-admin.vercel.app/api/seeds/ingest
- Authorization 헤더에는 Bearer 토큰으로 환경변수 HERMES_INGEST_TOKEN 값을 사용한다.
- Content-Type: application/json
전송 JSON 형식:
{"lane":"<lane이름>","items":[{"title":"한 줄","raw_text":"...","source_url":"원문 URL","dedup_key":"원문 URL 그대로"}]}

[raw_text 형식] — lane별 필수 필드를 이름·순서 고정으로 명시
  (예: ai-briefing = 발표 내용 / 수치·날짜 / 직무 시사점,
   painpoint = 실제 댓글·후기 원문 인용 2+ 포함)

[전송 직전 자체 검사 — 하나라도 어긋나면 고친 뒤 전송] — 필드 형식·URL 유효성·추측 배제

[dedup 규칙] — dedup_key는 원문 URL 그대로

[보고 — API 전송과 별도로 크론 결과에]
- 응답의 ok:true와 inserted 수. 401/500이면 에러 본문 그대로.
- 응답 source_type이 기대값인지 확인(다르면 lane 오타).
- inserted < 보낸 개수면 "N건 중복 차단됨"(정상).
- 후보 0건이면 POST하지 말고 "오늘은 없음"으로만 보고.
```

크론 프롬프트 정본 보관: `~/Downloads/hermes-*-cron-*.md` (구분선 아래가 본문).

### 4) 검증 3단계

```bash
# ① 잡 수동 실행
cd ~/.hermes/hermes-agent && HERMES_HOME=~/.hermes/profiles/<프로필> \
  venv/bin/python -m hermes_cli.main cron run <잡ID>

# ② prod 적재 확인 (main repo .env.local의 서비스 키 사용)
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/content_seeds?select=created_at,lane,source_type,title&lane=eq.<lane>&order=created_at.desc&limit=5" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

③ 로컬 admin에서 채점 실행 → `/admin/studio` 인박스에 해당 버킷으로 뜨는지, 출처 배지가 맞는지 확인.

## 트러블슈팅

| 증상 | 원인 | 조치 |
|---|---|---|
| `401 unauthorized` | 토큰 불일치/누락 | 프로필 `.env`와 Vercel의 `HERMES_INGEST_TOKEN` 값 대조 |
| `RuntimeError: Connection error.` | 잡 실행 시점에 맥 네트워크/DNS 미연결(슬립 후 캐치업 실행 포함) | 네트워크 확인 후 `cron run <잡ID>` 수동 재실행. errors.log에 같은 시각 Telegram DNS 에러가 같이 찍히면 확정 |
| `Codex stream produced no bytes within 45s` | openai-codex 프로바이더 TTFB 타임아웃(일시) | 재실행. 반복되면 프로필 config.yaml의 모델/프로바이더 점검 |
| 전 봇이 `401 token_expired` | HERMES 자격증명 만료 | 아래 "인증 만료" 절 — `codex login`으로는 안 고쳐진다 |
| `429 The usage limit has been reached` | 계정 사용량 한도(인증은 정상) | 리셋 대기, 또는 다른 계정을 풀에 추가 |
| 수집은 했는데 적재 안 됨 | 잡에 `terminal` 툴셋 없음 | jobs.json에 `enabled_toolsets: ["web","terminal"]` |
| 수집도 안 하고 "잡을 수정했다"고 보고 | 프롬프트에 크론 preamble 없음 | 위 2.5절 — preamble을 프롬프트 맨 앞에 |
| `BLOCKED: User denied this command` (정확히 60초 후) | `approvals.mode: manual` + 승인 요청이 텔레그램으로 가서 만료 | 위 2.5절 — `approvals.mode`를 off로 |
| 조사는 다 했는데 "승인이 차단했다"며 전송 안 함 | 서브에이전트 위임으로 컨텍스트 소진 → 마지막 단계 누락(실제 차단 아님) | `--clear-skills` + 전송 실행 규칙 블록. 로그에 `BLOCKED` 원문이 없으면 지어낸 것 |
| 적재됐는데 인박스에 안 보임 | 미채점 (정상 동작) | 로컬 admin에서 채점 실행. 72h 창·60점 컷도 확인 |
| `inserted`가 보낸 수보다 적음 | dedup 차단 (정상) | 조치 불필요 |
| source_type이 `slack-brief` | lane 오타 또는 미등록 lane | 프롬프트 lane 이름 확인 / `LANE_SOURCE` 등록 |

## 인증 만료 — 전 봇이 401로 죽을 때 (2026-08-16 실측)

증상: 모든 레인이 즉시 `rc=1`, stderr에 `401 token_expired` 또는 `unauthorized_unknown`.
매일 08:00 크론도 '지금 수집 요청'도 전부 실패한다. 씨앗이 안 쌓이는 것 말고 다른 신호가 없다.

**함정 3개**

1. **`codex login`으로는 안 고쳐진다.** 그건 `~/.codex/auth.json`(codex CLI 전용)만 갱신한다.
   HERMES는 `~/.hermes/auth.json`의 `credential_pool.openai-codex`를 따로 쓴다.
2. **`hermes auth status openai-codex`가 `logged in`이라고 답한다.** 풀에 항목이 있는지만 보고
   만료는 검사하지 않는다 — 이 명령으로는 이번 고장을 못 잡는다. 토큰 exp를 직접 까봐야 한다.
3. **프로필마다 `auth.json`이 따로다.** `hermes auth add`는 실행한 HERMES_HOME에만 저장되므로,
   글로벌에 추가해도 봇 프로필은 계속 만료본을 쓴다. 프로필 수만큼 재로그인하거나 아래처럼 배포해야 한다.

```bash
# ① 만료 확인 (전 프로필)
python3 - <<'EOF'
import json,os,base64,time,glob
def exp(c):
    t=c.get('access_token','');  p=t.split('.')[1]; p+='='*(-len(p)%4)
    return json.loads(base64.urlsafe_b64decode(p)).get('exp',0)
for f in [os.path.expanduser('~/.hermes/auth.json')]+glob.glob(os.path.expanduser('~/.hermes/profiles/*/auth.json')):
    pool=json.load(open(f)).get('credential_pool',{}).get('openai-codex',[])
    print(f, [('유효' if exp(c)>time.time() else '만료') for c in pool])
EOF

# ② 새 자격증명 1회 발급 (디바이스 코드 — 브라우저에서 코드 입력)
cd ~/.hermes/hermes-agent && HERMES_HOME=~/.hermes PYTHONUNBUFFERED=1 \
  venv/bin/python -m hermes_cli.main auth add openai-codex --type oauth --no-browser --label $(date +%Y-%m-%d)
# PYTHONUNBUFFERED=1 없으면 URL·코드가 버퍼링돼 안 보인다. 승인 대기가 2분을 넘으니 백그라운드로 띄울 것.

# ③ 유효한 것만 전 프로필에 배포 (①의 스크립트를 쓰기 모드로 — 백업 필수)
```

`hermes login`은 제거됐다(`auth add`로 대체). 배포 후 스모크 테스트:
`hermes --profile <봇> chat -Q -q "'인증OK'라고만 답해라. 도구 사용 금지."`

## 참조

- API 계약·lane/버킷/양질 신호 정본: `etc/seed-source-spec.md`
- ingest 라우트: `app/api/seeds/ingest/route.ts`
- lane 매핑: `lib/seed-sources.ts` · 큐레이션 상수: `lib/seed-curation.ts`
- Vercel env: `docs/VERCEL_ENV_SETUP.md`
- HERMES 로컬 구조: `~/.hermes` (default), 봇별 `~/.hermes/profiles/<이름>`, plist `~/Library/LaunchAgents/ai.hermes.gateway*.plist`
