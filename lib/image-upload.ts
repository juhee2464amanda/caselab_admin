// 관리자 이미지 업로드 공통 유틸 — 여러 편집 표면(ToolPreview·BlockListEditor·ThumbnailField)이 공유한다.
// 드롭 소스가 Finder 파일이면 그대로 업로드, 웹/다른 탭에서 끈 이미지면 URL을 서버가 fetch해 저장(CORS 회피).

async function postUpload(fd: FormData): Promise<string> {
  const res = await fetch('/api/admin/upload-image', { method: 'POST', body: fd });
  const json = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? '업로드 실패');
  return json.url;
}

// 파일 업로드(클릭·끌어놓기·붙여넣기).
export async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  return postUpload(fd);
}

// 웹/다른 탭에서 끈 이미지 주소 → 서버가 fetch해서 우리 스토리지에 저장.
export async function uploadImageFromUrl(url: string): Promise<string> {
  const fd = new FormData();
  fd.append('url', url);
  return postUpload(fd);
}

// 드롭 데이터에서 이미지 추출 — Finder 파일이면 File, 웹/탭에서 끈 이미지면 URL.
export function extractDroppedImage(dt: DataTransfer): { file?: File; url?: string } {
  const file = Array.from(dt.files).find((f) => f.type.startsWith('image/'));
  if (file) return { file };
  const fromList = (dt.getData('text/uri-list') || dt.getData('text/plain'))
    .split(/\s+/)
    .map((s) => s.trim())
    .find((s) => /^https?:\/\//i.test(s));
  if (fromList) return { url: fromList };
  const html = dt.getData('text/html');
  const m = html && html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) return { url: m[1] };
  return {};
}

// 여러 장 드롭/붙여넣기(갤러리)용 — 파일들 + 웹 URL 하나까지 모아서 반환.
export function extractDroppedImages(dt: DataTransfer): { files: File[]; url?: string } {
  const files = Array.from(dt.files).filter((f) => f.type.startsWith('image/'));
  if (files.length) return { files };
  const { url } = extractDroppedImage(dt);
  return { files: [], url };
}
