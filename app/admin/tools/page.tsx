import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

export default async function AdminTools() {
  if (!isSupabaseConfigured()) return <div className="p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('tools')
    .select('id, slug, name, category, status, pricing_tier, updated_at')
    .order('updated_at', { ascending: false });

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">자료실 (tools/prompts/guides/맥락 카드)</h1>
        <Button asChild variant="accent" className="self-start sm:self-auto">
          <Link href="/admin/tools/new">
            <Plus className="h-4 w-4" /> 새 자료
          </Link>
        </Button>
      </header>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3 w-32">카테고리</th>
              <th className="px-4 py-3 w-24">가격</th>
              <th className="px-4 py-3 w-24">상태</th>
              <th className="px-4 py-3 w-32">수정일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data ?? []).map((t) => (
              <tr key={t.id} className="hover:bg-muted/40">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/admin/tools/${t.id}`} className="block">
                    {t.name}
                    <div className="text-xs text-ink/40">/{t.slug}</div>
                  </Link>
                </td>
                <td className="px-4 py-3"><span className="badge">{t.category}</span></td>
                <td className="px-4 py-3 text-xs">{t.pricing_tier}</td>
                <td className="px-4 py-3"><span className="badge">{t.status}</span></td>
                <td className="px-4 py-3 text-xs text-ink/50">{formatDate(t.updated_at)}</td>
              </tr>
            ))}
            {!data?.length && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-ink/40">
                  아직 등록된 자료가 없어요. 우상단 "새 자료"로 시작하세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
