'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, ChevronDown, ChevronUp, Check, X, RotateCcw, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { SEED_TRACKS, type SeedTrack } from '@/lib/seed-tracks';

export type Seed = {
  id: string;
  title: string;
  raw_text: string;
  source_url: string | null;
  origin: string;
  lane: string | null;
  status: 'raw' | 'adopted' | 'generating' | 'published' | 'rejected';
  note: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<Seed['status'], { label: string; cls: string }> = {
  raw: { label: '검토 전', cls: 'bg-yellow-100 text-yellow-700' },
  adopted: { label: '채택됨', cls: 'bg-blue-100 text-blue-700' },
  generating: { label: '생성 중', cls: 'bg-purple-100 text-purple-700' },
  published: { label: '발행됨', cls: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', cls: 'bg-muted text-ink/50' },
};

// 생성 버튼은 로컬 작업장(Claude CLI 있는 환경)에서만 노출. Vercel에선 숨김.
const LOCAL_AI = process.env.NEXT_PUBLIC_LOCAL_AI === 'true';

const LANE_CLS: Record<string, string> = {
  scout: 'bg-emerald-50 text-emerald-700',
  analyst: 'bg-indigo-50 text-indigo-700',
  briefing: 'bg-orange-50 text-orange-700',
  weekly: 'bg-pink-50 text-pink-700',
};

export function SeedTriage({
  seeds,
  muted = false,
}: {
  seeds: Seed[];
  lanes?: string[];
  muted?: boolean;
}) {
  return (
    <div className="space-y-3">
      {seeds.map((s) => (
        <SeedCard key={s.id} seed={s} muted={muted} />
      ))}
    </div>
  );
}

function SeedCard({ seed, muted }: { seed: Seed; muted: boolean }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState(seed.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState<SeedTrack | null>(null);

  const generate = async (track: SeedTrack) => {
    setGen(track);
    setError(null);
    try {
      const res = await fetch('/api/seeds/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seedId: seed.id, track }),
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

  const update = async (patch: Partial<Pick<Seed, 'status' | 'note'>>) => {
    setPending(true);
    setError(null);
    const { error: err } = await supabase.from('content_seeds').update(patch).eq('id', seed.id);
    setPending(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  };

  const st = STATUS_LABEL[seed.status];

  return (
    <div className={cn('rounded-lg border border-border bg-white p-4', muted && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', st.cls)}>{st.label}</span>
            {seed.lane && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[11px] font-medium',
                  LANE_CLS[seed.lane] ?? 'bg-muted text-ink/60'
                )}
              >
                {seed.lane}
              </span>
            )}
            <span className="text-xs text-ink/40">{formatDate(seed.created_at)}</span>
          </div>
          <p className="font-medium text-sm leading-snug break-words">{seed.title}</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-ink/40 hover:text-ink"
          aria-label="원문 펼치기"
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/60 p-3 text-xs text-ink/80 max-h-80 overflow-auto">
            {seed.raw_text}
          </pre>
          {seed.source_url && (
            <a
              href={seed.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Slack 원문
            </a>
          )}
          <div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="triage 메모 (각도·실험 가설 등)"
              rows={2}
              className="text-xs"
            />
            <div className="mt-1 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={pending || note === (seed.note ?? '')}
                onClick={() => update({ note })}
              >
                메모 저장
              </Button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {seed.status === 'raw' && (
          <>
            <Button size="sm" disabled={pending} onClick={() => update({ status: 'adopted' })}>
              <Check className="h-3.5 w-3.5" /> 채택
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => update({ status: 'rejected' })}>
              <X className="h-3.5 w-3.5" /> 반려
            </Button>
          </>
        )}
        {seed.status === 'adopted' && (
          <>
            {LOCAL_AI ? (
              <>
                {/* 케이스(기획주도)는 각도 메모를 먼저 적으면 초안에 반영됨 */}
                {!note.trim() && (
                  <p className="w-full text-xs text-ink/45">
                    케이스는 <b>기획 각도</b>를 먼저 적으면 초안에 반영돼요 — 원문을 펼쳐 메모를 저장하세요.
                  </p>
                )}
                {SEED_TRACKS.map((p, i) => (
                  <span key={p.track} className="contents">
                    {/* 콘텐츠 → 자료실 그룹 구분선 */}
                    {i > 0 && p.group !== SEED_TRACKS[i - 1].group && (
                      <span className="self-center text-ink/20">|</span>
                    )}
                    <Button size="sm" variant="accent" disabled={!!gen} onClick={() => generate(p.track)}>
                      {gen === p.track ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}{' '}
                      {p.label}
                    </Button>
                  </span>
                ))}
                {gen && <span className="self-center text-xs text-ink/50">리서치 포함, 1–3분…</span>}
              </>
            ) : (
              <span className="self-center text-xs text-ink/40">생성은 로컬 작업장에서</span>
            )}
            <Button size="sm" variant="ghost" disabled={pending || !!gen} onClick={() => update({ status: 'raw' })}>
              <RotateCcw className="h-3.5 w-3.5" /> 검토 전으로
            </Button>
          </>
        )}
        {(seed.status === 'published' || seed.status === 'rejected') && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => update({ status: 'raw' })}>
            <RotateCcw className="h-3.5 w-3.5" /> 되돌리기
          </Button>
        )}
      </div>
    </div>
  );
}
