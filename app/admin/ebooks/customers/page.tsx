import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';

// /admin/ebooks/customers — ebook별 구매 고객 history (피드백 #8-3)
export const dynamic = 'force-dynamic';

type Purchase = {
  id: string;
  name: string;
  email: string;
  amount: number;
  status: string;
  sent_at: string | null;
  created_at: string;
  product_id: string;
  products: { title: string } | null;
};
type Product = { id: string; title: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '대기', cls: 'bg-yellow-100 text-yellow-700' },
  sent: { label: '발송완료', cls: 'bg-green-100 text-green-700' },
  failed: { label: '실패', cls: 'bg-red-100 text-red-700' },
  refunded: { label: '환불', cls: 'bg-muted text-ink/50' },
};

export default async function AdminEbookCustomers({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const sp = await searchParams;
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();

  const [prodRes, purRes] = await Promise.all([
    supabase.from('products').select('id, title').order('created_at', { ascending: false }),
    (() => {
      let q = supabase
        .from('purchases')
        .select('id, name, email, amount, status, sent_at, created_at, product_id, products(title)')
        .order('created_at', { ascending: false })
        .limit(300);
      if (sp.product) q = q.eq('product_id', sp.product);
      return q;
    })(),
  ]);
  const products = (prodRes.data ?? []) as Product[];
  const purchases = (purRes.data ?? []) as unknown as Purchase[];

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-4">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">구매 고객</h1>
        <p className="text-sm text-ink/60 mt-1">ebook별 구매 고객 history. 발송 상태와 함께 추적.</p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a href="/admin/ebooks/customers" className={`chip ${!sp.product ? 'chip-active' : ''}`}>전체</a>
        {products.map((p) => (
          <a key={p.id} href={`/admin/ebooks/customers?product=${p.id}`} className={`chip ${sp.product === p.id ? 'chip-active' : ''}`}>{p.title}</a>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3">ebook</th>
              <th className="px-4 py-3 w-24 text-right">금액</th>
              <th className="px-4 py-3 w-24">상태</th>
              <th className="px-4 py-3 w-32">구매일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {purchases.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-ink/40">구매 내역이 없어요.</td></tr>
            )}
            {purchases.map((p) => {
              const s = STATUS[p.status] ?? { label: p.status, cls: 'badge' };
              return (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-ink/70">{p.email}</td>
                  <td className="px-4 py-3">{p.products?.title ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.amount === 0 ? '무료' : `${p.amount.toLocaleString('ko-KR')}원`}</td>
                  <td className="px-4 py-3"><span className={`badge ${s.cls}`}>{s.label}</span></td>
                  <td className="px-4 py-3 text-xs text-ink/50">{formatDate(p.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
