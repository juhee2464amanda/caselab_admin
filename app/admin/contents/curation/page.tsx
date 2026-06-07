import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { CurationManager, type Slot, type PubContent } from '@/components/admin/CurationManager';

// /admin/contents/curation — Hero·Highlight·Links 슬롯 (D52). 배치·정렬은 CurationManager(client).
export default async function AdminCuration() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const [featRes, pubRes] = await Promise.all([
    supabase.from('featured_contents').select('id, slot_type, slot, content_id, active, sort_label, contents(title)').order('slot_type').order('slot'),
    supabase.from('contents').select('id, title, track').eq('status', 'published').order('updated_at', { ascending: false }).limit(100),
  ]);
  const entries = (featRes.data ?? []) as unknown as Slot[];
  const published = (pubRes.data ?? []) as PubContent[];

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">큐레이션</h1>
        <p className="text-sm text-ink/60 mt-1">메인 노출 슬롯(Hero·Highlight·Links)에 콘텐츠를 배치하고 순서를 정하세요.</p>
      </header>
      <CurationManager entries={entries} published={published} />
    </div>
  );
}
