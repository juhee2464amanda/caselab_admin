'use client';

import type { TrendBody } from '@/types/content';
import { BlockListEditor } from '../BlockListEditor';
import { BodySection } from './BodySection';
import { StringListEditor } from './StringListEditor';
import { TrendForWhoEditor } from './TrendForWhoEditor';
import { SourcesEditor } from './SourcesEditor';

/**
 * #6 Phase 3 — AI 트렌드 본문 GUI 에디터 (D70 정본).
 * 라이브 trends/[slug] 렌더 순서 정합. 모든 섹션 optional — 채운 섹션만 렌더.
 * (구 whats_new/experiment/verdict는 타입에 보존되나 폼은 D70만 생산.)
 */
export function TrendBodyEditor({
  value,
  onChange,
}: {
  value: TrendBody;
  onChange: (next: TrendBody) => void;
}) {
  const set = (patch: Partial<TrendBody>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <BodySection num="01" title="무슨 소식이에요" hint="새로 나온 것 / 바뀐 것.">
        <BlockListEditor value={value.what ?? []} onChange={(what) => set({ what })} />
      </BodySection>

      <BodySection num="02" title="왜 지금 화두예요" hint="맥락·배경.">
        <BlockListEditor value={value.why ?? []} onChange={(why) => set({ why })} />
      </BodySection>

      <BodySection num="03" title="누구한테 중요해요" hint="직무별 관련도.">
        <TrendForWhoEditor value={value.forWho ?? []} onChange={(forWho) => set({ forWho })} />
      </BodySection>

      <BodySection num="04" title="핵심만 빠르게" hint="핵심 3가지 정도.">
        <StringListEditor
          value={value.keyPoints ?? []}
          onChange={(keyPoints) => set({ keyPoints })}
          placeholder={(i) => `핵심 ${i + 1}`}
          addLabel="핵심 추가"
        />
      </BodySection>

      <BodySection num="05" title="좀 더 들어가면 (선택)" hint="깊이 있는 설명.">
        <BlockListEditor value={value.deepDive ?? []} onChange={(deepDive) => set({ deepDive })} />
      </BodySection>

      <BodySection num="06" title="그래서, 내 일엔?" hint="실무 적용 관점.">
        <BlockListEditor value={value.soWhat ?? []} onChange={(soWhat) => set({ soWhat })} />
      </BodySection>

      <BodySection title="출처·더 보기" hint="참고 링크.">
        <SourcesEditor value={value.sources ?? []} onChange={(sources) => set({ sources })} />
      </BodySection>
    </div>
  );
}
