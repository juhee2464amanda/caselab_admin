'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Info, Megaphone } from 'lucide-react';

/**
 * /admin/insights — 인스타 콘텐츠 인사이트 (1차 목업, 대시보드 소메뉴)
 *
 * 아직 전부 목데이터. 실데이터 연계 시 MOCK_*만 IG Graph API 동기화
 * 테이블(instagram_posts / instagram_metrics_daily / instagram_ads)로 교체한다.
 *
 * 지표 기준 (헤더 안내문과 동일하게 유지):
 * - 도달 = 게시물을 본 "계정 수"(unique). 조회 = 재생·노출 "횟수"(반복 포함). 조회≥도달.
 *   조회/도달 배수가 1.5 이상이면 같은 사람이 여러 번 봤다는 뜻 — 소재의 붙잡는 힘.
 * - 참여율 = (좋아요+댓글+저장+공유+리포스트) / 도달. 참여는 사람의 행동이라 횟수(조회)가
 *   아닌 사람 수(도달) 기준이 표준. 조회 기준으로 나누면 반복 시청에 희석돼 왜곡된다.
 * - 전환율 = 사이트 도착(숏링크·utm 클릭) / 도달. 채널 목표가 사이트 유입이라 이게 최종 지표.
 * - 광고 지표는 오가닉과 절대 합산하지 않는다 — 행 펼침 서브행으로 분리 표기.
 */

type AdResult = {
  spend: number;
  budget: number;
  views: number;
  profileVisits: number;
  follows: number;
  linkClicks: number;
  endsAt: string;
};

type Post = {
  id: string;
  title: string;
  category: string;
  traits: { 훅: string; 형식: string; 템플릿: string; 커버: string };
  postedAt: string; // YYYY-MM-DD
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  reposts: number;
  siteClicks: number;
  ad?: AdResult;
};

const MOCK_POSTS: Post[] = [
  {
    id: 'p1',
    title: '앤트로픽 개발자가 공개한 fable 5 잘쓰는 11가지 프롬프트',
    category: 'AI 트렌드',
    traits: { 훅: '권위 훅', 형식: '숫자 리스트', 템플릿: 'B8 원문발췌', 커버: '다크 무디' },
    postedAt: '2026-08-24',
    views: 300,
    reach: 278,
    likes: 6,
    comments: 1,
    saves: 4,
    shares: 1,
    reposts: 0,
    siteClicks: 6,
    ad: { spend: 3062, budget: 5000, views: 300, profileVisits: 17, follows: 3, linkClicks: 1, endsAt: '11시간 후 종료' },
  },
  {
    id: 'p2',
    title: 'Fable 5로 게임 만들기 — 4년 묵힌 아이디어 메모장',
    category: '제작기',
    traits: { 훅: '스토리 훅', 형식: '실측 실험', 템플릿: 'P11 화이트매거진', 커버: '일러스트 커버' },
    postedAt: '2026-08-24',
    views: 70,
    reach: 64,
    likes: 0,
    comments: 3,
    saves: 1,
    shares: 0,
    reposts: 0,
    siteClicks: 3,
    ad: { spend: 552, budget: 5000, views: 70, profileVisits: 1, follows: 0, linkClicks: 0, endsAt: '22시간 후 종료' },
  },
  {
    id: 'p3',
    title: '맥이 잠들면 에이전트도 멈춘다 — Agents Never Sleep',
    category: '자료실',
    traits: { 훅: '아픔 훅', 형식: '도구 소개', 템플릿: 'B12', 커버: '다크 무디' },
    postedAt: '2026-08-24',
    views: 152,
    reach: 140,
    likes: 3,
    comments: 0,
    saves: 6,
    shares: 2,
    reposts: 0,
    siteClicks: 3,
  },
  {
    id: 'p4',
    title: 'Simon Willison이 Fable 5로 하루 만에 한 것들',
    category: '케이스',
    traits: { 훅: '권위 훅', 형식: '사례 요약', 템플릿: 'C6', 커버: '화이트 클린' },
    postedAt: '2026-08-25',
    views: 88,
    reach: 80,
    likes: 5,
    comments: 2,
    saves: 3,
    shares: 1,
    reposts: 1,
    siteClicks: 3,
  },
  {
    id: 'p5',
    title: 'Anthropic Academy 무료 수료증의 진짜 가치',
    category: '가이드',
    traits: { 훅: '타이밍 훅', 형식: '오해 교정', 템플릿: 'B15', 커버: '화이트 클린' },
    postedAt: '2026-08-25',
    views: 61,
    reach: 55,
    likes: 2,
    comments: 0,
    saves: 5,
    shares: 0,
    reposts: 0,
    siteClicks: 1,
  },
];

const TODAY = new Date('2026-08-26');

function daysSince(dateStr: string): number {
  return Math.max(1, Math.round((TODAY.getTime() - new Date(dateStr).getTime()) / 864e5));
}

function engagement(p: Post): number {
  return p.likes + p.comments + p.saves + p.shares + p.reposts;
}

