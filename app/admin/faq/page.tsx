import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { FaqManager, type Faq } from '@/components/admin/FaqManager';

// /admin/faq — FAQ 관리 (D51). 추가·수정·삭제·발행 토글은 FaqManager(client).
export default async function AdminFaq() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('faqs')
    .select('id, question, answer, category, sort_order, is_published, updated_at')
    .order('sort_order');
  const faqs = (data ?? []) as Faq[];

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">FAQ</h1>
        <p className="text-sm text-ink/60 mt-1">자주 묻는 질문 관리. 발행된 항목은 사용자 FAQ에 노출.</p>
      </header>
      <FaqManager initial={faqs} />
    </div>
  );
}
