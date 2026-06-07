import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

// /admin/analytics/search — 인기 검색어 (D55) + 새로 시도된 검색어 (피드백 #1).
// events(event_type='search').metadata = { keyword, results_count, filter } 집계.
type SearchMeta = { metadata: { keyword?: string; results_count?: number } | null; created_at: string };

export const dynamic = 'force-dynamic';

export default async function AdminSearchKeywords() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const sevenAgo = Date.now() - 7 * 86400000;
  const { data } = await supabase
    .from('events')
    .select('metadata, created_at')
    .eq('event_type', 'search')
    .gt('created_at', since)
    .limit(3000);
  const rows = (data ?? []) as SearchMeta[];

  const agg = new Map<string, { count: number; totalResults: number; zero: number; recentCount: number; firstSeen: number }>();
  for (const r of rows) {
    const kw = (r.metadata?.keyword ?? '').toString().trim();
    if (!kw) continue;
    const ts = new Date(r.created_at).getTime();
    const e = agg.get(kw) ?? { count: 0, totalResults: 0, zero: 0, recentCount: 0, firstSeen: ts };
    const rc = Number(r.metadata?.results_count ?? 0);
    e.count += 1;
    e.totalResults += rc;
    if (rc === 0) e.zero += 1;
    if (ts >= sevenAgo) e.recentCount += 1;
    e.firstSeen = Math.min(e.firstSeen, ts);
    agg.set(kw, e);
  }

  // 새로 시도된 검색어 = 최근 7일 안에 처음 등장 (그 전엔 없던 키워드) Top 5
  const newKeywords = [...agg.entries()]
    .filter(([, e]) => e.firstSeen >= sevenAgo)
    .map(([keyword, e]) => ({ keyword, recentCount: e.recentCount, zero: e.zero, count: e.count }))
    .sort((a, b) => b.recentCount - a.recentCount)
    .slice(0, 5);
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

      {/* 새로 시도된 검색어 Top 5 (최근 7일 첫 등장) */}
      <section className="card p-5 border-l-4 border-accent">
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="font-serif text-base font-semibold">✨ 새로 시도된 검색어</h2>
          <span className="text-[11px] text-ink/40">최근 7일 처음 등장 · Top 5</span>
        </div>
        {newKeywords.length === 0 ? (
          <p className="text-sm text-ink/40">최근 7일 새로 등장한 검색어가 없어요.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {newKeywords.map((k) => (
              <span key={k.keyword} className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/5 px-3 py-1.5 text-sm">
                <span className="font-medium">{k.keyword}</span>
                <span className="text-xs text-ink/40">{k.recentCount}회</span>
                {k.zero > 0 && <span className="text-[10px] text-amber-600">0결과</span>}
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-ink/40">신규 검색어는 새로운 수요 신호예요. 0결과면 콘텐츠 제작 후보.</p>
      </section>

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
