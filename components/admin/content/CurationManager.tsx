'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, ArrowDown, Star, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { ALWAYS_ON, MAX_SUB, SLOT_TYPE, SUB_SLOTS, placeAsHero, placeAsSub, type Kind } from '@/lib/featured-slots';

// 홈 히어로 큐레이션 — 대표 1개 + Sub(추가 노출).
//   · 본가 홈은 featured_contents(slot_type='hero')를 slot 순서대로 캐러셀 렌더. slot=1이 대표.
//   · 콘텐츠(content_id) / 도구·프롬프트(tool_id) 폴리모픽 배치.
//   · 재정렬은 slot 번호 고정 + 페이로드(content_id/tool_id) 스왑 → unique(slot_type,slot) 충돌 없음.
//   · 배치(대표/Sub) 로직은 스튜디오 발행 화면과 공유(lib/featured-slots).
export type { Kind };
export type Slot = {
  id: string;
  slot: number;
  content_id: string | null;
  tool_id: string | null;
  active: boolean;
  // 예약 노출 창 판정 — 'always'(상시)만 홈에 뜬다. expired/pending은 여기선 배치돼 보이지만 홈에선 빠진다.
  window: 'always' | 'expired' | 'pending';
  from: string | null;
  until: string | null;
  kind: Kind;
  badge: string;
  title: string;
};
// 홈이 렌더하지 않는 slot_type에 남아 있는 행 — 배치해도 어디에도 안 보이는 유령.
export type Orphan = Slot & { slot_type: string };
export type RankItem = {
  key: string;
  kind: Kind;
  target_id: string;
  title: string;
  badge: string;
  views: number;
  saves: number;
  likes: number;
};

function represents(e: Slot, item: RankItem): boolean {
  return item.kind === 'content' ? e.content_id === item.target_id : e.tool_id === item.target_id;
}
function badgeTone(kind: Kind): string {
  if (kind === 'tool') return 'bg-blue-50 text-blue-700';
  if (kind === 'prompt') return 'bg-violet-50 text-violet-700';
  return 'bg-muted text-ink/60';
}

