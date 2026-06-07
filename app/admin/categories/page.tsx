import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { CategoryManager, type Category, type Tag } from '@/components/admin/CategoryManager';

// /admin/categories — 피드백 #4: '관심사(태그) 분석' 중심으로 재정의.
//   1) 메뉴별 태그·수  2) 반응율 높은 태그(관심사)  3) 추천 태그(미등록 인기 검색어)
//   관리(CRUD)는 하단 CategoryManager 유지.
export const dynamic = 'force-dynamic';

type CTag = { tag_id: string; content_id: string };
type CStat = { content_id: string; view_count: number; save_count: number; like_count: number; comment_count: number };
type SearchMeta = { metadata: { keyword?: string } | null };

export default async function AdminCategories() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

  const [catRes, tagRes, ctRes, ttRes, csRes, searchRes] = await Promise.all([
    supabase.from('categories').select('id, type, parent_track, slug, label, sort_order, is_active').order('type').order('sort_order'),
    supabase.from('tags').select('id, slug, label, usage_count').order('usage_count', { ascending: false }),
    supabase.from('content_tags').select('tag_id, content_id').limit(8000),
    supabase.from('tool_tags').select('tag_id').limit(8000),
    supabase.from('content_stats').select('content_id, view_count, save_count, like_count, comment_count'),
    supabase.from('events').select('metadata').eq('event_type', 'search').gt('created_at', since30).limit(3000),
  ]);

  const categories = (catRes.data ?? []) as Category[];
  const tags = (tagRes.data ?? []) as Tag[];
  const contentTags = (ctRes.data ?? []) as CTag[];
  const toolTags = (ttRes.data ?? []) as { tag_id: string }[];
  const stats = new Map<string, CStat>();
  for (const s of (csRes.data ?? []) as CStat[]) stats.set(s.content_id, s);

  // 태그별 집계
  type Agg = { contentCount: number; toolCount: number; views: number; engage: number };
  const agg = new Map<string, Agg>();
  const get = (id: string) => agg.get(id) ?? { contentCount: 0, toolCount: 0, views: 0, engage: 0 };
  for (const ct of contentTags) {
    const a = get(ct.tag_id);
    a.contentCount += 1;
    const s = stats.get(ct.content_id);
    if (s) {
      a.views += s.view_count ?? 0;
      a.engage += (s.save_count ?? 0) + (s.like_count ?? 0) + (s.comment_count ?? 0);
    }
    agg.set(ct.tag_id, a);
  }
  for (const tt of toolTags) {
    const a = get(tt.tag_id);
    a.toolCount += 1;
    agg.set(tt.tag_id, a);
  }

  const tagRows = tags
    .map((t) => {
      const a = agg.get(t.id) ?? { contentCount: 0, toolCount: 0, views: 0, engage: 0 };
      const rate = a.views ? (a.engage / a.views) * 100 : 0;
      return { ...t, ...a, rate };
    })
    .sort((x, y) => y.engage - x.engage);

  // 추천 태그 = 미등록 인기 검색어
  const tagLabels = new Set(tags.flatMap((t) => [t.label.toLowerCase(), t.slug.toLowerCase()]));
  const kwCount = new Map<string, number>();
  for (const r of (searchRes.data ?? []) as SearchMeta[]) {
    const kw = (r.metadata?.keyword ?? '').toString().trim();
    if (!kw) continue;
    kwCount.set(kw, (kwCount.get(kw) ?? 0) + 1);
  }
  const suggested = [...kwCount.entries()]
    .filter(([kw]) => !tagLabels.has(kw.toLowerCase()))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div className="p-4 sm:p-8 space-y-8">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">카테고리·태그 — 관심사 분석</h1>
        <p className="text-sm text-ink/60 mt-1">어떤 태그(관심사)가 반응을 많이 받는지, 추가하면 좋을 태그는 무엇인지.</p>
      </header>

      {/* 반응율 높은 태그 */}
      <section>
        <h2 className="font-serif text-base font-semibold mb-3">관심사(태그)별 반응</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-4 py-3">태그</th>
                <th className="px-4 py-3 w-28 text-right">사용 (콘텐츠/도구)</th>
                <th className="px-4 py-3 w-24 text-right">총 조회</th>
                <th className="px-4 py-3 w-28 text-right">저장+좋아요+댓글</th>
                <th className="px-4 py-3 w-20 text-right">반응율</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tagRows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-ink/40">등록된 태그가 없어요.</td></tr>
              )}
              {tagRows.map((t) => (
                <tr key={t.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{t.label}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink/60">{t.contentCount} / {t.toolCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.views.toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{t.engage.toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-accent">{t.rate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 추천 태그 */}
      <section>
        <h2 className="font-serif text-base font-semibold mb-1">추천 태그 <span className="text-xs text-ink/40 font-normal">미등록 인기 검색어</span></h2>
        <p className="text-xs text-ink/40 mb-3">아직 태그가 아닌데 검색이 많은 키워드. 새 관심사 태그 후보예요.</p>
        <div className="flex flex-wrap gap-2">
          {suggested.length === 0 && <span className="text-sm text-ink/40">추천할 키워드가 없어요.</span>}
          {suggested.map(([kw, n]) => (
            <span key={kw} className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/5 px-3 py-1.5 text-sm">
              <span className="font-medium">{kw}</span><span className="text-xs text-ink/40">{n}회 검색</span>
            </span>
          ))}
        </div>
      </section>

      {/* 관리 (CRUD) */}
      <section>
        <h2 className="font-serif text-base font-semibold mb-3">카테고리·태그 관리</h2>
        <CategoryManager categories={categories} tags={tags} />
      </section>
    </div>
  );
}
