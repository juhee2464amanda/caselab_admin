import Link from 'next/link';
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from '@/lib/supabase/server';

/**
 * /admin 대시보드 (D5 / D16 / D34)
 *
 * 결정 출처:
 *   §19 D5 — 북극성 = 주간 prompt_copy UV. KPI 5종
 *   §19 D16 + D34 — admin_notifications view + 발화 7건
 *   06 §7.1 영역 1 데이터 분석
 *
 * 데이터 소스 (0002):
 *   - public.get_north_star() RPC → { weekly_uv, prev_uv, delta_pct }
 *   - public.weekly_kpi view → { uv_7d, pv_7d, prompt_copy_count_7d, save_count_7d, react_count_7d, total_users, new_users_7d, ... }
 *   - public.admin_notifications view → { opinions_new, comments_reported, purchases_failed, topics_open, last_*_at }
 */

type WeeklyKpi = {
  prompt_copy_uv_7d: number;
  uv_7d: number;
  pv_7d: number;
  prompt_copy_count_7d: number;
  save_count_7d: number;
  react_count_7d: number;
  total_users: number;
  new_users_7d: number;
  new_users_prev_7d: number;
};

type NorthStar = {
  weekly_uv: number;
  prev_uv: number;
  delta_pct: number;
};

type AdminNotifications = {
  opinions_new: number;
  comments_reported: number;
  purchases_failed: number;
  topics_open: number;
  last_opinion_at: string | null;
  last_comment_report_at: string | null;
  last_purchase_fail_at: string | null;
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('ko-KR');
}

function pct(numerator: number, denominator: number): string {
  if (!denominator) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default async function AdminDashboard() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="p-4 sm:p-8 text-sm text-ink/60">
        Supabase 연결 후 사용할 수 있어요.
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();

  const [northStarRes, kpiRes, notiRes] = await Promise.all([
    supabase.rpc('get_north_star').single<NorthStar>(),
    supabase.from('weekly_kpi').select('*').single<WeeklyKpi>(),
    supabase.from('admin_notifications').select('*').single<AdminNotifications>(),
  ]);

  const ns = northStarRes.data;
  const kpi = kpiRes.data;
  const noti = notiRes.data;

  const saveRate = kpi ? pct(kpi.save_count_7d, kpi.pv_7d) : '—';
  const reactRate = kpi ? pct(kpi.react_count_7d, kpi.pv_7d) : '—';
  const newUserDelta =
    kpi && kpi.new_users_prev_7d > 0
      ? ((kpi.new_users_7d - kpi.new_users_prev_7d) / kpi.new_users_prev_7d) * 100
      : null;

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* 헤더 */}
      <header>
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold">
          대시보드
        </h1>
        <p className="text-sm text-ink/60 mt-1">
          이번 주 운영 현황 한 눈에. 북극성·KPI 5종·운영 알림.
        </p>
      </header>

      {/* 북극성 카드 — 주간 prompt_copy UV */}
      <section className="card p-6 bg-user-base border border-user-border">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-user-ink-muted">
              북극성 — 주간 prompt_copy UV
            </div>
            <div className="mt-2 font-serif text-4xl sm:text-5xl font-bold text-user-accent">
              {fmt(ns?.weekly_uv)}
            </div>
            <div className="mt-1 text-xs text-ink/60">
              지난 주 {fmt(ns?.prev_uv)} ·{' '}
              {ns && ns.delta_pct !== 0 ? (
                <span
                  className={
                    ns.delta_pct > 0 ? 'text-green-600' : 'text-red-600'
                  }
                >
                  {ns.delta_pct > 0 ? '▲' : '▼'} {Math.abs(ns.delta_pct).toFixed(1)}%
                </span>
              ) : (
                <span className="text-ink/40">변동 없음</span>
              )}
            </div>
          </div>
          <div className="text-xs text-ink/40 text-right max-w-[180px]">
            &quot;framework × AI 실행&quot; 적용 신호. 운영자 의사결정 단일 지표.
          </div>
        </div>
      </section>

      {/* KPI 5종 카드 */}
      <section>
        <h2 className="font-serif text-base font-semibold mb-3">KPI 5종 (주간)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="방문자 UV" value={fmt(kpi?.uv_7d)} hint="고유 사용자" />
          <KpiCard
            label="신규 가입"
            value={fmt(kpi?.new_users_7d)}
            hint={
              newUserDelta !== null
                ? `지난 주 ${fmt(kpi?.new_users_prev_7d)} (${
                    newUserDelta > 0 ? '+' : ''
                  }${newUserDelta.toFixed(1)}%)`
                : '지난 주 비교 없음'
            }
          />
          <KpiCard
            label="프롬프트 복사 UV"
            value={fmt(kpi?.prompt_copy_uv_7d)}
            hint="북극성 원천"
            accent
          />
          <KpiCard label="저장률" value={saveRate} hint="save / PV" />
          <KpiCard label="도움률" value={reactRate} hint="react / PV" />
        </div>
      </section>

      {/* 가드레일 5종 (P1 보강 예정 — 일부 placeholder) */}
      <section>
        <h2 className="font-serif text-base font-semibold mb-3">
          가드레일 5종
          <span className="ml-2 text-xs text-ink/40 font-normal">
            (체류·이탈·전환은 GA4 / Day 8 활성 후 보강)
          </span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <GuardrailCard
            label="이탈률"
            value="—"
            threshold=">70% 경고"
            status="pending"
          />
          <GuardrailCard
            label="부정 반응"
            value="—"
            threshold=">20% 경고"
            status="pending"
          />
          <GuardrailCard
            label="체류 시간"
            value="—"
            threshold="<2분 경고"
            status="pending"
          />
          <GuardrailCard
            label="발송 실패"
            value={fmt(noti?.purchases_failed)}
            threshold=">5% 경고"
            status={noti && noti.purchases_failed > 0 ? 'warning' : 'ok'}
          />
          <GuardrailCard
            label="로그인 전환"
            value="—"
            threshold="<30% 경고"
            status="pending"
          />
        </div>
      </section>

      {/* 운영 알림 종 — D16 발화 7건 */}
      <section>
        <h2 className="font-serif text-base font-semibold mb-3">운영 알림</h2>
        <div className="card divide-y divide-user-border">
          <NotiRow
            href="/admin/opinions"
            label="미답 의견"
            count={noti?.opinions_new}
            lastAt={noti?.last_opinion_at}
            warn={!!(noti && noti.opinions_new > 0)}
          />
          <NotiRow
            href="/admin/comments"
            label="신고된 댓글"
            count={noti?.comments_reported}
            lastAt={noti?.last_comment_report_at}
            warn={!!(noti && noti.comments_reported > 0)}
          />
          <NotiRow
            href="/admin/ebooks"
            label="실패한 전자책 발송"
            count={noti?.purchases_failed}
            lastAt={noti?.last_purchase_fail_at}
            warn={!!(noti && noti.purchases_failed > 0)}
          />
          <NotiRow
            href="/admin/topics"
            label="열린 후보 카드"
            count={noti?.topics_open}
            warn={false}
          />
        </div>
        <p className="mt-2 text-xs text-ink/40">
          D34 추가 발화 조건 (신규 가입자 / 전자책 주문 신규 / 카테고리·태그 prompt_copy 급등)는 Day 6 보강.
        </p>
      </section>

      {/* 빠른 액션 */}
      <section className="flex flex-wrap gap-2 pt-2">
        <Link href="/admin/contents" className="chip">콘텐츠 목록</Link>
        <Link href="/admin/contents/new" className="chip">+ 새 콘텐츠</Link>
        <Link href="/admin/analytics" className="chip">상세 분석</Link>
        <Link href="/admin/users" className="chip">사용자</Link>
      </section>
    </div>
  );
}

