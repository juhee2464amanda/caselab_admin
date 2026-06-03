'use client';

import { useEffect } from 'react';
import { parseUtmFromSearch, saveUtmToSession } from '@/lib/analytics/utm';

/**
 * 페이지 최초 진입 시 URL의 ?utm_* 파라미터를 sessionStorage에 저장.
 * 같은 세션 동안 track() 호출 시 events.metadata에 자동 병합 (utm.ts attachUtmToMetadata).
 *
 * 결정 출처: §19 D25 (UTM Builder) — 인스타·뉴스레터 등 채널별 인입 추적
 *
 * 적용 위치: app/layout.tsx (root) 또는 user 영역 layout.
 */
export function UtmCapture() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const utm = parseUtmFromSearch(window.location.search);
    if (utm) {
      saveUtmToSession(utm);
    }
  }, []);

  return null;
}
