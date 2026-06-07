import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';

// /admin/faq — FAQ 관리 (D51). 현재 읽기 목록, CRUD 폼은 다음 레이어.
type Faq = {
  id: string;
  question: string;
  category: string | null;
  sort_order: number;
  is_published: boolean;
  updated_at: string;
};

export default async function AdminFaq() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('faqs')
    .select('id, question, category, sort_order, is_published, updated_at')
    .order('sort_order');
  const faqs = (data ?? []) as Faq[];

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">FAQ</h1>
        <p className="text-sm text-ink/60 mt-1">자주 묻는 질문 관리. 발행된 항목은 사용자 FAQ에 노출.</p>
      </header>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3 w-16 text-right">순서</th>
              <th className="px-4 py-3">질문</th>
              <th className="px-4 py-3 w-28">카테고리</th>
              <th className="px-4 py-3 w-24">상태</th>
              <th className="px-4 py-3 w-32">수정일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {faqs.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink/40">등록된 FAQ가 없어요.</td></tr>
            )}
            {faqs.map((f) => (
              <tr key={f.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 text-right tabular-nums text-ink/50">{f.sort_order}</td>
                <td className="px-4 py-3 font-medium">{f.question}</td>
                <td className="px-4 py-3">{f.category ? <span className="badge">{f.category}</span> : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${f.is_published ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {f.is_published ? '발행' : '비공개'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-ink/50">{formatDate(f.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
