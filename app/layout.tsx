import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { GA4Provider } from '@/components/analytics/GA4Provider';
import { UtmCapture } from '@/components/analytics/UtmCapture';

export const metadata: Metadata = {
  title: {
    default: '케이스랩 — 일이 풀리는 AI 사용법',
    template: '%s | 케이스랩',
  },
  description:
    'AI를 일에 진짜 적용하는 방법을 framework × 단계별 AI 실행 × 솔직한 후기로 풀어내는 매거진.',
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
