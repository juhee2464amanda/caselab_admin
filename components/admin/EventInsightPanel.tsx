import { createSupabaseAdminClient } from '@/lib/supabase/admin';

// 행동 인사이트 (Supabase events, D21 이중적재의 DB쪽) — GA4가 못 보는 파라미터
// (CTA label·product_id·session 여정)를 보여준다. 소스는 본가 track()이 적재한 events 테이블.

type EventRow = {
  event_type: string;
  content_id: string | null;
  product_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type SessionJourney = {
  sessionId: string;
  startedAt: string;
  source: string;
  steps: string[];
  converted: boolean;
};

const DAYS = 7;
/** 여정 표시에서 제외 — 노이즈성 자동 이벤트 */
const JOURNEY_SKIP = new Set(['dwell', 'scroll_25', 'scroll_50']);

function meta(e: EventRow, key: string): string {
  const v = e.metadata?.[key];
  return typeof v === 'string' ? v : '';
}

function sessionSource(events: EventRow[]): string {
  for (const e of events) {
    const utm = meta(e, 'utm_source');
    if (utm) return utm;
  }
  for (const e of events) {
    const ref = meta(e, 'referrer');
    if (ref) return ref;
  }
  return 'direct';
}

function journeyStep(e: EventRow, productTitles: Map<string, string>): string {
  switch (e.event_type) {
    case 'pageview':
      return meta(e, 'path').split('?')[0] || '/';
    case 'cta_click':
      return `🔘 CTA:${meta(e, 'label') || meta(e, 'href')}`;
    case 'product_view':
      return `👀 상품조회${e.product_id ? `:${productTitles.get(e.product_id) ?? ''}` : ''}`;
    case 'ebook_order':
      return '🛒 주문';
    case 'ebook_download':
      return '⬇️ 다운로드';
    case 'login':
      return `🔑 로그인${meta(e, 'method') ? `(${meta(e, 'method')})` : ''}`;
    case 'signup':
      return '✨ 가입';
    case 'search':
      return `🔍 "${meta(e, 'keyword')}"`;
    case 'scroll_100':
      return '📖 완독';
    default:
      return e.event_type;
  }
}

function fmtKst(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function EventInsightPanel() {
  let events: EventRow[] = [];
  const productTitles = new Map<string, string>();

  try {
    const supabase = createSupabaseAdminClient();
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: ev, error }, { data: prods }] = await Promise.all([
      supabase
        .from('events')
        .select('event_type, content_id, product_id, metadata, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(2000),
      supabase.from('products').select('id, title'),
    ]);
    if (error) throw error;
    events = (ev ?? []) as EventRow[];
    for (const p of prods ?? []) productTitles.set(p.id, p.title);
  } catch {
    return (
      <section className="mb-8">
        <h2 className="font-semibold mb-3">행동 인사이트 (events · 최근 {DAYS}일)</h2>
        <div className="card p-4 text-sm text-ink/50">
          events 데이터를 불러오지 못했습니다. (<code>SUPABASE_SERVICE_ROLE_KEY</code> 확인)
        </div>
      </section>
    );
  }

  if (events.length === 0) {
    return (
      <section className="mb-8">
        <h2 className="font-semibold mb-3">행동 인사이트 (events · 최근 {DAYS}일)</h2>
        <div className="card p-4 text-sm text-ink/50">최근 {DAYS}일 이벤트가 아직 없습니다.</div>
      </section>
    );
  }

  // 세션 단위 그룹핑 — 퍼널·여정의 기준 단위 (session_id 없는 과거 이벤트는 제외)
  const sessions = new Map<string, EventRow[]>();
  for (const e of events) {
    const sid = meta(e, 'session_id');
    if (!sid) continue;
    const list = sessions.get(sid) ?? [];
    list.push(e);
    sessions.set(sid, list);
  }

  // 1) CTA 라벨별 클릭
  const ctaCounts = new Map<string, { href: string; count: number }>();
  for (const e of events) {
    if (e.event_type !== 'cta_click') continue;
    const label = meta(e, 'label') || '(라벨 없음)';
    const cur = ctaCounts.get(label) ?? { href: meta(e, 'href'), count: 0 };
    cur.count += 1;
    ctaCounts.set(label, cur);
  }
  const ctas = [...ctaCounts.entries()].sort((a, b) => b[1].count - a[1].count);

  // 2) ebook 퍼널 (세션 distinct): 방문 → 상품조회 → 주문
  const visited = sessions.size;
  const viewedSessions = new Set<string>();
  const orderedSessions = new Set<string>();
  const perProduct = new Map<string, { views: Set<string>; orders: Set<string> }>();
  for (const [sid, list] of sessions) {
    for (const e of list) {
      if (e.event_type === 'product_view') {
        viewedSessions.add(sid);
        if (e.product_id) {
          const p = perProduct.get(e.product_id) ?? { views: new Set(), orders: new Set() };
          p.views.add(sid);
          perProduct.set(e.product_id, p);
        }
      }
      if (e.event_type === 'ebook_order') {
        orderedSessions.add(sid);
        if (e.product_id) {
          const p = perProduct.get(e.product_id) ?? { views: new Set(), orders: new Set() };
          p.orders.add(sid);
          perProduct.set(e.product_id, p);
        }
      }
    }
  }
  const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);

  // 3) 최근 세션 여정 (최신 5개)
  const journeys: SessionJourney[] = [...sessions.entries()]
    .map(([sessionId, list]) => ({
      sessionId,
      startedAt: list[0].created_at,
      source: sessionSource(list),
      steps: list
        .filter((e) => !JOURNEY_SKIP.has(e.event_type))
        .map((e) => journeyStep(e, productTitles)),
      converted: list.some((e) => e.event_type === 'ebook_order'),
    }))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 5);

  const MAX_STEPS = 14;

  return (
    <section className="mb-8">
      <h2 className="font-semibold mb-3">행동 인사이트 (events · 최근 {DAYS}일)</h2>

      <div className="grid gap-3 sm:grid-cols-2 mb-3">
        {/* CTA 클릭 */}
        <div className="card p-4">
          <h3 className="text-xs uppercase tracking-wider text-ink/50 mb-2">CTA 클릭</h3>
          {ctas.length === 0 ? (
            <div className="text-sm text-ink/50">클릭 없음</div>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {ctas.map(([label, { href, count }]) => (
                  <tr key={label}>
                    <td className="py-2">
                      {label}
                      <span className="ml-2 text-xs text-ink/40">{href}</span>
                    </td>
                    <td className="py-2 w-12 text-right font-semibold">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ebook 퍼널 */}
        <div className="card p-4">
          <h3 className="text-xs uppercase tracking-wider text-ink/50 mb-2">
            ebook 퍼널 (세션 기준)
          </h3>
          <div className="flex items-center gap-2 text-sm mb-3">
            <span>방문 <b>{visited}</b></span>
            <span className="text-ink/30">→</span>
            <span>
              상품조회 <b>{viewedSessions.size}</b>
              <span className="ml-1 text-xs text-ink/40">{pct(viewedSessions.size, visited)}</span>
            </span>
            <span className="text-ink/30">→</span>
            <span>
              주문 <b>{orderedSessions.size}</b>
              <span className="ml-1 text-xs text-ink/40">
                {pct(orderedSessions.size, viewedSessions.size)}
              </span>
            </span>
          </div>
          {perProduct.size > 0 && (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {[...perProduct.entries()].map(([pid, { views, orders }]) => (
                  <tr key={pid}>
                    <td className="py-2 pr-2">{productTitles.get(pid) ?? pid.slice(0, 8)}</td>
                    <td className="py-2 w-24 text-right text-xs">
                      조회 {views.size} · 주문 {orders.size}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 최근 세션 여정 */}
      <div className="card p-4">
        <h3 className="text-xs uppercase tracking-wider text-ink/50 mb-2">
          최근 세션 여정 (최신 5개)
        </h3>
        <div className="divide-y divide-border">
          {journeys.map((j) => (
            <div key={j.sessionId} className="py-2 text-sm">
              <div className="flex items-center gap-2 text-xs text-ink/50 mb-1">
                <span>{fmtKst(j.startedAt)}</span>
                <span className="rounded bg-muted px-1.5 py-0.5">{j.source}</span>
                {j.converted && (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-semibold">주문 전환</span>
                )}
              </div>
              <div className="text-xs leading-relaxed break-all">
                {j.steps.slice(0, MAX_STEPS).join(' › ')}
                {j.steps.length > MAX_STEPS && (
                  <span className="text-ink/40"> …외 {j.steps.length - MAX_STEPS}단계</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
