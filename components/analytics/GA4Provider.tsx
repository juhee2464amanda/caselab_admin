'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { GA_ID, pageview } from '@/lib/analytics/ga4';

/**
 * GA4 Script — 동의 카드 없이 자동 수집.
 *
 * - 페이지 진입 즉시 GA4 Script 로드 + `analytics_storage: 'granted'`
 * - 광고 관련 스토리지(ad_*)는 denied 유지 (분석 통계만 수집)
 * - env 키 없으면 아예 렌더 안 함
 */
export function GA4Provider() {
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    if (!GA_ID) return;
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
            analytics_storage: 'granted'
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
