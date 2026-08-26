'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// 콘텐츠 목록(/admin/contents) 행 액션 — 보관(soft)·복구·삭제(hard).
// 목록은 contents(case/trend)와 tools(그 외)를 합치므로 대상 테이블을 행마다 넘겨받는다.
// status='archived'는 두 테이블 CHECK 제약에 포함(0001_init.sql).

export function ContentRowActions({
  table,
  id,
  title,
  status,
}: {
  table: 'contents' | 'tools';
  id: string;
  title: string;
  status: string;
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [pending, setPending] = useState(false);

  async function setStatus(next: string) {
    setPending(true);
    const { error } = await supabase.from(table).update({ status: next }).eq('id', id);
    setPending(false);
    if (error) { alert(`상태 변경 실패: ${error.message}`); return; }
    router.refresh();
  }

  async function remove() {
    if (!confirm(`"${title}" 을(를) 영구 삭제할까요? 되돌릴 수 없어요.`)) return;
    setPending(true);
    const { error } = await supabase.from(table).delete().eq('id', id);
    setPending(false);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2 text-xs">
      {status === 'archived' ? (
        <button onClick={() => setStatus('draft')} disabled={pending} className="text-ink/60 hover:underline disabled:opacity-50">복구</button>
      ) : (
        <button onClick={() => setStatus('archived')} disabled={pending} className="text-ink/60 hover:underline disabled:opacity-50">보관</button>
      )}
      <button onClick={remove} disabled={pending} className="text-red-600 hover:underline disabled:opacity-50">삭제</button>
    </div>
  );
}
