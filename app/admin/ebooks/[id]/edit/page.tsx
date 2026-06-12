import { notFound } from 'next/navigation';
import { EbookForm } from '@/components/admin/EbookForm';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export default async function EditEbookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">ebook 편집</h1>
        <p className="text-sm text-ink/60 mt-1">제목·가격·상세 본문·상태를 수정하고 PDF를 교체할 수 있어요.</p>
      </header>
      <EbookForm initial={data as never} />
    </div>
  );
}
