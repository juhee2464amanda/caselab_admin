'use client';

import { useDeepRead } from '@/lib/analytics/deep-read';

export function DeepReadTracker({ contentId }: { contentId: string }) {
  useDeepRead({ contentId });
  return null;
}
