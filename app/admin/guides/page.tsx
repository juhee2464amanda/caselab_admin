import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { GuideManager, type Guide } from '@/components/admin/GuideManager';

// /admin/guides — 공식 가이드 관리 (피드백 #7). tools(category='guide').
export default async function AdminGuides() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('tools')
    .select('id, name, url, description, status, job_tags')
    .eq('category', 'guide')
    .order('updated_at', { ascending: false });
  const guides = (data ?? []) as Guide[];

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">공식 가이드</h1>
        <p className="text-sm text-ink/60 mt-1">노출할 공식 문서 링크를 분류별로 등록·관리하세요.</p>
      </header>
      <GuideManager initial={guides} />
    </div>
  );
}
