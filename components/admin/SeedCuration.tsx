'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, ChevronDown, ChevronUp, Sparkles, Loader2, RefreshCw, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDate, cn } from '@/lib/utils';
import { BUCKETS, SCORE_CUT, WINDOW_HOURS, BUCKET_CAP, bucketProfile, type SeedBucket } from '@/lib/seed-curation';
import { SEED_TRACKS, type SeedTrack } from '@/lib/seed-tracks';
import { SOURCES, sourceProfile } from '@/lib/seed-sources';
import { CollectRequestButton } from '@/components/admin/CollectRequestButton';

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
  essence: Record<string, string> | null; // { headline, ...버킷별 상세 }
};

// 채점·생성은 로컬 작업장(Claude CLI)에서만. Vercel에선 숨김.
const LOCAL_AI = process.env.NEXT_PUBLIC_LOCAL_AI === 'true';

function scoreCls(score: number) {
  if (score >= 80) return 'bg-emerald-100 text-emerald-700';
  if (score >= 70) return 'bg-amber-100 text-amber-700';
  return 'bg-orange-100 text-orange-700';
}

// essence 상세 키 라벨(버킷별). headline은 카드 제목으로 이미 노출되므로 제외.
const ESSENCE_LABELS: Record<string, string> = {
  // service
  what: '무엇',
  feature: '기능',
  category: '카테고리',
  useCase: '누가·효율',
  // trend
  whyNow: '왜 지금',
  implication: 'AI 흐름·시사',
  // painpoint
  who: '대상',
  pain: '페인',
  suggest: '제안 콘텐츠',
};

function essenceRows(essence: Record<string, string> | null): [string, string][] {
  if (!essence) return [];
  return Object.entries(essence).filter(([k, v]) => k !== 'headline' && v && ESSENCE_LABELS[k]);
}

