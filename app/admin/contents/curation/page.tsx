import Link from 'next/link';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

// /admin/contents/curation — Hero·Highlight·Links 슬롯 (D52).
// 현재 읽기 슬롯 뷰, drag-and-drop 편집은 다음 레이어.
type Slot = {
  id: string;
  slot_type: 'hero' | 'highlight' | 'links';
  slot: number;
  content_id: string | null;
  active: boolean;
  sort_label: string | null;
  contents: { title: string; slug: string } | null;
};

const SLOT_META: { type: Slot['slot_type']; label: string; hint: string }[] = [
  { type: 'hero', label: 'Hero', hint: '메인 상단 대표 콘텐츠' },
  { type: 'highlight', label: 'Highlight', hint: '추천 하이라이트' },
  { type: 'links', label: 'Links', hint: '바로가기 링크 모음' },
];

export default async function AdminCuration() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('featured_contents')
    .select('id, slot_type, slot, content_id, active, sort_label, contents(title, slug)')
    .order('slot_type')
    .order('slot');
  const slots = (data ?? []) as unknown as Slot[];

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">큐레이션</h1>
        <p className="text-sm text-ink/60 mt-1">메인 노출 슬롯(Hero·Highlight·Links). 드래그 편집은 추후 추가.</p>
      </header>

      {SLOT_META.map((meta) => {
        const items = slots.filter((s) => s.slot_type === meta.type).sort((a, b) => a.slot - b.slot);
        return (
          <section key={meta.type}>
            <h2 className="font-serif text-base font-semibold mb-1">
              {meta.label} <span className="text-xs text-ink/40 font-normal">{items.length} 슬롯</span>
            </h2>
            <p className="text-xs text-ink/40 mb-3">{meta.hint}</p>
            <div className="card divide-y divide-border">
              {items.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-ink/40">배치된 콘텐츠가 없어요.</div>
              )}
              {items.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="badge shrink-0">#{s.slot}</span>
                    {s.contents ? (
                      <Link href={`/admin/contents/${s.content_id}`} className="font-medium hover:underline truncate">
                        {s.contents.title}
                      </Link>
                    ) : (
                      <span className="text-ink/40">(빈 슬롯)</span>
                    )}
                    {s.sort_label && <span className="text-xs text-ink/40">{s.sort_label}</span>}
                  </div>
                  <span className={`badge shrink-0 ${s.active ? 'bg-green-100 text-green-700' : 'bg-muted text-ink/50'}`}>
                    {s.active ? '노출' : '숨김'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
