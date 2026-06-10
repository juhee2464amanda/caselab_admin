import Link from 'next/link';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { EbookPdfUpload } from '@/components/admin/EbookPdfUpload';

// /admin/ebooks — 판매 중인 ebook (피드백 #8-2). 판매수·매출·발송완료 지표 + PDF 연결.
export const dynamic = 'force-dynamic';

type Product = { id: string; slug: string; title: string; price: number; status: string; pdf_path: string | null; body: { read_minutes?: number } | null };
type Purchase = { product_id: string; amount: number; sent_at: string | null };

function won(n: number) { return n === 0 ? '0원' : `${n.toLocaleString('ko-KR')}원`; }

export default async function AdminEbooks() {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();
  const [prodRes, purRes] = await Promise.all([
    supabase.from('products').select('id, slug, title, price, status, pdf_path, body').order('created_at', { ascending: false }),
    supabase.from('purchases').select('product_id, amount, sent_at'),
  ]);
  const products = (prodRes.data ?? []) as Product[];
  const purchases = (purRes.data ?? []) as Purchase[];

  const agg = new Map<string, { sales: number; revenue: number; sent: number }>();
  for (const p of purchases) {
    const a = agg.get(p.product_id) ?? { sales: 0, revenue: 0, sent: 0 };
    a.sales += 1;
    a.revenue += p.amount ?? 0;
    if (p.sent_at) a.sent += 1;
    agg.set(p.product_id, a);
  }

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-xl sm:text-2xl font-semibold">판매 중인 ebook</h1>
          <p className="text-sm text-ink/60 mt-1">등록된 전자책과 판매·발송 현황.</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Link href="/admin/ebooks/customers"><Button variant="outline">구매 고객</Button></Link>
          <Link href="/admin/ebooks/new"><Button variant="accent">새 ebook</Button></Link>
        </div>
      </header>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3">제목</th>
              <th className="px-4 py-3 w-24 text-right">가격</th>
              <th className="px-4 py-3 w-20 text-right">읽는시간</th>
              <th className="px-4 py-3 w-20 text-right">판매수</th>
              <th className="px-4 py-3 w-24 text-right">매출</th>
              <th className="px-4 py-3 w-20 text-right">발송완료</th>
              <th className="px-4 py-3 w-20">상태</th>
              <th className="px-4 py-3 w-44">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-ink/40">등록된 ebook이 없어요. 우상단 "새 ebook"으로 시작하세요.</td></tr>
            )}
            {products.map((p) => {
              const a = agg.get(p.id) ?? { sales: 0, revenue: 0, sent: 0 };
              return (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{p.title}<div className="text-xs text-ink/40">/{p.slug}</div></td>
                  <td className="px-4 py-3 text-right tabular-nums">{won(p.price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink/60">{p.body?.read_minutes ? `${p.body.read_minutes}분` : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{a.sales.toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{won(a.revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink/60">{a.sent.toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-3"><span className={`badge ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-muted text-ink/50'}`}>{p.status === 'active' ? '판매중' : '보관'}</span></td>
                  <td className="px-4 py-3"><EbookPdfUpload productId={p.id} slug={p.slug} pdfPath={p.pdf_path} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
