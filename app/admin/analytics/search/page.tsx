import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

// /admin/analytics/search — 인기 검색어 (D55).
// events(event_type='search').metadata = { keyword, results_count, filter } 집계.
type SearchMeta = { metadata: { keyword?: string; results_count?: number } | null };

export const dynamic = 'force-dynamic';

export default async function AdminSearchKeywords() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data } = await supabase
    .from('events')
    .select('metadata')
    .eq('event_type', 'search')
    .gt('created_at', since)
    .limit(3000);
  const rows = (data ?? []) as SearchMeta[];

  const agg = new Map<string, { count: number; totalResults: number; zero: number }>();
  for (const r of rows) {
    const kw = (r.metadata?.keyword ?? '').toString().trim();
    if (!kw) continue;
    const e = agg.get(kw) ?? { count: 0, totalResults: 0, zero: 0 };
    const rc = Number(r.metadata?.results_count ?? 0);
    e.count += 1;
    e.totalResults += rc;
    if (rc === 0) e.zero += 1;
    agg.set(kw, e);
  }
  const keywords = [...agg.entries()]
    .map(([keyword, e]) => ({ keyword, ...e }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
  const totalSearches = rows.length;
  const zeroResultKeywords = keywords.filter((k) => k.zero > 0).length;

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">검색 키워드</h1>
        <p className="text-sm text-ink/60 mt-1">최근 30일 사용자 검색어 Top 50. 0결과 검색어 = 콘텐츠 갭 신호.</p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4"><div className="text-xs text-ink/50">총 검색</div><div className="mt-1 font-serif text-2xl font-semibold tabular-nums">{totalSearches.toLocaleString('ko-KR')}</div></div>
        <div className="card p-4"><div className="text-xs text-ink/50">고유 검색어</div><div className="mt-1 font-serif text-2xl font-semibold tabular-nums">{agg.size.toLocaleString('ko-KR')}</div></div>
        <div className="card p-4"><div className="text-xs text-ink/50">0결과 검색어</div><div className="mt-1 font-serif text-2xl font-semibold tabular-nums text-amber-600">{zeroResultKeywords.toLocaleString('ko-KR')}</div></div>
      </section>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3 w-12 text-right">#</th>
              <th className="px-4 py-3">검색어</th>
              <th className="px-4 py-3 w-20 text-right">횟수</th>
              <th className="px-4 py-3 w-24 text-right">0결과율</th>
              <th className="px-4 py-3 w-24 text-right">평균 결과</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {keywords.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink/40">최근 30일 검색 기록이 없어요.</td></tr>
            )}
            {keywords.map((k, i) => {
              const zeroRate = k.count ? Math.round((k.zero / k.count) * 100) : 0;
              const avg = k.count ? (k.totalResults / k.count).toFixed(1) : '0';
              return (
                <tr key={k.keyword} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-right tabular-nums text-ink/30">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{k.keyword}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{k.count.toLocaleString('ko-KR')}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${zeroRate >= 50 ? 'text-amber-600 font-semibold' : 'text-ink/60'}`}>{zeroRate}%</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink/60">{avg}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
