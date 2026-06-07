'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// D52 — 큐레이션 슬롯 관리. slot_type별 1~5 슬롯에 콘텐츠 직접 배정.
// (slot check 1~5 + unique(slot_type,slot) 제약 → 슬롯 직접 배정 방식)
export type Slot = {
  id: string;
  slot_type: 'hero' | 'highlight' | 'links';
  slot: number;
  content_id: string;
  active: boolean;
  sort_label: string | null;
  contents: { title: string } | null;
};
export type PubContent = { id: string; title: string; track: string };

const SLOT_META: { type: Slot['slot_type']; label: string; hint: string }[] = [
  { type: 'hero', label: 'Hero', hint: '메인 상단 대표' },
  { type: 'highlight', label: 'Highlight', hint: '추천 하이라이트' },
  { type: 'links', label: 'Links', hint: '바로가기 모음' },
];
const SLOTS = [1, 2, 3, 4, 5];

export function CurationManager({ entries, published }: { entries: Slot[]; published: PubContent[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [add, setAdd] = useState({ slot_type: 'hero', content_id: '', slot: 1 });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!add.content_id) { setError('콘텐츠를 선택하세요.'); return; }
    setPending(true);
    const { error: err } = await supabase.from('featured_contents').insert({
      content_id: add.content_id,
      slot_type: add.slot_type,
      slot: Number(add.slot),
      active: true,
    });
    setPending(false);
    if (err) { setError(slotErr(err.message)); return; }
    setAdd((p) => ({ ...p, content_id: '' }));
    router.refresh();
  }

  async function changeSlot(item: Slot, slot: number) {
    setError(null);
    const { error: err } = await supabase.from('featured_contents').update({ slot }).eq('id', item.id);
    if (err) { setError(slotErr(err.message)); router.refresh(); return; }
    router.refresh();
  }
  async function toggleActive(item: Slot) {
    await supabase.from('featured_contents').update({ active: !item.active }).eq('id', item.id);
    router.refresh();
  }
  async function remove(item: Slot) {
    if (!confirm('이 슬롯을 비울까요?')) return;
    await supabase.from('featured_contents').delete().eq('id', item.id);
    router.refresh();
  }

  function slotErr(msg: string): string {
    if (/duplicate|unique/i.test(msg)) return '이미 사용 중인 슬롯이에요. 다른 번호를 선택하세요.';
    return msg;
  }

  return (
    <div className="space-y-6">
      {/* 추가 폼 */}
      <form onSubmit={addEntry} className="card p-5 space-y-3">
        <div className="text-sm font-semibold">슬롯에 콘텐츠 배치</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">영역</Label>
            <select className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              value={add.slot_type} onChange={(e) => setAdd((p) => ({ ...p, slot_type: e.target.value }))}>
              {SLOT_META.map((s) => <option key={s.type} value={s.type}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">슬롯</Label>
            <select className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              value={add.slot} onChange={(e) => setAdd((p) => ({ ...p, slot: Number(e.target.value) }))}>
              {SLOTS.map((n) => <option key={n} value={n}>#{n}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">콘텐츠</Label>
            <select className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              value={add.content_id} onChange={(e) => setAdd((p) => ({ ...p, content_id: e.target.value }))}>
              <option value="">선택…</option>
              {published.map((c) => <option key={c.id} value={c.id}>[{c.track === 'case' ? '케이스' : '트렌드'}] {c.title}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end"><Button type="submit" variant="accent" disabled={pending}>배치</Button></div>
      </form>

      {/* 영역별 슬롯 */}
      {SLOT_META.map((meta) => {
        const items = entries.filter((s) => s.slot_type === meta.type).sort((a, b) => a.slot - b.slot);
        return (
          <section key={meta.type}>
            <h2 className="font-serif text-base font-semibold mb-1">{meta.label} <span className="text-xs text-ink/40 font-normal">{items.length} 슬롯</span></h2>
            <p className="text-xs text-ink/40 mb-3">{meta.hint}</p>
            <div className="card divide-y divide-border">
              {items.length === 0 && <div className="px-4 py-8 text-center text-sm text-ink/40">배치된 콘텐츠가 없어요.</div>}
              {items.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <select
                      className="h-8 rounded-md border border-border bg-white px-2 text-xs shrink-0"
                      value={s.slot}
                      onChange={(e) => changeSlot(s, Number(e.target.value))}
                      title="슬롯 번호"
                    >
                      {SLOTS.map((n) => <option key={n} value={n}>#{n}</option>)}
                    </select>
                    <span className="font-medium truncate">{s.contents?.title ?? '(삭제된 콘텐츠)'}</span>
                    {s.sort_label && <span className="text-xs text-ink/40 shrink-0">{s.sort_label}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <button onClick={() => toggleActive(s)} className={s.active ? 'text-green-700 hover:underline' : 'text-ink/50 hover:underline'}>
                      {s.active ? '노출' : '숨김'}
                    </button>
                    <span className="text-ink/20">·</span>
                    <button onClick={() => remove(s)} className="text-red-600 hover:underline">제거</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
