import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import { InviteForm } from '@/components/admin/InviteForm';

// /admin/users/invite — editor 초대 (D47). 현재 운영진 목록 + 초대 폼.
type Staff = { id: string; name: string | null; email: string | null; role: string; created_at: string };

export default async function AdminUsersInvite() {
  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, name, email, role, created_at')
    .in('role', ['admin', 'editor'])
    .order('created_at', { ascending: true });
  const staff = (data ?? []) as Staff[];

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">editor 초대</h1>
        <p className="text-sm text-ink/60 mt-1">운영진(admin·editor) 계정 관리. editor는 콘텐츠·자료실 운영만 가능.</p>
      </header>

      <InviteForm />

      <section>
        <h2 className="font-serif text-base font-semibold mb-3">현재 운영진 <span className="text-xs text-ink/40 font-normal">{staff.length}</span></h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">이메일</th>
                <th className="px-4 py-3 w-24">권한</th>
                <th className="px-4 py-3 w-32">가입일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {staff.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-ink/40">운영진이 없어요.</td></tr>
              )}
              {staff.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{s.name ?? '—'}</td>
                  <td className="px-4 py-3 text-ink/70">{s.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${s.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-ink/60'}`}>{s.role}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink/50">{formatDate(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
