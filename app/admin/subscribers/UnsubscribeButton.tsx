'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/** 수신거부 문의를 운영자가 수동 처리하는 버튼. 트리거가 Brevo까지 전파. */
export function UnsubscribeButton({ kind, id }: { kind: 'member' | 'guest'; id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function unsubscribe() {
    if (!confirm('이 구독자를 해지 처리할까요? (Brevo 수신거부까지 반영)')) return;
    startTransition(async () => {
      setError(false);
      const res = await fetch('/api/admin/subscribers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, id }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={unsubscribe}
      disabled={pending}
      className="text-xs text-ink/40 hover:text-red-600 disabled:opacity-50"
    >
      {error ? '실패 — 재시도' : pending ? '처리 중…' : '해지 처리'}
    </button>
  );
}
