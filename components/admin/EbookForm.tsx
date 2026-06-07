'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// 피드백 #8-1 — ebook 등록. products insert (읽는 분단위는 body.read_minutes).
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'ebook';
}

export function EbookForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [f, setF] = useState({ title: '', slug: '', price: 0, read_minutes: 0, description: '', thumbnail_url: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setTitle(v: string) {
    setF((p) => ({ ...p, title: v, slug: slugTouched ? p.slug : slugify(v) }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.title.trim() || !f.slug.trim()) { setError('제목과 slug는 필수예요.'); return; }
    setPending(true);
    const { data, error: err } = await supabase.from('products').insert({
      title: f.title.trim(),
      slug: f.slug.trim(),
      price: Number(f.price) || 0,
      description: f.description.trim() || null,
      thumbnail_url: f.thumbnail_url.trim() || null,
      type: 'ebook',
      status: 'active',
      body: { read_minutes: Number(f.read_minutes) || 0 },
    }).select('id').single();
    setPending(false);
    if (err) { setError(err.message); return; }
    router.push('/admin/ebooks');
    router.refresh();
    void data;
  }

  return (
    <form onSubmit={onSubmit} className="card p-5 space-y-3 max-w-2xl">
      <div>
        <Label className="text-xs">제목 *</Label>
        <Input className="mt-1" value={f.title} onChange={(e) => setTitle(e.target.value)} placeholder="AI 실전 활용 전자책" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">slug *</Label>
          <Input className="mt-1" value={f.slug} onChange={(e) => { setSlugTouched(true); setF((p) => ({ ...p, slug: e.target.value })); }} />
        </div>
        <div>
          <Label className="text-xs">가격 (원)</Label>
          <Input className="mt-1" type="number" value={f.price} onChange={(e) => setF((p) => ({ ...p, price: Number(e.target.value) }))} />
        </div>
        <div>
          <Label className="text-xs">읽는 시간 (분)</Label>
          <Input className="mt-1" type="number" value={f.read_minutes} onChange={(e) => setF((p) => ({ ...p, read_minutes: Number(e.target.value) }))} />
        </div>
      </div>
      <div>
        <Label className="text-xs">썸네일 URL</Label>
        <Input className="mt-1" value={f.thumbnail_url} onChange={(e) => setF((p) => ({ ...p, thumbnail_url: e.target.value }))} placeholder="https://..." />
      </div>
      <div>
        <Label className="text-xs">설명</Label>
        <Textarea className="mt-1" rows={3} value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="submit" variant="accent" disabled={pending}>{pending ? '등록 중…' : 'ebook 등록'}</Button>
      </div>
    </form>
  );
}
