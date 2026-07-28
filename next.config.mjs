/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'k.kakaocdn.net' },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  // 카드프레스 렌더 라우트가 fs로 읽는 Pretendard woff를 Vercel 서버리스 번들에 포함
  outputFileTracingIncludes: {
    '/api/cardpress/render': ['./assets/fonts/*.woff'],
  },
};

export default nextConfig;
