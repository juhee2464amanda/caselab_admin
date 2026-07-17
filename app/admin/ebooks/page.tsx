import Link from 'next/link';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { EbookPdfUpload } from '@/components/admin/EbookPdfUpload';
import { TestSendButton } from '@/components/admin/TestSendButton';

// /admin/ebooks — 판매 중인 ebook (피드백 #8-2). 판매수·매출·발송완료 지표 + PDF 연결 + 테스트 발송.
export const dynamic = 'force-dynamic';

type Product = { id: string; slug: string; title: string; price: number; status: string; pdf_path: string | null; body: { read_minutes?: number } | null };
type Purchase = { product_id: string; amount: number; sent_at: string | null; metadata: { test?: boolean } | null };

function won(n: number) { return n === 0 ? '0원' : `${n.toLocaleString('ko-KR')}원`; }

export default async function AdminEbooks() {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();
  const [prodRes, purRes] = await Promise.all([
    supabase.from('products').select('id, slug, title, price, status, pdf_path, body').order('created_at', { ascending: false }),
    supabase.from('purchases').select('product_id, amount, sent_at, metadata'),
  ]);
  const products = (prodRes.data ?? []) as Product[];
  // 테스트 발송(metadata.test) 행은 매출·판매수 집계에서 제외
  const purchases = ((purRes.data ?? []) as Purchase[]).filter((p) => !p.metadata?.test);

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

      {/* 웹뷰어 요구사항 메모 — 구매자 마이페이지 뷰어(/read)가 정상 작동하려면 등록 시 지켜야 할 것들 */}
      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-ink/70">
        <p className="font-medium text-ink/80 mb-1">📖 웹뷰어 메모 — 구매자가 마이페이지에서 바로 읽는 뷰어가 붙어 있어요</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li><b>PDF 내보내기 시 북마크(목차/outline)를 반드시 포함</b>하세요. 포함해야 뷰어의 목차 클릭 이동이 작동합니다. 없으면 상세 본문의 toc 제목만 표시되고 이동은 안 돼요.</li>
          <li>PDF 미연결 상품은 마이페이지 &quot;읽기&quot;에서 열리지 않습니다. 판매 전 반드시 연결 상태 확인.</li>
          <li>텍스트 기반 PDF 권장 — 스캔 이미지형 PDF는 용량이 커져 뷰어 로딩이 느려집니다.</li>
        </ul>
      </div>

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
              <th className="px-4 py-3 w-36">테스트 발송</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-ink/40">등록된 ebook이 없어요. 우상단 "새 ebook"으로 시작하세요.</td></tr>
            )}
            {products.map((p) => {
              const a = agg.get(p.id) ?? { sales: 0, revenue: 0, sent: 0 };
              return (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium"><Link href={`/admin/ebooks/${p.id}/edit`} className="hover:text-accent hover:underline underline-offset-2">{p.title}</Link><div className="text-xs text-ink/40">/{p.slug}</div></td>
                  <td className="px-4 py-3 text-right tabular-nums">{won(p.price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink/60">{p.body?.read_minutes ? `${p.body.read_minutes}분` : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{a.sales.toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{won(a.revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink/60">{a.sent.toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-3"><span className={`badge ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-muted text-ink/50'}`}>{p.status === 'active' ? '판매중' : '보관'}</span></td>
                  <td className="px-4 py-3"><EbookPdfUpload productId={p.id} slug={p.slug} pdfPath={p.pdf_path} /></td>
                  <td className="px-4 py-3"><TestSendButton productId={p.id} hasPdf={!!p.pdf_path} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
