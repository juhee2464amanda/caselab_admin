import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const nextRaw = searchParams.get('next') ?? '/admin';
  // 루트('/')는 페이지가 없으므로 대시보드로 정규화
  const next = nextRaw === '/' ? '/admin' : nextRaw;

  if (code) {
    const response = NextResponse.redirect(`${origin}${next}`);
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookies: { name: string; value: string; options?: CookieOptions }[]) => {
            cookies.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );
    await supabase.auth.exchangeCodeForSession(code);
    return response;
  }
  return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
