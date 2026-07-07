# 씨앗 소스 스펙 (HERMES → /admin/seeds)

`/admin/seeds`의 3개 목적 버킷을 채우는 소스 정의. HERMES(외부 스카우트 앱)가 소스(lane)별 브리핑을 `content_seeds`에 `source_type`과 함께 적재하고, 로컬 AI 채점기(`scoreSeed`)가 버킷으로 분류한다. 적재 경로는 2개:

- **직접 적재(권장)** — HERMES 크론 → `POST /api/seeds/ingest` (아래 "직접 적재" 절)
- **Slack 경로(하위호환)** — 전용 Slack lane → 웹훅(`/api/slack/hermes-brief`)

- **출처(`source_type`)** = 어디서 왔나 (provenance). lane 이름에서 결정.
- **버킷(`bucket`)** = 무엇에 쓸까 (용도). AI가 내용으로 분류하되 출처가 prior 힌트.
- 정의 단일 출처: `lib/seed-sources.ts`(소스·lane 매핑), `lib/seed-curation.ts`(버킷).

## 소스 ↔ lane ↔ 버킷 ↔ 품질 신호

`수집 기준`(무엇을) + `양질 신호`(무엇이 있어야 콘텐츠화 가치 있나)는 `lib/seed-sources.ts`의 `criteria`/`qualitySignal`이 단일 출처. **양질 신호는 `scoreSeed`에 주입돼 신호가 없으면 감점되고, 수동 적재 컴포저에 안내로 노출**된다.

| source_type | Slack lane | 주 버킷 | 양질 신호(없으면 감점) |
|---|---|---|---|
| `ai-briefing` | `ai-briefing` | 🔵 trend | 공식 발표·모델·정책 원문 + 구체 수치·날짜·출처 URL. 추측·소문 아님. |
| `service-scout` | `service-scout` | 🟢 service | 실재 서비스 + 실사용 신호(런칭·반응·트래픽·후기 1+) + 공식 URL. 홍보문구 아님. |
| `youtube` | `painpoint-youtube` | 🟠 painpoint | 실제 댓글 원문 2+ · 반복 막힘/불만 · 영상 링크. 요약만이면 약함. |
| `community` | `painpoint-community` | 🟠 painpoint | 실제 고충 원문 인용 · 여러 사람 공감/반복 · 스레드 링크. |
| `blog` | `painpoint-blog` | 🟠 painpoint | 구체적 상황·맥락 담긴 후기/문제 서술 본문 + 원문 URL(RSS). |
| `instagram` | `painpoint-instagram` | 🟠 painpoint | 릴스/게시물 댓글 needs 원문 + 링크(수동 발췌). |
| `slack-brief` | 기타 generic lane | (자유분류) | — (하위호환) |
| `manual` | — | — | — (태깅한 소스 기준에 준함) |

신규 소스 추가(직접 적재) = `lib/seed-sources.ts`의 `LANE_SOURCE`에 한 줄(이미 등록된 lane이면 생략) + HERMES 크론 프롬프트에 lane 이름. Slack 경로를 쓸 때만 채널 생성 + `@caselab-brief-listener` 초대 + `SLACK_HERMES_CHANNELS` env 추가가 필요.

## 직접 적재 (권장 경로, 2026-07-07~)

Slack lane을 거치지 않고 HERMES 크론이 admin으로 바로 POST한다. **Slack 채널·리스너·`SLACK_HERMES_CHANNELS` 셋팅 불필요.** 위 lane 이름·양질 신호 기준은 동일하게 적용된다(채점기 감점 규칙 그대로).

```
POST https://caselab-admin.vercel.app/api/seeds/ingest
Authorization: Bearer <HERMES_INGEST_TOKEN>
Content-Type: application/json

{
  "lane": "service-scout",
  "items": [
    {
      "title": "1줄 요약 (생략 시 raw_text 첫 줄)",
      "raw_text": "원문/맥락 — 15자 이상 필수. painpoint는 실제 코멘트 원문 인용.",
      "source_url": "https://... (기사/스레드/영상 원문 링크)",
      "dedup_key": "기사 URL 또는 잡ID:항목번호 (멱등키, 생략 시 raw_text 해시)"
    }
  ]
}
```

