'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { uploadEbookPdf, MAX_PDF_BYTES } from '@/lib/ebook/uploadEbookPdf';
import { EbookPdfUpload } from '@/components/admin/EbookPdfUpload';

// 피드백 #8-1 — ebook 등록/편집 겸용. products insert/update (읽는 분단위는 body.read_minutes).
// 신규: PDF 업로드는 insert 후 product id로 ebooks 버킷에 올리고 pdf_path 저장 (handoff).
// 편집: 기존 product 행을 initial로 받아 update. PDF는 EbookPdfUpload(교체) 재사용.
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'ebook';
}

export interface ProductRow {
  id?: string;
  slug?: string;
  title?: string;
  price?: number;
  description?: string | null;
  thumbnail_url?: string | null;
  pdf_path?: string | null;
  status?: 'active' | 'archived';
  body?: Record<string, unknown> | null;
}

export function EbookForm({ initial }: { initial?: ProductRow }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const isEdit = !!initial?.id;
  const initialBody = (initial?.body ?? {}) as Record<string, unknown>;

  const [f, setF] = useState({
    title: initial?.title ?? '',
    slug: initial?.slug ?? '',
    price: initial?.price ?? 0,
    read_minutes: Number(initialBody.read_minutes) || 0,
    description: initial?.description ?? '',
    thumbnail_url: initial?.thumbnail_url ?? '',
    status: (initial?.status ?? 'active') as 'active' | 'archived',
  });
  const [slugTouched, setSlugTouched] = useState(isEdit);
  // 상세페이지 본문(toc/intro/stats 등)은 raw JSON으로 보존 편집. read_minutes는 위 친숙 필드가 덮어씀.
  const [bodyJson, setBodyJson] = useState(JSON.stringify(initialBody, null, 2));
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);

  function setTitle(v: string) {
    setF((p) => ({ ...p, title: v, slug: slugTouched ? p.slug : slugify(v) }));
  }

  function syncBody(newJson: string) {
    setBodyJson(newJson);
    try { JSON.parse(newJson || '{}'); setBodyError(null); }
    catch (e) { setBodyError((e as Error).message); }
  }

  function onPickPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file && file.type !== 'application/pdf') { setError('PDF 파일만 올릴 수 있어요.'); e.target.value = ''; return; }
    if (file && file.size > MAX_PDF_BYTES) { setError('파일이 너무 커요. 50MB 이하로 올려주세요.'); e.target.value = ''; return; }
    setError(null);
    setPdf(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.title.trim() || !f.slug.trim()) { setError('제목과 slug는 필수예요.'); return; }
    if (bodyError) { setError('본문 JSON 오류: ' + bodyError); return; }

    let parsedBody: Record<string, unknown>;
    try { parsedBody = JSON.parse(bodyJson || '{}'); }
    catch (e2) { setError('본문 JSON 파싱 실패: ' + (e2 as Error).message); return; }

    setPending(true);
    const payload = {
      title: f.title.trim(),
      slug: f.slug.trim(),
      price: Number(f.price) || 0,
      description: f.description.trim() || null,
      thumbnail_url: f.thumbnail_url.trim() || null,
      type: 'ebook',
      status: f.status,
      // 기존 body 유지 + read_minutes 친숙필드로 덮어쓰기
      body: { ...parsedBody, read_minutes: Number(f.read_minutes) || 0 },
    };

    if (isEdit) {
      const { error: err } = await supabase.from('products').update(payload).eq('id', initial!.id!);
      if (err) { setPending(false); setError(err.message); return; }
      setPending(false);
      router.push('/admin/ebooks');
      router.refresh();
      return;
    }

    // 신규: insert 후 PDF 업로드
    const { data, error: err } = await supabase.from('products').insert(payload).select('id').single();
    if (err || !data) { setPending(false); setError(err?.message ?? '등록에 실패했어요.'); return; }
    if (pdf) {
      try {
        await uploadEbookPdf(pdf, data.id as string, f.slug.trim());
      } catch (uErr) {
        setPending(false);
        setError(`상품은 등록됐지만 PDF 업로드에 실패했어요: ${(uErr as Error).message} — 목록에서 다시 첨부하세요.`);
        return;
      }
    }
    setPending(false);
    router.push('/admin/ebooks');
    router.refresh();
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">썸네일 URL</Label>
          <Input className="mt-1" value={f.thumbnail_url} onChange={(e) => setF((p) => ({ ...p, thumbnail_url: e.target.value }))} placeholder="https://..." />
        </div>
        <div>
          <Label className="text-xs">상태</Label>
          <Select value={f.status} onValueChange={(v) => setF((p) => ({ ...p, status: v as 'active' | 'archived' }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">판매중</SelectItem>
              <SelectItem value="archived">보관</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">설명</Label>
        <Textarea className="mt-1" rows={3} value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} />
      </div>

      <div>
        <Label className="text-xs">상세 본문 (JSON — 목차·소개·통계 등, 선택)</Label>
        <Textarea className="mt-1 font-mono text-xs min-h-[180px]" value={bodyJson} onChange={(e) => syncBody(e.target.value)} />
        {bodyError && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {bodyError}</p>}
        <p className="text-xs text-ink/40 mt-1">읽는 시간은 위 필드가 적용돼요. 그 외 상세페이지 구조(toc/intro/stats 등)는 여기서 편집·보존됩니다.</p>
      </div>

      <div>
        <Label className="text-xs">전자책 PDF</Label>
        {isEdit ? (
          <div className="mt-1"><EbookPdfUpload productId={initial!.id!} slug={f.slug.trim() || initial!.slug || 'ebook'} pdfPath={initial!.pdf_path ?? null} /></div>
        ) : (
          <>
            <Input className="mt-1 cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs" type="file" accept="application/pdf" onChange={onPickPdf} />
            {pdf
              ? <p className="text-xs text-ink/50 mt-1">{pdf.name} · {(pdf.size / 1024 / 1024).toFixed(1)}MB</p>
              : <p className="text-xs text-ink/40 mt-1">구매자에게 자동 발송될 PDF. 지금 안 올려도 목록에서 나중에 첨부할 수 있어요. (최대 50MB)</p>}
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="submit" variant="accent" disabled={pending}>{pending ? '저장 중…' : isEdit ? '변경 저장' : 'ebook 등록'}</Button>
      </div>
    </form>
  );
}
