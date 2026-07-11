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
| 수집은 했는데 적재 안 됨 | 잡에 `terminal` 툴셋 없음 | jobs.json에 `enabled_toolsets: ["web","terminal"]` |
| 적재됐는데 인박스에 안 보임 | 미채점 (정상 동작) | 로컬 admin에서 채점 실행. 72h 창·60점 컷도 확인 |
| `inserted`가 보낸 수보다 적음 | dedup 차단 (정상) | 조치 불필요 |
| source_type이 `slack-brief` | lane 오타 또는 미등록 lane | 프롬프트 lane 이름 확인 / `LANE_SOURCE` 등록 |

## 참조

- API 계약·lane/버킷/양질 신호 정본: `etc/seed-source-spec.md`
- ingest 라우트: `app/api/seeds/ingest/route.ts`
- lane 매핑: `lib/seed-sources.ts` · 큐레이션 상수: `lib/seed-curation.ts`
- Vercel env: `docs/VERCEL_ENV_SETUP.md`
- HERMES 로컬 구조: `~/.hermes` (default), 봇별 `~/.hermes/profiles/<이름>`, plist `~/Library/LaunchAgents/ai.hermes.gateway*.plist`
