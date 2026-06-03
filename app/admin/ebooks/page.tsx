import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';

export default async function AdminEbooks() {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();
  const { data: products } = await supabase
    .from('products')
    .select('id, slug, title, price, status, created_at')
    .order('created_at', { ascending: false });
  const { data: purchases } = await supabase
    .from('purchases')
    .select('id, name, email, status, sent_at, created_at, products(title)')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="p-4 sm:p-8 space-y-8">
      <section>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold mb-4">전자책</h1>
        <ul className="space-y-2">
          {(products ?? []).map((p) => (
            <li key={p.id} className="card p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-medium">{p.title}</h3>
                <p className="text-xs text-ink/50">/{p.slug} · {p.price === 0 ? '무료' : p.price.toLocaleString() + '원'}</p>
              </div>
              <span className="badge shrink-0">{p.status}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-semibold mb-3">최근 주문</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
              <tr><th className="px-4 py-3">이름</th><th className="px-4 py-3">이메일</th><th className="px-4 py-3">전자책</th><th className="px-4 py-3">상태</th><th className="px-4 py-3">신청일</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {((purchases ?? []) as any[]).map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3">{p.email}</td>
                  <td className="px-4 py-3">{p.products?.title}</td>
                  <td className="px-4 py-3"><span className="badge">{p.status}</span></td>
                  <td className="px-4 py-3 text-xs text-ink/50">{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
