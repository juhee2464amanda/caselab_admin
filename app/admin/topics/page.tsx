import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';

export default async function AdminTopics() {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('topic_suggestions')
    .select('id, title, description, vote_count, status, created_at')
    .order('vote_count', { ascending: false })
    .limit(100);

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-serif text-xl sm:text-2xl font-semibold mb-6">후보 카드</h1>
      <ul className="space-y-3">
        {(data ?? []).map((t) => (
          <li key={t.id} className="card p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
            <div className="w-12 text-center shrink-0">
              <div className="font-serif text-2xl font-bold">{t.vote_count}</div>
              <div className="text-[10px] text-ink/50 uppercase">votes</div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium">{t.title}</h3>
              {t.description && <p className="text-sm text-ink/60 mt-1">{t.description}</p>}
              <p className="text-xs text-ink/40 mt-1">{formatDate(t.created_at)}</p>
            </div>
            <span className="badge shrink-0">{t.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
