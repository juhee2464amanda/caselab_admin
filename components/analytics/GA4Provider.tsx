'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { GA_ID, pageview } from '@/lib/analytics/ga4';

const CONSENT_KEY = 'caselab.consent.analytics';

export function getAnalyticsConsent(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(CONSENT_KEY) === 'granted';
}

export function setAnalyticsConsent(granted: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
  // Consent Mode v2 update — 즉시 gtag에도 전파
  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }
  window.dispatchEvent(new Event('caselab:consent-change'));
}

/**
 * Consent Mode v2 + GA4 Script.
 *
 * 결정 출처: §19 D24 (Consent Mode v2 default denied → update granted, §18.9)
 *
 * - 페이지 진입 즉시 GA4 Script 로드 + `consent('default', { all: 'denied' })`
 *   → cookieless modeling으로 보강 (사용자가 거부 상태에서도 통계 일부 수집)
 * - 사용자가 CookieConsent에서 동의 → `setAnalyticsConsent(true)` → `consent('update', granted)`
 * - env 키 없으면 아예 렌더 안 함
 */
export function GA4Provider() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    setConsented(getAnalyticsConsent());
    function onChange() {
      setConsented(getAnalyticsConsent());
    }
    window.addEventListener('caselab:consent-change', onChange);
    return () => window.removeEventListener('caselab:consent-change', onChange);
  }, []);

  useEffect(() => {
    if (!GA_ID) return;
    // pageview는 consent와 무관하게 gtag에 전달 (Consent Mode v2가 차단 여부 결정)
    pageview(pathname + (params.toString() ? `?${params}` : ''));
  }, [pathname, params]);

  if (!GA_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-consent-init" strategy="beforeInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('consent', 'default', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: '${consented ? 'granted' : 'denied'}',
            wait_for_update: 500
          });
        `}
      </Script>
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
