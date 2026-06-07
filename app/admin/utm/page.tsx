import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import { UtmBuilderForm } from '@/components/admin/UtmBuilderForm';

// /admin/utm — UTM 링크 (D25). 현재 생성 이력 목록, Builder 폼은 다음 레이어.
type UtmLink = {
  id: string;
  label: string;
  source: string;
  medium: string;
  campaign: string;
  full_url: string;
  created_at: string;
};

export default async function AdminUtm() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('utm_links')
    .select('id, label, source, medium, campaign, full_url, created_at')
    .order('created_at', { ascending: false });
  const links = (data ?? []) as UtmLink[];

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">유입 (UTM)</h1>
        <p className="text-sm text-ink/60 mt-1">UTM 추적 링크를 만들고 생성 이력을 관리하세요.</p>
      </header>

      <UtmBuilderForm />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3">라벨</th>
              <th className="px-4 py-3 w-28">source</th>
              <th className="px-4 py-3 w-24">medium</th>
              <th className="px-4 py-3 w-32">campaign</th>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3 w-28">생성일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {links.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-ink/40">생성된 UTM 링크가 없어요.</td></tr>
            )}
            {links.map((l) => (
              <tr key={l.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{l.label}</td>
                <td className="px-4 py-3 text-xs">{l.source}</td>
                <td className="px-4 py-3 text-xs">{l.medium}</td>
                <td className="px-4 py-3 text-xs">{l.campaign}</td>
                <td className="px-4 py-3">
                  <a href={l.full_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline break-all">
                    {l.full_url}
                  </a>
                </td>
                <td className="px-4 py-3 text-xs text-ink/50">{formatDate(l.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
