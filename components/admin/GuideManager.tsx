'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// 피드백 #7 — 공식 가이드 관리. tools(category='guide'). 분류는 job_tags[0]에 저장.
export type Guide = {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
  status: string;
  job_tags: string[] | null;
};

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'guide';
}

const EMPTY = { name: '', url: '', description: '', category: '' };

export function GuideManager({ initial }: { initial: Guide[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() { setEditId(null); setF(EMPTY); setError(null); }
  function startEdit(g: Guide) {
    setEditId(g.id);
    setF({ name: g.name, url: g.url ?? '', description: g.description ?? '', category: g.job_tags?.[0] ?? '' });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.name.trim() || !f.url.trim()) { setError('이름과 링크는 필수예요.'); return; }
    setPending(true);
    const payload = {
      name: f.name.trim(),
      url: f.url.trim(),
      description: f.description.trim() || null,
      job_tags: f.category.trim() ? [f.category.trim()] : [],
    };
    let err;
    if (editId) {
      ({ error: err } = await supabase.from('tools').update(payload).eq('id', editId));
    } else {
      const slug = `${slugify(f.name)}-${(globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`).slice(0, 4)}`;
      ({ error: err } = await supabase.from('tools').insert({ ...payload, slug, category: 'guide', status: 'published' }));
    }
    setPending(false);
    if (err) { setError(err.message); return; }
    reset();
    router.refresh();
  }

  async function togglePublish(g: Guide) {
    await supabase.from('tools').update({ status: g.status === 'published' ? 'draft' : 'published' }).eq('id', g.id);
    router.refresh();
  }
  async function remove(g: Guide) {
    if (!confirm(`"${g.name}" 삭제할까요?`)) return;
    await supabase.from('tools').delete().eq('id', g.id);
    if (editId === g.id) reset();
    router.refresh();
  }

  // 분류별 그룹
  const groups = new Map<string, Guide[]>();
  for (const g of initial) {
    const cat = g.job_tags?.[0] ?? '미분류';
    groups.set(cat, [...(groups.get(cat) ?? []), g]);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="card p-5 space-y-3">
        <div className="text-sm font-semibold">{editId ? '가이드 수정' : '공식 가이드 추가'}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">이름 *</Label><Input className="mt-1" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} placeholder="OpenAI Prompt Engineering Guide" /></div>
          <div><Label className="text-xs">분류</Label><Input className="mt-1" value={f.category} onChange={(e) => setF((p) => ({ ...p, category: e.target.value }))} placeholder="OpenAI / Anthropic / Google …" /></div>
        </div>
        <div><Label className="text-xs">링크 (URL) *</Label><Input className="mt-1" value={f.url} onChange={(e) => setF((p) => ({ ...p, url: e.target.value }))} placeholder="https://platform.openai.com/docs/..." /></div>
        <div><Label className="text-xs">설명</Label><Textarea className="mt-1" rows={2} value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} /></div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          {editId && <Button type="button" variant="outline" onClick={reset}>취소</Button>}
          <Button type="submit" variant="accent" disabled={pending}>{pending ? '저장 중…' : editId ? '수정 저장' : '추가'}</Button>
        </div>
      </form>

      {[...groups.entries()].map(([cat, items]) => (
        <section key={cat}>
          <h2 className="font-serif text-base font-semibold mb-3">{cat} <span className="text-xs text-ink/40 font-normal">{items.length}</span></h2>
          <div className="card divide-y divide-border">
            {items.map((g) => (
              <div key={g.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <a href={g.url ?? '#'} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">{g.name}</a>
                  {g.description && <p className="text-sm text-ink/60 mt-0.5">{g.description}</p>}
                  <p className="text-xs text-ink/40 mt-0.5 break-all">{g.url}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  <span className={`badge ${g.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{g.status === 'published' ? '발행' : '비공개'}</span>
                  <button onClick={() => startEdit(g)} className="text-accent hover:underline">수정</button>
                  <button onClick={() => togglePublish(g)} className="text-ink/60 hover:underline">{g.status === 'published' ? '비공개' : '발행'}</button>
                  <button onClick={() => remove(g)} className="text-red-600 hover:underline">삭제</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {initial.length === 0 && <p className="text-sm text-ink/40">등록된 가이드가 없어요.</p>}
    </div>
  );
}
