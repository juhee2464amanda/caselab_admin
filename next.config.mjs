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
  // suggest-images(로컬 전용)가 동적 import하는 playwright를 서버 번들에서 제외 —
  // devDependency라 Vercel 빌드에 없어도 빌드가 깨지지 않게 한다.
  serverExternalPackages: ['playwright'],
  // 카드프레스 렌더 라우트가 fs로 읽는 Pretendard woff를 Vercel 서버리스 번들에 포함
  outputFileTracingIncludes: {
    '/api/cardpress/render': ['./assets/fonts/*.woff'],
  },
};

export default nextConfig;
