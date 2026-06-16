'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// 피드백 #2 — 1:1 문의 답변 발송. send-support-reply Edge Function(Gmail SMTP) invoke.
export function SupportReplyForm({ ticketId, answered }: { ticketId: string; answered: boolean }) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (!body.trim()) {
      setMsg({ ok: false, text: '답변 내용을 입력하세요.' });
      return;
    }
    if (answered && !confirm('이미 답변한 문의예요. 다시 발송할까요?')) return;
    setPending(true);
    setMsg(null);
    const { data, error } = await supabase.functions.invoke('send-support-reply', {
      body: { ticket_id: ticketId, reply_body: body.trim() },
    });
    setPending(false);
    if (error) {
      let detail = error.message;
      try {
        const j = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
        if (j?.error) detail = j.error;
      } catch {
        /* noop */
      }
      setMsg({ ok: false, text: `발송 실패: ${detail}` });
      return;
    }
    setMsg({ ok: true, text: `답변 메일을 ${data?.sent_to ?? '고객'}에게 발송했어요.` });
    setBody('');
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Textarea
        rows={5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="고객에게 보낼 답변을 작성하세요. (Gmail로 발송됩니다)"
      />
      {msg && <p className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>}
      <div className="flex justify-end">
        <Button variant="accent" onClick={send} disabled={pending}>
          {pending ? '발송 중…' : '답변 메일 발송'}
        </Button>
      </div>
    </div>
  );
}
