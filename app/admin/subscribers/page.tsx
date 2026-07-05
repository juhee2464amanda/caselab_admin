import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import { UnsubscribeButton } from './UnsubscribeButton';

export const dynamic = 'force-dynamic';

/**
 * 뉴스레터 구독자 통합 뷰 — 두 수집 경로를 한 화면에서 관리.
 *  - 회원: profiles.newsletter=true (마이페이지 토글로 스스로 해지 가능)
 *  - 구독폼(비로그인): newsletter_subscribers (본가 /unsubscribe 토큰 링크 또는 여기서 수동 해지)
 * 해지 처리는 DB 트리거(본가 0014/0019)가 Brevo blacklist까지 전파한다.
 */

type Row = {
  kind: 'member' | 'guest';
  id: string;
  email: string | null;
  name: string | null;
  source: string;
  status: 'active' | 'pending' | 'unsubscribed';
  created_at: string;
};

const STATUS_LABEL: Record<Row['status'], string> = {
  active: '구독중',
  pending: '확인 대기',
  unsubscribed: '해지',
};

export default async function AdminSubscribers() {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();

  const [guestsRes, membersRes] = await Promise.all([
    supabase
      .from('newsletter_subscribers')
      .select('id, email, name, source, status, consented, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('profiles')
      .select('id, email, name, created_at')
      .eq('newsletter', true)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const rows: Row[] = [
    ...(membersRes.data ?? []).map((p) => ({
      kind: 'member' as const,
      id: p.id,
      email: p.email,
      name: p.name,
      source: '회원 가입/마이페이지',
      status: 'active' as const,
      created_at: p.created_at,
    })),
    ...(guestsRes.data ?? []).map((s) => ({
      kind: 'guest' as const,
      id: s.id,
      email: s.email,
      name: s.name,
      source: `구독폼 (${s.source})`,
      status: (s.status === 'unsubscribed' ? 'unsubscribed' : s.status === 'pending' ? 'pending' : 'active') as Row['status'],
      created_at: s.created_at,
    })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const activeCount = rows.filter((r) => r.status !== 'unsubscribed').length;
  const unsubCount = rows.filter((r) => r.status === 'unsubscribed').length;

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">구독자</h1>
        <p className="mt-1 text-xs text-ink/50">
          수신 대상 <strong className="text-ink">{activeCount}</strong> · 해지 {unsubCount} · 회원{' '}
          {membersRes.data?.length ?? 0} / 구독폼 {guestsRes.data?.length ?? 0}
          {' — '}해지 처리는 Brevo 수신거부(blacklist)까지 자동 반영돼요.
        </p>
      </header>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">경로</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">등록일</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink/40">
                  아직 구독자가 없어요.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{r.email ?? '—'}</td>
                <td className="px-4 py-3 text-ink/70">{r.name || '—'}</td>
                <td className="px-4 py-3 text-xs text-ink/60">{r.source}</td>
                <td className="px-4 py-3">
                  <span
                    className={`badge ${
                      r.status === 'unsubscribed'
                        ? 'text-ink/40'
                        : r.status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-accent text-white'
                    }`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-ink/50">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  {r.status !== 'unsubscribed' && <UnsubscribeButton kind={r.kind} id={r.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