// ─────────────── 보조 컴포넌트 ───────────────

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`card p-4 ${
        accent ? 'border-user-accent border-2' : ''
      }`}
    >
      <div className="text-xs text-user-ink-muted">{label}</div>
      <div
        className={`mt-2 font-serif text-2xl font-semibold tabular-nums ${
          accent ? 'text-user-accent' : 'text-user-ink'
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-ink/40">{hint}</div>}
    </div>
  );
}

function GuardrailCard({
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
  const statusColor =
    status === 'warning'
      ? 'text-red-600'
      : status === 'ok'
      ? 'text-green-600'
      : 'text-ink/30';
  const statusLabel =
    status === 'warning' ? '⚠️ 임계 초과' : status === 'ok' ? '✓ 양호' : '데이터 수집 중';
  return (
    <div className="card p-4">
      <div className="text-xs text-user-ink-muted">{label}</div>
      <div className="mt-2 font-serif text-xl font-semibold tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-[11px] text-ink/40">{threshold}</div>
      <div className={`mt-2 text-[11px] ${statusColor}`}>{statusLabel}</div>
    </div>
  );
}

function NotiRow({
  href,
  label,
  count,
  lastAt,
  warn,
}: {
  href: string;
  label: string;
  count: number | null | undefined;
  lastAt?: string | null;
  warn: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-user-subtle/40 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            warn ? 'bg-red-500' : 'bg-ink/20'
          }`}
        />
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-3 text-right">
        <span
          className={`font-serif text-base font-semibold tabular-nums ${
            warn ? 'text-red-600' : 'text-ink/60'
          }`}
        >
          {fmt(count)}
        </span>
        {lastAt && (
          <span className="text-xs text-ink/40 hidden sm:inline">
            최근 {new Date(lastAt).toLocaleDateString('ko-KR')}
          </span>
        )}
        <span className="text-ink/30">→</span>
      </div>
    </Link>
  );
}
