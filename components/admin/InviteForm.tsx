'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// D47 — editor 초대 폼. /api/admin/invite 호출.
export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setPending(true);
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: json.error ?? '초대에 실패했어요.' });
      } else {
        setMsg({ ok: true, text: `${json.email} 님에게 초대 메일을 보냈어요. (role: editor)` });
        setEmail('');
        setName('');
        router.refresh();
      }
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-5 space-y-3">
      <div className="text-sm font-semibold">editor 초대</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">이메일 *</Label>
          <Input className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="editor@example.com" required />
        </div>
        <div>
          <Label className="text-xs">이름 (선택)</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="김에디터" />
        </div>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="accent" disabled={pending}>{pending ? '초대 중…' : '초대 메일 보내기'}</Button>
      </div>
      <p className="text-[11px] text-ink/40">초대 메일 발송은 Supabase Auth SMTP 설정에 의존합니다. 미설정 시 실패할 수 있어요.</p>
    </form>
  );
}
