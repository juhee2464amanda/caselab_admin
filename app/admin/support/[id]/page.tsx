import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import { SupportReplyForm } from '@/components/admin/SupportReplyForm';

// /admin/support/[id] — 문의 상세 + 답변 발송 (피드백 #2)
type Ticket = {
  id: string;
  subject: string;
  body: string;
  status: 'open' | 'answered' | 'closed';
  reply_body: string | null;
  replied_at: string | null;
  created_at: string;
  user_id: string | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: '대기', cls: 'bg-yellow-100 text-yellow-700' },
  answered: { label: '답변완료', cls: 'bg-green-100 text-green-700' },
  closed: { label: '종료', cls: 'bg-muted text-ink/50' },
};

export default async function AdminSupportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('support_tickets')
    .select('id, subject, body, status, reply_body, replied_at, created_at, user_id')
    .eq('id', id)
    .maybeSingle();
  const ticket = data as Ticket | null;
  if (!ticket) notFound();

  let submitter = '비로그인 문의';
  if (ticket.user_id) {
    const { data: prof } = await supabase.from('profiles').select('name, email').eq('id', ticket.user_id).maybeSingle();
    if (prof) submitter = `${prof.name ?? '이름없음'}${prof.email ? ` (${prof.email})` : ''}`;
  }
  const s = STATUS[ticket.status] ?? { label: ticket.status, cls: 'badge' };

  return (
    <div className="p-4 sm:p-8 max-w-3xl space-y-6">
      <Link href="/admin/support" className="text-sm text-accent hover:underline">← 문의 목록</Link>

      <header>
        <div className="flex items-center gap-2">
          <h1 className="font-serif text-xl sm:text-2xl font-semibold">{ticket.subject}</h1>
          <span className={`badge ${s.cls}`}>{s.label}</span>
        </div>
        <p className="text-sm text-ink/50 mt-1">{submitter} · 접수 {formatDate(ticket.created_at)}</p>
      </header>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-2">문의 내용</h2>
        <div className="card p-4 text-sm whitespace-pre-wrap">{ticket.body}</div>
      </section>

      {ticket.reply_body && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-2">
            보낸 답변 {ticket.replied_at && <span className="font-normal normal-case text-ink/40">· {formatDate(ticket.replied_at)}</span>}
          </h2>
          <div className="card p-4 text-sm whitespace-pre-wrap bg-green-50/40 border-green-200">{ticket.reply_body}</div>
        </section>
      )}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-2">
          {ticket.status === 'answered' ? '추가 답변' : '답변 작성'}
        </h2>
        {ticket.user_id ? (
          <SupportReplyForm ticketId={ticket.id} answered={ticket.status === 'answered'} />
        ) : (
          <p className="text-sm text-ink/40">비로그인 문의는 발송 대상 이메일이 없어 답변 메일을 보낼 수 없어요.</p>
        )}
      </section>
    </div>
  );
}
