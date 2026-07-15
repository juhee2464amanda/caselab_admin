'use client';

import type { CaseBody } from '@/types/content';
import { BlockListEditor } from '../BlockListEditor';
import { BodySection } from './BodySection';
import { StringListEditor } from './StringListEditor';
import { PainPointsEditor } from './PainPointsEditor';
import { StepCardsEditor } from './StepCardsEditor';
import { TakingPointsEditor } from './TakingPointsEditor';
import { FrameworkReferenceEditor } from './FrameworkReferenceEditor';
import { FrameworkStepsEditor } from './FrameworkStepsEditor';
import { RichSectionsEditor } from './RichSectionsEditor';

/**
 * #6 Phase 3 — 실전 케이스 본문 GUI 에디터 (D70 7섹션).
 * 라이브 cases/[slug] 렌더 순서 정합. 각 섹션은 slice 업데이트 → 나머지 필드 보존
 * (legacy 4섹션 데이터도 보존되어 손실 없음).
 */
export function CaseBodyEditor({
  value,
  onChange,
}: {
  value: CaseBody;
  onChange: (next: CaseBody) => void;
}) {
  const set = (patch: Partial<CaseBody>) => onChange({ ...value, ...patch });
  const hasLegacy =
    (value.essence?.length ?? 0) > 0 ||
    (value.framework?.length ?? 0) > 0 ||
    (value.failures?.length ?? 0) > 0 ||
    (value.review?.length ?? 0) > 0 ||
    (value.customization?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <BodySection num="01" title="이런 분들을 위한 글이에요" hint="타깃 독자를 한 줄씩.">
        <StringListEditor
          value={value.forWho ?? []}
          onChange={(forWho) => set({ forWho })}
          placeholder={(i) => `대상 ${i + 1} (예: 데이터 없이 기획하는 마케터)`}
          addLabel="대상 추가"
        />
      </BodySection>

      <BodySection num="02" title="어떤 케이스를 다루나요" hint="케이스 도입부. 자유 블록.">
        <BlockListEditor value={value.caseIntro ?? []} onChange={(caseIntro) => set({ caseIntro })} />
      </BodySection>

      <BodySection num="03" title="보통 이런 일에서 막히는 이유" hint="반복되는 문제 + 근본 원인.">
        <PainPointsEditor value={value.painPoints ?? []} onChange={(painPoints) => set({ painPoints })} />
      </BodySection>

      <BodySection num="04" title="적용한 Framework" hint="차용한 사고법 출처 (선택).">
        <FrameworkReferenceEditor
          value={value.frameworkReference ?? null}
          onChange={(ref) => set({ frameworkReference: ref ?? undefined })}
        />
      </BodySection>

      <BodySection num="05" title="단계별 AI 활용" hint="사람이 할 일 / AI 시킬 일 / 프롬프트 / 결과 비교.">
        <StepCardsEditor value={value.stepCards ?? []} onChange={(stepCards) => set({ stepCards })} />
      </BodySection>

      <BodySection num="06" title="좋았던 점 · 아쉬웠던 점" hint="솔직하게. 양쪽 모두.">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-emerald-600">👍 좋았던 점</div>
            <StringListEditor value={value.pros ?? []} onChange={(pros) => set({ pros })} addLabel="추가" />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-red-500">👎 아쉬웠던 점</div>
            <StringListEditor value={value.cons ?? []} onChange={(cons) => set({ cons })} addLabel="추가" />
          </div>
        </div>
      </BodySection>

      <BodySection num="07" title="핵심 Taking point" hint="가져갈 핵심 + 바로 할 액션.">
        <TakingPointsEditor value={value.takingPoints ?? []} onChange={(takingPoints) => set({ takingPoints })} />
      </BodySection>

      <BodySection title="추가 섹션 (이미지·링크·갤러리 등)" hint="트렌드처럼 이미지·북마크·갤러리·문단을 자유롭게. 07 뒤에 순서대로 노출돼요.">
        <RichSectionsEditor value={value.sections ?? []} onChange={(sections) => set({ sections })} />
      </BodySection>

      {/* 레거시 4섹션 — 접이식. 기존 콘텐츠 보존·편집용 (신규는 위 D70 사용 권장) */}
      <details className="rounded-xl border border-border bg-white" open={hasLegacy}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-ink/70">
          레거시 4섹션 (essence·framework·failures·review·customization)
          {hasLegacy && <span className="ml-2 text-[11px] font-normal text-amber-600">· 데이터 있음</span>}
        </summary>
        <div className="space-y-4 border-t border-border p-4">
          <p className="text-xs text-ink/50 break-keep">
            D70 7섹션을 채우면 라이브는 그쪽을 렌더합니다. 이 4섹션은 신규 D70 필드가 모두 비었을 때만 폴백으로 노출돼요.
          </p>
          <BodySection title="본질 (essence)">
            <BlockListEditor value={value.essence ?? []} onChange={(essence) => set({ essence })} />
          </BodySection>
          <BodySection title="Framework (단계)">
            <FrameworkStepsEditor value={value.framework ?? []} onChange={(framework) => set({ framework })} />
          </BodySection>
          <BodySection title="별로였던 사례 (failures)">
            <BlockListEditor value={value.failures ?? []} onChange={(failures) => set({ failures })} />
          </BodySection>
          <BodySection title="후기 (review)">
            <BlockListEditor value={value.review ?? []} onChange={(review) => set({ review })} />
          </BodySection>
          <BodySection title="본인 것으로 만드는 4단계 (customization)" hint="정확히 4개 권장.">
            <StringListEditor
              value={value.customization ?? []}
              onChange={(customization) => set({ customization })}
              placeholder={(i) => `${i + 1}단계`}
              addLabel="단계 추가"
            />
          </BodySection>
        </div>
      </details>
    </div>
  );
}
