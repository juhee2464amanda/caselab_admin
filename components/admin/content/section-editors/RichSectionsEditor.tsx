'use client';

import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { BlockListEditor } from '../BlockListEditor';
import type { RichSection } from '@/types/content';

/**
 * 자유 리치 섹션 에디터 (도구·케이스·프롬프트·가이드 상세 공통).
 * 트렌드 본문과 동일한 블록(문단·소제목·프롬프트·체크리스트·이미지·갤러리·북마크)을
 * 각 섹션에 자유롭게 배치. 고정 섹션 외에 이미지·링크 등을 넣고 싶을 때 사용.
 * 본가 상세 페이지가 고정 섹션 뒤에 순서대로 렌더한다.
 *
 * 컨트롤드: value(RichSection[]) + onChange.
 */
export function RichSectionsEditor({
  value,
  onChange,
}: {
  value: RichSection[];
  onChange: (next: RichSection[]) => void;
}) {
  function update(i: number, patch: Partial<RichSection>) {
    onChange(value.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
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
  function add() {
    onChange([...value, { heading: '', blocks: [] }]);
  }

  return (
    <div className="space-y-4">
      {value.length === 0 && (
        <p className="text-sm text-ink/40">
          섹션이 없어요. 아래 &lsquo;섹션 추가&rsquo;로 이미지·링크·문단 등을 자유롭게 넣을 수 있어요.
        </p>
      )}

      {value.map((section, i) => (
        <section key={i} className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 space-y-2">
              <Input
                value={section.label ?? ''}
                placeholder="작은 라벨 (선택, 예: 더 알아보기)"
                onChange={(e) => update(i, { label: e.target.value || undefined })}
                className="h-8 text-xs"
              />
              <Input
                value={section.heading ?? ''}
                placeholder="섹션 제목 (선택, 예: 실제 화면으로 보기)"
                onChange={(e) => update(i, { heading: e.target.value || undefined })}
                className="font-semibold"
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-ink/40 hover:text-ink disabled:opacity-30" title="위로"><ChevronUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} className="p-1 text-ink/40 hover:text-ink disabled:opacity-30" title="아래로"><ChevronDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => remove(i)} className="p-1 text-red-500 hover:text-red-700" title="섹션 삭제"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
          <BlockListEditor value={section.blocks} onChange={(blocks) => update(i, { blocks })} />
        </section>
      ))}

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-ink/60 hover:border-ink/30 hover:text-ink"
      >
        <Plus className="h-4 w-4" /> 섹션 추가
      </button>
    </div>
  );
}
