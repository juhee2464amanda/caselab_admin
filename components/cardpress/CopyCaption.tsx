'use client';

import { useState } from 'react';

// 폰에서 캡션을 인스타 작성 화면에 붙여넣기 위한 버튼.
// 길게 눌러 선택하는 방식은 해시태그 줄에서 자주 어긋나서, 한 번에 전체를 집어준다.
export function CopyCaption({ text, label = '캡션 전체 복사' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // iOS 사파리는 사용자 제스처 밖이거나 비보안 컨텍스트(http://LAN)에서 clipboard API를 막는다
      // → 화면 밖 textarea + execCommand 로 떨어뜨린다. 로컬 와이파이 접속이 바로 이 경우다.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white active:opacity-80"
    >
      {done ? '복사됨 ✓' : label}
    </button>
  );
}
