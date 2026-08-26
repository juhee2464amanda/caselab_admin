'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tags, X, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

/**
 * CategoryQuickEdit — 각 콘텐츠 메뉴 우측 상단에서 그 메뉴에 해당하는
 * 직무 카테고리(예: 마케팅·영업)만 빠르게 수정하는 슬라이드 패널.
 *
 * 전역 관리(/admin/categories)와 동일한 categories 테이블을 쓰되,
 * scope.type + scope.tracks 로 범위를 좁혀 노출한다. 전체 CRUD 지원.
 */

export type CategoryScope = {
  /** categories.type — 예: 'content_subcategory' | 'tool_subcategory' */
  type: string;
  /** 노출·추가 대상 parent_track 목록. 예: ['case', 'trend'] */
  tracks: string[];
  /** 패널 제목. 기본 '카테고리 수정' */
  title?: string;
};

type Row = {
  id: string;
  type: string;
  parent_track: string | null;
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

export function CategoryQuickEdit({ scope }: { scope: CategoryScope }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const multiTrack = scope.tracks.length > 1;

  const [draft, setDraft] = useState({
    parent_track: scope.tracks[0] ?? '',
    slug: '',
    label: '',
    sort_order: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from('categories')
      .select('id, type, parent_track, slug, label, sort_order, is_active')
      .eq('type', scope.type)
      .order('parent_track')
      .order('sort_order');
    if (scope.tracks.length) q = q.in('parent_track', scope.tracks);
    const { data, error: err } = await q;
    setLoading(false);
    if (err) { setError(err.message); return; }
    setRows((data ?? []) as Row[]);
  }, [supabase, scope.type, scope.tracks]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!draft.slug.trim() || !draft.label.trim()) { setError('slug·이름은 필수예요.'); return; }
    setPending(true);
    const { error: err } = await supabase.from('categories').insert({
      type: scope.type,
      parent_track: draft.parent_track || null,
      slug: draft.slug.trim(),
      label: draft.label.trim(),
      sort_order: Number(draft.sort_order) || 0,
    });
    setPending(false);
    if (err) { setError(err.message); return; }
    setDraft((p) => ({ ...p, slug: '', label: '', sort_order: 0 }));
    await load();
    router.refresh();
  }

  async function saveField(c: Row, patch: Partial<Pick<Row, 'label' | 'sort_order'>>) {
    setError(null);
    const { error: err } = await supabase.from('categories').update(patch).eq('id', c.id);
    if (err) { setError(err.message); return; }
    setRows((prev) => prev.map((r) => (r.id === c.id ? { ...r, ...patch } : r)));
    router.refresh();
  }

  async function toggleActive(c: Row) {
    setError(null);
    const next = !c.is_active;
    const { error: err } = await supabase.from('categories').update({ is_active: next }).eq('id', c.id);
    if (err) { setError(err.message); return; }
    setRows((prev) => prev.map((r) => (r.id === c.id ? { ...r, is_active: next } : r)));
    router.refresh();
  }

  async function remove(c: Row) {
    if (!confirm(`"${c.label}" 카테고리를 삭제할까요?`)) return;
    setError(null);
    const { error: err } = await supabase.from('categories').delete().eq('id', c.id);
    if (err) { setError(err.message); return; }
    setRows((prev) => prev.filter((r) => r.id !== c.id));
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <Tags className="h-4 w-4" />
        카테고리 수정
      </Button>

      <div
        className={cn(
          'fixed inset-0 z-50 transition-opacity',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        aria-hidden={!open}
      >
        <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
        <aside
          className={cn(
            'absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-elevated transition-transform overflow-y-auto',
            open ? 'translate-x-0' : 'translate-x-full',
          )}
          role="dialog"
          aria-modal="true"
        >
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-5 py-4">
            <div>
              <h2 className="font-serif text-lg font-semibold">{scope.title ?? '카테고리 수정'}</h2>
              <p className="text-xs text-ink/50 mt-0.5">이 메뉴에 해당하는 직무 카테고리만 보여요.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="p-5 space-y-5">
            {error && <p className="text-sm text-red-600">{error}</p>}

            {/* 목록 */}
            <div className="space-y-2">
              {loading && <p className="text-sm text-ink/40">불러오는 중…</p>}
              {!loading && rows.length === 0 && (
                <p className="text-sm text-ink/40">아직 카테고리가 없어요. 아래에서 추가하세요.</p>
              )}
              {rows.map((c) => (
                <CategoryRow
                  key={c.id}
                  row={c}
                  showTrack={multiTrack}
                  onSave={saveField}
                  onToggle={toggleActive}
                  onRemove={remove}
                />
              ))}
            </div>

            {/* 추가 폼 */}
            <form onSubmit={addCategory} className="card p-4 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <Plus className="h-4 w-4" /> 카테고리 추가
              </div>
              {multiTrack && (
                <div>
                  <Label className="text-xs">구분</Label>
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    value={draft.parent_track}
                    onChange={(e) => setDraft((p) => ({ ...p, parent_track: e.target.value }))}
                  >
                    {scope.tracks.map((tr) => <option key={tr} value={tr}>{tr}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">이름 *</Label>
                  <Input className="mt-1" value={draft.label} onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))} placeholder="마케팅" />
                </div>
                <div>
                  <Label className="text-xs">slug *</Label>
                  <Input className="mt-1" value={draft.slug} onChange={(e) => setDraft((p) => ({ ...p, slug: e.target.value }))} placeholder="marketing" />
                </div>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="w-24">
                  <Label className="text-xs">정렬</Label>
                  <Input className="mt-1" type="number" value={draft.sort_order} onChange={(e) => setDraft((p) => ({ ...p, sort_order: Number(e.target.value) }))} />
                </div>
                <Button type="submit" variant="accent" disabled={pending}>{pending ? '추가 중…' : '추가'}</Button>
              </div>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}

function CategoryRow({
  row,
  showTrack,
  onSave,
  onToggle,
  onRemove,
}: {
  row: Row;
  showTrack: boolean;
  onSave: (c: Row, patch: Partial<Pick<Row, 'label' | 'sort_order'>>) => void;
  onToggle: (c: Row) => void;
  onRemove: (c: Row) => void;
}) {
  const [label, setLabel] = useState(row.label);
  useEffect(() => { setLabel(row.label); }, [row.label]);
  const dirty = label.trim() !== row.label && label.trim().length > 0;

  function commit() {
    if (dirty) onSave(row, { label: label.trim() });
  }

  return (
    <div className={cn('flex items-center gap-2 rounded-md border border-border px-3 py-2', !row.is_active && 'opacity-50')}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
            className="w-full bg-transparent text-sm font-medium outline-none focus:bg-muted/50 rounded px-1 -mx-1"
          />
          {dirty && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={commit} className="text-accent" title="저장">
              <Check className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="text-[11px] text-ink/40">
          /{row.slug}{showTrack && row.parent_track ? ` · ${row.parent_track}` : ''}
        </div>
      </div>
      <input
        type="number"
        value={row.sort_order}
        onChange={(e) => onSave(row, { sort_order: Number(e.target.value) })}
        className="w-12 rounded border border-border bg-white px-1.5 py-1 text-right text-xs tabular-nums"
        title="정렬"
      />
      <button type="button" onClick={() => onToggle(row)} className="text-xs text-ink/60 hover:underline whitespace-nowrap">
        {row.is_active ? '비활성' : '활성'}
      </button>
      <button type="button" onClick={() => onRemove(row)} className="text-xs text-red-600 hover:underline">삭제</button>
    </div>
  );
}
