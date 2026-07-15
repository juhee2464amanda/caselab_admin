#!/bin/bash
# CaselabStudio 런처 — admin의 "내 컴퓨터에서 스튜디오 열기" 버튼(caselab-studio://open)이 부르는 스크립트.
# ~/Applications/CaselabStudio.app 이 이 파일을 Terminal로 실행한다.
# 로컬 dev 서버(npm run studio)를 띄우고, 준비되면 "MD로 시작" 화면을 자동으로 연다.

PROJ="/Users/amanda/Documents/01.side_project/02. caselab/apps/caselab_admin"
URL="http://localhost:3000/admin/studio/import"

# GUI 세션에서 실행되므로 Homebrew 경로를 PATH에 명시적으로 추가(npm 위치 보장).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$PROJ" || { echo "프로젝트 폴더를 찾을 수 없습니다: $PROJ"; exit 1; }

# 이미 서버가 떠 있으면 또 띄우지 않고 화면만 연다.
if curl -sf -o /dev/null http://localhost:3000; then
  echo "✓ 스튜디오가 이미 켜져 있어요. 화면을 엽니다."
  open "$URL"
  exit 0
fi

echo "▶ CaselabStudio 시작 중… 잠시만요. (이 창을 닫으면 스튜디오가 꺼집니다)"

# 서버가 응답하기 시작하면 브라우저를 여는 감시자를 백그라운드로 돌린다(최대 60초 대기).
(
  for _ in $(seq 1 60); do
    sleep 1
    if curl -sf -o /dev/null http://localhost:3000; then
      open "$URL"
      break
    fi
  done
) &

# dev 서버는 포그라운드로 — 이 창이 서버 콘솔이 되고, 창을 닫을 때까지 유지된다.
exec npm run studio
