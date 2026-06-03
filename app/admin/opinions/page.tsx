import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';

export default async function AdminOpinions() {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('opinions')
    .select('id, body, email, status, reply_body, replied_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-serif text-xl sm:text-2xl font-semibold mb-6">의견함</h1>
      <ul className="space-y-3">
        {(data ?? []).length === 0 && (
          <li className="card p-10 text-center text-ink/40">받은 의견이 없어요.</li>
        )}
        {(data ?? []).map((o) => (
          <li key={o.id} className="card p-4 sm:p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-2 text-xs">
              <span className="text-ink/50">{o.email ?? '익명'} · {formatDate(o.created_at)}</span>
              <span className={`badge ${o.status === 'new' ? 'bg-yellow-100 text-yellow-700' : o.status === 'replied' ? 'bg-green-100 text-green-700' : ''}`}>
                {o.status}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{o.body}</p>
            {o.reply_body && (
              <div className="mt-3 pl-3 border-l-2 border-accent text-sm text-ink/70">
                <div className="text-xs font-semibold mb-1">답장</div>
                {o.reply_body}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
