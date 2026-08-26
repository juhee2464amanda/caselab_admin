'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// 아카이브 수동 정리 — /api/seeds/purge(POST, admin). Vercel Cron이 매일 자동 실행하지만
// 지금 바로 정리하고 싶을 때(또는 로컬 검증) 쓴다.
export function SeedPurgeButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    if (!confirm('오래됐거나 상한을 넘은 미사용 씨앗을 삭제할까요? (콘텐츠가 된 씨앗은 보존)')) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/seeds/purge', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '정리 실패');
      setMsg(`정리됨 · 기간 ${json.deletedByAge ?? 0} + 용량 ${json.deletedByCapacity ?? 0}건`);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={run}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        지금 정리
      </Button>
      {msg && <span className="text-xs text-ink/50">{msg}</span>}
    </div>
  );
}
