'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Block } from '@/types/content';

/**
 * #6 Phase 1 — 재사용 블록 리스트 에디터.
 * 본문 섹션(caseIntro·essence·what·why·deepDive·soWhat 등 Block[])의 구조화 입력.
 * 편집 지원: text · heading · prompt · checklist (핵심 4종).
 * 그 외 고급 블록(role-card·rebuttal·context-card 등)은 read-only로 보존(데이터 유실 방지).
 *
 * 컨트롤드: value(Block[]) + onChange. 저장 검증은 호출측(TrackForm)에서.
 */

type AddType = 'text' | 'heading' | 'prompt' | 'checklist';

const ADD_BUTTONS: { type: AddType; label: string }[] = [
  { type: 'text', label: '문단' },
  { type: 'heading', label: '소제목' },
  { type: 'prompt', label: '프롬프트' },
  { type: 'checklist', label: '체크리스트' },
];

function newBlock(type: AddType): Block {
  switch (type) {
    case 'text': return { type: 'text', markdown: '' };
    case 'heading': return { type: 'heading', level: 2, text: '' };
    case 'prompt': return { type: 'prompt', label: '', prompt: '' };
    case 'checklist': return { type: 'checklist', title: '', items: [''] };
  }
}

const EDITABLE = new Set(['text', 'heading', 'prompt', 'checklist']);

export function BlockListEditor({
  value,
  onChange,
}: {
  value: Block[];
  onChange: (blocks: Block[]) => void;
}) {
  function update(i: number, next: Block) {
    onChange(value.map((b, idx) => (idx === i ? next : b)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function add(type: AddType) {
    onChange([...value, newBlock(type)]);
  }

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-sm text-ink/40 py-2">블록이 없어요. 아래에서 추가하세요.</p>
      )}

      {value.map((block, i) => (
        <div key={i} className="rounded-lg border border-border bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink/40">
              {BLOCK_LABEL[block.type] ?? block.type}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-ink/40 hover:text-ink disabled:opacity-30" title="위로"><ChevronUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} className="p-1 text-ink/40 hover:text-ink disabled:opacity-30" title="아래로"><ChevronDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => remove(i)} className="p-1 text-red-500 hover:text-red-700" title="삭제"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
          <BlockFields block={block} onChange={(b) => update(i, b)} />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs text-ink/40 inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> 블록 추가</span>
        {ADD_BUTTONS.map((b) => (
          <button key={b.type} type="button" onClick={() => add(b.type)} className="text-xs rounded-md border border-border px-2.5 py-1 hover:bg-muted">
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const BLOCK_LABEL: Record<string, string> = {
  text: '문단', heading: '소제목', prompt: '프롬프트', checklist: '체크리스트',
};

function BlockFields({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  if (!EDITABLE.has(block.type)) {
    // 고급 블록 — 보존만 (read-only)
    return (
      <div className="text-xs text-ink/40">
        고급 블록(<code>{block.type}</code>)은 여기서 편집 불가 — 저장 시 그대로 보존됩니다.
      </div>
    );
  }

  if (block.type === 'text') {
    return (
      <Textarea rows={3} value={block.markdown} placeholder="문단 내용 (markdown)"
        onChange={(e) => onChange({ ...block, markdown: e.target.value })} />
    );
  }

  if (block.type === 'heading') {
    return (
      <div className="flex gap-2">
        <select className="h-10 rounded-md border border-border bg-white px-2 text-sm shrink-0"
          value={block.level} onChange={(e) => onChange({ ...block, level: Number(e.target.value) === 3 ? 3 : 2 })}>
          <option value={2}>H2</option>
          <option value={3}>H3</option>
        </select>
        <Input value={block.text} placeholder="소제목" onChange={(e) => onChange({ ...block, text: e.target.value })} />
      </div>
    );
  }

  if (block.type === 'prompt') {
    return (
      <div className="space-y-2">
        <Input value={block.label} placeholder="라벨 (예: 분석 프롬프트)" onChange={(e) => onChange({ ...block, label: e.target.value })} />
        <Textarea rows={4} value={block.prompt} placeholder="복사 대상 프롬프트 본문" className="font-mono text-[13px]"
          onChange={(e) => onChange({ ...block, prompt: e.target.value })} />
      </div>
    );
  }

  if (block.type === 'checklist') {
    const items = block.items;
    return (
      <div className="space-y-2">
        <Input value={block.title} placeholder="체크리스트 제목" onChange={(e) => onChange({ ...block, title: e.target.value })} />
        {items.map((it, idx) => (
          <div key={idx} className="flex gap-2">
            <Input value={it} placeholder={`항목 ${idx + 1}`}
              onChange={(e) => onChange({ ...block, items: items.map((x, k) => (k === idx ? e.target.value : x)) })} />
            <button type="button" onClick={() => onChange({ ...block, items: items.filter((_, k) => k !== idx) })}
              className="px-2 text-red-500 hover:text-red-700 shrink-0" title="항목 삭제">×</button>
          </div>
        ))}
        <button type="button" onClick={() => onChange({ ...block, items: [...items, ''] })}
          className="text-xs text-accent hover:underline">+ 항목 추가</button>
      </div>
    );
  }

  return null;
}
