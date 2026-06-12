import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * /admin/revenue — 수익 대시보드 (D40)
 *
 * 데이터 소스: products · purchases (기존 테이블, 신규 마이그레이션 불필요).
 * 리텐션·완독률은 events 집계 의존 → P1 보강 (현재 placeholder).
 */
export const dynamic = 'force-dynamic';

type PurchaseRow = {
  id: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  products: { title: string; price: number } | null;
};

function won(n: number): string {
  return n === 0 ? '0원' : `${n.toLocaleString('ko-KR')}원`;
}

export default async function AdminRevenue() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('purchases')
    .select('id, status, sent_at, created_at, metadata, products(title, price)')
    .order('created_at', { ascending: false });

  // 테스트 발송(metadata.test) 행 제외
  const rows = ((data ?? []) as unknown as (PurchaseRow & { metadata: { test?: boolean } | null })[])
    .filter((r) => !r.metadata?.test);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const total = rows.length;
  const thisMonth = rows.filter((r) => new Date(r.created_at) >= monthStart).length;
  const sent = rows.filter((r) => r.sent_at).length;
  const sentRate = total ? Math.round((sent / total) * 100) : 0;
  const revenue = rows.reduce((s, r) => s + (r.products?.price ?? 0), 0);

  // 상품별 집계
  const byProduct = new Map<string, { title: string; orders: number; sent: number; revenue: number }>();
  for (const r of rows) {
    const title = r.products?.title ?? '(삭제된 상품)';
    const e = byProduct.get(title) ?? { title, orders: 0, sent: 0, revenue: 0 };
    e.orders += 1;
    if (r.sent_at) e.sent += 1;
    e.revenue += r.products?.price ?? 0;
    byProduct.set(title, e);
  }
  const productRows = [...byProduct.values()].sort((a, b) => b.orders - a.orders);

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">수익 대시보드</h1>
        <p className="text-sm text-ink/60 mt-1">전자책 주문·발송·매출 현황. (products·purchases 기준)</p>
      </header>

      {/* KPI 카드 */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="누적 주문" value={total.toLocaleString('ko-KR')} hint="전체 purchases" />
        <Kpi label="이번 달 주문" value={thisMonth.toLocaleString('ko-KR')} hint={`${now.getMonth() + 1}월`} />
        <Kpi
          label="발송 성공률"
          value={total ? `${sentRate}%` : '—'}
          hint={`${sent}/${total} 발송 완료`}
          accent={total > 0 && sentRate < 95}
        />
        <Kpi label="누적 매출" value={won(revenue)} hint="결제 도입 전 0원 가능" />
      </section>

      {/* 상품별 집계 */}
      <section>
        <h2 className="font-serif text-base font-semibold mb-3">상품별 집계</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-4 py-3">상품</th>
                <th className="px-4 py-3 w-24 text-right">주문</th>
                <th className="px-4 py-3 w-28 text-right">발송 완료</th>
                <th className="px-4 py-3 w-28 text-right">매출</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {productRows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-ink/40">주문이 없어요.</td></tr>
              )}
              {productRows.map((p) => (
                <tr key={p.title} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{p.title}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.orders.toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink/60">{p.sent.toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{won(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* events 의존 지표 — P1 */}
      <section>
        <h2 className="font-serif text-base font-semibold mb-3">
          리텐션·완독률
          <span className="ml-2 text-xs text-ink/40 font-normal">(events 집계 / GA4 보강 후 — P1)</span>
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="리텐션 (7일)" value="—" hint="events 집계 필요" />
          <Kpi label="완독률 (90%+)" value="—" hint="scroll-tracker 집계 필요" />
        </div>
      </section>
    </div>
  );
}

function Kpi({
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
    <div className={`card p-4 ${accent ? 'border-2 border-red-300 bg-red-50/40' : ''}`}>
      <div className="text-xs text-ink/50">{label}</div>
      <div className="mt-2 font-serif text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-ink/40">{hint}</div>}
    </div>
  );
}
