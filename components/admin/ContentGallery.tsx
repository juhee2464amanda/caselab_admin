'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// 갤러리(카드뉴스) — 여러 이미지를 좌우 화살표로 넘겨 본다. 본가 components/content/ContentGallery와 정합.
export function ContentGallery({ images }: { images: { url: string; caption?: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' });
  };

  if (images.length <= 1) {
    const im = images[0];
    return (
      <figure className="my-6">
        {im?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={im.url} alt="" className="w-full rounded-lg" loading="lazy" />
        )}
        {im?.caption && <figcaption className="mt-2 text-center text-[13px] text-ink/55">{im.caption}</figcaption>}
      </figure>
    );
  }

  return (
    <div className="group/gal relative my-6">
      <div
        ref={ref}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((im, i) => (
          <figure key={i} className="w-full shrink-0 snap-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.url} alt="" className="w-full rounded-lg" loading="lazy" />
            {im.caption && <figcaption className="mt-2 text-center text-[13px] text-ink/55">{im.caption}</figcaption>}
          </figure>
        ))}
      </div>
      <button
        type="button"
        onClick={() => scroll(-1)}
        className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white/90 text-ink shadow-md hover:bg-white"
        aria-label="이전"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => scroll(1)}
        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white/90 text-ink shadow-md hover:bg-white"
        aria-label="다음"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <div className="mt-1.5 text-center text-[11px] text-ink/40">좌우로 넘겨보세요 · 총 {images.length}장</div>
    </div>
  );
}
