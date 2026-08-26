'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { PainPoint } from '@/types/content';
import { RepeatableList } from './RepeatableList';

/**
 * #6 Phase 2 — case §03 "보통 이런 일에서 막히는 이유".
 * PainPoint[]: { num, title, symptom, rootCause }. 라이브 PainPointsGrid 정합.
 */
export function PainPointsEditor({
  value,
  onChange,
}: {
  value: PainPoint[];
  onChange: (next: PainPoint[]) => void;
}) {
  return (
    <RepeatableList<PainPoint>
      items={value}
      onChange={onChange}
      addLabel="막히는 지점 추가"
      itemLabel={(i) => `막히는 지점 ${i + 1}`}
      emptyHint="실무에서 반복되는 문제 3가지를 추천."
      newItem={() => ({ num: String(value.length + 1).padStart(2, '0'), title: '', symptom: '', rootCause: '' })}
      renderItem={(pp, update) => (
        <div className="space-y-2">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div>
              <Label className="text-[11px]">번호</Label>
              <Input value={pp.num} placeholder="01" onChange={(e) => update({ ...pp, num: e.target.value })} />
            </div>
            <div>
              <Label className="text-[11px]">제목</Label>
              <Input value={pp.title} placeholder="문제를 한 줄로" onChange={(e) => update({ ...pp, title: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-[11px]">증상 (겉으로 드러나는 것)</Label>
            <Textarea rows={2} value={pp.symptom} placeholder="이런 상황이 반복돼요…" onChange={(e) => update({ ...pp, symptom: e.target.value })} />
          </div>
          <div>
            <Label className="text-[11px]">근본 원인</Label>
            <Textarea rows={2} value={pp.rootCause} placeholder="사실 진짜 원인은…" onChange={(e) => update({ ...pp, rootCause: e.target.value })} />
          </div>
        </div>
      )}
    />
  );
}
