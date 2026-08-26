'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { TakingPoint } from '@/types/content';
import { RepeatableList } from './RepeatableList';

/**
 * #6 Phase 2 — case §07 "핵심 Taking point".
 * TakingPoint[]: { title, description, action? }. 라이브 TakingPointsList 정합.
 */
export function TakingPointsEditor({
  value,
  onChange,
}: {
  value: TakingPoint[];
  onChange: (next: TakingPoint[]) => void;
}) {
  return (
    <RepeatableList<TakingPoint>
      items={value}
      onChange={onChange}
      addLabel="Taking point 추가"
      itemLabel={(i) => `Taking point ${i + 1}`}
      emptyHint="이 글에서 가져갈 3가지를 추천."
      newItem={() => ({ title: '', description: '', action: '' })}
      renderItem={(tp, update) => (
        <div className="space-y-2">
          <div>
            <Label className="text-[11px]">제목</Label>
            <Input value={tp.title} placeholder="가져갈 핵심 한 줄" onChange={(e) => update({ ...tp, title: e.target.value })} />
          </div>
          <div>
            <Label className="text-[11px]">설명</Label>
            <Textarea rows={2} value={tp.description} placeholder="왜 중요한지" onChange={(e) => update({ ...tp, description: e.target.value })} />
          </div>
          <div>
            <Label className="text-[11px]">바로 할 액션 (선택)</Label>
            <Input value={tp.action ?? ''} placeholder="본인 일에 바로 옮길 행동" onChange={(e) => update({ ...tp, action: e.target.value || undefined })} />
          </div>
        </div>
      )}
    />
  );
}
