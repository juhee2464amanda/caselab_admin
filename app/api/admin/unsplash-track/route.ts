import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Unsplash API 약관: 사진을 실제로 채택(다운로드)할 때 그 사진의 download_location을 한 번 호출해야 한다.
// 검색 결과를 보기만 한 사진은 호출하지 않는다 — 그래서 검색(suggest-thumbnail)이 아니라 '반영' 시점에 부른다.
// 실패해도 사용자 흐름은 막지 않는다(썸네일은 이미 우리 버킷에 복사된 뒤).
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const key = process.env.UNSPLASH_ACCESS_KEY;
  const { location } = (await req.json()) as { location?: string };
  if (!key || !location || !/^https:\/\/api\.unsplash\.com\//.test(location)) {
    return NextResponse.json({ ok: false });
  }
  try {
    await fetch(location, {
      headers: { Authorization: `Client-ID ${key}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* 표기 트래킹 실패는 무시 */
  }
  return NextResponse.json({ ok: true });
}
