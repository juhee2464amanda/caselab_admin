import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { GA4Provider } from '@/components/analytics/GA4Provider';
import { UtmCapture } from '@/components/analytics/UtmCapture';

export const metadata: Metadata = {
  title: {
    default: '케이스랩 관리자',
    template: '%s | 케이스랩 관리자',
  },
  description: '케이스랩 콘텐츠·회원·통계 관리자 페이지.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: '케이스랩',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Suspense fallback={null}>
          <GA4Provider />
          <UtmCapture />
        </Suspense>
        <SpeedInsights />
      </body>
    </html>
  );
}
