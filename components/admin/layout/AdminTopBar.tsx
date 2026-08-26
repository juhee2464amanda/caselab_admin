import { OpenLocalStudioNotice } from '../studio/OpenLocalStudioNotice';

/**
 * AdminTopBar — admin 전 화면 상단 우측에 고정되는 바.
 *
 * "내 컴퓨터에서 스튜디오 열기"는 원래 씨앗 큐레이션/MD 임포트 화면에만 있었는데,
 * 콘텐츠 수정 중에도 로컬로 건너뛸 일이 많아 레이아웃으로 끌어올렸다.
 * 배포판(Vercel)에서만 의미가 있으므로 로컬(NEXT_PUBLIC_LOCAL_AI=true)에서는 렌더하지 않는다.
 * 모바일에선 상단 메뉴바(AdminSidebar, sticky z-30)와 겹치지 않게 sticky를 lg 이상에서만 건다.
 */
export function AdminTopBar() {
  if (process.env.NEXT_PUBLIC_LOCAL_AI === 'true') return null;

  return (
    <div className="static lg:sticky lg:top-0 z-20 flex items-center justify-end gap-3 border-b border-border bg-white/95 px-4 py-2 backdrop-blur sm:px-8">
      <span className="hidden text-[11px] text-ink/45 sm:inline">
        생성·초안은 내 컴퓨터에서만 동작해요
      </span>
      <OpenLocalStudioNotice variant="inline" />
    </div>
  );
}
