'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, ChevronDown, ChevronUp, Sparkles, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDate, cn } from '@/lib/utils';
import { BUCKETS, type SeedBucket } from '@/lib/seed-curation';
import { SEED_TRACKS, type SeedTrack } from '@/lib/seed-tracks';
import { sourceProfile } from '@/lib/seed-sources';

export type CurSeed = {
  id: string;
  title: string;
  raw_text: string;
  source_url: string | null;
  lane: string | null;
  source_type: string | null;
  status: string;
  note: string | null;
  created_at: string;
  bucket: SeedBucket | null;
  score: number | null;
  score_reason: string | null;
  suggested_angle: string | null;
};

// 채점·생성은 로컬 작업장(Claude CLI)에서만. Vercel에선 숨김.
const LOCAL_AI = process.env.NEXT_PUBLIC_LOCAL_AI === 'true';

function scoreCls(score: number) {
  if (score >= 80) return 'bg-emerald-100 text-emerald-700';
  if (score >= 70) return 'bg-amber-100 text-amber-700';
  return 'bg-orange-100 text-orange-700';
}

export function SeedCuration({
  grouped,
  pending,
}: {
  grouped: Record<SeedBucket, CurSeed[]>;
  pending: number; // 미채점 raw 씨앗 수
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scoring, setScoring] = useState(false);
  const [gen, setGen] = useState<SeedTrack | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // 선택된 씨앗의 대표 버킷 → 기본 추천 트랙
  const allSeeds = Object.values(grouped).flat();
  const firstSelected = allSeeds.find((s) => selected.has(s.id));
  const suggestedTrack = firstSelected?.bucket
    ? BUCKETS.find((b) => b.key === firstSelected.bucket)?.defaultTrack
    : undefined;

  const runScore = async () => {
    setScoring(true);
    setError(null);
    try {
      const res = await fetch('/api/seeds/score', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '분석 실패');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScoring(false);
    }
  };

  const generate = async (track: SeedTrack) => {
    if (selected.size === 0) return;
    setGen(track);
    setError(null);
    try {
      const res = await fetch('/api/seeds/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seedIds: [...selected], track }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '생성 실패');
      router.push(json.redirect);
    } catch (e) {
      setError((e as Error).message);
      setGen(null);
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 액션 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/60">
          최근 72시간 · 버킷별 점수 상위 5개 · 60점 미만은 숨김.
        </p>
        {LOCAL_AI ? (
          <Button size="sm" variant="outline" disabled={scoring} onClick={runScore}>
            {scoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            새 씨앗 분석{pending > 0 && ` (대기 ${pending})`}
          </Button>
        ) : (
          <span className="text-xs text-ink/40">분석·생성은 로컬 작업장에서{pending > 0 && ` · 미채점 ${pending}`}</span>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* 3 버킷 컬럼 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {BUCKETS.map((b) => {
          const list = grouped[b.key] ?? [];
          return (
            <section key={b.key} className="space-y-2">
              <h2 className="font-serif text-base font-semibold">
                {b.emoji} {b.label} <span className="text-xs text-ink/40 font-normal">{list.length}</span>
              </h2>
              <p className="text-[11px] text-ink/45 leading-snug">{b.criteria}</p>
              {b.sources.length > 0 && (
                <p className="text-[11px] text-ink/35 leading-snug">
                  소스 · {b.sources.map((k) => sourceProfile(k)?.badge ?? k).join(' · ')}
                </p>
              )}
              {list.length === 0 ? (
                <p className="text-sm text-ink/30 py-4">72시간 내 떠오른 소식이 없어요.</p>
              ) : (
                list.map((s) => (
                  <SeedCuratedCard key={s.id} seed={s} selected={selected.has(s.id)} onToggle={() => toggle(s.id)} />
                ))
              )}
            </section>
          );
        })}
      </div>

      {/* 선택 → 조합 생성 액션바 */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10">
          <div className="mx-auto max-w-3xl rounded-xl border border-border bg-white p-3 shadow-lg">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                선택 {selected.size}개 →
              </span>
              {LOCAL_AI ? (
                SEED_TRACKS.map((p) => (
                  <Button
                    key={p.track}
                    size="sm"
                    variant={p.track === suggestedTrack ? 'accent' : 'outline'}
                    disabled={!!gen}
                    onClick={() => generate(p.track)}
                  >
                    {gen === p.track ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {p.label}
                  </Button>
                ))
              ) : (
                <span className="text-xs text-ink/40">생성은 로컬 작업장에서</span>
              )}
              <Button size="sm" variant="ghost" disabled={!!gen} onClick={() => setSelected(new Set())}>
                <X className="h-3.5 w-3.5" /> 선택 해제
              </Button>
              {gen && <span className="text-xs text-ink/50">합쳐 생성 중, 1–3분…</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SeedCuratedCard({
  seed,
  selected,
  onToggle,
}: {
  seed: CurSeed;
  selected: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const hide = async () => {
    setPending(true);
    // 숨김 = 반려 처리(버킷에서 빠짐)
    await supabase.from('content_seeds').update({ status: 'rejected' }).eq('id', seed.id);
    setPending(false);
    router.refresh();
  };

  return (
    <div className={cn('rounded-lg border bg-white p-3', selected ? 'border-accent ring-1 ring-accent' : 'border-border')}>
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 h-4 w-4 shrink-0 accent-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            {seed.score != null && (
              <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', scoreCls(seed.score))}>
                {seed.score}
              </span>
            )}
            {sourceProfile(seed.source_type) && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-ink/50">
                {sourceProfile(seed.source_type)!.badge}
              </span>
            )}
            <span className="text-[11px] text-ink/40">{formatDate(seed.created_at)}</span>
          </div>
          <p className="text-sm font-medium leading-snug break-words">{seed.title}</p>
          {seed.score_reason && <p className="mt-0.5 text-[11px] text-ink/50 leading-snug">{seed.score_reason}</p>}
        </div>
        <button onClick={() => setOpen((v) => !v)} className="shrink-0 text-ink/40 hover:text-ink" aria-label="펼치기">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-2 pl-6">
          {seed.suggested_angle && (
            <p className="text-xs text-ink/70">
              <span className="font-medium">각도</span> · {seed.suggested_angle}
            </p>
          )}
          <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 text-[11px] text-ink/80 max-h-60 overflow-auto">
            {seed.raw_text}
          </pre>
          <div className="flex items-center justify-between">
            {seed.source_url ? (
              <a href={seed.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                <ExternalLink className="h-3 w-3" /> 원문
              </a>
            ) : <span />}
            <Button size="sm" variant="ghost" disabled={pending} onClick={hide}>
              <X className="h-3.5 w-3.5" /> 숨김
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
