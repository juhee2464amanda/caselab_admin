import Link from 'next/link';
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from '@/lib/supabase/server';

/**
 * /admin 대시보드 — D61 7위젯 (2026-06-07)
 *
 * 1 북극성(+일별 추이 스파크라인) · 2 KPI 5종 · 3 메인 퍼널 · 4 가드레일 5종
 * 5 잘 되는 콘텐츠 Top 5 · 6 최근 변경(audit_logs) · 7 직무·페르소나 분포
 *
 * 데이터 소스 (0002/0001):
 *   get_north_star() · weekly_kpi · get_daily_trend(days) · admin_notifications
 *   content_stats · audit_logs · profiles
 */
export const dynamic = 'force-dynamic';

type NorthStar = { weekly_uv: number; prev_uv: number; delta_pct: number };
type WeeklyKpi = {
  prompt_copy_uv_7d: number;
  uv_7d: number;
  uv_prev_7d: number;
  pv_7d: number;
  prompt_copy_count_7d: number;
  save_count_7d: number;
  react_count_7d: number;
  total_users: number;
  new_users_7d: number;
  new_users_prev_7d: number;
};
type DailyTrend = { day: string; pv: number; saves: number };
type AdminNotifications = { purchases_failed: number };
type ContentStat = {
  content_id: string;
  title: string;
  track: string;
  view_count: number;
  save_count: number;
  like_count: number;
};
type Audit = { id: string; actor_type: string; action_type: string; entity_type: string; created_at: string };
type ProfileRow = { job: string | null; persona: string | null };

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('ko-KR');
}
function pct(n: number, d: number): string {
  if (!d) return '—';
  return `${((n / d) * 100).toFixed(1)}%`;
}
function deltaPct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

const ENTITY_LABEL: Record<string, string> = {
  content: '콘텐츠', tool: '자료실', comment: '댓글', opinion: '의견', profile: '프로필',
  category: '카테고리', tag: '태그', topic_suggestion: '후보 카드', featured_content: '큐레이션',
  purchase: '구매', faq: 'FAQ', support_ticket: '문의', newsletter_campaign: '뉴스레터',
};
const ACTION_VERB: Record<string, string> = { create: '생성', update: '수정', delete: '삭제' };

