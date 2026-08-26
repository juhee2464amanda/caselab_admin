import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 인스타 게시물·지표 동기화 — /admin/insights [동기화] 버튼.
 *
 * IG Graph API(Instagram Login 토큰, 카드뉴스 발행과 동일 토큰)로 미디어 목록과
 * 게시물별 lifetime 인사이트를 읽어 instagram_posts를 upsert하고, 오늘 날짜로
 * instagram_metrics_daily 스냅샷을 쌓는다(하루 여러 번 눌러도 당일 행을 덮어씀).
 *
 * 주의: 이 인사이트는 오가닉만이다 — 부스트(광고) 조회·방문은 여기 합산되지 않아
 * instagram_ads에 수기로 기록한다(프로페셔널 대시보드 값). category·traits·utm_code는
 * 운영자가 붙이는 값이라 동기화가 덮어쓰지 않는다.
 */

const IG_BASE = 'https://graph.instagram.com/v21.0';
const METRICS = 'reach,views,likes,comments,saved,shares,total_interactions';

type Insight = { name: string; values?: { value?: number }[] };

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const userId = process.env.INSTAGRAM_USER_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!userId || !token) {
    return NextResponse.json({ error: 'INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN 미설정' }, { status: 500 });
  }

  const mediaRes = await fetch(
    `${IG_BASE}/${userId}/media?fields=id,caption,permalink,timestamp,media_type,thumbnail_url,media_url&limit=50&access_token=${token}`
  );
  const media = await mediaRes.json();
  if (!mediaRes.ok || media.error) {
    return NextResponse.json({ error: `Instagram API: ${media.error?.message ?? mediaRes.status}` }, { status: 502 });
  }

  const admin = createSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  let synced = 0;
  const errors: string[] = [];

  for (const m of media.data ?? []) {
    try {
      const insRes = await fetch(`${IG_BASE}/${m.id}/insights?metric=${METRICS}&access_token=${token}`);
      const ins = await insRes.json();
      if (!insRes.ok || ins.error) throw new Error(ins.error?.message ?? String(insRes.status));
      const v = (name: string) =>
        ((ins.data as Insight[]) ?? []).find((d) => d.name === name)?.values?.[0]?.value ?? 0;

      // category·traits·utm_code 등 운영자 태깅은 건드리지 않는다
      const { error: postErr } = await admin.from('instagram_posts').upsert(
        {
          ig_media_id: m.id,
          caption: m.caption ?? null,
          permalink: m.permalink ?? null,
          media_type: m.media_type ?? null,
          thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
          posted_at: m.timestamp,
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'ig_media_id' }
      );
      if (postErr) throw new Error(postErr.message);

      const { error: metricErr } = await admin.from('instagram_metrics_daily').upsert(
        {
          ig_media_id: m.id,
          captured_on: today,
          reach: v('reach'),
          views: v('views'),
          likes: v('likes'),
          comments: v('comments'),
          saves: v('saved'),
          shares: v('shares'),
          total_interactions: v('total_interactions'),
        },
        { onConflict: 'ig_media_id,captured_on' }
      );
      if (metricErr) throw new Error(metricErr.message);
      synced++;
    } catch (e) {
      errors.push(`${m.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ ok: errors.length === 0, synced, errors });
}
