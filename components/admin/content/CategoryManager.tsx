'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// D30 — 카테고리·태그 CRUD.
export type Category = {
  id: string;
  type: string;
  parent_track: string | null;
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};
export type Tag = { id: string; slug: string; label: string; usage_count: number };

const TYPE_META: { value: string; label: string; tracks: string[] }[] = [
  { value: 'content_subcategory', label: '콘텐츠 카테고리', tracks: ['case', 'trend'] },
  { value: 'tool_subcategory', label: '자료실 카테고리', tracks: ['tool', 'prompt', 'guide', 'context-card'] },
  { value: 'utm_channel', label: 'UTM 채널', tracks: [] },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPE_META.map((t) => [t.value, t.label]));

export function CategoryManager({ categories, tags }: { categories: Category[]; tags: Tag[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [cat, setCat] = useState({ type: 'content_subcategory', parent_track: 'case', slug: '', label: '', sort_order: 0 });
  const [tag, setTag] = useState({ slug: '', label: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const curType = TYPE_META.find((t) => t.value === cat.type)!;

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!cat.slug.trim() || !cat.label.trim()) { setError('카테고리 slug·라벨은 필수예요.'); return; }
    setPending(true);
    const { error: err } = await supabase.from('categories').insert({
      type: cat.type,
      parent_track: cat.type === 'utm_channel' ? null : cat.parent_track,
      slug: cat.slug.trim(),
      label: cat.label.trim(),
      sort_order: Number(cat.sort_order) || 0,
    });
    setPending(false);
    if (err) { setError(err.message); return; }
    setCat((p) => ({ ...p, slug: '', label: '', sort_order: 0 }));
    router.refresh();
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tag.slug.trim() || !tag.label.trim()) { setError('태그 slug·라벨은 필수예요.'); return; }
    setPending(true);
    const { error: err } = await supabase.from('tags').insert({ slug: tag.slug.trim(), label: tag.label.trim() });
    setPending(false);
    if (err) { setError(err.message); return; }
    setTag({ slug: '', label: '' });
    router.refresh();
  }

  async function toggleActive(c: Category) {
    await supabase.from('categories').update({ is_active: !c.is_active }).eq('id', c.id);
    router.refresh();
  }
  async function removeCategory(c: Category) {
    if (!confirm(`"${c.label}" 삭제할까요?`)) return;
    await supabase.from('categories').delete().eq('id', c.id);
    router.refresh();
  }
  async function removeTag(t: Tag) {
    if (!confirm(`태그 "${t.label}" 삭제할까요?`)) return;
    await supabase.from('tags').delete().eq('id', t.id);
    router.refresh();
  }

  const groups = TYPE_META.map((t) => ({ ...t, items: categories.filter((c) => c.type === t.value) }));

  return (
    <div className="space-y-6">
      {/* 추가 폼 2종 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={addCategory} className="card p-5 space-y-3">
          <div className="text-sm font-semibold">카테고리 추가</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">타입</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                value={cat.type}
                onChange={(e) => {
                  const next = TYPE_META.find((t) => t.value === e.target.value)!;
                  setCat((p) => ({ ...p, type: next.value, parent_track: next.tracks[0] ?? '' }));
                }}
              >
                {TYPE_META.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">parent track</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm disabled:opacity-40"
                value={cat.parent_track}
                disabled={curType.tracks.length === 0}
                onChange={(e) => setCat((p) => ({ ...p, parent_track: e.target.value }))}
              >
                {curType.tracks.length === 0 && <option value="">—</option>}
                {curType.tracks.map((tr) => <option key={tr} value={tr}>{tr}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">slug *</Label><Input className="mt-1" value={cat.slug} onChange={(e) => setCat((p) => ({ ...p, slug: e.target.value }))} placeholder="marketing" /></div>
            <div><Label className="text-xs">라벨 *</Label><Input className="mt-1" value={cat.label} onChange={(e) => setCat((p) => ({ ...p, label: e.target.value }))} placeholder="마케팅" /></div>
          </div>
          <div className="w-28"><Label className="text-xs">정렬</Label><Input className="mt-1" type="number" value={cat.sort_order} onChange={(e) => setCat((p) => ({ ...p, sort_order: Number(e.target.value) }))} /></div>
          <div className="flex justify-end"><Button type="submit" variant="accent" disabled={pending}>추가</Button></div>
        </form>

        <form onSubmit={addTag} className="card p-5 space-y-3">
          <div className="text-sm font-semibold">태그 추가</div>
          <div><Label className="text-xs">slug *</Label><Input className="mt-1" value={tag.slug} onChange={(e) => setTag((p) => ({ ...p, slug: e.target.value }))} placeholder="ai-automation" /></div>
          <div><Label className="text-xs">라벨 *</Label><Input className="mt-1" value={tag.label} onChange={(e) => setTag((p) => ({ ...p, label: e.target.value }))} placeholder="AI 자동화" /></div>
          <div className="flex justify-end"><Button type="submit" variant="accent" disabled={pending}>추가</Button></div>
        </form>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* 카테고리 그룹 */}
      {groups.map((g) => (
        <section key={g.value}>
          <h2 className="font-serif text-base font-semibold mb-3">{g.label} <span className="text-xs text-ink/40 font-normal">{g.items.length}</span></h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
                <tr>
                  <th className="px-4 py-3">라벨</th>
                  <th className="px-4 py-3 w-40">slug</th>
                  <th className="px-4 py-3 w-24">parent</th>
                  <th className="px-4 py-3 w-16 text-right">순서</th>
                  <th className="px-4 py-3 w-36">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {g.items.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/40">항목이 없어요.</td></tr>}
                {g.items.map((c) => (
                  <tr key={c.id} className={`hover:bg-muted/30 ${!c.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">{c.label}</td>
                    <td className="px-4 py-3 text-xs text-ink/50">/{c.slug}</td>
                    <td className="px-4 py-3 text-xs">{c.parent_track ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink/60">{c.sort_order}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 text-xs">
                        <button onClick={() => toggleActive(c)} className="text-ink/60 hover:underline">{c.is_active ? '비활성' : '활성'}</button>
                        <span className="text-ink/20">·</span>
                        <button onClick={() => removeCategory(c)} className="text-red-600 hover:underline">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {/* 태그 */}
      <section>
        <h2 className="font-serif text-base font-semibold mb-3">태그 <span className="text-xs text-ink/40 font-normal">{tags.length}</span></h2>
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && <span className="text-sm text-ink/40">태그가 없어요.</span>}
          {tags.map((t) => (
            <span key={t.id} className="badge inline-flex items-center gap-1.5">
              {t.label} <span className="text-ink/40">{t.usage_count}</span>
              <button onClick={() => removeTag(t)} className="text-red-500 hover:text-red-700" title="삭제">×</button>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

export { TYPE_LABEL };
