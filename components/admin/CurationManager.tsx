'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// D52 + 피드백 #3 — 큐레이션 슬롯 관리.
//   · 우측 '잘 되는 콘텐츠' 랭킹(조회·저장·좋아요 index)에서 📌 한 클릭 배치
//   · hero 대표 날짜 1개 → hero 슬롯 전체에 적용(sort_label)
//   · links 영역 = 실시간 순위 자동 노출 (별도 관리 불필요)
//   (slot check 1~5 + unique(slot_type,slot) 제약 → 슬롯 직접 배정)
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
export type Ranked = { content_id: string; title: string; track: string; score: number; views: number; saves: number; likes: number };

const MANUAL_AREAS: { type: 'hero' | 'highlight'; label: string; hint: string }[] = [
  { type: 'hero', label: 'Hero', hint: '메인 최상단 대표 노출. 대표 날짜 1개로 4슬롯 일괄 관리.' },
  { type: 'highlight', label: 'Highlight', hint: '메인 중단 추천 하이라이트.' },
];
const SLOTS = [1, 2, 3, 4, 5];

export function CurationManager({ entries, published, ranked }: { entries: Slot[]; published: PubContent[]; ranked: Ranked[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [add, setAdd] = useState({ slot_type: 'hero', content_id: '', slot: 1 });
  const [heroDate, setHeroDate] = useState(entries.find((e) => e.slot_type === 'hero')?.sort_label ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const placedIds = new Set(entries.map((e) => e.content_id));

  function nextFreeSlot(type: string): number | null {
    const used = new Set(entries.filter((e) => e.slot_type === type).map((e) => e.slot));
    return SLOTS.find((n) => !used.has(n)) ?? null;
  }
  function slotErr(msg: string): string {
    return /duplicate|unique/i.test(msg) ? '이미 사용 중인 슬롯이에요.' : msg;
  }

  async function quickPlace(r: Ranked, type: 'hero' | 'highlight') {
    setError(null);
    const free = nextFreeSlot(type);
    if (!free) { setError(`${type} 슬롯(1~5)이 가득 찼어요.`); return; }
    const { error: err } = await supabase.from('featured_contents').insert({ content_id: r.content_id, slot_type: type, slot: free, active: true });
    if (err) { setError(slotErr(err.message)); return; }
    router.refresh();
  }
  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!add.content_id) { setError('콘텐츠를 선택하세요.'); return; }
    setPending(true);
    const { error: err } = await supabase.from('featured_contents').insert({ content_id: add.content_id, slot_type: add.slot_type, slot: Number(add.slot), active: true });
    setPending(false);
    if (err) { setError(slotErr(err.message)); return; }
    setAdd((p) => ({ ...p, content_id: '' }));
    router.refresh();
  }
  async function changeSlot(item: Slot, slot: number) {
    setError(null);
    const { error: err } = await supabase.from('featured_contents').update({ slot }).eq('id', item.id);
    if (err) setError(slotErr(err.message));
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
  async function applyHeroDate() {
    const heroIds = entries.filter((e) => e.slot_type === 'hero').map((e) => e.id);
    if (!heroIds.length) { setError('hero 슬롯이 없어요. 먼저 콘텐츠를 배치하세요.'); return; }
    await supabase.from('featured_contents').update({ sort_label: heroDate || null }).in('id', heroIds);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 슬롯 영역 */}
        <div className="lg:col-span-2 space-y-6">
          {/* hero 대표 날짜 */}
          <div className="card p-4 flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs">Hero 대표 날짜 (4슬롯 일괄)</Label>
              <Input className="mt-1" value={heroDate} onChange={(e) => setHeroDate(e.target.value)} placeholder="예: 2026년 6월 2주차" />
            </div>
            <Button type="button" variant="outline" onClick={applyHeroDate}>hero 전체에 적용</Button>
          </div>

          {MANUAL_AREAS.map((meta) => {
            const items = entries.filter((s) => s.slot_type === meta.type).sort((a, b) => a.slot - b.slot);
            return (
              <section key={meta.type}>
                <h2 className="font-serif text-base font-semibold mb-1">{meta.label} <span className="text-xs text-ink/40 font-normal">{items.length} 슬롯</span></h2>
                <p className="text-xs text-ink/40 mb-3">{meta.hint}</p>
                <div className="card divide-y divide-border">
                  {items.length === 0 && <div className="px-4 py-6 text-center text-sm text-ink/40">우측 랭킹에서 📌로 배치하세요.</div>}
                  {items.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <select className="h-8 rounded-md border border-border bg-white px-2 text-xs shrink-0" value={s.slot} onChange={(e) => changeSlot(s, Number(e.target.value))}>
                          {SLOTS.map((n) => <option key={n} value={n}>#{n}</option>)}
                        </select>
                        <span className="font-medium truncate">{s.contents?.title ?? '(삭제된 콘텐츠)'}</span>
                        {s.sort_label && <span className="text-xs text-ink/40 shrink-0">{s.sort_label}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-xs">
                        <button onClick={() => toggleActive(s)} className={s.active ? 'text-green-700 hover:underline' : 'text-ink/50 hover:underline'}>{s.active ? '노출' : '숨김'}</button>
                        <span className="text-ink/20">·</span>
                        <button onClick={() => remove(s)} className="text-red-600 hover:underline">제거</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {/* links 영역 안내 */}
          <section>
            <h2 className="font-serif text-base font-semibold mb-1">Links <span className="text-xs text-ink/40 font-normal">실시간 자동</span></h2>
            <div className="card p-4 bg-muted/30 text-sm text-ink/60">
              메인 하단 <b>Links 영역</b>은 우측 '잘 되는 콘텐츠' 순위가 <b>실시간 자동 노출</b>돼요. 별도 배치가 필요 없습니다.
            </div>
          </section>

          {/* 수동 배치(임의 콘텐츠) */}
          <details className="card p-4">
            <summary className="text-sm font-semibold cursor-pointer">랭킹 밖 콘텐츠 직접 배치</summary>
            <form onSubmit={addEntry} className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
              <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={add.slot_type} onChange={(e) => setAdd((p) => ({ ...p, slot_type: e.target.value }))}>
                <option value="hero">Hero</option><option value="highlight">Highlight</option>
              </select>
              <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={add.slot} onChange={(e) => setAdd((p) => ({ ...p, slot: Number(e.target.value) }))}>
                {SLOTS.map((n) => <option key={n} value={n}>#{n}</option>)}
              </select>
              <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={add.content_id} onChange={(e) => setAdd((p) => ({ ...p, content_id: e.target.value }))}>
                <option value="">콘텐츠 선택…</option>
                {published.map((c) => <option key={c.id} value={c.id}>[{c.track === 'case' ? '케이스' : '트렌드'}] {c.title}</option>)}
              </select>
              <Button type="submit" variant="accent" disabled={pending}>배치</Button>
            </form>
          </details>
        </div>

        {/* 우측: 잘 되는 콘텐츠 랭킹 */}
        <aside>
          <h2 className="font-serif text-base font-semibold mb-1">🔥 잘 되는 콘텐츠</h2>
          <p className="text-xs text-ink/40 mb-3">조회·저장·좋아요 index 순. 📌로 슬롯에 바로 배치.</p>
          <div className="space-y-2">
            {ranked.length === 0 && <p className="text-sm text-ink/40">데이터가 없어요.</p>}
            {ranked.map((r, i) => (
              <div key={r.content_id} className={`card p-3 ${placedIds.has(r.content_id) ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-ink/30 tabular-nums w-4">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    <div className="text-[11px] text-ink/40 mt-0.5">조회 {r.views} · 저장 {r.saves} · 좋아요 {r.likes}</div>
                    <div className="mt-1.5 flex gap-1.5">
                      <button onClick={() => quickPlace(r, 'hero')} className="text-[11px] rounded bg-accent/10 text-accent px-2 py-1 hover:bg-accent/20">📌 Hero</button>
                      <button onClick={() => quickPlace(r, 'highlight')} className="text-[11px] rounded bg-muted text-ink/70 px-2 py-1 hover:bg-muted/70">📌 Highlight</button>
                      {placedIds.has(r.content_id) && <span className="text-[11px] text-green-600 self-center">배치됨</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
