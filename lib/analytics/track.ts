'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { GA_ID } from './ga4';
import { attachUtmToMetadata } from './utm';

/**
 * events 테이블 + GA4 통합 적재 wrapper.
 *
 * 결정 출처:
 *   §19 D21 — GA4 event name 매핑 한 곳에 정의
 *   §19 D55 — events.search 추가 (admin/analytics 인기 검색어 적재)
 *   §18.9 — Consent Mode v2 (denied 모드에서도 events 테이블은 적재. GA4만 차단)
 *
 * 사용:
 *   track('prompt_copy', { content_id, label });
 *   track('search', { keyword, results_count, filter });
 *   track('scroll_25', { content_id, depth: 25 });
 */

export type EventType =
  | 'pv'
  | 'deep_read'
  | 'prompt_copy'
  | 'save'
  | 'react_up'
  | 'react_down'
  | 'cta_click'
  | 'ebook_order'
  | 'ebook_download'
  | 'ebook_read_page'
  | 'ebook_finish'
  | 'scroll_25'
  | 'scroll_50'
  | 'scroll_100'
  | 'search';

/**
 * GA4 event name 매핑. D21 결정 — Phase 4 PG 도입 시점에 ebook_order → 'purchase' 매핑 활성.
 */
const GA4_EVENT_NAME: Record<EventType, string> = {
  pv: 'page_view',
  deep_read: 'deep_read',
  prompt_copy: 'prompt_copy',
  save: 'save',
  react_up: 'react_up',
  react_down: 'react_down',
  cta_click: 'cta_click',
  ebook_order: 'ebook_order', // Phase 4(PG)에 'purchase'로 변경
  ebook_download: 'ebook_download',
  ebook_read_page: 'ebook_read_page',
  ebook_finish: 'ebook_finish',
  scroll_25: 'scroll', // GA4 표준 'scroll' 이벤트로 통합 + depth params
  scroll_50: 'scroll',
  scroll_100: 'scroll',
  search: 'search',
};

/**
 * events 테이블 INSERT + GA4 fire (Consent granted 시).
 * 실패는 silent (운영 흐름 차단 안 함).
 */
export async function track(
  eventType: EventType,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const merged = attachUtmToMetadata(metadata);

  // 1) events 테이블 적재 (anon RLS 허용, 익명 사용자도 적재 가능)
  try {
    const supabase = createSupabaseBrowserClient();
    const { content_id, ...rest } = merged as { content_id?: string } & Record<
      string,
      unknown
    >;
    await supabase
      .from('events')
      .insert({
        event_type: eventType,
        content_id: content_id ?? null,
        metadata: rest,
      });
  } catch {
    // silent
  }

  // 2) GA4 fire (Consent granted 시만 — Consent Mode v2가 자동 처리)
  if (
    typeof window !== 'undefined' &&
    GA_ID &&
    typeof window.gtag === 'function'
  ) {
    const ga4Name = GA4_EVENT_NAME[eventType];
    window.gtag('event', ga4Name, merged);
  }
}
