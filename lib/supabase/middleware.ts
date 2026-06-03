import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/auth', '/api', '/_next', '/favicon.ico'];

// editor 진입 차단 — admin only 경로
// 계획서 §D17: editor 는 콘텐츠·자료실 운영, 분석·사용자·매출·설정·정산 영역은 admin only
const ADMIN_ONLY_PREFIXES = [
  '/admin/users',
  '/admin/analytics',
  '/admin/revenue',
  '/admin/settings',
  '/admin/ebooks',
  '/admin/opinions',
  '/admin/comments',
  '/admin/newsletters',
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isAdminOnly(pathname: string) {
  return ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !key) return response;

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const role = profile?.role ?? 'user';
  const isAdmin = role === 'admin';
  const isEditor = role === 'editor';

  if (!isAdmin && !isEditor) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('error', 'forbidden');
    return NextResponse.redirect(redirect);
  }

  if (isEditor && isAdminOnly(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/admin';
    return NextResponse.redirect(redirect);
  }

  return response;
}
