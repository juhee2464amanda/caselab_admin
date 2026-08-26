'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { StepCard } from '@/types/content';
import { RepeatableList } from './RepeatableList';

/**
 * #6 Phase 2 — case §05 "단계별 AI 활용".
 * StepCard[]: { num, label, description?, human, ai, prompt, goodResult?, badResult? }.
 * 라이브 StepCard 컴포넌트 정합 — 사람이 할 일 / AI에 시킬 일 / 프롬프트 / 결과 비교 4구성.
 */
export function StepCardsEditor({
  value,
  onChange,
}: {
  value: StepCard[];
  onChange: (next: StepCard[]) => void;
}) {
  return (
    <RepeatableList<StepCard>
      items={value}
      onChange={onChange}
      addLabel="단계 추가"
      itemLabel={(i) => `Step ${i + 1}`}
      emptyHint="단계별로 사람이 할 일 → AI 시킬 일 → 프롬프트 → 결과 비교를 추천."
      newItem={() => ({ num: value.length + 1, label: '', human: '', ai: '', prompt: '' })}
      renderItem={(s, update) => (
        <div className="space-y-2">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div>
              <Label className="text-[11px]">번호</Label>
              <Input
                type="number"
                min={1}
                value={s.num}
                onChange={(e) => update({ ...s, num: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
            <div>
              <Label className="text-[11px]">단계 이름</Label>
              <Input value={s.label} placeholder="예: 문제 정의" onChange={(e) => update({ ...s, label: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-[11px]">설명 (선택)</Label>
            <Input value={s.description ?? ''} placeholder="이 단계가 왜 필요한지" onChange={(e) => update({ ...s, description: e.target.value || undefined })} />
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">🙋 사람이 할 일</Label>
              <Textarea rows={2} value={s.human} placeholder="손으로 먼저 만드는 입력" onChange={(e) => update({ ...s, human: e.target.value })} />
            </div>
            <div>
              <Label className="text-[11px]">🤖 AI에 시킬 일</Label>
              <Textarea rows={2} value={s.ai} placeholder="AI에게 위임할 부분" onChange={(e) => update({ ...s, ai: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-[11px]">프롬프트</Label>
            <Textarea rows={3} value={s.prompt} placeholder="복사 대상 프롬프트" className="font-mono text-[13px]" onChange={(e) => update({ ...s, prompt: e.target.value })} />
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">✅ 좋은 결과 (선택)</Label>
              <Textarea rows={2} value={s.goodResult ?? ''} placeholder="잘 나온 출력 예시" onChange={(e) => update({ ...s, goodResult: e.target.value || undefined })} />
            </div>
            <div>
              <Label className="text-[11px]">⚠️ 아쉬운 결과 (선택)</Label>
              <Textarea rows={2} value={s.badResult ?? ''} placeholder="별로였던 출력 예시" onChange={(e) => update({ ...s, badResult: e.target.value || undefined })} />
            </div>
          </div>
        </div>
      )}
    />
  );
}
