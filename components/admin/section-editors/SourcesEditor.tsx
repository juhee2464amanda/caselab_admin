'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SourceLink } from '@/types/content';
import { RepeatableList } from './RepeatableList';

/**
 * #6 Phase 2 — trend §"출처·더 보기".
 * SourceLink[]: { label, url }. 라이브 trend 페이지 출처 링크 리스트 정합.
 */
export function SourcesEditor({
  value,
  onChange,
}: {
  value: SourceLink[];
  onChange: (next: SourceLink[]) => void;
}) {
  return (
    <RepeatableList<SourceLink>
      items={value}
      onChange={onChange}
      addLabel="출처 추가"
      itemLabel={(i) => `출처 ${i + 1}`}
      emptyHint="참고한 원문·더 읽을거리 링크."
      newItem={() => ({ label: '', url: '' })}
      renderItem={(s, update) => (
        <div className="grid sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">라벨</Label>
            <Input value={s.label} placeholder="표시될 텍스트" onChange={(e) => update({ ...s, label: e.target.value })} />
          </div>
          <div>
            <Label className="text-[11px]">URL</Label>
            <Input value={s.url} placeholder="https://…" onChange={(e) => update({ ...s, url: e.target.value })} />
          </div>
        </div>
      )}
    />
  );
}
