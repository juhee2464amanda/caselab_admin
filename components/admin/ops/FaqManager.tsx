'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';

// D51 — FAQ CRUD. 추가·수정·삭제·발행 토글.
export type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  sort_order: number;
  is_published: boolean;
  updated_at: string;
};

const EMPTY = { question: '', answer: '', category: '', sort_order: 0 };

export function FaqManager({ initial }: { initial: Faq[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<{ question: string; answer: string; category: string; sort_order: number }>(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(item: Faq) {
    setEditId(item.id);
    setF({ question: item.question, answer: item.answer, category: item.category ?? '', sort_order: item.sort_order });
    setError(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() {
    setEditId(null);
    setF(EMPTY);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.question.trim() || !f.answer.trim()) {
      setError('질문과 답변은 필수예요.');
      return;
    }
    setPending(true);
    const payload = {
      question: f.question.trim(),
      answer: f.answer.trim(),
      category: f.category.trim() || null,
      sort_order: Number(f.sort_order) || 0,
    };
    let err;
    if (editId) {
      ({ error: err } = await supabase.from('faqs').update(payload).eq('id', editId));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error: err } = await supabase.from('faqs').insert({ ...payload, created_by: user?.id ?? null }));
    }
    setPending(false);
    if (err) { setError(err.message); return; }
    reset();
    router.refresh();
  }

  async function togglePublish(item: Faq) {
    await supabase.from('faqs').update({ is_published: !item.is_published }).eq('id', item.id);
    router.refresh();
  }
  async function remove(item: Faq) {
    if (!confirm(`"${item.question}" 삭제할까요?`)) return;
    await supabase.from('faqs').delete().eq('id', item.id);
    if (editId === item.id) reset();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* 추가/수정 폼 */}
      <form onSubmit={onSubmit} className="card p-5 space-y-3">
        <div className="text-sm font-semibold">{editId ? 'FAQ 수정' : '새 FAQ 추가'}</div>
        <div>
          <Label className="text-xs">질문 *</Label>
          <Input className="mt-1" value={f.question} onChange={(e) => setF((p) => ({ ...p, question: e.target.value }))} placeholder="환불은 어떻게 하나요?" />
        </div>
        <div>
          <Label className="text-xs">답변 *</Label>
          <Textarea className="mt-1" rows={4} value={f.answer} onChange={(e) => setF((p) => ({ ...p, answer: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">카테고리</Label>
            <Input className="mt-1" value={f.category} onChange={(e) => setF((p) => ({ ...p, category: e.target.value }))} placeholder="결제 / 콘텐츠 / 계정 / 기타" />
          </div>
          <div>
            <Label className="text-xs">정렬 순서</Label>
            <Input className="mt-1" type="number" value={f.sort_order} onChange={(e) => setF((p) => ({ ...p, sort_order: Number(e.target.value) }))} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          {editId && <Button type="button" variant="outline" onClick={reset}>취소</Button>}
          <Button type="submit" variant="accent" disabled={pending}>{pending ? '저장 중…' : editId ? '수정 저장' : '추가'}</Button>
        </div>
      </form>

      {/* 목록 */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3 w-14 text-right">순서</th>
              <th className="px-4 py-3">질문</th>
              <th className="px-4 py-3 w-24">카테고리</th>
              <th className="px-4 py-3 w-20">상태</th>
              <th className="px-4 py-3 w-40">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {initial.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink/40">등록된 FAQ가 없어요.</td></tr>
            )}
            {initial.map((item) => (
              <tr key={item.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 text-right tabular-nums text-ink/50">{item.sort_order}</td>
                <td className="px-4 py-3 font-medium">{item.question}</td>
                <td className="px-4 py-3">{item.category ? <span className="badge">{item.category}</span> : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${item.is_published ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {item.is_published ? '발행' : '비공개'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5 text-xs">
                    <button onClick={() => startEdit(item)} className="text-accent hover:underline">수정</button>
                    <span className="text-ink/20">·</span>
                    <button onClick={() => togglePublish(item)} className="text-ink/60 hover:underline">{item.is_published ? '비공개' : '발행'}</button>
                    <span className="text-ink/20">·</span>
                    <button onClick={() => remove(item)} className="text-red-600 hover:underline">삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
