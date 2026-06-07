import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';

// /admin/history — 감사 로그 (D44/D45). audit_logs 최근 100건 timeline.
type Audit = {
  id: string;
  actor_type: 'user' | 'system';
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

const ENTITY_LABEL: Record<string, string> = {
  content: '콘텐츠', tool: '자료실', comment: '댓글', opinion: '의견', profile: '프로필',
  category: '카테고리', tag: '태그', topic_suggestion: '후보 카드', featured_content: '큐레이션',
  purchase: '구매', faq: 'FAQ', support_ticket: '문의', newsletter_campaign: '뉴스레터',
};
const ACTION_VERB: Record<string, string> = { create: '생성', update: '수정', delete: '삭제' };

function describe(a: Audit): string {
  const ent = ENTITY_LABEL[a.entity_type] ?? a.entity_type;
  const verb = ACTION_VERB[a.action_type.split('.').pop() ?? ''] ?? a.action_type;
  return `${ent} ${verb}`;
}

export default async function AdminHistory() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('audit_logs')
    .select('id, actor_type, action_type, entity_type, entity_id, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = (data ?? []) as Audit[];

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">History</h1>
        <p className="text-sm text-ink/60 mt-1">운영 변경 이력 (최근 100건). 핵심 테이블의 생성·수정·삭제 자동 기록.</p>
      </header>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3 w-40">시각</th>
              <th className="px-4 py-3 w-20">주체</th>
              <th className="px-4 py-3">동작</th>
              <th className="px-4 py-3">action_type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-ink/40">기록이 없어요.</td></tr>
            )}
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 text-xs text-ink/50">{formatDate(a.created_at)}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${a.actor_type === 'system' ? 'bg-muted text-ink/50' : 'bg-blue-100 text-blue-700'}`}>
                    {a.actor_type === 'system' ? '시스템' : '운영자'}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{describe(a)}</td>
                <td className="px-4 py-3 text-xs text-ink/40 font-mono">{a.action_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
