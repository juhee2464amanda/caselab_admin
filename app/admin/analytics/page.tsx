import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export default async function AdminAnalytics() {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();
  const { data: stats } = await supabase.from('admin_stats').select('*').maybeSingle();
  const { data: contentStats } = await supabase
    .from('content_stats')
    .select('*')
    .order('like_count', { ascending: false })
    .limit(20);

  const cards = [
    { label: '총 사용자', value: stats?.total_users ?? 0 },
    { label: '7일 신규', value: stats?.new_users_7d ?? 0 },
    { label: '30일 신규', value: stats?.new_users_30d ?? 0 },
    { label: '발행 콘텐츠', value: stats?.published_contents ?? 0 },
    { label: '총 반응', value: stats?.total_reactions ?? 0 },
    { label: '총 저장', value: stats?.total_saves ?? 0 },
    { label: '의견 (new)', value: stats?.new_opinions ?? 0 },
    { label: '댓글 (visible)', value: stats?.visible_comments ?? 0 },
  ];

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-serif text-xl sm:text-2xl font-semibold mb-6">분석</h1>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="text-xs text-ink/50">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>
      <section>
        <h2 className="font-semibold mb-3">콘텐츠별 메트릭 (TOP 20)</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-4 py-3">제목</th>
                <th className="px-4 py-3 w-20">트랙</th>
                <th className="px-4 py-3 w-20">좋아요</th>
                <th className="px-4 py-3 w-20">저장</th>
                <th className="px-4 py-3 w-20">댓글</th>
                <th className="px-4 py-3 w-20">조회</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(contentStats ?? []).map((s: any) => (
                <tr key={s.content_id}>
                  <td className="px-4 py-3">{s.title}</td>
                  <td className="px-4 py-3 text-xs">{s.track}</td>
                  <td className="px-4 py-3 text-xs">{s.like_count}</td>
                  <td className="px-4 py-3 text-xs">{s.save_count}</td>
                  <td className="px-4 py-3 text-xs">{s.comment_count}</td>
                  <td className="px-4 py-3 text-xs">{s.view_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
