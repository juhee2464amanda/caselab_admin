import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { InsightsClient, type InsightPost, type AdRow } from '@/components/admin/analytics/InsightsClient';
import { categoryFromUrl } from '@/lib/analytics/insight-category';

/**
 * /admin/insights — 인스타 콘텐츠 인사이트 (대시보드 소메뉴)
 *
 * 오가닉 지표: instagram_posts + instagram_metrics_daily(최신 스냅샷) — [동기화] 버튼이
 * IG Graph API에서 적재(app/api/instagram/insights-sync).
 * 광고: instagram_ads 수기 기록. 사이트 전환: utm_code→link_clicks(인간 클릭) 집계.
 * category·traits·utm_code 태깅과 광고 입력은 행의 [편집]에서 저장(insights-meta).
 */

export const dynamic = 'force-dynamic';

export default async function AdminInsights() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  // 조회는 RLS(is_admin) 걸린 테이블이라 세션 클라이언트로도 되지만,
  // link_clicks 집계까지 한 번에 하기 위해 service role로 읽는다(페이지 자체가 admin 전용 레이아웃).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <div className="p-4 sm:p-8 text-sm text-ink/60">로그인이 필요해요.</div>;

  const admin = createSupabaseAdminClient();

  const [{ data: posts }, { data: metrics }, { data: ads }, { data: links }] = await Promise.all([
    admin.from('instagram_posts').select('*').order('posted_at', { ascending: false }),
    admin.from('instagram_metrics_daily').select('*').order('captured_on', { ascending: false }),
    admin.from('instagram_ads').select('*'),
    admin.from('utm_links').select('id, code, target_url'),
  ]);

  // 게시물별 최신 스냅샷 (captured_on desc 정렬이라 첫 번째가 최신)
  const latest = new Map<string, NonNullable<typeof metrics>[number]>();
  for (const m of metrics ?? []) {
    if (!latest.has(m.ig_media_id)) latest.set(m.ig_media_id, m);
  }

  // utm_code → 인간 클릭 수
  const codeToLinkId = new Map((links ?? []).map((l) => [l.code, l.id]));
  const usedLinkIds = [...new Set((posts ?? []).map((p) => codeToLinkId.get(p.utm_code)).filter(Boolean))];
  const clicksByLink = new Map<string, number>();
  if (usedLinkIds.length > 0) {
    const { data: clicks } = await admin
      .from('link_clicks')
      .select('link_id')
      .in('link_id', usedLinkIds as string[])
      .eq('is_bot', false);
    for (const c of clicks ?? []) clicksByLink.set(c.link_id, (clicksByLink.get(c.link_id) ?? 0) + 1);
  }

  const adByMedia = new Map((ads ?? []).map((a) => [a.ig_media_id, a as AdRow]));

  // utm_code → 본가 상세 메뉴에서 도출한 분류. 편집 폼이 utm 입력 즉시 분류를 자동으로 채운다.
  const utmCategories: Record<string, string> = {};
  for (const l of links ?? []) {
    const derived = categoryFromUrl(l.target_url);
    if (derived) utmCategories[l.code] = derived;
  }

  const rows: InsightPost[] = (posts ?? []).map((p) => {
    const m = latest.get(p.ig_media_id);
    const linkId = codeToLinkId.get(p.utm_code);
    return {
      igMediaId: p.ig_media_id,
      title: (p.caption ?? '(캡션 없음)').split('\n')[0].slice(0, 80),
      permalink: p.permalink,
      thumbnailUrl: p.thumbnail_url,
      postedAt: p.posted_at,
      category: p.category,
      traits: p.traits,
      utmCode: p.utm_code,
      reach: m?.reach ?? 0,
      views: m?.views ?? 0,
      likes: m?.likes ?? 0,
      comments: m?.comments ?? 0,
      ownComments: p.own_comments ?? 0,
      saves: m?.saves ?? 0,
      shares: m?.shares ?? 0,
      reposts: p.reposts ?? 0,
      siteClicks: linkId ? (clicksByLink.get(linkId) ?? 0) : null,
      ad: adByMedia.get(p.ig_media_id) ?? null,
      capturedOn: m?.captured_on ?? null,
    };
  });

  return <InsightsClient posts={rows} utmCategories={utmCategories} />;
}
