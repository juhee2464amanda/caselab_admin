#!/usr/bin/env bash
# MD 직행 스튜디오 원클릭 실행기.
# 하는 일: (1) claude CLI 로그인 확인 → (2) 로컬 dev 서버 기동 → (3) 준비되면 MD로 시작 페이지를 브라우저로 자동 오픈.
# 사용: npm run studio  (또는 ./scripts/studio.sh)
set -euo pipefail

cd "$(dirname "$0")/.."

URL="http://localhost:3000/admin/studio/import"
CLAUDE_BIN="${CLAUDE_CLI_PATH:-$(command -v claude || true)}"

# 1) Claude CLI 로그인 확인 (초안 생성은 구독 CLI로 돌아감)
if [ -z "$CLAUDE_BIN" ]; then
  echo "❌ claude CLI를 찾을 수 없어요. 'npm i -g @anthropic-ai/claude-code' 후 'claude login' 하세요."
  exit 1
fi
if ! "$CLAUDE_BIN" -p --model sonnet "ping" >/dev/null 2>&1; then
  echo "⚠️  claude CLI 로그인이 안 돼 있는 것 같아요. 새 터미널에서 'claude login' 먼저 실행하세요."
  echo "    (로그인 돼 있는데도 이 메시지가 나오면 그냥 무시하고 진행해도 됩니다.)"
fi

# 2) 서버가 뜨면 브라우저 자동 오픈 (백그라운드 대기)
(
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "http://localhost:3000"; then
      open "$URL" 2>/dev/null || echo "브라우저를 못 열었어요. 직접 여세요: $URL"
      exit 0
    fi
    sleep 1
  done
) &

echo "▶  로컬 스튜디오 기동 중… 준비되면 자동으로 열립니다: $URL"
echo "   (끄려면 Ctrl+C)"

# 3) dev 서버 실행 (포그라운드)
exec npm run dev
