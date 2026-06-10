'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { uploadEbookPdf } from '@/lib/ebook/uploadEbookPdf';

// 기존 상품에 PDF 첨부/교체 (핸드오프 요구사항 3). 목록 행에서 바로 업로드.
// 파일 선택 즉시 업로드 → products.pdf_path 갱신.
export function EbookPdfUpload({
  productId,
  slug,
  pdfPath,
}: {
  productId: string;
  slug: string;
  pdfPath: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(pdfPath);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    setError(null);
    setPending(true);
    try {
      const { pdf_path } = await uploadEbookPdf(file, productId, slug);
      setCurrent(pdf_path);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  const fileName = current ? current.split('/').pop() : null;

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onPick}
      />
      <div className="flex items-center gap-2">
        {current ? (
          <span className="badge bg-green-100 text-green-700" title={fileName ?? ''}>연결됨</span>
        ) : (
          <span className="badge bg-yellow-100 text-yellow-700">미연결</span>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? '업로드 중…' : current ? '교체' : 'PDF 첨부'}
        </Button>
      </div>
      {fileName && <span className="text-xs text-ink/40 truncate max-w-[180px]" title={fileName}>{fileName}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
