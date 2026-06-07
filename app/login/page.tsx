'use client';

import { Suspense, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[80vh] grid place-items-center text-sm text-ink/40">로딩…</div>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/admin';
  const initialNotice = params.get('error') === 'forbidden'
    ? '관리자 권한이 없는 계정입니다.'
    : null;
  const supabase = createSupabaseBrowserClient();

  function loginEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.push(next);
    });
  }

  return (
    <div className="min-h-[80vh] grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center font-serif text-2xl font-bold mb-2">
          케이스랩 관리자
        </div>
        <p className="text-center text-sm text-ink/60 mb-8">
          관리자(admin / editor) 전용 로그인입니다.
        </p>

        {initialNotice && (
          <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {initialNotice}
          </p>
        )}

        <form onSubmit={loginEmail} className="space-y-3">
          <div>
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">비밀번호</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" variant="accent" className="w-full" disabled={pending}>
            로그인
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-ink/50">
          계정이 없으신가요? 운영자에게 계정 발급을 요청해 주세요.
        </p>
      </div>
    </div>
  );
}
