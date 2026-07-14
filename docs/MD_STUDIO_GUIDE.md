# MD로 시작 — 초안 만들기 (돈 안 내는 방식)

초안 생성은 구독 Claude CLI로 로컬에서 돌아간다(토큰 비용 0원). 배포된 admin(Vercel)에선 안 됨 — 아래처럼 로컬에서 연다.

## 매번 하는 일 (딱 이것만)

```bash
npm run studio
```

- 서버가 뜨면 **MD로 시작 페이지가 브라우저에 자동으로 열림**
- 끝나면 그 터미널에서 `Ctrl+C`

수동으로 하고 싶으면: `npm run dev` → 브라우저에서 http://localhost:3000/admin/studio/import

## 페이지에서

1. 텔레그램에서 정리한 **완성 MD 붙여넣기**
2. **제목** + **콘텐츠 타입**(케이스/트렌드/도구/프롬프트/가이드) 선택
3. (선택) **"이 타입으로 엣지 제안"** — 각도·섹션 배치를 제안받아 다듬기
4. **"초안 생성"** 클릭 → 로컬 Claude CLI가 본문 생성 → DB에 draft로 저장
5. 열리는 편집 폼에서 검수 → 발행

## 처음 한 번만 (셋업)

- Claude CLI 로그인: `claude login` (구독 계정)
- `.env.local`에 아래가 있어야 함 (이미 설정돼 있음):
  ```
  AI_PROVIDER=subscription
  NEXT_PUBLIC_LOCAL_AI=true
  CLAUDE_CLI_PATH=/Users/amanda/.npm-global/bin/claude
  ```

## 안 될 때

- 생성 버튼이 안 보임 → `.env.local`의 `NEXT_PUBLIC_LOCAL_AI=true` 확인 후 서버 재시작
- 생성 중 에러 → 터미널에 `claude login` 세션 만료 메시지 있는지 확인, 재로그인
- 브라우저가 자동으로 안 열림 → 직접 http://localhost:3000/admin/studio/import 접속
