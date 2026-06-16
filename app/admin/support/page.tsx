import Link from 'next/link';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';

// /admin/support — 1:1 문의 (D51). 현재 읽기 목록, 답변 폼은 다음 레이어.
type Ticket = {
  id: string;
  subject: string;
  status: 'open' | 'answered' | 'closed';
  replied_at: string | null;
  created_at: string;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: '대기', cls: 'bg-yellow-100 text-yellow-700' },
  answered: { label: '답변완료', cls: 'bg-green-100 text-green-700' },
  closed: { label: '종료', cls: 'bg-muted text-ink/50' },
};

export default async function AdminSupport({
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
    .from('support_tickets')
    .select('id, subject, status, replied_at, created_at')
    .order('created_at', { ascending: false });
  if (sp.status && sp.status in STATUS) q = q.eq('status', sp.status);
  const { data } = await q;
  const tickets = (data ?? []) as Ticket[];

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-4">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">1:1 문의</h1>
        <p className="text-sm text-ink/60 mt-1">사용자 문의 티켓. 대기 중인 문의를 우선 처리하세요.</p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a href="/admin/support" className={`chip ${!sp.status ? 'chip-active' : ''}`}>전체</a>
        {Object.entries(STATUS).map(([k, v]) => (
          <a key={k} href={`/admin/support?status=${k}`} className={`chip ${sp.status === k ? 'chip-active' : ''}`}>{v.label}</a>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3">제목</th>
              <th className="px-4 py-3 w-28">상태</th>
              <th className="px-4 py-3 w-32">접수일</th>
              <th className="px-4 py-3 w-32">답변일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tickets.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-ink/40">문의가 없어요.</td></tr>
            )}
            {tickets.map((t) => {
              const s = STATUS[t.status] ?? { label: t.status, cls: 'badge' };
              return (
                <tr key={t.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/support/${t.id}`} className="hover:underline">{t.subject}</Link>
                  </td>
                  <td className="px-4 py-3"><span className={`badge ${s.cls}`}>{s.label}</span></td>
                  <td className="px-4 py-3 text-xs text-ink/50">{formatDate(t.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-ink/50">{t.replied_at ? formatDate(t.replied_at) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
