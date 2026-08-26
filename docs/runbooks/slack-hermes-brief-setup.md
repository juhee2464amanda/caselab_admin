# HERMES 브리퍼 → Seed Backlog 자동 적재 설정 가이드

Slack 채널에 브리퍼 메시지가 올라오면 **실시간**으로 Notion Seed Backlog에
`출처=hermes-slack`·`status=시작 전(draft)` 행으로 자동 적재된다.
요약·각도·실험가설·핵심인사이트는 자동으로 채우지 않는다 — **하루 1회 triage 때 Claude가 입히고, 운영자가 직접 실험 후 ready로 승격**(직접실험 게이트 유지).

- 웹훅 경로: `POST /api/slack/hermes-brief`
- 코드: `app/api/slack/hermes-brief/route.ts`, `lib/notion.ts`
- 자동화 수준: **raw만 떨구기** (LLM 미사용)

---

## 1. Notion 통합 토큰 발급 + DB 연결
1. https://www.notion.so/my-integrations → **New integration**(내부) 생성 → **Internal Integration Token**(`ntn_...`) 복사
2. Seed Backlog DB 페이지 → 우상단 `...` → **Connections** → 방금 만든 통합 추가
3. DB ID 확인: `c5b293982e854db2940211c861c50112` (이미 알고 있음)

## 2. Slack 앱 이벤트 구독
1. https://api.slack.com/apps → **hermes 앱** 선택
2. **OAuth & Permissions** → Bot Token Scopes에 `channels:history` (공개 채널) 또는 `groups:history` (비공개) 추가 → 워크스페이스에 재설치
3. **Basic Information** → **Signing Secret** 복사
4. 브리퍼가 올라오는 채널에 봇 초대: 채널에서 `/invite @hermes`
5. **Event Subscriptions** → Enable On
   - **Request URL**: `https://caselab-admin.vercel.app/api/slack/hermes-brief`
     (저장 시 Slack이 challenge 검증 → 코드가 자동 응답하므로 ✅ Verified 떠야 함)
   - **Subscribe to bot events**: `message.channels` (공개) 또는 `message.groups` (비공개)
   - 저장
6. 대상 채널 ID 확인: 채널명 클릭 → 세부정보 맨 아래 **Channel ID** (`C0...`)

## 3. Vercel 환경변수 (admin 프로젝트)
Settings → Environment Variables 에 추가 후 **재배포**:

| 변수 | 값 |
|---|---|
| `SLACK_SIGNING_SECRET` | (2-3에서 복사) |
| `SLACK_HERMES_CHANNEL_ID` | `C0...` (2-6) |
| `NOTION_TOKEN` | `ntn_...` (1-1) |
| `NOTION_SEED_DB_ID` | `c5b293982e854db2940211c861c50112` |

## 4. 동작 확인
1. 대상 채널에 아무 메시지나 올림
2. Notion Seed Backlog에 📡 아이콘 draft 행이 생기는지 확인
3. 안 생기면: Vercel → 해당 함수 로그에서 `[hermes-brief] failed:` 확인

---

## 동작/안전장치
- **서명 검증**: Slack Signing Secret(v0 HMAC) + 5분 타임스탬프 → 위조 요청 차단
- **채널 화이트리스트**: `SLACK_HERMES_CHANNEL_ID` 외 채널 무시
- **중복 방지**: 메시지 `ts` 기반(`원천링크`에 `p<ts>` 저장) — Slack 재전송에도 멱등
- **필터**: 메시지 편집/삭제/입장 등(subtype) 제외, 본문 빈 메시지 제외, 봇 브리핑은 허용
- **직접실험 게이트**: 항상 `시작 전(draft)`로만 착지 → 자동 발행 파이프라인에 안 들어감

## Telegram 스트림은?
이 웹훅은 Slack 전용. Telegram 브리핑은 당분간 **붙여넣기**로 처리하고,
자동화가 필요하면 별도로 Telegram `getUpdates`/웹훅 → 같은 `createBriefSeed`(origin=`hermes-telegram`) 재사용.