/** 참여율 = 참여 합계 / 도달 (사람 수 기준) */
function engagementRate(p: Post): number {
  return p.reach > 0 ? engagement(p) / p.reach : 0;
}

/** 전환율 = 사이트 도착 / 도달 */
function conversionRate(p: Post): number {
  return p.reach > 0 ? p.siteClicks / p.reach : 0;
}

function viewsPerDay(p: Post): number {
  return p.views / daysSince(p.postedAt);
}

const COLUMNS = [
  { key: 'postedAt', label: '업로드', num: false, tip: '게시일과 경과일. 절대치 비교의 보정 기준.' },
  { key: 'reach', label: '도달', num: true, tip: '게시물을 본 계정 수 (중복 없음).' },
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
  { key: 'reposts', label: '리포스트', num: true },
  {
    key: 'engRate',
    label: '참여율',
    num: true,
    tip: '(좋아요+댓글+저장+공유+리포스트) ÷ 도달. 참여는 사람의 행동이라 횟수(조회)가 아닌 사람 수(도달) 기준. 광고로 도달이 부풀면 낮아지는 점 주의. "콘텐츠가 좋았나"의 지표.',
  },
  {
    key: 'convRate',
    label: '사이트 전환율',
    num: true,
    tip: '사이트 도착(숏링크 클릭+utm pageview) ÷ 도달. 채널 목표인 사이트 유입 기준 — "장사가 됐나"의 지표. DM 경유분만 utm이 붙어 약간 과소 집계될 수 있음.',
  },
  { key: 'viewsPerDay', label: '조회/일', num: true, tip: '조회 ÷ 경과일. 오래된 게시물과 새 게시물을 공정하게 비교.' },
] as const;

type SortKey = (typeof COLUMNS)[number]['key'];

function sortValue(p: Post, key: SortKey): number | string {
  switch (key) {
    case 'viewRatio':
      return p.reach > 0 ? p.views / p.reach : 0;
    case 'engRate':
      return engagementRate(p);
    case 'convRate':
      return conversionRate(p);
    case 'viewsPerDay':
      return viewsPerDay(p);
    case 'postedAt':
      return p.postedAt;
    default:
      return p[key];
  }
}

const nf = new Intl.NumberFormat('ko-KR');

