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
  const initialNotice = (() => {
    switch (params.get('error')) {
      case 'forbidden':
        return '이 계정은 관리자 권한이 없습니다. caselab.kr@gmail.com 으로 로그인해 주세요.';
      case 'middleware':
        return '인증 처리 중 오류가 발생했습니다. 다시 시도해 주세요.';
      default:
        return null;
    }
  })();
  const supabase = createSupabaseBrowserClient();

  function loginWithGoogle() {
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) setError(error.message);
    });
  }

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
          관리자 전용 — caselab.kr@gmail.com 구글 계정으로 로그인하세요.
        </p>

        {initialNotice && (
          <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {initialNotice}
          </p>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={loginWithGoogle}
          disabled={pending}
        >
          Google로 로그인
        </Button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <details className="mt-8">
          <summary className="cursor-pointer text-xs text-ink/40 text-center list-none">
            다른 방법으로 로그인 (이메일·비밀번호)
          </summary>
          <form onSubmit={loginEmail} className="space-y-3 mt-4">
            <div>
              <Label htmlFor="email">이메일</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">비밀번호</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" variant="accent" className="w-full" disabled={pending}>
              로그인
            </Button>
          </form>
        </details>
      </div>
    </div>
  );
}
