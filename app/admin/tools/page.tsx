import Link from 'next/link';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { CategoryQuickEdit } from '@/components/admin/CategoryQuickEdit';

// /admin/tools → '프롬프트 순위' (피드백 #6).
// 전체 콘텐츠에서 prompt_copy 이벤트가 많은 = 잘 복사되는 프롬프트 순위.
// 콘텐츠 등록·편집은 콘텐츠 목록(/admin/contents) + 새 콘텐츠로 통합.
export const dynamic = 'force-dynamic';

type Ev = { content_id: string | null; created_at: string };
type Content = { id: string; title: string; track: string; slug: string };

export default async function AdminPromptRanking() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const recent30 = Date.now() - 30 * 86400000;

  const { data: evData } = await supabase
    .from('events')
    .select('content_id, created_at')
    .eq('event_type', 'prompt_copy')
    .gt('created_at', since90)
    .not('content_id', 'is', null)
    .limit(8000);
  const evs = (evData ?? []) as Ev[];

  const agg = new Map<string, { total: number; recent: number }>();
  for (const e of evs) {
    if (!e.content_id) continue;
    const a = agg.get(e.content_id) ?? { total: 0, recent: 0 };
    a.total += 1;
    if (new Date(e.created_at).getTime() >= recent30) a.recent += 1;
    agg.set(e.content_id, a);
  }

  const ids = [...agg.keys()];
  const titleMap = new Map<string, Content>();
  if (ids.length) {
    const { data: cs } = await supabase.from('contents').select('id, title, track, slug').in('id', ids);
    for (const c of (cs ?? []) as Content[]) titleMap.set(c.id, c);
  }

  const ranked = ids
    .map((id) => ({ id, ...agg.get(id)!, content: titleMap.get(id) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 50);

  const totalCopies = evs.length;

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-serif text-xl sm:text-2xl font-semibold">프롬프트 순위</h1>
          <p className="text-sm text-ink/60 mt-1">최근 90일 전체 콘텐츠에서 복사가 많이 된 프롬프트 순위. 콘텐츠 등록·편집은 <Link href="/admin/contents" className="text-accent hover:underline">콘텐츠 목록</Link>에서.</p>
        </div>
        <div className="self-start sm:self-auto">
          <CategoryQuickEdit scope={{ type: 'tool_subcategory', tracks: ['tool', 'prompt', 'context-card'], title: '자료실 카테고리 수정' }} />
        </div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4"><div className="text-xs text-ink/50">총 복사 (90일)</div><div className="mt-1 font-serif text-2xl font-semibold tabular-nums">{totalCopies.toLocaleString('ko-KR')}</div></div>
        <div className="card p-4"><div className="text-xs text-ink/50">복사된 프롬프트 수</div><div className="mt-1 font-serif text-2xl font-semibold tabular-nums">{agg.size.toLocaleString('ko-KR')}</div></div>
      </section>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3 w-12 text-right">#</th>
              <th className="px-4 py-3 w-20">타입</th>
              <th className="px-4 py-3">콘텐츠</th>
              <th className="px-4 py-3 w-24 text-right">복사(90일)</th>
              <th className="px-4 py-3 w-24 text-right">최근 30일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ranked.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink/40">최근 90일 프롬프트 복사 기록이 없어요.</td></tr>
            )}
            {ranked.map((r, i) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 text-right tabular-nums text-ink/30">{i + 1}</td>
                <td className="px-4 py-3"><span className="badge">{r.content ? (r.content.track === 'case' ? '케이스' : '트렌드') : '—'}</span></td>
                <td className="px-4 py-3">
                  {r.content ? (
                    <Link href={`/admin/contents/${r.id}`} className="font-medium hover:underline">{r.content.title}</Link>
                  ) : <span className="text-ink/40">(삭제된 콘텐츠)</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">{r.total.toLocaleString('ko-KR')}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink/60">{r.recent.toLocaleString('ko-KR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
