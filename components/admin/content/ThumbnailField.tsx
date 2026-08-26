'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Sparkles, UploadCloud } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ImageZoom } from '@/components/admin/content/ImageZoom';
import { uploadImageFile, uploadImageFromUrl, extractDroppedImage } from '@/lib/images/image-upload';
import { COVER_ART_OPTIONS, COVER_ART_PRIMARY } from '@/lib/cardpress/convert';

// 썸네일 입력 동작(업로드·끌어놓기·붙여넣기) 공통 로직.
// 설정 패널의 ThumbnailField와 발행 레일의 ThumbnailDropzone이 둘 다 이걸 쓰고
// 같은 thumbnail_url state에 물려 있어서, 어느 쪽에 넣든 반대쪽에도 그대로 반영된다.
function useThumbnailUpload(value: string, onChange: (url: string) => void) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // 값이 바뀌면(다른 입력 표면에서 넣었을 때 포함) 깨짐 표시를 초기화 — 새 URL은 다시 시도해야 한다.
  useEffect(() => setBroken(false), [value]);

  async function run(fn: () => Promise<string>) {
    setUploading(true);
    setErr(null);
    try {
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

  return {
    fileRef,
    uploading,
    err,
    setErr,
    broken,
    setBroken,
    dragOver,
    upload,
    run,
    onPaste,
    openPicker: () => fileRef.current?.click(),
    // 드롭 대상 엘리먼트에 그대로 펼쳐 쓰는 핸들러 묶음
    dropProps: {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
      },
      onDragLeave: () => setDragOver(false),
      onDrop,
    },
  };
}

// 드롭존 클릭 시 열리는 숨은 파일 입력 — 같은 파일 재선택도 되도록 value를 매번 비운다.
function HiddenFileInput({ inputRef, onFile }: { inputRef: React.RefObject<HTMLInputElement>; onFile: (f: File) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = '';
      }}
    />
  );
}

// 카드뉴스 커버와 같은 규격(v3)으로 16:9 썸네일을 만든다.
// 본가 카드가 썸네일을 16:9로 크롭하기 때문에 세로 커버를 그대로 쓰면 헤드라인이 잘린다
// (components/content/RelatedCarousel.tsx) — 그래서 전용 프리셋으로 뽑아 버킷에 올린다.
function ThumbnailMaker({ suggestTitle, onDone }: { suggestTitle?: string; onDone: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [eyebrow, setEyebrow] = useState('');
  const [title, setTitle] = useState(suggestTitle ?? '');
  const [hl, setHl] = useState('');
  const [art, setArt] = useState('iri');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const lines = title.split('\n').filter(Boolean).length;

  async function make() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/cardpress/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          size: '16x9',
          template: 'C1',
          accent: 'cat-case',
          props: {
            coverLayout: 'v3',
            coverArt: art,
            kicker: eyebrow || undefined,
            title: title.trim(),
            hl: hl.trim() || undefined,
          },
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const blob = await res.blob();
      const url = await uploadImageFile(new File([blob], `thumb-${Date.now()}.png`, { type: 'image/png' }));
      onDone(url);
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs rounded-md border border-border px-2.5 py-1.5 hover:bg-muted"
      >
        <Sparkles className="h-3.5 w-3.5" /> 썸네일 만들기
      </button>
    );

  return (
    <div className="rounded-md border border-border p-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold">썸네일 만들기 · 카드 규격(16:9)</span>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-ink/40 hover:underline">
          닫기
        </button>
      </div>
      <Input className="h-7 text-xs" value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} placeholder="윗줄 (예: 맥 전용 유틸)" />
      <textarea
        className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs"
        rows={2}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={'제목 2줄 (엔터로 줄바꿈)\n첫 줄이 상황, 둘째 줄이 결론'}
      />
      <div className="flex items-center gap-1.5">
        <Input className="h-7 text-xs" value={hl} onChange={(e) => setHl(e.target.value)} placeholder="형광펜 단어" />
        <select
          value={art}
          onChange={(e) => setArt(e.target.value)}
          className="h-7 rounded-md border border-border bg-transparent px-1 text-xs"
        >
          {/* 여기엔 이미지 입력이 없어서 사진 아트는 제외 — 나머지는 카드뉴스와 같은 기본 5종 */}
          {COVER_ART_OPTIONS.filter((o) => COVER_ART_PRIMARY.includes(o.value) && o.value !== 'photo').map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {lines > 2 && <p className="text-[11px] text-amber-600">3줄 이상이면 작게 줄였을 때 마지막 줄이 먼저 죽습니다.</p>}
      <button
        type="button"
        disabled={busy || !title.trim()}
        onClick={make}
        className="w-full rounded-md bg-accent px-2 py-1.5 text-xs text-white disabled:opacity-50"
      >
        {busy ? '만드는 중…' : '만들어서 썸네일에 넣기'}
      </button>
      {err && <p className="text-[11px] text-red-600">{err}</p>}
    </div>
  );
}

