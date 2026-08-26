'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// admin 테스트 발송 버튼 — /api/admin/test-ebook 호출 → purchase_id 받아 status 폴링.
// pdf_path 없는 ebook은 disabled.
export function TestSendButton({ productId, hasPdf }: { productId: string; hasPdf: boolean }) {
  const supabase = createSupabaseBrowserClient();
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  async function poll(purchaseId: string): Promise<'sent' | 'failed' | 'pending'> {
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data } = await supabase.from('purchases').select('status').eq('id', purchaseId).maybeSingle();
      const s = data?.status as string | undefined;
      if (s === 'sent' || s === 'failed') return s;
    }
    return 'pending';
  }

  async function onClick() {
    if (!hasPdf) return;
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/test-ebook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product_id: productId }),
      });
      const json = (await res.json().catch(() => ({}))) as { purchase_id?: string; email?: string; error?: string };
      if (!res.ok || !json.purchase_id) { setMsg({ kind: 'err', text: json.error || '발송 실패' }); return; }

      const result = await poll(json.purchase_id);
      if (result === 'sent') setMsg({ kind: 'ok', text: `발송됨 → ${json.email} (메일함 확인)` });
      else if (result === 'failed') setMsg({ kind: 'err', text: '발송 실패 — Vault 시크릿/SMTP 확인' });
      else setMsg({ kind: 'info', text: '발송 요청됨 — 잠시 후 메일함 확인' });
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending || !hasPdf}
        onClick={onClick}
        title={hasPdf ? '내 이메일로 테스트 발송' : 'PDF 첨부 후 발송 가능'}
      >
        <Send className="h-3.5 w-3.5" /> {pending ? '발송 중…' : '테스트 발송'}
      </Button>
      {msg && (
        <span className={`text-xs ${msg.kind === 'ok' ? 'text-green-600' : msg.kind === 'err' ? 'text-red-600' : 'text-ink/50'}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
