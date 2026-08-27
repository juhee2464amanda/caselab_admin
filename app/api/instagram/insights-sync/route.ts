import { NextRequest, NextResponse } from 'next/server';
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
 * 주의: 이 인사이트는 오가닉만이다 — 부스트(광고) 성과는 Marketing API
 * (FB_ADS_TOKEN, act 광고계정)에서 광고분(지출·도달·노출·액션)을 자동 적재한다.
 * 부스트 광고의 creative에는 오가닉과 다른 섀도 미디어 id가 붙어서, 게시물 매칭은
 * ad.name의 캡션 접두("Instagram post: …")로 한다. category·traits·utm_code와
 * 수기 필드(budget·profile_visits·follows 등)는 동기화가 덮어쓰지 않는다.
 */

const IG_BASE = 'https://graph.instagram.com/v21.0';
const METRICS = 'reach,views,likes,comments,saved,shares,total_interactions';

type Insight = { name: string; values?: { value?: number }[] };

// 실행 = Vercel Cron(GET + Authorization: Bearer CRON_SECRET, 매일 KST 00:00) 또는
//        admin 수동(POST, /admin/insights [동기화] 버튼). seeds/purge와 동일 패턴.
async function authorize(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return profile?.role === 'admin';
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!(await authorize(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

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

  const adsResult = await syncAds(admin, errors);

  return NextResponse.json({ ok: errors.length === 0, synced, ads: adsResult, errors });
}

type AdInsight = { spend?: string; reach?: string; impressions?: string; actions?: { action_type: string; value: string }[] };
type MarketingAd = {
  id: string;
  name?: string;
  effective_status?: string;
  insights?: { data?: AdInsight[] };
};

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Marketing API에서 광고별 광고분 성과를 읽어 instagram_ads에 적재.
 * total_* 필드는 "광고 전달에서 발생한 몫"(post_reaction·comment·post_save…) —
 * 대시보드가 오가닉과 합산해 앱 표시 합계를 재현한다(실측: 저장 오가닉1+광고14=앱15).
 * 같은 게시물에 광고가 여러 개면 합산해 1행 정책 유지.
 */
async function syncAds(admin: ReturnType<typeof createSupabaseAdminClient>, errors: string[]) {
  const adsToken = process.env.FB_ADS_TOKEN;
  const adAccount = process.env.FB_AD_ACCOUNT_ID;
  if (!adsToken || !adAccount) return { skipped: 'FB_ADS_TOKEN / FB_AD_ACCOUNT_ID 미설정' };

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${adAccount}/ads?fields=id,name,effective_status,insights.date_preset(maximum){spend,reach,impressions,actions}&limit=100&access_token=${encodeURIComponent(adsToken)}`
  );
  const json = await res.json();
  if (!res.ok || json.error) {
    errors.push(`Marketing API: ${json.error?.message ?? res.status}`);
    return { synced: 0 };
  }

  const { data: posts } = await admin.from('instagram_posts').select('ig_media_id, caption');

  // 게시물별 광고분 합산
  const byMedia = new Map<
    string,
    { status: string; spend: number; reach: number; views: number; link_clicks: number; total_likes: number; total_comments: number; total_shares: number; total_saves: number }
  >();
  let unmatched = 0;

  for (const ad of (json.data ?? []) as MarketingAd[]) {
    // "Instagram post: <캡션 앞부분>..." → 캡션 접두 매칭 (섀도 미디어 id라 id 직결 불가)
    const prefix = norm((ad.name ?? '').replace(/^Instagram post: /, '').replace(/\.{3}$/, ''));
    const post = prefix
      ? (posts ?? []).find((p) => p.caption && norm(p.caption).startsWith(prefix))
      : undefined;
    if (!post) {
      unmatched++;
      continue;
    }
    const ins = ad.insights?.data?.[0];
    const act = (type: string) => Number(ins?.actions?.find((a) => a.action_type === type)?.value ?? 0);
    const cur = byMedia.get(post.ig_media_id) ?? {
      status: 'ended', spend: 0, reach: 0, views: 0, link_clicks: 0,
      total_likes: 0, total_comments: 0, total_shares: 0, total_saves: 0,
    };
    if (ad.effective_status === 'ACTIVE') cur.status = 'running';
    cur.spend += Math.round(Number(ins?.spend ?? 0));
    cur.reach += Number(ins?.reach ?? 0);
    cur.views += Number(ins?.impressions ?? 0);
    cur.link_clicks += act('link_click');
    cur.total_likes += act('post_reaction');
    cur.total_comments += act('comment');
    cur.total_shares += act('onsite_conversion.post_share') + act('post_share');
    cur.total_saves += act('onsite_conversion.post_save');
    byMedia.set(post.ig_media_id, cur);
  }

  let synced = 0;
  for (const [igMediaId, row] of byMedia) {
    // 수기 필드(budget·profile_visits·follows·started_on 등)를 보존하려고 upsert 대신 update/insert 분기
    const { data: existing } = await admin.from('instagram_ads').select('id').eq('ig_media_id', igMediaId).maybeSingle();
    const patch = { ...row, updated_at: new Date().toISOString() };
    const { error } = existing
      ? await admin.from('instagram_ads').update(patch).eq('id', existing.id)
      : await admin.from('instagram_ads').insert({ ig_media_id: igMediaId, ...patch });
    if (error) errors.push(`ads ${igMediaId}: ${error.message}`);
    else synced++;
  }

  return { synced, unmatched };
}
