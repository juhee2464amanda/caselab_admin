import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';

// /admin/newsletters — 뉴스레터 캠페인 (D53). 현재 읽기 목록, 작성·Brevo 발송은 다음 레이어.
type Campaign = {
  id: string;
  subject: string;
  status: 'draft' | 'sent' | 'failed';
  recipient_count: number | null;
  open_count: number | null;
  click_count: number | null;
  sent_at: string | null;
  created_at: string;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: '초안', cls: 'bg-yellow-100 text-yellow-700' },
  sent: { label: '발송완료', cls: 'bg-green-100 text-green-700' },
  failed: { label: '실패', cls: 'bg-red-100 text-red-700' },
};

function rate(n: number | null, d: number | null): string {
  if (!d) return '—';
  return `${Math.round(((n ?? 0) / d) * 100)}%`;
}

export default async function AdminNewsletters() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('newsletter_campaigns')
    .select('id, subject, status, recipient_count, open_count, click_count, sent_at, created_at')
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as Campaign[];

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">뉴스레터</h1>
        <p className="text-sm text-ink/60 mt-1">캠페인 발송 이력. 작성·세그먼트·Brevo 발송은 추후 추가.</p>
      </header>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3">제목</th>
              <th className="px-4 py-3 w-24">상태</th>
              <th className="px-4 py-3 w-20 text-right">수신자</th>
              <th className="px-4 py-3 w-20 text-right">오픈</th>
              <th className="px-4 py-3 w-20 text-right">클릭</th>
              <th className="px-4 py-3 w-32">발송일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-ink/40">캠페인이 없어요.</td></tr>
            )}
            {rows.map((c) => {
              const s = STATUS[c.status] ?? { label: c.status, cls: 'badge' };
              return (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.subject}</td>
                  <td className="px-4 py-3"><span className={`badge ${s.cls}`}>{s.label}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{(c.recipient_count ?? 0).toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink/60">{rate(c.open_count, c.recipient_count)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink/60">{rate(c.click_count, c.recipient_count)}</td>
                  <td className="px-4 py-3 text-xs text-ink/50">{c.sent_at ? formatDate(c.sent_at) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
