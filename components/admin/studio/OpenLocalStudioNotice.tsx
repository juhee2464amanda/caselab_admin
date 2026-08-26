// 배포판(Vercel)에서 초안·본문 생성이 안 될 때 띄우는 "내 컴퓨터에서 스튜디오 열기" 안내.
// 무료(구독 Claude)로 돌리기 위해 생성은 로컬에서만 작동한다. caselab-studio:// 딥링크가
// 로컬 스튜디오(next dev)를 켜고, 잠시 뒤 이 화면이 로컬로 다시 열리면 생성 버튼이 활성화된다.
// scripts/studio.sh 가 이 URL 스킴을 처리한다. 버튼이 안 되면 `npm run studio` 폴백.

// box: 넉넉한 설명 박스(MdImport 등 전용 화면). inline: 버튼 하나만(선택 패널 등 좁은 곳).
export function OpenLocalStudioNotice({ variant = 'box' }: { variant?: 'box' | 'inline' }) {
  if (variant === 'inline') {
    return (
      <a
        href="caselab-studio://open"
        title="내 컴퓨터에서 스튜디오가 켜지고, 잠시 뒤 이 화면이 로컬로 다시 열려요. 그때 생성 버튼이 활성화됩니다."
        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
      >
        ▶ 내 컴퓨터에서 스튜디오 열기
      </a>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
      <p className="font-semibold flex items-center gap-1.5">
        <span aria-hidden>🖥️</span> 생성은 내 컴퓨터에서 열어야 동작해요
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-amber-700">
        무료(구독 Claude)로 돌리기 위해 생성은 로컬에서만 작동합니다. 아래 버튼을 누르면
        내 컴퓨터에서 스튜디오가 켜지고 잠시 뒤 이 화면이 로컬로 다시 열려요. 그때 <b>생성</b>{' '}
        버튼이 활성화됩니다.
      </p>
      <a
        href="caselab-studio://open"
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
      >
        ▶ 내 컴퓨터에서 스튜디오 열기
      </a>
      <p className="mt-2 text-[12px] text-amber-600">
        처음 누르면 “CaselabStudio 열기를 허용하시겠습니까?”가 뜨는데 <b>허용</b>을 누르세요.
        버튼이 안 되면 터미널에서 <code className="rounded bg-amber-100 px-1">npm run studio</code>.
      </p>
    </div>
  );
}
