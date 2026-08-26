import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /admin/insights 운영자 입력 저장.
 * - meta: 게시물 태깅(category·traits·utm_code) — 동기화가 덮어쓰지 않는 수동 영역
 * - ad: 광고 성과 수기 기록(게시물당 1행 upsert) — IG API가 부스트 성과를 안 내려줘서 수기
 */

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json();
  const igMediaId = String(body.ig_media_id ?? '');
  if (!igMediaId) return NextResponse.json({ error: 'ig_media_id 필요' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  if (body.meta) {
    const { category, traits, utm_code, own_comments, reposts } = body.meta;
    const { error } = await admin
      .from('instagram_posts')
      .update({
        category: category || null,
        traits: traits && Object.keys(traits).length ? traits : null,
        utm_code: utm_code || null,
        own_comments: Number(own_comments) || 0,
        reposts: Number(reposts) || 0,
      })
      .eq('ig_media_id', igMediaId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.ad) {
    const { status, spend, budget, reach, views, profile_visits, follows, link_clicks, started_on, ended_on, memo } =
      body.ad;
    const row = {
      ig_media_id: igMediaId,
      status: status === 'ended' ? 'ended' : 'running',
      spend: Number(spend) || 0,
      budget: Number(budget) || 0,
      reach: Number(reach) || 0,
      views: Number(views) || 0,
      profile_visits: Number(profile_visits) || 0,
      follows: Number(follows) || 0,
      link_clicks: Number(link_clicks) || 0,
      started_on: started_on || null,
      ended_on: ended_on || null,
      memo: memo || null,
      updated_at: new Date().toISOString(),
    };
    // 게시물당 광고 1행 정책 — 있으면 갱신, 없으면 생성
    const { data: existing } = await admin
      .from('instagram_ads')
      .select('id')
      .eq('ig_media_id', igMediaId)
      .maybeSingle();
    const { error } = existing
      ? await admin.from('instagram_ads').update(row).eq('id', existing.id)
      : await admin.from('instagram_ads').insert(row);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
