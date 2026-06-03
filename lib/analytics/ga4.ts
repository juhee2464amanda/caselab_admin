'use client';

declare global {
  interface Window {
    gtag?: (command: string, ...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '';

export function isGAEnabled(): boolean {
  return typeof window !== 'undefined' && !!GA_ID && typeof window.gtag === 'function';
}

export function pageview(url: string) {
  if (!isGAEnabled()) return;
  window.gtag!('config', GA_ID, { page_path: url });
}

export function track(event: string, params: Record<string, unknown> = {}) {
  if (!isGAEnabled()) return;
  window.gtag!('event', event, params);
}
