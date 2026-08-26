'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// 아카이브에서 씨앗 하나를 작업실 대상으로 채택 — /api/seeds/adopt(POST, admin).
// 채택하면 작업실(/admin/studio) 상단 '채택한 씨앗' 그룹에 상시 노출된다.
export function SeedAdoptButton({ seedId }: { seedId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/seeds/adopt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seedIds: [seedId] }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={run} className="shrink-0">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
      작업실로 채택
    </Button>
  );
}