export default function InsightsMockup() {
  const [sortKey, setSortKey] = useState<SortKey>('viewsPerDay');
  const [sortDesc, setSortDesc] = useState(true);
  const [openAd, setOpenAd] = useState<string | null>('p1');

  const posts = useMemo(() => {
    const arr = [...MOCK_POSTS];
    arr.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sortDesc ? -cmp : cmp;
    });
    return arr;
  }, [sortKey, sortDesc]);

  const totals = useMemo(() => {
    const sum = (f: (p: Post) => number) => MOCK_POSTS.reduce((s, p) => s + f(p), 0);
    const reach = sum((p) => p.reach);
    const views = sum((p) => p.views);
    const eng = sum(engagement);
    const factors = [
      { label: '좋아요', value: sum((p) => p.likes) },
      { label: '댓글', value: sum((p) => p.comments) },
      { label: '저장', value: sum((p) => p.saves) },
      { label: '공유', value: sum((p) => p.shares) },
      { label: '리포스트', value: sum((p) => p.reposts) },
    ];
    const follows = sum((p) => p.ad?.follows ?? 0);
    const spend = sum((p) => p.ad?.spend ?? 0);
    const visits = sum((p) => p.ad?.profileVisits ?? 0);
    const adCount = MOCK_POSTS.filter((p) => p.ad).length;
    return { reach, views, eng, factors, follows, spend, visits, adCount };
  }, []);

  // 타입(분류·훅·형식·템플릿·커버)별로 묶은 태그 평균 참여율.
  // 1건짜리는 개별 게시물과 같아 비교 근거가 약하다 — 표시는 하되 흐리게(표본 부족).
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
    for (const p of MOCK_POSTS) {
      const rate = engagementRate(p);
      add('분류', p.category, rate);
      for (const [type, tag] of Object.entries(p.traits)) add(type, tag, rate);
    }
    return ['분류', '훅', '형식', '템플릿', '커버'].map((type) => {
      const tags = [...(groups.get(type) ?? new Map()).entries()]
        .map(([tag, { sum, n }]: [string, { sum: number; n: number }]) => ({ tag, avg: sum / n, n }))
        .sort((a, b) => b.avg - a.avg);
      return { type, tags, max: tags[0]?.avg ?? 1 };
    });
  }, []);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-4">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">콘텐츠 인사이트</h1>
        <p className="text-sm text-ink/60 mt-1">
          인스타 게시물별 도달·참여·광고 성과를 한눈에 봅니다. <span className="text-amber-600 font-medium">현재 목업 — 전부 예시 데이터입니다.</span>
        </p>
      </header>

      {/* 지표 기준 안내 */}
      <div className="flex items-start gap-2 text-xs text-ink/55 bg-muted/60 rounded-lg px-3 py-2.5 mb-6 leading-relaxed">
        <Info size={13} className="shrink-0 mt-0.5 text-ink/40" />
        <div>
          <span className="font-medium text-ink/70">도달</span>=본 계정 수(중복 없음) ·{' '}
          <span className="font-medium text-ink/70">조회</span>=재생·노출 횟수(반복 포함). 조회÷도달이 클수록 같은 사람이
          여러 번 본 소재. <span className="font-medium text-ink/70">참여율</span>=참여 합계÷도달 — 참여는 사람의 행동이라
          횟수(조회)가 아닌 사람 수(도달) 기준. <span className="font-medium text-ink/70">사이트 전환율</span>=사이트 도착÷도달.
        </div>
      </div>

      {/* 요약 — 콘텐츠(오가닉)와 광고를 분리 */}
      <div className="grid lg:grid-cols-[3fr_2fr] gap-4 mb-6">
        {/* 콘텐츠 성과 */}
        <section className="card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-3">콘텐츠 성과 (오가닉)</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="도달" value={nf.format(totals.reach)} />
            <Stat label="조회" value={nf.format(totals.views)} sub={`도달의 ${(totals.views / totals.reach).toFixed(2)}배`} />
            <Stat
              label="참여 · 참여율"
              value={`${nf.format(totals.eng)} · ${((totals.eng / totals.reach) * 100).toFixed(1)}%`}
              sub="참여 합계 ÷ 도달"
            />
          </div>
          {/* 참여 팩터별 합계 */}
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

        {/* 광고 성과 */}
        <section className="card p-4 border-amber-200 bg-amber-50/30">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-700/70 mb-3 flex items-center gap-1">
            <Megaphone size={12} />
            광고 성과 (진행 중 {totals.adCount}건 합산)
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="지출" value={`₩${nf.format(totals.spend)}`} sub="집행 중 — 최종 아님" />
            <Stat label="프로필 방문" value={nf.format(totals.visits)} sub="방문당 비용은 광고별로" />
            <Stat label="팔로우" value={`+${totals.follows}`} />
          </div>
        </section>
      </div>

      {/* 메인 테이블 */}
      <div className="card overflow-x-auto mb-6">
        <table className="w-full min-w-[960px] text-sm">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {posts.map((p) => {
              const adOpen = openAd === p.id && !!p.ad;
              return (
                <PostRows key={p.id} post={p} adOpen={adOpen} onToggleAd={() => setOpenAd(adOpen ? null : p.id)} />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 특성별 평균 참여율 */}
      <div className="card p-4 sm:p-6">
        <h2 className="font-serif text-base font-semibold mb-1">특성별 평균 참여율</h2>
        <p className="text-xs text-ink/50 mb-4">
          같은 특성이 붙은 게시물들의 참여율 평균을 타입별로 비교 — "다음 콘텐츠를 어떤 분류·훅·형식·템플릿·커버로 만들까"의
          근거. 1건짜리는 흐리게(표본 부족) 표시합니다.
        </p>
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
      </div>
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

function PostRows({ post: p, adOpen, onToggleAd }: { post: Post; adOpen: boolean; onToggleAd: () => void }) {
  return (
    <>
      <tr className="hover:bg-muted/30">
        <td className="px-4 py-3">
          <div className="min-w-[260px] max-w-[340px]">
            <div className="font-medium leading-snug line-clamp-1">{p.title}</div>
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[11px] font-medium whitespace-nowrap">
                {p.category}
              </span>
              {Object.values(p.traits).map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded bg-muted text-ink/55 text-[11px] whitespace-nowrap">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </td>
        <td className="px-3 py-3 text-xs text-ink/60 whitespace-nowrap">
          {p.postedAt.slice(5).replace('-', '/')}
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
        <Num v={p.reposts} />
        <td className="px-3 py-3 text-right tabular-nums font-medium">{(engagementRate(p) * 100).toFixed(1)}%</td>
        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
          <span className="font-medium">{(conversionRate(p) * 100).toFixed(1)}%</span>
          <span className="text-ink/40 text-xs"> ({p.siteClicks})</span>
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
      </tr>
      {adOpen && p.ad && (
        <tr className="bg-amber-50/60">
          <td colSpan={13} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs pl-8">
              <span className="font-medium text-amber-700">광고 성과 ({p.ad.endsAt})</span>
              <AdStat label="지출" value={`₩${nf.format(p.ad.spend)} / ₩${nf.format(p.ad.budget)}`} />
              <AdStat label="조회" value={nf.format(p.ad.views)} />
              <AdStat label="프로필 방문" value={String(p.ad.profileVisits)} />
              <AdStat
                label="방문당 비용"
                value={p.ad.profileVisits > 0 ? `₩${nf.format(Math.round(p.ad.spend / p.ad.profileVisits))}` : '—'}
              />
              <AdStat label="팔로우" value={`+${p.ad.follows}`} />
              <AdStat label="외부 링크" value={String(p.ad.linkClicks)} />
            </div>
          </td>
        </tr>
      )}
    </>
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
