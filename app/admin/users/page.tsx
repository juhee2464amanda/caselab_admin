import Link from 'next/link';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

export default async function AdminUsers() {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();
  const { data: users } = await supabase
    .from('profiles')
    .select('id, name, email, job, role, status, onboarded, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">가입자</h1>
        <Link href="/admin/users/invite" className="self-start sm:self-auto">
          <Button variant="accent">editor 초대</Button>
        </Link>
      </header>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3">직무</th>
              <th className="px-4 py-3">권한</th>
              <th className="px-4 py-3">온보딩</th>
              <th className="px-4 py-3">가입일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(users ?? []).map((u) => (
              <tr key={u.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{u.name || '—'}</td>
                <td className="px-4 py-3 text-ink/70">{u.email}</td>
                <td className="px-4 py-3">{u.job ?? ''}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${u.role === 'admin' ? 'bg-accent text-white' : ''}`}>{u.role}</span>
                </td>
                <td className="px-4 py-3 text-xs">{u.onboarded ? '✓' : '—'}</td>
                <td className="px-4 py-3 text-xs text-ink/50">{formatDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
