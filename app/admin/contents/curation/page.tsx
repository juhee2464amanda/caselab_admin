import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { CurationManager, type Slot, type PubContent, type Ranked } from '@/components/admin/CurationManager';
import { CategoryQuickEdit } from '@/components/admin/CategoryQuickEdit';

// /admin/contents/curation — Hero·Highlight·Links 슬롯 (D52 + 피드백 #3).
// 우측 '잘 되는 콘텐츠' 랭킹(조회·저장·좋아요 index)에서 한 클릭 배치.
export const dynamic = 'force-dynamic';

type CStat = { content_id: string; title: string; track: string; view_count: number; save_count: number; like_count: number };

export default async function AdminCuration() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const [featRes, pubRes, statRes] = await Promise.all([
    supabase.from('featured_contents').select('id, slot_type, slot, content_id, active, sort_label, featured_from, featured_until, contents(title)').order('slot_type').order('slot'),
    supabase.from('contents').select('id, title, track').eq('status', 'published').order('updated_at', { ascending: false }).limit(100),
    supabase.from('content_stats').select('content_id, title, track, view_count, save_count, like_count'),
  ]);
  const entries = (featRes.data ?? []) as unknown as Slot[];
  const published = (pubRes.data ?? []) as PubContent[];

  // 잘 되는 index = 조회 + 저장*3 + 좋아요*2
  const ranked: Ranked[] = ((statRes.data ?? []) as CStat[])
    .map((s) => ({
      content_id: s.content_id,
      title: s.title,
      track: s.track,
      views: s.view_count ?? 0,
      saves: s.save_count ?? 0,
      likes: s.like_count ?? 0,
      score: (s.view_count ?? 0) + (s.save_count ?? 0) * 3 + (s.like_count ?? 0) * 2,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-serif text-xl sm:text-2xl font-semibold">큐레이션</h1>
          <p className="text-sm text-ink/60 mt-1">잘 되는 콘텐츠를 메인 슬롯에 배치하세요. 우측 랭킹에서 📌로 한 번에 배치.</p>
        </div>
        <div className="self-start sm:self-auto">
          <CategoryQuickEdit scope={{ type: 'content_subcategory', tracks: ['case', 'trend'], title: '콘텐츠 카테고리 수정' }} />
        </div>
      </header>
      <CurationManager entries={entries} published={published} ranked={ranked} />
    </div>
  );
}
