import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { CategoryQuickEdit } from '@/components/admin/CategoryQuickEdit';
import { formatDate } from '@/lib/utils';

export default async function AdminComments() {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('comments')
    .select('id, body, status, created_at, content_id, contents(title, slug, track)')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">댓글 모더레이션</h1>
        <div className="self-start sm:self-auto">
          <CategoryQuickEdit scope={{ type: 'content_subcategory', tracks: ['case', 'trend'], title: '콘텐츠 카테고리 수정' }} />
        </div>
      </div>
      <ul className="space-y-3">
        {((data ?? []) as any[]).map((c) => (
          <li key={c.id} className="card p-4 sm:p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-2 text-xs">
              <span className="text-ink/50">{c.contents?.title} · {formatDate(c.created_at)}</span>
              <span className={`badge ${c.status === 'reported' ? 'bg-red-100 text-red-700' : c.status === 'hidden' ? 'bg-ink/10' : 'bg-green-100 text-green-700'}`}>
                {c.status}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
