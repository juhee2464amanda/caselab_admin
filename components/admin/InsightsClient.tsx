'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Info, Megaphone, Pencil, RefreshCw } from 'lucide-react';

/**
 * /admin/insights 클라이언트 — 정렬 테이블·동기화·태깅/광고 편집.
 * 지표 기준(합의 확정): 참여율=(좋아요+댓글+저장+공유)÷도달, 사이트 전환율=사이트 도착÷도달.
 * 리포스트는 IG API 미제공이라 컬럼 없음(공유=shares). 광고는 오가닉과 합산 금지.
 */

export type AdRow = {
  id: string;
  ig_media_id: string;
  status: string;
  spend: number;
  budget: number;
  views: number;
  profile_visits: number;
  follows: number;
  link_clicks: number;
  started_on: string | null;
  ended_on: string | null;
  memo: string | null;
};

export type InsightPost = {
  igMediaId: string;
  title: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: string;
  category: string | null;
  traits: Record<string, string> | null;
  utmCode: string | null;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  siteClicks: number | null; // utm_code 미지정이면 null(집계 불가)
  ad: AdRow | null;
  capturedOn: string | null;
};

const TRAIT_TYPES = ['훅', '형식', '템플릿', '커버'] as const;

function daysSince(dateStr: string): number {
  return Math.max(1, Math.round((Date.now() - new Date(dateStr).getTime()) / 864e5));
}

function engagement(p: InsightPost): number {
  return p.likes + p.comments + p.saves + p.shares;
}

function engagementRate(p: InsightPost): number {
  return p.reach > 0 ? engagement(p) / p.reach : 0;
}

function conversionRate(p: InsightPost): number | null {
  return p.siteClicks === null ? null : p.reach > 0 ? p.siteClicks / p.reach : 0;
}

function viewsPerDay(p: InsightPost): number {
  return p.views / daysSince(p.postedAt);
}

const COLUMNS = [
  { key: 'postedAt', label: '업로드', num: false, tip: '게시일과 경과일. 절대치 비교의 보정 기준.' },
  { key: 'reach', label: '도달', num: true, tip: '게시물을 본 계정 수 (중복 없음). 오가닉만 — 광고 도달은 별도.' },
  { key: 'views', label: '조회', num: true, tip: '재생·노출 횟수 (같은 사람의 반복 시청 포함).' },
  {
    key: 'viewRatio',
    label: '조회/도달',
    num: true,
    tip: '조회 ÷ 도달. 1보다 클수록 같은 사람이 여러 번 본 소재 — 붙잡는 힘.',
  },
  { key: 'likes', label: '좋아요', num: true },
  { key: 'comments', label: '댓글', num: true },
  { key: 'saves', label: '저장', num: true },
  { key: 'shares', label: '공유', num: true },
  {
    key: 'engRate',
    label: '참여율',
    num: true,
    tip: '(좋아요+댓글+저장+공유) ÷ 도달. 참여는 사람의 행동이라 횟수(조회)가 아닌 사람 수(도달) 기준. "콘텐츠가 좋았나"의 지표.',
  },
  {
    key: 'convRate',
    label: '사이트 전환율',
    num: true,
    tip: '사이트 도착(utm_code 숏링크 인간 클릭) ÷ 도달. 채널 목표인 사이트 유입 기준 — "장사가 됐나"의 지표. utm_code 태깅이 없으면 — 표시.',
  },
  { key: 'viewsPerDay', label: '조회/일', num: true, tip: '조회 ÷ 경과일. 오래된 게시물과 새 게시물을 공정하게 비교.' },
] as const;

type SortKey = (typeof COLUMNS)[number]['key'];

function sortValue(p: InsightPost, key: SortKey): number | string {
  switch (key) {
    case 'viewRatio':
      return p.reach > 0 ? p.views / p.reach : 0;
    case 'engRate':
      return engagementRate(p);
    case 'convRate':
      return conversionRate(p) ?? -1;
    case 'viewsPerDay':
      return viewsPerDay(p);
    case 'postedAt':
      return p.postedAt;
    default:
      return p[key];
  }
}

const nf = new Intl.NumberFormat('ko-KR');

