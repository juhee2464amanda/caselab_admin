import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

// /admin/categories — 카테고리·태그 관리 (D30). 현재 읽기 목록, CRUD는 다음 레이어.
type Category = {
  id: string;
  type: string;
  parent_track: string | null;
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};
type Tag = { id: string; slug: string; label: string; usage_count: number };

const TYPE_LABEL: Record<string, string> = {
  content_subcategory: '콘텐츠 카테고리',
  tool_subcategory: '자료실 카테고리',
  utm_channel: 'UTM 채널',
};

export default async function AdminCategories() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const [catRes, tagRes] = await Promise.all([
    supabase.from('categories').select('id, type, parent_track, slug, label, sort_order, is_active').order('type').order('sort_order'),
    supabase.from('tags').select('id, slug, label, usage_count').order('usage_count', { ascending: false }),
  ]);
  const cats = (catRes.data ?? []) as Category[];
  const tags = (tagRes.data ?? []) as Tag[];

  const groups = Object.keys(TYPE_LABEL).map((t) => ({ type: t, items: cats.filter((c) => c.type === t) }));

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">카테고리·태그</h1>
        <p className="text-sm text-ink/60 mt-1">콘텐츠·자료실 세부 분류 + UTM 채널 + 가로지르는 태그.</p>
      </header>

      {groups.map((g) => (
        <section key={g.type}>
          <h2 className="font-serif text-base font-semibold mb-3">
            {TYPE_LABEL[g.type]} <span className="text-xs text-ink/40 font-normal">{g.items.length}</span>
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
                <tr>
                  <th className="px-4 py-3">라벨</th>
                  <th className="px-4 py-3 w-40">slug</th>
                  <th className="px-4 py-3 w-28">parent</th>
                  <th className="px-4 py-3 w-16 text-right">순서</th>
                  <th className="px-4 py-3 w-20">활성</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {g.items.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/40">항목이 없어요.</td></tr>
                )}
                {g.items.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{c.label}</td>
                    <td className="px-4 py-3 text-xs text-ink/50">/{c.slug}</td>
                    <td className="px-4 py-3 text-xs">{c.parent_track ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink/60">{c.sort_order}</td>
                    <td className="px-4 py-3">{c.is_active ? '✓' : <span className="text-ink/30">비활성</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section>
        <h2 className="font-serif text-base font-semibold mb-3">
          태그 <span className="text-xs text-ink/40 font-normal">{tags.length}</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && <span className="text-sm text-ink/40">태그가 없어요.</span>}
          {tags.map((t) => (
            <span key={t.id} className="badge">
              {t.label} <span className="ml-1 text-ink/40">{t.usage_count}</span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
