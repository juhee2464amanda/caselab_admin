import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 커버 이미지 Unsplash 인라인 검색 (spec §3-② 메타포 검색어 → 원클릭 검색).
// UNSPLASH_ACCESS_KEY 미설정이면 빈 결과 + 안내 (URL 직접 입력 폴백).
export async function GET(req: NextRequest) {
  const devBypass =
    process.env.NODE_ENV !== 'production' && req.headers.get('x-cardpress-dev') === '1';
  if (!devBypass) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const query = req.nextUrl.searchParams.get('query')?.trim();
  if (!query) return NextResponse.json({ error: 'query 필요' }, { status: 400 });

  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    return NextResponse.json({
      results: [],
      notice: 'UNSPLASH_ACCESS_KEY 미설정 — unsplash.com에서 직접 찾아 URL을 붙여넣어 주세요.',
    });
  }

  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12&orientation=portrait`,
    { headers: { Authorization: `Client-ID ${key}` } }
  );
  if (!res.ok)
    return NextResponse.json({ error: `Unsplash ${res.status}` }, { status: 502 });

  const data = (await res.json()) as {
    results: Array<{
      id: string;
      urls: { raw: string; small: string };
      user: { name: string; links: { html: string } };
    }>;
  };
  return NextResponse.json({
    results: data.results.map((r) => ({
      id: r.id,
      thumb: r.urls.small,
      // 커버 규격(1080×1350, 4:5)으로 크롭된 URL — Satori가 그대로 fetch
      full: `${r.urls.raw}&w=1080&h=1350&fit=crop&fm=jpg&q=80`,
      credit: r.user.name,
      creditLink: r.user.links.html,
    })),
  });
}