export function CurationManager({
  entries,
  orphans = [],
  rankViews,
  rankSaves,
  pool,
}: {
  entries: Slot[];
  orphans?: Orphan[];
  rankViews: RankItem[];
  rankSaves: RankItem[];
  pool: RankItem[];
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addId, setAddId] = useState('');

  const sorted = [...entries].sort((a, b) => a.slot - b.slot);
  const hero = sorted.find((e) => e.slot === 1) ?? null;
  const subs = sorted.filter((e) => e.slot !== 1);
  const placedKeys = new Set(entries.map((e) => (e.tool_id ? `t:${e.tool_id}` : `c:${e.content_id}`)));

  const fc = () => supabase.from('featured_contents');

  async function run(fn: () => Promise<Array<{ error: { message: string } | null }> | void>) {
    setError(null);
    setBusy(true);
    try {
      const res = await fn();
      const bad = Array.isArray(res) ? res.find((r) => r?.error) : null;
      if (bad?.error) { setError(bad.error.message); return; }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // 대표(slot 1)로 지정 / Sub(추가 노출)로 배치 — 스튜디오 발행 화면과 같은 로직을 쓴다.
  function setHero(item: RankItem) {
    void run(async () => {
      const res = await placeAsHero(supabase, { kind: item.kind, id: item.target_id });
      if (!res.ok) setError(res.message);
    });
  }

  function addSub(item: RankItem) {
    void run(async () => {
      const res = await placeAsSub(supabase, { kind: item.kind, id: item.target_id });
      if (!res.ok) setError(res.message);
    });
  }

  function addFromSelect(where: 'hero' | 'sub') {
    const item = pool.find((p) => p.key === addId);
    if (!item) return;
    setAddId('');
    if (where === 'hero') setHero(item);
    else addSub(item);
  }

  // 유령 슬롯 구제 — hero Sub로 끌어오거나 제거. (이미 hero에 같은 대상이 있으면 유령만 삭제)
  function adoptOrphan(o: Orphan) {
    void run(async () => {
      const dup = entries.find((e) => (o.tool_id ? e.tool_id === o.tool_id : e.content_id === o.content_id));
      if (dup) { await fc().delete().eq('id', o.id); return; }
      const used = new Set(entries.map((e) => e.slot));
      const free = SUB_SLOTS.find((n) => !used.has(n));
      if (!free) { setError(`Sub 슬롯이 가득 찼어요 (최대 ${MAX_SUB}개). 하나 제거하고 다시 시도하세요.`); return; }
      const { error } = await fc().update({ slot_type: SLOT_TYPE, slot: free }).eq('id', o.id);
      return [{ error }];
    });
  }

  function removeOrphan(o: Orphan) {
    if (!confirm('이 슬롯을 삭제할까요? (홈에 노출되지 않는 항목이에요)')) return;
    void run(async () => {
      const { error } = await fc().delete().eq('id', o.id);
      return [{ error }];
    });
  }

  // 위/아래 재정렬 — 인접 슬롯끼리 페이로드 스왑 (slot 번호는 고정)
  function move(entry: Slot, dir: -1 | 1) {
    const i = sorted.findIndex((e) => e.id === entry.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const other = sorted[j];
    void run(async () => {
      const a = await fc().update({ content_id: other.content_id, tool_id: other.tool_id, ...ALWAYS_ON }).eq('id', entry.id);
      const b = await fc().update({ content_id: entry.content_id, tool_id: entry.tool_id, ...ALWAYS_ON }).eq('id', other.id);
      return [a, b];
    });
  }

  // 예약 노출 창 해제 — 만료/예약 상태라 홈에서만 빠지는 슬롯을 상시 노출로 되돌린다.
  function clearWindow(entry: Slot) {
    void run(async () => {
      const { error } = await fc().update(ALWAYS_ON).eq('id', entry.id);
      return [{ error }];
    });
  }

  // Sub → 대표로 승격 (slot 1과 페이로드 스왑)
  function promote(entry: Slot) {
    const slot1 = entries.find((e) => e.slot === 1);
    void run(async () => {
      if (!slot1) {
        const { error } = await fc().update({ slot: 1, ...ALWAYS_ON }).eq('id', entry.id);
        return [{ error }];
      }
      const a = await fc().update({ content_id: entry.content_id, tool_id: entry.tool_id, ...ALWAYS_ON }).eq('id', slot1.id);
      const b = await fc().update({ content_id: slot1.content_id, tool_id: slot1.tool_id, ...ALWAYS_ON }).eq('id', entry.id);
      return [a, b];
    });
  }

  async function toggleActive(entry: Slot) {
    await fc().update({ active: !entry.active }).eq('id', entry.id);
    router.refresh();
  }

  // 제거 후 남은 슬롯을 1..N으로 연속 재정렬(빈칸 제거) — 오름차순이라 unique 충돌 없음
  function remove(entry: Slot) {
    if (!confirm('이 슬롯을 비울까요?')) return;
    void run(async () => {
      await fc().delete().eq('id', entry.id);
      const rest = entries.filter((e) => e.id !== entry.id).sort((a, b) => a.slot - b.slot);
      for (let k = 0; k < rest.length; k++) {
        const want = k + 1;
        if (rest[k].slot !== want) await fc().update({ slot: want }).eq('id', rest[k].id);
      }
    });
  }

  const Badge = ({ kind, label }: { kind: Kind; label: string }) => (
    <span className={`shrink-0 text-[10px] font-medium rounded px-1.5 py-0.5 ${badgeTone(kind)}`}>{label}</span>
  );

  // 예약 노출 창 경고 — 여기선 배치돼 보이는데 홈에선 빠지는 상태를 슬롯 옆에 바로 드러낸다.
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
  const WindowWarn = ({ entry }: { entry: Slot }) =>
    entry.window === 'always' ? null : (
      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 bg-amber-100 text-amber-800">
        {entry.window === 'expired' ? `⚠️ ${day(entry.until)} 만료 · 홈 미노출` : `⏳ ${day(entry.from)}부터 노출`}
        <button disabled={busy} onClick={() => clearWindow(entry)} className="underline hover:no-underline disabled:opacity-50">
          상시로
        </button>
      </span>
    );

  const RankBlock = ({ title, items, metric }: { title: string; items: RankItem[]; metric: 'views' | 'saves' }) => (
    <div>
      <h3 className="text-xs font-semibold text-ink/70 mb-2">{title}</h3>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-xs text-ink/40">데이터가 없어요.</p>}
        {items.map((r, i) => {
          const placed = placedKeys.has(r.key);
          return (
            <div key={r.key} className={`card p-3 ${placed ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-2">
                <span className="text-xs font-bold text-ink/30 tabular-nums w-4 shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge kind={r.kind} label={r.badge} />
                    <span className="text-sm font-medium truncate">{r.title}</span>
                  </div>
                  <div className="text-[11px] text-ink/40 mt-0.5">
                    <span className={metric === 'views' ? 'text-ink/70 font-medium' : ''}>조회 {r.views}</span>
                    {' · '}
                    <span className={metric === 'saves' ? 'text-ink/70 font-medium' : ''}>저장 {r.saves}</span>
                    {' · 좋아요 '}{r.likes}
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <button disabled={busy} onClick={() => setHero(r)} className="inline-flex items-center gap-1 text-[11px] rounded bg-accent/10 text-accent px-2 py-1 hover:bg-accent/20 disabled:opacity-50">
                      <Star className="h-3 w-3" /> 대표
                    </button>
                    <button disabled={busy} onClick={() => addSub(r)} className="inline-flex items-center gap-1 text-[11px] rounded bg-muted text-ink/70 px-2 py-1 hover:bg-muted/70 disabled:opacity-50">
                      <Pin className="h-3 w-3" /> Sub
                    </button>
                    {placed && <span className="text-[11px] text-green-600 self-center">배치됨</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 슬롯 영역 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hero 대표 */}
          <section>
            <h2 className="font-serif text-base font-semibold mb-1">
              Hero 대표 <span className="text-xs text-ink/40 font-normal">홈 최상단 첫 화면</span>
            </h2>
            <p className="text-xs text-ink/40 mb-3">우측 인기 콘텐츠에서 <b>대표</b>로 지정하거나, Sub에서 ⭐로 승격하세요.</p>
            <div className="card p-4">
              {hero ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Star className="h-4 w-4 text-accent shrink-0" />
                    <Badge kind={hero.kind} label={hero.badge} />
                    <span className="font-medium truncate">{hero.title}</span>
                    <WindowWarn entry={hero} />
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <button onClick={() => toggleActive(hero)} className={hero.active ? 'text-green-700 hover:underline' : 'text-ink/50 hover:underline'}>{hero.active ? '노출' : '숨김'}</button>
                    <span className="text-ink/20">·</span>
                    <button onClick={() => remove(hero)} className="text-red-600 hover:underline">제거</button>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-ink/40">대표가 비어 있어요. 우측 인기 콘텐츠에서 <b>대표</b>로 지정하세요.</div>
              )}
            </div>
          </section>

          {/* Sub 추가 노출 */}
          <section>
            <h2 className="font-serif text-base font-semibold mb-1">
              Sub 추가 노출 <span className="text-xs text-ink/40 font-normal">{subs.length}/{MAX_SUB} 슬롯</span>
            </h2>
            <p className="text-xs text-ink/40 mb-3">대표 다음 순서로 히어로 캐러셀에 노출돼요. 위/아래로 순서를 바꾸세요.</p>
            <div className="card divide-y divide-border">
              {subs.length === 0 && <div className="px-4 py-6 text-center text-sm text-ink/40">우측 인기 콘텐츠에서 📌 Sub로 배치하세요.</div>}
              {subs.map((s, idx) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex flex-col shrink-0">
                      <button disabled={busy || idx === 0} onClick={() => move(s, -1)} className="text-ink/40 hover:text-ink disabled:opacity-30" aria-label="위로"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button disabled={busy || idx === subs.length - 1} onClick={() => move(s, 1)} className="text-ink/40 hover:text-ink disabled:opacity-30" aria-label="아래로"><ArrowDown className="h-3.5 w-3.5" /></button>
                    </div>
                    <span className="text-xs font-bold text-ink/30 tabular-nums w-5 shrink-0">#{idx + 2}</span>
                    <Badge kind={s.kind} label={s.badge} />
                    <span className="font-medium truncate">{s.title}</span>
                    <WindowWarn entry={s} />
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <button disabled={busy} onClick={() => promote(s)} className="inline-flex items-center gap-1 text-accent hover:underline disabled:opacity-50"><Star className="h-3 w-3" /> 대표로</button>
                    <span className="text-ink/20">·</span>
                    <button onClick={() => toggleActive(s)} className={s.active ? 'text-green-700 hover:underline' : 'text-ink/50 hover:underline'}>{s.active ? '노출' : '숨김'}</button>
                    <span className="text-ink/20">·</span>
                    <button onClick={() => remove(s)} className="text-red-600 hover:underline">제거</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 직접 추가 — 우측 Top 3에 없는 것도 여기서 올린다 */}
          <section>
            <h2 className="font-serif text-base font-semibold mb-1">
              콘텐츠 추가 <span className="text-xs text-ink/40 font-normal">발행된 전체 목록에서 선택</span>
            </h2>
            <p className="text-xs text-ink/40 mb-3">우측 인기 Top 3에 없는 콘텐츠·도구·프롬프트도 여기서 바로 배치할 수 있어요.</p>
            <div className="card p-4 flex flex-col sm:flex-row gap-2">
              <select className="h-10 flex-1 rounded-md border border-border bg-white px-3 text-sm" value={addId} onChange={(e) => setAddId(e.target.value)}>
                <option value="">발행된 콘텐츠·도구·프롬프트 선택…</option>
                {pool.map((p) => (
                  <option key={p.key} value={p.key}>
                    [{p.badge}] {p.title}{placedKeys.has(p.key) ? ' · 배치됨' : ''}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button type="button" variant="accent" disabled={busy || !addId} onClick={() => addFromSelect('hero')}>
                  <Star className="h-3.5 w-3.5" /> 대표로
                </Button>
                <Button type="button" variant="outline" disabled={busy || !addId} onClick={() => addFromSelect('sub')}>
                  <Pin className="h-3.5 w-3.5" /> Sub로
                </Button>
              </div>
            </div>
          </section>

          {/* 유령 슬롯 — 홈이 렌더하지 않는 slot_type에 남은 행 (옛 highlight/links 배치) */}
          {orphans.length > 0 && (
            <section>
              <h2 className="font-serif text-base font-semibold mb-1 text-amber-700">
                ⚠️ 홈에 노출되지 않는 슬롯 <span className="text-xs font-normal text-ink/40">{orphans.length}건</span>
              </h2>
              <p className="text-xs text-ink/50 mb-3">
                홈은 Hero 슬롯만 노출해요. 아래 항목은 지금은 없어진 배치 방식(highlight/links)으로 올라가 어디에도 보이지 않습니다.
              </p>
              <div className="card border-amber-300 bg-amber-50/40 divide-y divide-amber-200">
                {orphans.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 text-[10px] font-medium rounded px-1.5 py-0.5 bg-amber-100 text-amber-800">{o.slot_type} #{o.slot}</span>
                      <Badge kind={o.kind} label={o.badge} />
                      <span className="font-medium truncate">{o.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs">
                      <button disabled={busy} onClick={() => adoptOrphan(o)} className="inline-flex items-center gap-1 text-accent hover:underline disabled:opacity-50">
                        <Pin className="h-3 w-3" /> Sub로 가져오기
                      </button>
                      <span className="text-ink/20">·</span>
                      <button disabled={busy} onClick={() => removeOrphan(o)} className="text-red-600 hover:underline disabled:opacity-50">삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* 우측: 인기 콘텐츠 */}
        <aside className="space-y-5">
          <div>
            <h2 className="font-serif text-base font-semibold mb-1">🔥 인기 콘텐츠</h2>
            <p className="text-xs text-ink/40">조회수·저장 기준 Top 3. 콘텐츠 + 도구·프롬프트 통합.</p>
          </div>
          <RankBlock title="조회 Top 3" items={rankViews} metric="views" />
          <RankBlock title="저장 Top 3" items={rankSaves} metric="saves" />
        </aside>
      </div>
    </div>
  );
}
