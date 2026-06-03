'use client';

import { useEffect, useRef } from 'react';
import { track } from './track';

/**
 * 페이지 스크롤 깊이 25/50/100% 도달 시 1회씩 track() fire.
 *
 * 결정 출처: §19 D21 (track wrapper) — scroll_25/50/100 EventType
 *
 * 적용 위치: 콘텐츠 상세 페이지 layout 또는 client component에서 useScrollTracker() 호출.
 * 페이지당 1회만 발화 (한 사용자가 같은 글 다시 봐도 25%·50%·100% 각각 1번).
 */
export function useScrollTracker(opts: {
  contentId?: string;
  thresholds?: ReadonlyArray<25 | 50 | 100>;
} = {}) {
  const { contentId, thresholds = [25, 50, 100] as const } = opts;
  const firedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    firedRef.current = new Set();

    function getScrollDepthPercent(): number {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return 100; // 짧은 페이지는 즉시 100%
      return Math.min(100, Math.round((scrollTop / docHeight) * 100));
    }

    function onScroll() {
      const depth = getScrollDepthPercent();
      for (const t of thresholds) {
        if (depth >= t && !firedRef.current.has(t)) {
          firedRef.current.add(t);
          const eventName = `scroll_${t}` as const;
          track(eventName, contentId ? { content_id: contentId, depth } : { depth });
        }
      }
    }

    // 첫 fire (페이지 짧으면 즉시 100% 도달)
    onScroll();

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [contentId, thresholds]);
}
