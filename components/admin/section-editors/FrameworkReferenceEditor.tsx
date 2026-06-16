'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { FrameworkReference } from '@/types/content';

/**
 * #6 Phase 2 — case §04 "적용한 Framework".
 * 단일 FrameworkReference: { name, description, sourceLabel?, sourceTitle?, sourceUrl?, sourceThumbnail? }.
 * 라이브 FrameworkRefSection 정합. null 허용(섹션 비활성).
 */
export function FrameworkReferenceEditor({
  value,
  onChange,
}: {
  value: FrameworkReference | null;
  onChange: (next: FrameworkReference | null) => void;
}) {
  if (!value) {
    return (
      <button
        type="button"
        onClick={() => onChange({ name: '', description: '' })}
        className="text-xs rounded-md border border-border px-2.5 py-1.5 hover:bg-muted"
      >
        + Framework 출처 추가
      </button>
    );
  }

  const set = (patch: Partial<FrameworkReference>) => onChange({ ...value, ...patch });

  return (
    <div className="rounded-lg border border-border bg-white p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink/40">Framework 출처</span>
        <button type="button" onClick={() => onChange(null)} className="text-xs text-red-500 hover:text-red-700">제거</button>
      </div>
      <div>
        <Label className="text-[11px]">이름</Label>
        <Input value={value.name} placeholder="예: 가설 기반 사고법" onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div>
        <Label className="text-[11px]">설명</Label>
        <Textarea rows={2} value={value.description} placeholder="어떤 사고 구조를 차용했는지" onChange={(e) => set({ description: e.target.value })} />
      </div>
      <div className="grid sm:grid-cols-2 gap-2 pt-1 border-t border-border/60">
        <div>
          <Label className="text-[11px]">출처 라벨 (선택)</Label>
          <Input value={value.sourceLabel ?? ''} placeholder="예: 책 / 논문 / 블로그" onChange={(e) => set({ sourceLabel: e.target.value || undefined })} />
        </div>
        <div>
          <Label className="text-[11px]">출처 제목 (선택)</Label>
          <Input value={value.sourceTitle ?? ''} placeholder="원전 제목" onChange={(e) => set({ sourceTitle: e.target.value || undefined })} />
        </div>
        <div>
          <Label className="text-[11px]">출처 URL (선택)</Label>
          <Input value={value.sourceUrl ?? ''} placeholder="https://…" onChange={(e) => set({ sourceUrl: e.target.value || undefined })} />
        </div>
        <div>
          <Label className="text-[11px]">출처 썸네일 URL (선택)</Label>
          <Input value={value.sourceThumbnail ?? ''} placeholder="https://…" onChange={(e) => set({ sourceThumbnail: e.target.value || undefined })} />
        </div>
      </div>
    </div>
  );
}
