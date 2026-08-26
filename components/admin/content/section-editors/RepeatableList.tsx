'use client';

import type { ReactNode } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';

/**
 * #6 Phase 2 — 재사용 반복 리스트 chrome.
 * 카드 + 위/아래 이동 + 삭제 + 추가 버튼을 제공. 각 항목의 필드 입력은 renderItem이 담당.
 * BlockListEditor와 동일한 시각 언어를 공유한다.
 *
 * 컨트롤드: items + onChange. 검증은 호출측에서.
 */
export function RepeatableList<T>({
  items,
  onChange,
  newItem,
  renderItem,
  addLabel,
  itemLabel,
  emptyHint,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  newItem: () => T;
  renderItem: (item: T, update: (next: T) => void, index: number) => ReactNode;
  addLabel: string;
  itemLabel?: (index: number) => string;
  emptyHint?: string;
}) {
  function update(i: number, next: T) {
    onChange(items.map((it, idx) => (idx === i ? next : it)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-sm text-ink/40 py-2">{emptyHint ?? '항목이 없어요. 아래에서 추가하세요.'}</p>
      )}

      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-border bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink/40">
              {itemLabel ? itemLabel(i) : `#${i + 1}`}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-ink/40 hover:text-ink disabled:opacity-30" title="위로"><ChevronUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="p-1 text-ink/40 hover:text-ink disabled:opacity-30" title="아래로"><ChevronDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => remove(i)} className="p-1 text-red-500 hover:text-red-700" title="삭제"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
          {renderItem(item, (next) => update(i, next), i)}
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...items, newItem()])}
        className="inline-flex items-center gap-1 text-xs rounded-md border border-border px-2.5 py-1.5 hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </button>
    </div>
  );
}
