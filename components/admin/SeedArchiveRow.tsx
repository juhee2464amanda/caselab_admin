'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { sourceProfile } from '@/lib/seed-sources';
import { bucketProfile, isSeedBucket, bucketFromSource } from '@/lib/seed-curation';
import { ESSENCE_LABELS, essenceRows } from '@/lib/seed-essence';
import { formatDate, cn } from '@/lib/utils';
import { SeedAdoptButton } from '@/components/admin/SeedAdoptButton';

export type ArchiveSeed = {
  id: string;
  title: string;
  source_url: string | null;
  source_type: string | null;
  origin: string | null;
  status: string;
  created_at: string;
  bucket: string | null;
  score: number | null;
  raw_text: string | null;
  score_reason: string | null;
  suggested_angle: string | null;
  essence: Record<string, string> | null;
  note: string | null;
};

// 씨앗 아카이브의 한 행 — ▸ 화살표로 펼치면 작업실 카드와 동일한 상세(요약·근거·각도·원문)를 본다.
// 상세 데이터(essence·score_reason·suggested_angle)는 채점 때 적재됨. 미채점 씨앗은 원문만 노출.
export function SeedArchiveRow({ seed, statusLabel, statusCls }: { seed: ArchiveSeed; statusLabel: string; statusCls: string }) {
  const [open, setOpen] = useState(false);

  // 유효 버킷 — 채점된 bucket 우선, 없으면 출처로 추정.
  const eb = (seed.bucket && isSeedBucket(seed.bucket) ? seed.bucket : bucketFromSource(seed.source_type)) ?? null;
  const inferred = !(seed.bucket && isSeedBucket(seed.bucket));
  const rows = essenceRows(seed.essence);
  const hasDetail = rows.length > 0 || !!seed.score_reason || !!seed.suggested_angle || !!seed.note || !!seed.raw_text;

  return (
    <div className="text-sm">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium shrink-0', statusCls)}>{statusLabel}</span>
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <p className="truncate font-medium">{seed.essence?.headline || seed.title}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink/40">
            {sourceProfile(seed.source_type) && <span>{sourceProfile(seed.source_type)!.badge}</span>}
            {eb && bucketProfile(eb) && (
              <span>
                {bucketProfile(eb)!.emoji} {bucketProfile(eb)!.label}
                {inferred && <span className="text-ink/30"> (추정)</span>}
              </span>
            )}
            {seed.score != null && <span>· {seed.score}점</span>}
            {seed.origin && <span>· {seed.origin}</span>}
            <span>· {formatDate(seed.created_at)}</span>
          </div>
        </button>
        {seed.source_url && (
          <a href={seed.source_url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-accent hover:underline">
            원문
          </a>
        )}
        {(seed.status === 'raw' || seed.status === 'rejected') && <SeedAdoptButton seedId={seed.id} />}
        {seed.status === 'adopted' && <span className="shrink-0 text-xs text-amber-600">작업실에 채택됨</span>}
        <button onClick={() => setOpen((v) => !v)} className="shrink-0 text-ink/40 hover:text-ink" aria-label="자세히 보기">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="space-y-2 px-4 pb-3 pl-6">
          {rows.length > 0 && (
            <dl className="rounded-md bg-muted/50 p-2 text-[11px] leading-snug">
              {rows.map(([k, v]) => (
                <div key={k} className="flex gap-1.5">
                  <dt className="shrink-0 font-medium text-ink/50">{ESSENCE_LABELS[k]}</dt>
                  <dd className="text-ink/80">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {seed.score_reason && (
            <p className="text-xs text-ink/70">
              <span className="font-medium">왜 중요</span> · {seed.score_reason}
            </p>
          )}
          {seed.suggested_angle && (
            <p className="text-xs text-ink/70">
              <span className="font-medium">각도</span> · {seed.suggested_angle}
            </p>
          )}
          {seed.note && (
            <p className="text-xs text-ink/70">
              <span className="font-medium">메모</span> · {seed.note}
            </p>
          )}
          {rows.length === 0 && !seed.score_reason && !seed.suggested_angle && (
            <p className="text-[11px] text-ink/40">아직 채점 전이라 요약이 없어요. 작업실에서 재분석하면 채워집니다.</p>
          )}
          {seed.raw_text && (
            <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 text-[11px] text-ink/80 max-h-60 overflow-auto">
              {seed.raw_text}
            </pre>
          )}
          {seed.source_url && (
            <a href={seed.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              <ExternalLink className="h-3 w-3" /> 원문 열기
            </a>
          )}
          {!hasDetail && <p className="text-[11px] text-ink/40">표시할 상세 내용이 없어요.</p>}
        </div>
      )}
    </div>
  );
}
