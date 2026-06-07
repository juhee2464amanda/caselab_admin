import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { CategoryManager, type Category, type Tag } from '@/components/admin/CategoryManager';

// /admin/categories — 카테고리·태그 관리 (D30). CRUD는 CategoryManager(client).
export default async function AdminCategories() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const [catRes, tagRes] = await Promise.all([
    supabase.from('categories').select('id, type, parent_track, slug, label, sort_order, is_active').order('type').order('sort_order'),
    supabase.from('tags').select('id, slug, label, usage_count').order('usage_count', { ascending: false }),
  ]);
  const categories = (catRes.data ?? []) as Category[];
  const tags = (tagRes.data ?? []) as Tag[];

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">카테고리·태그</h1>
        <p className="text-sm text-ink/60 mt-1">콘텐츠·자료실 세부 분류 + UTM 채널 + 가로지르는 태그.</p>
      </header>
      <CategoryManager categories={categories} tags={tags} />
    </div>
  );
}
