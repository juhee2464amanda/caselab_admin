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
      color?: string;
      urls: { raw: string; small: string };
      user: { name: string; links: { html: string } };
    }>;
  };
  return NextResponse.json({
    results: data.results
      .map((r) => ({
        id: r.id,
        thumb: r.urls.small,
        // 커버 규격(1080×1350, 4:5)으로 크롭된 URL — Satori가 그대로 fetch
        full: `${r.urls.raw}&w=1080&h=1350&fit=crop&fm=jpg&q=80`,
        credit: r.user.name,
        creditLink: r.user.links.html,
        bright: isBright(r.color),
      }))
      // 밝은 사진을 뒤로 민다 — 지우지는 않는다(대표색은 근사라 오탐이 난다. 판단은 사람이)
      .sort((a, b) => Number(a.bright) - Number(b.bright)),
  });
}

/** 대표색으로 "흰 글자가 죽는 사진"을 가려낸다.
 *  v3 커버는 하단 스크림이 깔리지만 스크림은 아래 66%만 덮는다 — 위쪽이 하얀 사진은
 *  아이브로우·워드마크가 먼저 죽는다. Unsplash가 주는 color(대표색) 하나로 미리 거른다.
 *  ⚠️ 픽셀을 재는 게 아니라 근사다. 그래서 제외가 아니라 정렬만 바꾼다(하드 필터는 오탐이 아프다). */
function isBright(hex?: string): boolean {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return false;
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  // WCAG 상대 휘도
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.45;
}
