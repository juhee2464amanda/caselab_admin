import Link from 'next/link';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

export default async function AdminContents({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from('contents')
    .select('id, slug, title, track, status, curated, published_at, updated_at')
    .order('updated_at', { ascending: false });
  if (sp.status === 'published') q = q.eq('status', 'published');
  if (sp.status === 'draft') q = q.eq('status', 'draft');
  const { data: items } = await q;

  return (
    <div className="p-4 sm:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">콘텐츠</h1>
        <Link href="/admin/contents/new" className="self-start sm:self-auto"><Button variant="accent">새 콘텐츠</Button></Link>
      </header>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/contents" className={`chip ${!sp.status && 'chip-active'}`}>전체</Link>
        <Link href="/admin/contents?status=published" className={`chip ${sp.status === 'published' && 'chip-active'}`}>발행</Link>
        <Link href="/admin/contents?status=draft" className={`chip ${sp.status === 'draft' && 'chip-active'}`}>초안</Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3 w-20">트랙</th>
              <th className="px-4 py-3">제목</th>
              <th className="px-4 py-3 w-24">상태</th>
              <th className="px-4 py-3 w-24">큐레이션</th>
              <th className="px-4 py-3 w-32">수정일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(items ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink/40">콘텐츠가 없어요.</td></tr>
            )}
            {(items ?? []).map((it) => (
              <tr key={it.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <span className="badge">{it.track === 'case' ? '케이스' : '트렌드'}</span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/contents/${it.id}`} className="font-medium hover:underline">
                    {it.title}
                  </Link>
                  <div className="text-xs text-ink/40 mt-0.5">/{it.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${it.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {it.status === 'published' ? '발행' : it.status === 'draft' ? '초안' : it.status}
                  </span>
                </td>
                <td className="px-4 py-3">{it.curated ? '⭐' : ''}</td>
                <td className="px-4 py-3 text-xs text-ink/50">{formatDate(it.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