// 콘텐츠 썸네일 등록 — 이미지 업로드(공개 버킷) 또는 URL 직접 입력.
// 자유 URL 입력만 있던 시절 "fable5prompt" 같은 잘못된 값이 들어가 홈 히어로가 깨지던 문제 방지용.
export function ThumbnailField({
  value,
  onChange,
  suggestTitle,
}: {
  value: string;
  onChange: (url: string) => void;
  /** 있으면 "썸네일 만들기" 패널의 제목 칸을 미리 채운다 */
  suggestTitle?: string;
}) {
  const t = useThumbnailUpload(value, onChange);

  return (
    <div>
      <Label className="text-xs">썸네일</Label>
      <p className="text-[11px] text-ink/40 mt-0.5">홈 히어로·카드에 노출돼요. 이미지를 끌어놓거나, 올리거나, 이미지 URL을 붙여넣으세요.</p>
      <div className="mt-1.5 flex items-start gap-3" onPaste={t.onPaste}>
        <button
          type="button"
          onClick={t.openPicker}
          {...t.dropProps}
          title={value ? '이미지 클릭 = 확대 · 끌어놓기 = 교체' : '클릭 또는 이미지 끌어놓기'}
          className={cn(
            'w-24 h-16 rounded-md border overflow-hidden shrink-0 flex items-center justify-center transition-colors',
            t.dragOver ? 'border-accent border-dashed bg-accent/10' : 'border-border bg-muted hover:border-ink/30',
          )}
        >
          {value && !t.broken ? (
            <ImageZoom src={value} alt="" onError={() => t.setBroken(true)} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] text-ink/30 px-1 text-center leading-tight">{t.dragOver ? '여기에 놓기' : value ? '깨진 URL' : '끌어놓기'}</span>
          )}
        </button>
        <div className="flex-1 space-y-1.5">
          <button
            type="button"
            onClick={t.openPicker}
            disabled={t.uploading}
            className="inline-flex items-center gap-1.5 text-xs rounded-md border border-border px-2.5 py-1.5 hover:bg-muted disabled:opacity-50"
          >
            <UploadCloud className="h-3.5 w-3.5" /> {t.uploading ? '업로드 중…' : '이미지 업로드'}
          </button>
          <HiddenFileInput inputRef={t.fileRef} onFile={t.upload} />
          <Input
            className="h-8 text-xs"
            value={value}
            placeholder="또는 이미지 URL"
            onChange={(e) => onChange(e.target.value)}
          />
          <ThumbnailMaker suggestTitle={suggestTitle} onDone={onChange} />
          {value && (
            <button type="button" onClick={() => onChange('')} className="text-[11px] text-red-600 hover:underline">
              제거
            </button>
          )}
        </div>
      </div>
      {t.err && <p className="text-[11px] text-red-600 mt-1">{t.err}</p>}
    </div>
  );
}

// 발행 준비 레일용 압축형 드롭존 — 설정 패널을 펼치지 않아도 여기에 끌어놓으면 바로 썸네일이 채워진다.
// ok를 주면 레일의 다른 필수 항목처럼 체크/경고 아이콘으로 게이트 상태를 같이 보여준다.
export function ThumbnailDropzone({
  value,
  onChange,
  ok,
}: {
  value: string;
  onChange: (url: string) => void;
  ok?: boolean;
}) {
  const t = useThumbnailUpload(value, onChange);
  const missing = ok === false;
  const hint = t.uploading
    ? '업로드 중…'
    : t.dragOver
      ? '여기에 놓기'
      : t.broken
        ? '깨진 URL — 다시 올려주세요'
        : value
          ? '등록됨 · 클릭하면 교체'
          : '끌어놓거나 클릭해서 올리기';

  return (
    <div className="mb-4" onPaste={t.onPaste}>
      <button
        type="button"
        onClick={t.openPicker}
        {...t.dropProps}
        title={value ? '클릭 = 교체 · 이미지 클릭 = 확대' : '클릭 또는 이미지 끌어놓기'}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg border border-dashed p-2 text-left transition-colors',
          t.dragOver
            ? 'border-accent bg-accent/10'
            : cn('hover:border-ink/30 hover:bg-muted/50', missing ? 'border-red-300 bg-red-500/[0.03]' : 'border-border'),
        )}
      >
        <span className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {value && !t.broken ? (
            <ImageZoom src={value} alt="" onError={() => t.setBroken(true)} className="h-full w-full object-cover" />
          ) : (
            <UploadCloud className={cn('h-4 w-4', missing ? 'text-red-400' : 'text-ink/30')} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-xs">
            {ok !== undefined &&
              (ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
              ))}
            <span className={cn('font-medium', missing && 'text-red-600')}>썸네일</span>
          </span>
          <span className={cn('mt-0.5 block truncate text-[11px]', t.broken ? 'text-red-600' : 'text-ink/45')}>{hint}</span>
        </span>
      </button>
      <HiddenFileInput inputRef={t.fileRef} onFile={t.upload} />
      {t.err && <p className="mt-1 text-[11px] text-red-600">{t.err}</p>}
    </div>
  );
}
