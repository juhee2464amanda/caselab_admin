'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// 초안(draft) 삭제 — 잘못 저장한 뉴스레터 정리용. 발송완료(sent)는 삭제 버튼 미노출.
export function NewsletterDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (!confirm('이 초안을 삭제할까요?')) return;
    setPending(true);
    const { error } = await supabase.from('newsletter_campaigns').delete().eq('id', id);
    setPending(false);
    if (error) { alert('삭제 실패: ' + error.message); return; }
    router.refresh();
  }

  return (
    <button type="button" onClick={onDelete} disabled={pending}
      className="text-ink/40 hover:text-red-600 disabled:opacity-40" title="초안 삭제">
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
