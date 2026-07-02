# 씨앗 소스 스펙 (HERMES → /admin/seeds)

`/admin/seeds`의 3개 목적 버킷을 채우는 소스 정의. HERMES(외부 스카우트 앱)가 소스별 **전용 Slack lane**에 브리핑을 올리면 웹훅(`/api/slack/hermes-brief`)이 `content_seeds`에 `source_type`과 함께 적재하고, 로컬 AI 채점기(`scoreSeed`)가 버킷으로 분류한다.

- **출처(`source_type`)** = 어디서 왔나 (provenance). Slack lane에서 결정.
- **버킷(`bucket`)** = 무엇에 쓸까 (용도). AI가 내용으로 분류하되 출처가 prior 힌트.
- 정의 단일 출처: `lib/seed-sources.ts`(소스·lane 매핑), `lib/seed-curation.ts`(버킷).

## 소스 ↔ lane ↔ 버킷

| source_type | Slack lane | 주 버킷 | 수집 기준 |
|---|---|---|---|
| `ai-briefing` | `ai-briefing` | 🔵 trend | AI 업계 새 발표·모델·정책·화제. 직무인 시사점 있는 것. (기존 scout/analyst 흡수 가능) |
| `service-scout` | `service-scout` | 🟢 service | 새로 나와 입소문 나는 AI 서비스/도구. 실무 적용 가능. |
| `youtube` | `painpoint-youtube` | 🟠 painpoint | 직무·AI 관련 영상 댓글에서 반복되는 막힘·불만·needs. |
| `community` | `painpoint-community` | 🟠 painpoint | 커리어리·아웃스탠딩·Reddit·오픈카톡 등 실무 고충 스레드. |
| `blog` | `painpoint-blog` | 🟠 painpoint | 실무 후기·문제 서술형 포스트(RSS 기반, 가장 안정적). |
| `instagram` | `painpoint-instagram` | 🟠 painpoint | 릴스·게시물 댓글 needs. **공식 API 부재 → 수동 보조**. |
| `slack-brief` | 기타 generic lane | (자유분류) | 기존 범용 브리핑(하위호환). |
| `manual` | — | — | 운영자 admin 직접 적재. |

신규 소스 추가 = ① Slack 채널 생성 + `@caselab-brief-listener` 초대 → ② `lib/seed-sources.ts`의 `LANE_SOURCE`에 한 줄 → ③ `SLACK_HERMES_CHANNELS` env에 `채널ID:lane` 추가.

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
