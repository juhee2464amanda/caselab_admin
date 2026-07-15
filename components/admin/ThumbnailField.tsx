'use client';

import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ImageZoom } from '@/components/admin/ImageZoom';
import { uploadImageFile, uploadImageFromUrl, extractDroppedImage } from '@/lib/image-upload';

// 콘텐츠 썸네일 등록 — 이미지 업로드(공개 버킷) 또는 URL 직접 입력.
// 자유 URL 입력만 있던 시절 "fable5prompt" 같은 잘못된 값이 들어가 홈 히어로가 깨지던 문제 방지용.
export function ThumbnailField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const { file, url } = extractDroppedImage(e.dataTransfer);
    if (file) void upload(file);
    else if (url) void run(() => uploadImageFromUrl(url));
    else setErr('이미지 파일이나 이미지를 끌어놓아 주세요.');
  }
  function onPaste(e: React.ClipboardEvent) {
    const f = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'))?.getAsFile();
    if (f) {
      e.preventDefault();
      void upload(f);
    }
  }

  async function run(fn: () => Promise<string>) {
    setUploading(true);
    setErr(null);
    try {
      setBroken(false);
      onChange(await fn());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  function upload(file: File) {
    return run(() => uploadImageFile(file));
  }

  return (
    <div>
      <Label className="text-xs">썸네일</Label>
      <p className="text-[11px] text-ink/40 mt-0.5">홈 히어로·카드에 노출돼요. 이미지를 끌어놓거나, 올리거나, 이미지 URL을 붙여넣으세요.</p>
      <div className="mt-1.5 flex items-start gap-3" onPaste={onPaste}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          title={value ? '이미지 클릭 = 확대 · 끌어놓기 = 교체' : '클릭 또는 이미지 끌어놓기'}
          className={cn(
            'w-24 h-16 rounded-md border overflow-hidden shrink-0 flex items-center justify-center transition-colors',
            dragOver ? 'border-accent border-dashed bg-accent/10' : 'border-border bg-muted hover:border-ink/30',
          )}
        >
          {value && !broken ? (
            <ImageZoom src={value} alt="" onError={() => setBroken(true)} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] text-ink/30 px-1 text-center leading-tight">{dragOver ? '여기에 놓기' : value ? '깨진 URL' : '끌어놓기'}</span>
          )}
        </button>
        <div className="flex-1 space-y-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-xs rounded-md border border-border px-2.5 py-1.5 hover:bg-muted disabled:opacity-50"
          >
            <UploadCloud className="h-3.5 w-3.5" /> {uploading ? '업로드 중…' : '이미지 업로드'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
          <Input
            className="h-8 text-xs"
            value={value}
            placeholder="또는 이미지 URL"
            onChange={(e) => {
              setBroken(false);
              onChange(e.target.value);
            }}
          />
          {value && (
            <button type="button" onClick={() => onChange('')} className="text-[11px] text-red-600 hover:underline">
              제거
            </button>
          )}
        </div>
      </div>
      {err && <p className="text-[11px] text-red-600 mt-1">{err}</p>}
    </div>
  );
}