export function InsightsClient({ posts: input }: { posts: InsightPost[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('viewsPerDay');
  const [sortDesc, setSortDesc] = useState(true);
  const [openRow, setOpenRow] = useState<string | null>(null); // 광고 서브행
  const [editRow, setEditRow] = useState<string | null>(null); // 태깅/광고 편집
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const posts = useMemo(() => {
    const arr = [...input];
    arr.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sortDesc ? -cmp : cmp;
    });
    return arr;
  }, [input, sortKey, sortDesc]);

  const totals = useMemo(() => {
    const sum = (f: (p: InsightPost) => number) => input.reduce((s, p) => s + f(p), 0);
    const reach = sum((p) => p.reach);
    const views = sum((p) => p.views);
    const eng = sum(engagement);
    const factors = [
      { label: '좋아요', value: sum((p) => p.likes) },
      { label: '댓글', value: sum((p) => p.comments) },
      { label: '저장', value: sum((p) => p.saves) },
      { label: '공유', value: sum((p) => p.shares) },
    ];
    const follows = sum((p) => p.ad?.follows ?? 0);
    const spend = sum((p) => p.ad?.spend ?? 0);
    const visits = sum((p) => p.ad?.profile_visits ?? 0);
    const adCount = input.filter((p) => p.ad).length;
    return { reach, views, eng, factors, follows, spend, visits, adCount };
  }, [input]);

  const traitGroups = useMemo(() => {
    const groups = new Map<string, Map<string, { sum: number; n: number }>>();
    const add = (type: string, tag: string, rate: number) => {
      const g = groups.get(type) ?? new Map();
      const cur = g.get(tag) ?? { sum: 0, n: 0 };
      cur.sum += rate;
      cur.n += 1;
      g.set(tag, cur);
      groups.set(type, g);
    };
    for (const p of input) {
      const rate = engagementRate(p);
      if (p.category) add('분류', p.category, rate);
      for (const [type, tag] of Object.entries(p.traits ?? {})) if (tag) add(type, tag, rate);
    }
    return ['분류', ...TRAIT_TYPES]
      .map((type) => {
        const tags = [...(groups.get(type) ?? new Map()).entries()]
          .map(([tag, { sum, n }]: [string, { sum: number; n: number }]) => ({ tag, avg: sum / n, n }))
          .sort((a, b) => b.avg - a.avg);
        return { type, tags, max: tags[0]?.avg ?? 1 };
      })
      .filter((g) => g.tags.length > 0);
  }, [input]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const onSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/instagram/insights-sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? String(res.status));
      setSyncMsg(`${data.synced}건 동기화${data.errors?.length ? ` · 실패 ${data.errors.length}` : ''}`);
      router.refresh();
    } catch (e) {
      setSyncMsg(`실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const captured = input.find((p) => p.capturedOn)?.capturedOn;

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl sm:text-2xl font-semibold">콘텐츠 인사이트</h1>
          <p className="text-sm text-ink/60 mt-1">
            인스타 게시물별 도달·참여·광고 성과.
            {captured && <span className="text-ink/40"> 마지막 스냅샷 {captured}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {syncMsg && <span className="text-xs text-ink/50">{syncMsg}</span>}
          <button
            onClick={onSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? '동기화 중…' : '동기화'}
          </button>
        </div>
      </header>

      <div className="flex items-start gap-2 text-xs text-ink/55 bg-muted/60 rounded-lg px-3 py-2.5 mb-6 leading-relaxed">
        <Info size={13} className="shrink-0 mt-0.5 text-ink/40" />
        <div>
          <span className="font-medium text-ink/70">도달</span>=본 계정 수(중복 없음) ·{' '}
          <span className="font-medium text-ink/70">조회</span>=재생·노출 횟수(반복 포함).{' '}
          <span className="font-medium text-ink/70">참여율</span>=참여 합계÷도달 —{' '}
          <span className="font-medium text-ink/70">사이트 전환율</span>=사이트 도착÷도달. 광고 성과는 오가닉과 분리.
          컬럼명에 마우스를 올리면 상세 기준이 보여요.
        </div>
      </div>

      {input.length === 0 ? (
        <div className="card p-10 text-center text-sm text-ink/50">
          아직 데이터가 없어요. 우측 상단 <b>동기화</b>를 누르면 인스타 게시물과 지표를 가져옵니다.
          <br />
          <span className="text-xs text-ink/40">
            (테이블 미생성이면 supabase/migrations/1033_instagram_insights.sql을 먼저 실행하세요)
          </span>
        </div>
      ) : (
        <>
          {/* 요약 — 콘텐츠(오가닉)와 광고 분리 */}
          <div className="grid lg:grid-cols-[3fr_2fr] gap-4 mb-6">
            <section className="card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-3">콘텐츠 성과 (오가닉)</h2>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Stat label="도달" value={nf.format(totals.reach)} />
                <Stat
                  label="조회"
                  value={nf.format(totals.views)}
                  sub={totals.reach > 0 ? `도달의 ${(totals.views / totals.reach).toFixed(2)}배` : undefined}
                />
                <Stat
                  label="참여 · 참여율"
                  value={`${nf.format(totals.eng)} · ${totals.reach > 0 ? ((totals.eng / totals.reach) * 100).toFixed(1) : 0}%`}
                  sub="참여 합계 ÷ 도달"
                />
              </div>
              <div className="border-t border-border pt-3">
                <div className="text-[11px] text-ink/40 mb-2">참여 상세</div>
                <div className="flex items-end gap-4">
                  {totals.factors.map((f) => (
                    <div key={f.label} className="flex-1 min-w-0">
                      <div className="text-base font-semibold tabular-nums">{nf.format(f.value)}</div>
                      <div className="h-1.5 bg-muted rounded my-1 overflow-hidden">
                        <div
                          className="h-full bg-accent/60 rounded"
                          style={{ width: `${totals.eng > 0 ? (f.value / totals.eng) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-ink/50 truncate">
                        {f.label}
                        <span className="text-ink/35"> {totals.eng > 0 ? Math.round((f.value / totals.eng) * 100) : 0}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="card p-4 border-amber-200 bg-amber-50/30">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-700/70 mb-3 flex items-center gap-1">
                <Megaphone size={12} />
                광고 성과 ({totals.adCount}건 합산 · 수기 기록)
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="지출" value={`₩${nf.format(totals.spend)}`} />
                <Stat label="프로필 방문" value={nf.format(totals.visits)} sub="방문당 비용은 광고별로" />
                <Stat label="팔로우" value={`+${totals.follows}`} />
              </div>
            </section>
          </div>

          {/* 메인 테이블 */}
          <div className="card overflow-x-auto mb-6">
            <table className="w-full min-w-[1020px] text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
                <tr>
                  <th className="px-4 py-3">콘텐츠</th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className={`group relative px-3 py-3 whitespace-nowrap cursor-pointer select-none hover:text-ink ${c.num ? 'text-right' : ''}`}
                      onClick={() => onSort(c.key)}
                    >
                      <span className={'tip' in c && c.tip ? 'underline decoration-dotted decoration-ink/30 underline-offset-2' : ''}>
                        {c.label}
                      </span>
                      {sortKey === c.key && (sortDesc ? ' ↓' : ' ↑')}
                      {'tip' in c && c.tip && (
                        <div className="hidden group-hover:block absolute right-0 top-full z-20 mt-1 w-60 whitespace-normal normal-case tracking-normal rounded-lg bg-ink text-white/90 text-[11px] font-normal leading-relaxed px-3 py-2 shadow-lg text-left">
                          {c.tip}
                        </div>
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center">광고</th>
                  <th className="px-3 py-3 text-center">편집</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {posts.map((p) => (
                  <PostRows
                    key={p.igMediaId}
                    post={p}
                    adOpen={openRow === p.igMediaId && !!p.ad}
                    onToggleAd={() => setOpenRow(openRow === p.igMediaId ? null : p.igMediaId)}
                    editOpen={editRow === p.igMediaId}
                    onToggleEdit={() => setEditRow(editRow === p.igMediaId ? null : p.igMediaId)}
                    onSaved={() => {
                      setEditRow(null);
                      router.refresh();
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* 특성별 평균 참여율 */}
          <div className="card p-4 sm:p-6">
            <h2 className="font-serif text-base font-semibold mb-1">특성별 평균 참여율</h2>
            <p className="text-xs text-ink/50 mb-4">
              같은 특성이 붙은 게시물들의 참여율 평균을 타입별로 비교 — "다음 콘텐츠를 어떤 분류·훅·형식·템플릿·커버로
              만들까"의 근거. 1건짜리는 흐리게(표본 부족). 태깅은 각 행의 [편집]에서.
            </p>
            {traitGroups.length === 0 ? (
              <p className="text-sm text-ink/40 py-4 text-center">아직 태깅된 게시물이 없어요. 행의 [편집]에서 분류·특성을 붙여주세요.</p>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-5">
                {traitGroups.map(({ type, tags, max }) => (
                  <div key={type}>
                    <div className="text-xs font-semibold text-ink/60 border-b border-border pb-1 mb-2">{type}</div>
                    <div className="space-y-1.5">
                      {tags.map(({ tag, avg, n }) => (
                        <div key={tag} className={`flex items-center gap-2 ${n < 2 ? 'opacity-40' : ''}`}>
                          <span className="w-28 shrink-0 text-xs text-ink/70 truncate">{tag}</span>
                          <div className="flex-1 h-3.5 bg-muted rounded overflow-hidden">
                            <div className="h-full bg-accent/70 rounded" style={{ width: `${(avg / max) * 100}%` }} />
                          </div>
                          <span className="w-[4.5rem] shrink-0 text-right text-[11px] tabular-nums text-ink/70">
                            {(avg * 100).toFixed(1)}% <span className="text-ink/40">({n})</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-ink/50">{label}</div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-ink/40 mt-0.5">{sub}</div>}
    </div>
  );
}

function PostRows({
  post: p,
  adOpen,
  onToggleAd,
  editOpen,
  onToggleEdit,
  onSaved,
}: {
  post: InsightPost;
  adOpen: boolean;
  onToggleAd: () => void;
  editOpen: boolean;
  onToggleEdit: () => void;
  onSaved: () => void;
}) {
  const conv = conversionRate(p);
  const colCount = COLUMNS.length + 3;
  return (
    <>
      <tr className="hover:bg-muted/30">
        <td className="px-4 py-3">
          <div className="min-w-[240px] max-w-[320px]">
            <a
              href={p.permalink ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium leading-snug line-clamp-1 hover:text-accent"
            >
              {p.title}
            </a>
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              {p.category ? (
                <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[11px] font-medium whitespace-nowrap">
                  {p.category}
                </span>
              ) : (
                <span className="text-[11px] text-ink/30">태깅 없음</span>
              )}
              {Object.values(p.traits ?? {})
                .filter(Boolean)
                .map((t) => (
                  <span key={t} className="px-1.5 py-0.5 rounded bg-muted text-ink/55 text-[11px] whitespace-nowrap">
                    {t}
                  </span>
                ))}
            </div>
          </div>
        </td>
        <td className="px-3 py-3 text-xs text-ink/60 whitespace-nowrap">
          {p.postedAt.slice(5, 10).replace('-', '/')}
          <span className="text-ink/40"> · {daysSince(p.postedAt)}일</span>
        </td>
        <Num v={p.reach} strong />
        <Num v={p.views} />
        <td className="px-3 py-3 text-right tabular-nums text-ink/70">
          {p.reach > 0 ? `${(p.views / p.reach).toFixed(2)}배` : '—'}
        </td>
        <Num v={p.likes} />
        <Num v={p.comments} />
        <Num v={p.saves} />
        <Num v={p.shares} />
        <td className="px-3 py-3 text-right tabular-nums font-medium">{(engagementRate(p) * 100).toFixed(1)}%</td>
        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
          {conv === null ? (
            <span className="text-ink/30" title="utm_code 태깅 후 집계">
              —
            </span>
          ) : (
            <>
              <span className="font-medium">{(conv * 100).toFixed(1)}%</span>
              <span className="text-ink/40 text-xs"> ({p.siteClicks})</span>
            </>
          )}
        </td>
        <td className="px-3 py-3 text-right tabular-nums font-medium">{viewsPerDay(p).toFixed(0)}</td>
        <td className="px-3 py-3 text-center">
          {p.ad ? (
            <button
              onClick={onToggleAd}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium hover:bg-amber-200 whitespace-nowrap"
            >
              <Megaphone size={11} />
              광고
              {adOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          ) : (
            <span className="text-ink/25 text-xs">—</span>
          )}
        </td>
        <td className="px-3 py-3 text-center">
          <button onClick={onToggleEdit} className="p-1.5 rounded hover:bg-muted text-ink/40 hover:text-ink" title="태깅·광고 입력">
            <Pencil size={13} />
          </button>
        </td>
      </tr>
      {adOpen && p.ad && (
        <tr className="bg-amber-50/60">
          <td colSpan={colCount} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs pl-4">
              <span className="font-medium text-amber-700">
                광고 성과 ({p.ad.status === 'ended' ? '종료' : '진행 중'}
                {p.ad.ended_on ? ` · ~${p.ad.ended_on}` : ''})
              </span>
              <AdStat label="지출" value={`₩${nf.format(p.ad.spend)}${p.ad.budget ? ` / ₩${nf.format(p.ad.budget)}` : ''}`} />
              <AdStat label="조회" value={nf.format(p.ad.views)} />
              <AdStat label="프로필 방문" value={String(p.ad.profile_visits)} />
              <AdStat
                label="방문당 비용"
                value={p.ad.profile_visits > 0 ? `₩${nf.format(Math.round(p.ad.spend / p.ad.profile_visits))}` : '—'}
              />
              <AdStat label="팔로우" value={`+${p.ad.follows}`} />
              <AdStat label="외부 링크" value={String(p.ad.link_clicks)} />
            </div>
          </td>
        </tr>
      )}
      {editOpen && (
        <tr className="bg-muted/40">
          <td colSpan={colCount} className="px-4 py-4">
            <RowEditor post={p} onSaved={onSaved} />
          </td>
        </tr>
      )}
    </>
  );
}

/** 태깅(분류·특성·utm_code) + 광고 수기 입력 폼 — 한 번의 저장으로 둘 다 upsert */
function RowEditor({ post: p, onSaved }: { post: InsightPost; onSaved: () => void }) {
  const [category, setCategory] = useState(p.category ?? '');
  const [traits, setTraits] = useState<Record<string, string>>({
    훅: p.traits?.['훅'] ?? '',
    형식: p.traits?.['형식'] ?? '',
    템플릿: p.traits?.['템플릿'] ?? '',
    커버: p.traits?.['커버'] ?? '',
  });
  const [utmCode, setUtmCode] = useState(p.utmCode ?? '');
  const [hasAd, setHasAd] = useState(!!p.ad);
  const [ad, setAd] = useState({
    status: p.ad?.status ?? 'running',
    spend: p.ad?.spend ?? 0,
    budget: p.ad?.budget ?? 0,
    views: p.ad?.views ?? 0,
    profile_visits: p.ad?.profile_visits ?? 0,
    follows: p.ad?.follows ?? 0,
    link_clicks: p.ad?.link_clicks ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const cleanTraits = Object.fromEntries(Object.entries(traits).filter(([, v]) => v.trim()));
      const res = await fetch('/api/instagram/insights-meta', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ig_media_id: p.igMediaId,
          meta: { category: category.trim(), traits: cleanTraits, utm_code: utmCode.trim() },
          ...(hasAd ? { ad } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? String(res.status));
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const input = 'px-2 py-1.5 rounded border border-border bg-white text-sm w-full';
  return (
    <div className="space-y-3 max-w-3xl">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Field label="분류">
          <input className={input} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="AI 트렌드" />
        </Field>
        {TRAIT_TYPES.map((t) => (
          <Field key={t} label={t}>
            <input className={input} value={traits[t]} onChange={(e) => setTraits({ ...traits, [t]: e.target.value })} />
          </Field>
        ))}
        <Field label="utm_code">
          <input className={input} value={utmCode} onChange={(e) => setUtmCode(e.target.value)} placeholder="prompt11" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-ink/60">
        <input type="checkbox" checked={hasAd} onChange={(e) => setHasAd(e.target.checked)} />
        광고 성과 기록 (프로페셔널 대시보드 값을 수기 입력)
      </label>
      {hasAd && (
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          <Field label="상태">
            <select className={input} value={ad.status} onChange={(e) => setAd({ ...ad, status: e.target.value })}>
              <option value="running">진행 중</option>
              <option value="ended">종료</option>
            </select>
          </Field>
          {(
            [
              ['spend', '지출 ₩'],
              ['budget', '예산 ₩'],
              ['views', '조회'],
              ['profile_visits', '프로필 방문'],
              ['follows', '팔로우'],
              ['link_clicks', '외부 링크'],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                type="number"
                className={input}
                value={ad[k]}
                onChange={(e) => setAd({ ...ad, [k]: Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        {err && <span className="text-xs text-red-500">{err}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-ink/45 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Num({ v, strong }: { v: number; strong?: boolean }) {
  return (
    <td className={`px-3 py-3 text-right tabular-nums ${strong ? 'font-medium' : 'text-ink/70'}`}>{nf.format(v)}</td>
  );
}

function AdStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-ink/70">
      <span className="text-ink/40">{label}</span> <span className="font-medium tabular-nums">{value}</span>
    </span>
  );
}
