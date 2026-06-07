import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/auth', '/api', '/_next', '/favicon.ico'];

// admin 접근 허용 이메일 — 기본값은 운영자 단일 계정.
// 여러 명 허용하려면 Vercel env ADMIN_EMAILS="a@x.com,b@y.com" 로 덮어씀.
const DEFAULT_ADMIN_EMAILS = 'caselab.kr@gmail.com';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? DEFAULT_ADMIN_EMAILS)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  try {
    return await updateSessionInner(request);
  } catch (e) {
    console.error('[middleware] failed:', e);
    const pathname = request.nextUrl.pathname;
    if (isPublicPath(pathname)) return NextResponse.next({ request });
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('error', 'middleware');
    return NextResponse.redirect(redirect);
  }
}

async function updateSessionInner(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) return response;

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !key) {
    console.warn('[middleware] missing supabase env, allowing through');
    return response;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`unexpected protocol: ${parsed.protocol}`);
    }
  } catch (e) {
    console.warn('[middleware] invalid NEXT_PUBLIC_SUPABASE_URL:', JSON.stringify(url), e);
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('next', pathname);
    return NextResponse.redirect(redirect);
  }

  // 단일 운영자 게이트 — 허용 이메일만 통과. 그 외 계정은 로그인돼도 차단.
  const email = (user.email ?? '').toLowerCase();
  if (!adminEmails().includes(email)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('error', 'forbidden');
    return NextResponse.redirect(redirect);
  }

  return response;
}