export function SeedCuration({
  seeds,
  pending,
  onGenerated,
}: {
  seeds: CurSeed[];
  pending: number; // 미채점 raw 씨앗 수
  /** 스튜디오 임베드용. 있으면 생성 후 페이지 이동 대신 콜백(같은 화면에서 편집으로). */
  onGenerated?: (id: string, kind: 'content' | 'tool') => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scoring, setScoring] = useState(false);
  const [gen, setGen] = useState<SeedTrack | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 생성 흐름: 타입 선택 → 기획방향(필수) → 개요 생성 → 개요 확인·수정 → 본문 생성(단계적 구체화)
  const [pendingTrack, setPendingTrack] = useState<SeedTrack | null>(null);
  const [direction, setDirection] = useState('');
  const [outlineText, setOutlineText] = useState<string | null>(null); // null = 아직 개요 생성 전
  const [outlining, setOutlining] = useState(false);

  // 필터 상태 (버킷은 라우팅이 아닌 soft 필터)
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [bucketFilter, setBucketFilter] = useState<SeedBucket | null>(null);
  const [showAll, setShowAll] = useState(false); // true면 점수컷(<60)·미채점도 노출
  const [query, setQuery] = useState('');
  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(new Set()); // 버킷별 '더 보기'
  const toggleBucket = (k: string) =>
    setExpandedBuckets((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  // 수동 적재 컴포저
  const [composerOpen, setComposerOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // 공통 노출 조건(점수컷·검색어). 칩 카운트와 목록이 같은 기준을 쓰도록 단일화.
  const passesBase = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (s: CurSeed) => {
      if (!showAll && (s.score == null || s.score < SCORE_CUT)) return false;
      if (q && !s.title.toLowerCase().includes(q)) return false;
      return true;
    };
  }, [showAll, query]);

  // facet 카운트 — 자기 축을 제외한 나머지 필터를 적용해 '누르면 몇 개 보일지'를 표시.
  const sourceFacets = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of seeds) {
      if (!passesBase(s)) continue;
      if (bucketFilter && s.bucket !== bucketFilter) continue;
      const k = s.source_type ?? 'slack-brief';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [seeds, passesBase, bucketFilter]);
  const bucketFacets = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of seeds) {
      if (!passesBase(s)) continue;
      if (sourceFilter && (s.source_type ?? 'slack-brief') !== sourceFilter) continue;
      if (s.bucket) m.set(s.bucket, (m.get(s.bucket) ?? 0) + 1);
    }
    return m;
  }, [seeds, passesBase, sourceFilter]);

  // 필터 + 신선도 가중 정렬(최근×점수). 0h:가중1.0 → 72h:0.5(하한 0.3) → '지금 뜨는' 것이 위로.
  const filtered = useMemo(() => {
    const now = Date.now();
    const weight = (s: CurSeed) => {
      const score = s.score ?? 0;
      const ageH = (now - new Date(s.created_at).getTime()) / 3_600_000;
      const decay = Math.max(0.3, 1 - 0.5 * (ageH / WINDOW_HOURS));
      return score * decay;
    };
    return seeds
      .filter((s) => {
        if (sourceFilter && (s.source_type ?? 'slack-brief') !== sourceFilter) return false;
        if (bucketFilter && s.bucket !== bucketFilter) return false;
        return passesBase(s);
      })
      .sort((a, b) => weight(b) - weight(a));
  }, [seeds, sourceFilter, bucketFilter, passesBase]);

  // 선택된 씨앗의 대표 버킷 → 기본 추천 트랙 (제약 아님, 시각적 하이라이트만)
  const firstSelected = seeds.find((s) => selected.has(s.id));
  const suggestedTrack = firstSelected?.bucket ? bucketProfile(firstSelected.bucket)?.defaultTrack : undefined;

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

  const clearSelection = () => {
    setSelected(new Set());
    setPendingTrack(null);
    setDirection('');
    setOutlineText(null);
  };

  const pickTrack = (track: SeedTrack | null) => {
    setPendingTrack(track);
    setOutlineText(null); // 타입 바뀌면 개요 초기화
  };

  // 1단계: 개요(목차) 생성 — 사람이 확인·수정할 뼈대.
  const makeOutline = async () => {
    if (selected.size === 0 || !pendingTrack || !direction.trim()) return;
    setOutlining(true);
    setError(null);
    try {
      const res = await fetch('/api/seeds/outline', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seedIds: [...selected], track: pendingTrack, direction: direction.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '개요 생성 실패');
      setOutlineText((json.outline as string[])?.join('\n') ?? '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOutlining(false);
    }
  };

  // 2단계: 확정 개요로 본문 생성.
  const generate = async () => {
    if (selected.size === 0 || !pendingTrack || !direction.trim()) return;
    const outline = (outlineText ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    setGen(pendingTrack);
    setError(null);
    try {
      const res = await fetch('/api/seeds/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seedIds: [...selected], track: pendingTrack, direction: direction.trim(), outline }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '생성 실패');
      // 스튜디오 모드: 같은 화면에서 편집으로 넘어감. 아니면 에디터 페이지로 이동.
      if (onGenerated && json.id) {
        onGenerated(json.id, json.kind === 'tool' ? 'tool' : 'content');
        return;
      }
      router.push(json.redirect);
    } catch (e) {
      setError((e as Error).message);
      setGen(null);
      router.refresh();
    }
  };

  // 수동 씨앗 적재. 로컬이면 삽입 직후 즉시 채점(/api/seeds/score seedIds)까지.
  const createSeed = async (input: {
    title: string;
    raw_text: string;
    source_url: string;
    source_type: string;
    note: string;
  }) => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/seeds/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '적재 실패');
      if (LOCAL_AI && json.id) {
        await fetch('/api/seeds/score', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ seedIds: [json.id] }),
        }).catch(() => {}); // 채점 실패해도 씨앗은 남음(다음 "새 씨앗 분석"에서 처리)
      }
      setComposerOpen(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 헤더 액션 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/60">
          최근 72시간 · 채점된 씨앗 {seeds.length}건.
        </p>
        <div className="flex items-center gap-2">
          <CollectRequestButton />
          <Button size="sm" variant="outline" onClick={() => setComposerOpen((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> 수동 씨앗 추가
          </Button>
          {LOCAL_AI ? (
            <Button size="sm" variant="outline" disabled={scoring} onClick={runScore}>
              {scoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              새 씨앗 분석{pending > 0 && ` (대기 ${pending})`}
            </Button>
          ) : (
            <span className="text-xs text-ink/40">분석·생성은 로컬 작업장에서{pending > 0 && ` · 미채점 ${pending}`}</span>
          )}
        </div>
      </div>

      {composerOpen && <SeedComposer creating={creating} onSubmit={createSeed} onCancel={() => setComposerOpen(false)} />}

      {/* 필터바 */}
      <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
        {/* 소스 칩 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-ink/40 mr-1">소스</span>
          <FilterChip active={sourceFilter === null} onClick={() => setSourceFilter(null)}>
            전체 <span className="tabular-nums text-ink/40">{[...sourceFacets.values()].reduce((a, n) => a + n, 0)}</span>
          </FilterChip>
          {SOURCES.filter((src) => (sourceFacets.get(src.key) ?? 0) > 0 || sourceFilter === src.key).map((src) => (
            <FilterChip key={src.key} active={sourceFilter === src.key} onClick={() => setSourceFilter(src.key)}>
              {src.badge} <span className="tabular-nums text-ink/40">{sourceFacets.get(src.key) ?? 0}</span>
            </FilterChip>
          ))}
        </div>
        {/* 버킷 칩 + 점수컷 + 검색 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-ink/40 mr-1">분류</span>
          <FilterChip active={bucketFilter === null} onClick={() => setBucketFilter(null)}>전체</FilterChip>
          {BUCKETS.map((b) => (
            <FilterChip key={b.key} active={bucketFilter === b.key} onClick={() => setBucketFilter(b.key)}>
              {b.emoji} {b.label} <span className="tabular-nums text-ink/40">{bucketFacets.get(b.key) ?? 0}</span>
            </FilterChip>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목 검색"
              className="h-7 w-32 rounded-md border border-border bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-accent"
            />
            <FilterChip active={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? '전체 점수' : `${SCORE_CUT}점+`}
            </FilterChip>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* 카테고리(버킷)별 나열 + 버킷당 상한(균형). 초과분은 '더 보기'. */}
      {filtered.length === 0 && (
        <p className="text-sm text-ink/30 py-6 text-center">
          조건에 맞는 씨앗이 없어요.{!showAll && ' 점수컷을 낮추거나 필터를 풀어 보세요.'}
        </p>
      )}
      <div className="space-y-6">
        {BUCKETS.filter((b) => !bucketFilter || b.key === bucketFilter).map((b) => {
          const list = filtered.filter((s) => s.bucket === b.key);
          const expanded = expandedBuckets.has(b.key) || !!bucketFilter;
          const shown = expanded ? list : list.slice(0, BUCKET_CAP);
          const overflow = list.length - BUCKET_CAP;
          return (
            <section key={b.key} className="space-y-2">
              <div className="flex items-center gap-2 border-b border-border pb-1">
                <h2 className="font-serif text-base font-semibold">{b.emoji} {b.label}</h2>
                <span className="text-xs text-ink/40 tabular-nums">{list.length}</span>
                {overflow > 0 && !bucketFilter && (
                  <button onClick={() => toggleBucket(b.key)} className="ml-auto text-xs text-accent hover:underline">
                    {expanded ? '접기' : `+${overflow} 더 보기`}
                  </button>
                )}
              </div>
              {list.length === 0 ? (
                <p className="text-sm text-ink/30 py-2">지금 이 카테고리엔 없어요.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {shown.map((s) => (
                    <SeedCuratedCard key={s.id} seed={s} selected={selected.has(s.id)} onToggle={() => toggle(s.id)} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* 선택 → 타입 선택 → 기획방향(필수) → 생성 */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10">
          <div className="mx-auto max-w-3xl rounded-xl border border-border bg-white p-3 shadow-lg space-y-3">
            {/* Step 1: 타입 선택 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">선택 {selected.size}개 →</span>
              {LOCAL_AI ? (
                SEED_TRACKS.map((p) => (
                  <Button
                    key={p.track}
                    size="sm"
                    variant={p.track === pendingTrack || (p.track === suggestedTrack && !pendingTrack) ? 'accent' : 'outline'}
                    disabled={!!gen || outlining}
                    onClick={() => pickTrack(p.track)}
                  >
                    {p.label}
                    {p.track === suggestedTrack && !pendingTrack && <span className="ml-1 text-[10px] opacity-70">추천</span>}
                  </Button>
                ))
              ) : (
                <span className="text-xs text-ink/40">생성은 로컬 작업장에서</span>
              )}
              <Button size="sm" variant="ghost" disabled={!!gen || outlining} onClick={clearSelection}>
                <X className="h-3.5 w-3.5" /> 선택 해제
              </Button>
            </div>

            {/* Step 2: 기획방향(필수) — 첫 기획은 반드시 사람이 방향을 준다 */}
            {LOCAL_AI && pendingTrack && (
              <div className="space-y-2 border-t border-border pt-3">
                <label className="block text-xs font-medium text-ink/70">
                  기획방향 <span className="text-red-500">*</span>
                  <span className="ml-1 font-normal text-ink/40">
                    — 이 {SEED_TRACKS.find((p) => p.track === pendingTrack)?.label.replace('로 생성', '')}를 어떤 대상·문제·메시지로 풀지 방향을 적으세요. 소스가 이 방향에 맞게 재구성됩니다.
                  </span>
                </label>
                <textarea
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  disabled={!!gen || outlining}
                  placeholder="예) 마케터가 반복 업무를 자동화하는 관점에서, 도입 장벽과 실제 절감 효과를 중심으로"
                  className="w-full min-h-[64px] resize-y rounded-md border border-border bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent"
                />

                {/* Step 3: 개요 생성 → 확인·수정 → 본문 생성 (단계적 구체화) */}
                {outlineText === null ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="accent" disabled={outlining || !direction.trim()} onClick={makeOutline}>
                      {outlining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      개요 생성
                    </Button>
                    <Button size="sm" variant="ghost" disabled={outlining} onClick={() => pickTrack(null)}>
                      타입 다시 선택
                    </Button>
                    {outlining && <span className="text-xs text-ink/50">개요 잡는 중…</span>}
                  </div>
                ) : (
                  <div className="space-y-2 border-t border-dashed border-border pt-2">
                    <label className="block text-xs font-medium text-ink/70">
                      개요(목차) <span className="font-normal text-ink/40">— 한 줄에 항목 하나. 순서·항목을 자유롭게 수정하세요. 본문이 이 구조를 따릅니다.</span>
                    </label>
                    <textarea
                      value={outlineText}
                      onChange={(e) => setOutlineText(e.target.value)}
                      disabled={!!gen}
                      className="w-full min-h-[120px] resize-y rounded-md border border-border bg-white px-2.5 py-1.5 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-accent"
                    />
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="accent" disabled={!!gen || !outlineText.trim()} onClick={generate}>
                        {gen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        이 개요로 본문 생성
                      </Button>
                      <Button size="sm" variant="outline" disabled={!!gen || outlining} onClick={makeOutline}>
                        {outlining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        개요 다시 생성
                      </Button>
                      <Button size="sm" variant="ghost" disabled={!!gen} onClick={() => pickTrack(null)}>
                        타입 다시 선택
                      </Button>
                      {gen && <span className="text-xs text-ink/50">본문 생성 중, 1–3분…</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
        active ? 'border-accent bg-accent text-white' : 'border-border bg-white text-ink/60 hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function SeedComposer({
  creating,
  onSubmit,
  onCancel,
}: {
  creating: boolean;
  onSubmit: (input: { title: string; raw_text: string; source_url: string; source_type: string; note: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [rawText, setRawText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceType, setSourceType] = useState('manual');
  const [note, setNote] = useState('');

  const canSubmit = title.trim().length > 0 && rawText.trim().length > 0 && !creating;
  const inputCls = 'w-full rounded-md border border-border bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent';

  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">수동 씨앗 추가</h3>
        <span className="text-[11px] text-ink/40">Slack 없이 직접 소식을 넣습니다{LOCAL_AI ? ' · 추가 후 자동 채점' : ''}</span>
      </div>
      <input className={inputCls} placeholder="제목 *" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className={cn(inputCls, 'min-h-[120px] resize-y')}
        placeholder="원문/내용 * — 소식 본문, 요점, 붙여넣은 글 등"
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input className={inputCls} placeholder="원문 URL (선택)" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        <select className={inputCls} value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
          {SOURCES.map((src) => (
            <option key={src.key} value={src.key}>
              {src.label}
            </option>
          ))}
        </select>
      </div>
      {/* 선택 소스의 수집 기준·품질 신호 안내 — 얇은 씨앗 방지 */}
      {(() => {
        const src = sourceProfile(sourceType);
        if (!src || (!src.criteria && !src.qualitySignal)) return null;
        return (
          <div className="rounded-md bg-amber-50 border border-amber-100 px-2.5 py-2 text-[11px] leading-snug text-amber-900/80 space-y-0.5">
            <p><span className="font-medium">이 소스 기준</span> · {src.criteria}</p>
            {src.qualitySignal && <p><span className="font-medium">양질 신호</span> · {src.qualitySignal}</p>}
          </div>
        );
      })()}
      <input className={inputCls} placeholder="기획 각도 메모 (선택) — 케이스 생성 시 프롬프트에 주입" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="accent"
          disabled={!canSubmit}
          onClick={() => onSubmit({ title, raw_text: rawText, source_url: sourceUrl, source_type: sourceType, note })}
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          추가
        </Button>
        <Button size="sm" variant="ghost" disabled={creating} onClick={onCancel}>
          취소
        </Button>
      </div>
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
  const [reanalyzing, setReanalyzing] = useState(false);

  const hide = async () => {
    setPending(true);
    // 숨김 = 반려 처리(버킷에서 빠짐)
    await supabase.from('content_seeds').update({ status: 'rejected' }).eq('id', seed.id);
    setPending(false);
    router.refresh();
  };

  // 이 씨앗 강제 재채점(essence·헤드라인 갱신). 로컬 전용.
  const reanalyze = async () => {
    setReanalyzing(true);
    try {
      await fetch('/api/seeds/score', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seedIds: [seed.id] }),
      });
      router.refresh();
    } finally {
      setReanalyzing(false);
    }
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
            {seed.bucket && bucketProfile(seed.bucket) && (
              <span className="rounded px-1.5 py-0.5 text-[11px] text-ink/50" title="AI 분류(추천)">
                {bucketProfile(seed.bucket)!.emoji} {bucketProfile(seed.bucket)!.label}
              </span>
            )}
            <span className="text-[11px] text-ink/40">{formatDate(seed.created_at)}</span>
          </div>
          <p className="text-sm font-medium leading-snug break-words">{seed.essence?.headline || seed.title}</p>
          {seed.score_reason && <p className="mt-0.5 text-[11px] text-ink/50 leading-snug">{seed.score_reason}</p>}
        </div>
        <button onClick={() => setOpen((v) => !v)} className="shrink-0 text-ink/40 hover:text-ink" aria-label="펼치기">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-2 pl-6">
          {essenceRows(seed.essence).length > 0 && (
            <dl className="rounded-md bg-muted/50 p-2 text-[11px] leading-snug">
              {essenceRows(seed.essence).map(([k, v]) => (
                <div key={k} className="flex gap-1.5">
                  <dt className="shrink-0 font-medium text-ink/50">{ESSENCE_LABELS[k]}</dt>
                  <dd className="text-ink/80">{v}</dd>
                </div>
              ))}
            </dl>
          )}
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
            <div className="flex items-center gap-1">
              {LOCAL_AI && (
                <Button size="sm" variant="ghost" disabled={reanalyzing} onClick={reanalyze}>
                  {reanalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} 재분석
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={pending} onClick={hide}>
                <X className="h-3.5 w-3.5" /> 숨김
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
