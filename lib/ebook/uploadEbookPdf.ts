// 전자책 PDF 업로드 — 클라이언트에서 서버 route(/api/admin/upload-ebook)로 전달.
// 실제 업로드는 service_role 서버에서 처리(RLS 우회). 본사이트 send-ebook 계약:
// ebooks 버킷 안 오브젝트 키를 products.pdf_path 에 저장한다.

export const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50MB

export type UploadEbookResult = { pdf_path: string };

/** 선택한 PDF 파일을 productId 상품에 연결한다. 성공 시 저장된 pdf_path 반환. */
export async function uploadEbookPdf(
  file: File,
  productId: string,
  slug: string
): Promise<UploadEbookResult> {
  if (file.type !== 'application/pdf') {
    throw new Error('PDF 파일만 업로드할 수 있어요.');
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('파일이 너무 커요. 50MB 이하로 올려주세요.');
  }

  const fd = new FormData();
  fd.append('file', file);
  fd.append('productId', productId);
  fd.append('slug', slug);

  const res = await fetch('/api/admin/upload-ebook', { method: 'POST', body: fd });
  const json = (await res.json().catch(() => ({}))) as { pdf_path?: string; error?: string };
  if (!res.ok || !json.pdf_path) {
    throw new Error(json.error || '업로드에 실패했어요.');
  }
  return { pdf_path: json.pdf_path };
}
