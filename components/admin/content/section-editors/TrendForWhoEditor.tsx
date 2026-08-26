'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { TrendForWho } from '@/types/content';
import { RepeatableList } from './RepeatableList';

/**
 * #6 Phase 2 — trend §"누구한테 중요해요".
 * TrendForWho[]: { role, why }. 라이브 trend 페이지 직무별 관련도 카드 정합.
 */
export function TrendForWhoEditor({
  value,
  onChange,
}: {
  value: TrendForWho[];
  onChange: (next: TrendForWho[]) => void;
}) {
  return (
    <RepeatableList<TrendForWho>
      items={value}
      onChange={onChange}
      addLabel="대상 추가"
      itemLabel={(i) => `대상 ${i + 1}`}
      emptyHint="이 소식이 어떤 직무에 왜 중요한지 추천."
      newItem={() => ({ role: '', why: '' })}
      renderItem={(w, update) => (
        <div className="space-y-2">
          <div>
            <Label className="text-[11px]">직무 / 역할</Label>
            <Input value={w.role} placeholder="예: 마케터" onChange={(e) => update({ ...w, role: e.target.value })} />
          </div>
          <div>
            <Label className="text-[11px]">왜 중요한가</Label>
            <Textarea rows={2} value={w.why} placeholder="이 직무에 미치는 영향" onChange={(e) => update({ ...w, why: e.target.value })} />
          </div>
        </div>
      )}
    />
  );
}
