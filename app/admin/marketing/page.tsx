import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import { MarketingLinkForm, ShortLinkCell, ActiveToggle } from '@/components/admin/MarketingLinkForm';

// /admin/marketing — 유입 링크 대장. ManyChat 숏링크(utm_links.kind='manychat')
// 생성·관리 + link_clicks 서버측 클릭 집계(총/최근 7일, 봇 제외).
type MarketingLink = {
  id: string;
  label: string;
  code: string | null;
  keyword: string | null;
  ig_post_url: string | null;
  flow_name: string | null;
  full_url: string;
  memo: string | null;
  is_active: boolean;
  created_at: string;
};

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default async function AdminMarketing() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('utm_links')
    .select('id, label, code, keyword, ig_post_url, flow_name, full_url, memo, is_active, created_at')
    .eq('kind', 'manychat')
    .order('created_at', { ascending: false });
  const links = (data ?? []) as MarketingLink[];

  // 클릭 집계 — 볼륨이 작아 행을 받아 JS에서 총/7일 카운트 (봇 제외)
  const counts = new Map<string, { total: number; week: number }>();
  if (links.length > 0) {
    const { data: clicks } = await supabase
      .from('link_clicks')
      .select('link_id, clicked_at')
      .eq('is_bot', false)
      .in('link_id', links.map((l) => l.id));
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const c of clicks ?? []) {
      const cur = counts.get(c.link_id) ?? { total: 0, week: 0 };
      cur.total += 1;
      if (new Date(c.clicked_at).getTime() >= weekAgo) cur.week += 1;
      counts.set(c.link_id, cur);
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">유입 링크</h1>
        <p className="text-sm text-ink/60 mt-1">
          ManyChat DM에 넣을 숏링크를 만들고, 게시물·키워드별 유입 클릭을 관리하세요. 클릭은 서버에서 직접 집계돼요 (봇 제외).
        </p>
      </header>

      <MarketingLinkForm siteBase={SITE} />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3">라벨</th>
              <th className="px-4 py-3 w-24">키워드</th>
              <th className="px-4 py-3 w-20">게시물</th>
              <th className="px-4 py-3 w-32">플로우</th>
              <th className="px-4 py-3">숏링크</th>
              <th className="px-4 py-3 w-28 text-right">클릭 (7일)</th>
              <th className="px-4 py-3 w-20">상태</th>
              <th className="px-4 py-3 w-28">생성일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {links.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-ink/40">생성된 유입 링크가 없어요. 위에서 첫 숏링크를 만들어 보세요.</td></tr>
            )}
            {links.map((l) => {
              const c = counts.get(l.id) ?? { total: 0, week: 0 };
              return (
                <tr key={l.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.label}</div>
                    {l.memo && <div className="text-xs text-ink/40 mt-0.5">{l.memo}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">{l.keyword ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    {l.ig_post_url ? (
                      <a href={l.ig_post_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">보기 ↗</a>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">{l.flow_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {l.code ? (
                      <ShortLinkCell url={`${SITE}/l/${l.code}`} />
                    ) : (
                      <a href={l.full_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline break-all">{l.full_url}</a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className="font-medium">{c.total}</span>
                    <span className="text-xs text-ink/40"> ({c.week})</span>
                  </td>
                  <td className="px-4 py-3"><ActiveToggle id={l.id} isActive={l.is_active} /></td>
                  <td className="px-4 py-3 text-xs text-ink/50">{formatDate(l.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
