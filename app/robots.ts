import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const IS_PROD = process.env.VERCEL_ENV === 'production' || !process.env.VERCEL_ENV;

export default function robots(): MetadataRoute.Robots {
  if (!IS_PROD) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    };
  }
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/mypage'] },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
