'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FrameworkStep } from '@/types/content';
import { BlockListEditor } from '../BlockListEditor';
import { RepeatableList } from './RepeatableList';

/**
 * #6 Phase 3 — legacy case "Framework" 섹션 (4섹션 본문).
 * FrameworkStep[]: { name, description, intent, blocks: Block[] }.
 * D70 전환 후엔 stepCards가 정본이지만, 기존 legacy 콘텐츠 보존·편집을 위해 유지.
 */
export function FrameworkStepsEditor({
  value,
  onChange,
}: {
  value: FrameworkStep[];
  onChange: (next: FrameworkStep[]) => void;
}) {
  return (
    <RepeatableList<FrameworkStep>
      items={value}
      onChange={onChange}
      addLabel="Step 추가"
      itemLabel={(i) => `Step ${i + 1}`}
      emptyHint="Framework 단계가 없어요."
      newItem={() => ({ name: '', description: '', intent: '', blocks: [{ type: 'text', markdown: '' }] })}
      renderItem={(step, update) => (
        <div className="space-y-2">
          <div>
            <Label className="text-[11px]">단계 이름</Label>
            <Input value={step.name} placeholder="예: 가설 세우기" onChange={(e) => update({ ...step, name: e.target.value })} />
          </div>
          <div>
            <Label className="text-[11px]">설명</Label>
            <Input value={step.description} placeholder="단계 설명 (선택)" onChange={(e) => update({ ...step, description: e.target.value })} />
          </div>
          <div>
            <Label className="text-[11px]">의도 (IntentBox)</Label>
            <Input value={step.intent} placeholder="이 단계의 의도를 한 줄로" onChange={(e) => update({ ...step, intent: e.target.value })} />
          </div>
          <div>
            <Label className="text-[11px]">블록</Label>
            <BlockListEditor value={step.blocks} onChange={(blocks) => update({ ...step, blocks })} />
          </div>
        </div>
      )}
    />
  );
}
