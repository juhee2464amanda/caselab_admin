'use client';

import { useState } from 'react';
import { Link2, Check } from 'lucide-react';

interface Props {
  url: string;
  title: string;
}

export function ShareButtons({ url, title }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }

  function shareKakao() {
    if (typeof window === 'undefined') return;
    // TODO: 운영 시 Kakao SDK 초기화 필요 — 이슈 등록 항목
    window.open(
      `https://story.kakao.com/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      '_blank',
      'width=500,height=600'
    );
  }

  function shareTwitter() {
    if (typeof window === 'undefined') return;
    window.open(
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      '_blank',
      'width=500,height=600'
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={shareKakao}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-yellow-300 text-ink hover:bg-yellow-400"
        aria-label="카카오톡 공유"
      >
        <span className="text-xs font-bold">K</span>
      </button>
      <button
        type="button"
        onClick={shareTwitter}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink text-white hover:bg-ink/90"
        aria-label="X 공유"
      >
        <span className="text-xs font-bold">𝕏</span>
      </button>
      <button
        type="button"
        onClick={copyLink}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-border text-ink hover:bg-muted"
        aria-label="링크 복사"
      >
        {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
