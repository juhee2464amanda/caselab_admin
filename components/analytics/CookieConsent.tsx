'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { GA_ID } from '@/lib/analytics/ga4';
import { setAnalyticsConsent } from './GA4Provider';

const KEY = 'caselab.consent.banner-dismissed';

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!GA_ID) return; // GA 미설정이면 배너 자체 X
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(KEY) === '1') return;
    setShow(true);
  }, []);

  if (!show) return null;

  function accept() {
    setAnalyticsConsent(true);
    window.localStorage.setItem(KEY, '1');
    setShow(false);
  }

  function decline() {
    setAnalyticsConsent(false);
    window.localStorage.setItem(KEY, '1');
    setShow(false);
  }

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm z-50">
      <div className="rounded-md border border-border bg-white shadow-elevated p-4">
        <p className="text-sm leading-relaxed text-ink/80">
          글을 어떻게 읽으시는지 익명 통계(GA4)로 살펴봐도 될까요?
          개인을 식별하는 데는 쓰지 않아요.
        </p>
        <p className="mt-1.5 text-xs text-ink/50">
          자세한 내용은{' '}
          <Link href="/legal/privacy" className="underline">개인정보처리방침</Link>
          을 확인해주세요.
        </p>
        <div className="mt-3 flex gap-2">
          <Button onClick={accept} variant="accent" size="sm" className="flex-1">동의</Button>
          <Button onClick={decline} variant="outline" size="sm" className="flex-1">거부</Button>
        </div>
      </div>
    </div>
  );
}