- **씨앗 1건 = 소재 1건** 계약 동일. HERMES가 항목을 이미 분할해서 `items` 배열로 보낸다(최대 50건). 크론 래퍼·다이제스트 분할 휴리스틱 불필요.
- **인증**: `HERMES_INGEST_TOKEN` 공유 토큰 — Vercel env와 HERMES 크론 양쪽에 동일 값.
- **멱등성**: `dedup_key`가 `slack_ts` 컬럼(text unique)에 `ingest:` 접두로 upsert — 재전송에도 중복 적재 없음. DDL 변경 없음.
- **적재 후 흐름 동일**: `origin='hermes-direct'`, `status='raw'` → 채점(scoreSeed) → 버킷 → 스튜디오 인박스.
- `lane` 대신 `source_type`을 직접 지정해도 된다(`isSeedSource` 검증, 미지정 시 lane 매핑 → `slack-brief` 폴백).

## 반자동 수집 로드맵 (RSS·API 단계적)

크롤러는 외부 HERMES 앱 몫(이 repo 밖). 안정적인 것부터 단계적으로 자동화하고, 그 전까지는 **admin 수동 적재**로 브리지한다(컴포저가 소스별 양질 신호를 안내).

1. **blog (RSS)** — 가장 안정. 정해진 실무 블로그/뉴스레터 RSS를 폴링 → 본문+URL을 `painpoint-blog` lane에 봇 브리핑.
2. **service-scout (API/피드)** — Product Hunt API·AI 뉴스레터·특정 X 계정 등에서 신규 서비스 + 실사용 신호 → `service-scout` lane.
3. **youtube (Data API)** — 지정 채널/영상의 댓글에서 반복 needs 원문 2+ 발췌 → `painpoint-youtube` lane.
4. **community** — 커리어리·Reddit 등 지정 스레드 원문 인용 → `painpoint-community` lane.
5. **instagram (수동)** — 공식 API 부재 → 운영자 수동 발췌(`source_type='instagram'`).

각 단계에서 봇 브리핑은 아래 "브리핑 형식"과 해당 소스의 양질 신호를 반드시 만족해야 한다(안 그러면 채점기가 감점).

## HERMES가 각 lane에 올릴 브리핑 형식

웹훅은 봇 메시지의 텍스트(또는 attachments/blocks)를 `raw_text`로, 첫 줄을 제목으로 적재한다. 채점·콘텐츠화 품질을 위해 브리핑 한 건 = 소재 한 건으로 다음을 포함:

- **1줄 요약(제목)** — 무엇에 대한 것인지 한 줄.
- **원문/맥락** — 발췌 인용, 반복되는 코멘트, 수치. painpoint는 "사람들이 실제로 뭐라 하는지" 원문 코멘트를 몇 개 붙일 것.
- **출처 URL** — 영상/스레드/포스트 링크(신뢰도 채점·원문 확인용).
- 크론 주기: lane별 자유(예: ai-briefing 일 1회, painpoint-* 주 수회). 봇 메시지만 적재되고 사람 대화는 제외됨.

## 인스타(수동 보조)

공식 댓글 API가 없어 자동 크롤이 어렵다. 운영자가 릴스/게시물 댓글에서 needs를 발췌해 `painpoint-instagram` 채널에 직접 올리거나(봇 아님 → 적재 안 됨 주의: 봇 계정으로 포스팅 필요), admin 수동 적재(`source_type='manual'`/`instagram`)로 대체한다.

## 흐름 요약

```
HERMES(소스별 크롤·요약) → 전용 Slack lane
   → POST /api/slack/hermes-brief  (lane → source_type)
   → content_seeds {source_type, status:'raw'}
   → 새 씨앗 분석(scoreSeed, 출처 힌트) → {bucket, score}
   → /admin/seeds 버킷별 top5 (카드에 출처 배지)
   → 복수선택 → 트랙 선택 → 콘텐츠 발행
```
