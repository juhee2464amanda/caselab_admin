'use client';

import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';

/**
 * #6 Phase 2 — 단순 문자열 리스트 에디터.
 * D70 case.forWho · case.pros · case.cons · trend.keyPoints 등 string[] 섹션에 사용.
 * 한 줄 입력 + 추가/삭제. 순서 이동은 생략(짧은 리스트 가정).
 */
export function StringListEditor({
  value,
  onChange,
  placeholder,
  addLabel = '+ 항목 추가',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: (index: number) => string;
  addLabel?: string;
}) {
  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="text-sm text-ink/40">항목이 없어요.</p>
      )}
      {value.map((v, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={v}
            placeholder={placeholder ? placeholder(i) : `항목 ${i + 1}`}
            onChange={(e) => onChange(value.map((x, k) => (k === i ? e.target.value : x)))}
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, k) => k !== i))}
            className="px-2 text-red-500 hover:text-red-700 shrink-0"
            title="삭제"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, ''])}
        className="inline-flex items-center gap-1 text-xs rounded-md border border-border px-2.5 py-1.5 hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" /> {addLabel.replace(/^\+\s*/, '')}
      </button>
    </div>
  );
}