export default async function AdminDashboard() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();

  const [nsRes, kpiRes, trendRes, notiRes, topRes, auditRes, profRes, deepRes] = await Promise.all([
    supabase.rpc('get_north_star').single<NorthStar>(),
    supabase.from('weekly_kpi').select('*').single<WeeklyKpi>(),
    supabase.rpc('get_daily_trend', { days: 28 }),
    supabase.from('admin_notifications').select('purchases_failed').single<AdminNotifications>(),
    supabase.from('content_stats').select('content_id, title, track, view_count, save_count, like_count').order('view_count', { ascending: false }).limit(5),
    supabase.from('audit_logs').select('id, actor_type, action_type, entity_type, created_at').order('created_at', { ascending: false }).limit(6),
    supabase.from('profiles').select('job, persona'),
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('event_type', 'deep_read').gt('created_at', since7),
  ]);

  const ns = nsRes.data;
  const kpi = kpiRes.data;
  const trend = (trendRes.data ?? []) as DailyTrend[];
  const noti = notiRes.data;
  const top = (topRes.data ?? []) as ContentStat[];
  const audits = (auditRes.data ?? []) as Audit[];
  const profiles = (profRes.data ?? []) as ProfileRow[];
  const deepRead = deepRes.count ?? 0;

  // 퍼널 단계
  const funnel = [
    { label: '방문 (UV)', value: kpi?.uv_7d ?? 0 },
    { label: '조회 (PV)', value: kpi?.pv_7d ?? 0 },
    { label: '정독', value: deepRead },
    { label: '프롬프트 복사', value: kpi?.prompt_copy_count_7d ?? 0 },
    { label: '저장', value: kpi?.save_count_7d ?? 0 },
  ];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  // KPI 델타
  const uvDelta = kpi ? deltaPct(kpi.uv_7d, kpi.uv_prev_7d) : null;
  const newUserDelta = kpi ? deltaPct(kpi.new_users_7d, kpi.new_users_prev_7d) : null;

  // 직무·페르소나 분포
  const jobDist = new Map<string, number>();
  const personaDist = new Map<string, number>();
  for (const p of profiles) {
    const j = p.job ?? '미입력';
    jobDist.set(j, (jobDist.get(j) ?? 0) + 1);
    const ps = p.persona ?? '미분류';
    personaDist.set(ps, (personaDist.get(ps) ?? 0) + 1);
  }
  const jobRows = [...jobDist.entries()].sort((a, b) => b[1] - a[1]);
  const personaRows = [...personaDist.entries()].sort((a, b) => b[1] - a[1]);

  const sparkData = trend.map((t) => t.pv);

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header>
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold">대시보드</h1>
        <p className="text-sm text-ink/60 mt-1">이번 주 운영 현황 한 눈에. 북극성·KPI·퍼널·콘텐츠·운영 변경.</p>
      </header>

      {/* 위젯 1 — 북극성 + 일별 추이 */}
      <section className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink/50">북극성 — 주간 프롬프트 활용 유저</div>
            <div className="mt-2 font-serif text-4xl sm:text-5xl font-bold text-accent tabular-nums">{fmt(ns?.weekly_uv)}</div>
            <div className="mt-1 text-xs text-ink/60">
              지난 주 {fmt(ns?.prev_uv)} ·{' '}
              {ns && ns.delta_pct !== 0 ? (
                <span className={ns.delta_pct > 0 ? 'text-green-600' : 'text-red-600'}>
                  {ns.delta_pct > 0 ? '▲' : '▼'} {Math.abs(ns.delta_pct).toFixed(1)}%
                </span>
              ) : (
                <span className="text-ink/40">변동 없음</span>
              )}
            </div>
          </div>
          <div className="min-w-0 sm:w-1/2">
            <div className="text-[11px] text-ink/40 mb-1">일별 방문(PV) 추이 — 최근 28일</div>
            <Sparkline data={sparkData} />
          </div>
        </div>
      </section>

      {/* 위젯 2 — KPI 5종 */}
      <section>
        <h2 className="font-serif text-base font-semibold mb-3">KPI 5종 (주간)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Kpi label="방문자 UV" value={fmt(kpi?.uv_7d)} delta={uvDelta} />
          <Kpi label="신규 가입" value={fmt(kpi?.new_users_7d)} delta={newUserDelta} />
          <Kpi label="프롬프트 복사 UV" value={fmt(kpi?.prompt_copy_uv_7d)} delta={ns?.delta_pct ?? null} accent />
          <Kpi label="저장률" value={kpi ? pct(kpi.save_count_7d, kpi.pv_7d) : '—'} hint="save / PV" />
          <Kpi label="도움률" value={kpi ? pct(kpi.react_count_7d, kpi.pv_7d) : '—'} hint="react / PV" />
        </div>
      </section>

      {/* 2-column: 퍼널+가드레일 / Top5+최근변경 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 위젯 3 — 메인 퍼널 */}
        <section className="card p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-serif text-base font-semibold">메인 퍼널</h2>
            <span className="text-[11px] text-ink/40">방문 → 조회 → 정독 → 복사 → 저장 (7일)</span>
          </div>
          <div className="space-y-2.5">
            {funnel.map((f) => (
              <div key={f.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-ink/70">{f.label}</span>
                  <span className="tabular-nums text-ink/60">
                    {fmt(f.value)}{' '}
                    <span className="text-ink/35">({pct(f.value, funnel[0].value)})</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(f.value / funnelMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 위젯 4 — 가드레일 5종 */}
        <section className="card p-5">
          <h2 className="font-serif text-base font-semibold mb-4">가드레일</h2>
          <div className="grid grid-cols-2 gap-3">
            <Guardrail label="발송 실패" value={fmt(noti?.purchases_failed)} threshold=">5% 경고" status={noti && noti.purchases_failed > 0 ? 'warning' : 'ok'} />
            <Guardrail label="이탈률" value="—" threshold=">70% 경고" status="pending" />
            <Guardrail label="부정 반응" value="—" threshold=">20% 경고" status="pending" />
            <Guardrail label="체류 시간" value="—" threshold="<2분 경고" status="pending" />
            <Guardrail label="로그인 전환" value="—" threshold="<30% 경고" status="pending" />
          </div>
          <p className="mt-3 text-[11px] text-ink/40">체류·이탈·전환은 GA4 / Day 8 활성 후 보강.</p>
        </section>

        {/* 위젯 5 — 잘 되는 콘텐츠 Top 5 */}
        <section className="card p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-serif text-base font-semibold">잘 되는 콘텐츠 Top 5</h2>
            <Link href="/admin/analytics" className="text-[11px] text-accent hover:underline">상세 분석 →</Link>
          </div>
          <div className="space-y-2">
            {top.length === 0 && <p className="text-sm text-ink/40">데이터가 없어요.</p>}
            {top.map((c, i) => (
              <Link key={c.content_id} href={`/admin/contents/${c.content_id}`} className="flex items-center gap-3 py-1.5 hover:bg-muted/40 rounded-md px-1.5 -mx-1.5">
                <span className="text-xs font-semibold text-ink/30 w-4 tabular-nums">{i + 1}</span>
                <span className="badge shrink-0">{c.track === 'case' ? '케이스' : '트렌드'}</span>
                <span className="flex-1 min-w-0 truncate text-sm">{c.title}</span>
                <span className="text-xs text-ink/50 tabular-nums shrink-0">조회 {fmt(c.view_count)} · 저장 {fmt(c.save_count)}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* 위젯 6 — 최근 변경 */}
        <section className="card p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-serif text-base font-semibold">최근 변경</h2>
            <Link href="/admin/history" className="text-[11px] text-accent hover:underline">History →</Link>
          </div>
          <div className="space-y-1">
            {audits.length === 0 && <p className="text-sm text-ink/40">기록이 없어요.</p>}
            {audits.map((a) => {
              const ent = ENTITY_LABEL[a.entity_type] ?? a.entity_type;
              const verb = ACTION_VERB[a.action_type.split('.').pop() ?? ''] ?? '';
              return (
                <div key={a.id} className="flex items-center gap-2 text-sm py-1">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${a.actor_type === 'system' ? 'bg-ink/20' : 'bg-accent'}`} />
                  <span className="flex-1 min-w-0 truncate">{ent} {verb}</span>
                  <span className="text-[11px] text-ink/40 shrink-0">{new Date(a.created_at).toLocaleDateString('ko-KR')}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* 위젯 7 — 직무·페르소나 분포 */}
      <section className="card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-base font-semibold">가입자 직무·페르소나 분포</h2>
          <Link href="/admin/users" className="text-[11px] text-accent hover:underline">가입자 →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <DistBars title="직무" rows={jobRows} total={profiles.length} />
          <DistBars title="페르소나" rows={personaRows} total={profiles.length} />
        </div>
      </section>
    </div>
  );
}

// ─────────────── 보조 컴포넌트 ───────────────

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <div className="h-12 flex items-center text-[11px] text-ink/30">추이 데이터 부족</div>;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const W = 100;
  const H = 32;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `0,${H} ${pts.join(' ')} ${W},${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-12">
      <polygon points={area} fill="currentColor" className="text-accent/10" />
      <polyline points={pts.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Kpi({
  label,
  value,
  hint,
  delta,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  accent?: boolean;
}) {
  return (
    <div className={`card p-4 ${accent ? 'border-2 border-accent' : ''}`}>
      <div className={`text-xs ${accent ? 'text-accent font-semibold' : 'text-ink/50'}`}>{label}</div>
      <div className={`mt-2 font-serif text-2xl font-semibold tabular-nums ${accent ? 'text-accent' : ''}`}>{value}</div>
      {delta !== undefined && delta !== null ? (
        <div className={`mt-1 text-[11px] ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
        </div>
      ) : hint ? (
        <div className="mt-1 text-[11px] text-ink/40">{hint}</div>
      ) : null}
    </div>
  );
}

function Guardrail({
  label,
  value,
  threshold,
  status,
}: {
  label: string;
  value: string;
  threshold: string;
  status: 'ok' | 'warning' | 'pending';
}) {
  const color = status === 'warning' ? 'text-red-600' : status === 'ok' ? 'text-green-600' : 'text-ink/30';
  const tag = status === 'warning' ? '⚠️ 임계 초과' : status === 'ok' ? '✓ 양호' : '수집 중';
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-ink/50">{label}</div>
      <div className="mt-1 font-serif text-lg font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] text-ink/40">{threshold}</div>
      <div className={`mt-1 text-[10px] ${color}`}>{tag}</div>
    </div>
  );
}

function DistBars({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div>
      <div className="text-xs font-semibold text-ink/60 mb-2">{title}</div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-ink/40">데이터가 없어요.</p>}
        {rows.map(([label, count]) => (
          <div key={label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-ink/70">{label}</span>
              <span className="tabular-nums text-ink/50">{fmt(count)} · {pct(count, total)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-accent/70" style={{ width: `${(count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
