'use client';

import { useRef, useState } from 'react';
import { ArrowUpRight, Copy, Check, ExternalLink, Upload, Loader2, Trash2, Plus } from 'lucide-react';
import { ToolBodySchema, type ToolBody } from '@/lib/tool-body';
import { Editable } from '@/components/admin/Editable';
import { ImageZoom } from '@/components/admin/ImageZoom';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { uploadImageFile, uploadImageFromUrl, extractDroppedImage } from '@/lib/image-upload';

type FeatureImage = { url: string; caption?: string };

// 기능 이미지 편집 — 업로드(클릭)·끌어놓기·붙여넣기(⌘V)·URL 직접 입력·캡션·삭제.
// ToolBody feature.image 계약({url, caption?})만 다룬다(strict 스키마라 size/align 넣으면 발행 차단됨).
function FeatureImageField({ image, onChange }: { image?: FeatureImage; onChange: (img: FeatureImage | undefined) => void }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const commit = async (fn: () => Promise<string>) => {
    setUploading(true);
    setErr(null);
    try {
      onChange({ url: await fn(), caption: image?.caption });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  const up = (file: File) => commit(() => uploadImageFile(file));

  const onPaste = (e: React.ClipboardEvent) => {
    const f = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'))?.getAsFile();
    if (f) {
      e.preventDefault();
      up(f);
    }
  };

  return (
    <div className="mt-3 space-y-2" onPaste={onPaste}>
      {image?.url ? (
        <>
          <figure className="overflow-hidden rounded-xl border border-border bg-muted">
            <ImageZoom src={image.url} alt={image.caption ?? ''} className="block w-full" />
          </figure>
          <div className="flex items-center gap-2">
            <Input
              value={image.caption ?? ''}
              placeholder="캡션 (선택)"
              onChange={(e) => onChange({ url: image.url, caption: e.target.value || undefined })}
              className="h-8 text-xs"
            />
            <button type="button" onClick={() => fileRef.current?.click()} className="shrink-0 text-xs font-semibold text-accent hover:underline">교체</button>
            <button type="button" onClick={() => onChange(undefined)} className="shrink-0 text-xs text-red-500 hover:underline">삭제</button>
          </div>
        </>
      ) : (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const { file, url } = extractDroppedImage(e.dataTransfer);
            if (file) up(file);
            else if (url) commit(() => uploadImageFromUrl(url));
            else setErr('이미지 파일이나 이미지를 끌어놓아 주세요.');
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center text-xs transition-colors',
            dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-ink/30',
          )}
        >
          {uploading ? (
            <><Loader2 className="h-4 w-4 animate-spin text-ink/40" /> 업로드 중…</>
          ) : (
            <>
              <Upload className="h-4 w-4 text-ink/40" />
              <span className="text-ink/60">이미지 끌어놓기·클릭·붙여넣기(⌘V)</span>
            </>
          )}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) up(f); }}
      />
      <Input value={image?.url ?? ''} placeholder="또는 이미지 URL 직접 붙여넣기" onChange={(e) => onChange(e.target.value ? { url: e.target.value, caption: image?.caption } : undefined)} className="h-8 text-xs" />
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

// 히어로 썸네일 편집 — 16:10 박스 자체가 드롭존. 끌어놓기·클릭·붙여넣기(⌘V).
// thumbnail_url은 body가 아니라 폼 상태라 onPatch({ thumbnailUrl })로 커밋한다.
function HeroThumbnailField({
  url,
  emoji,
  name,
  onCommit,
}: {
  url?: string | null;
  emoji?: string | null;
  name: string;
  onCommit: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<string>) => {
    setUploading(true);
    setErr(null);
    try {
      onCommit(await fn());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const { file, url: dropped } = extractDroppedImage(e.dataTransfer);
    if (file) run(() => uploadImageFile(file));
    else if (dropped) run(() => uploadImageFromUrl(dropped));
    else setErr('이미지 파일이나 이미지를 끌어놓아 주세요.');
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const f = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'))?.getAsFile();
    if (f) {
      e.preventDefault();
      run(() => uploadImageFile(f));
    }
  };

  return (
    <div className="space-y-1.5">
      <div
        onPaste={onPaste}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'group relative aspect-[16/10] overflow-hidden rounded-2xl border bg-muted outline-none transition-colors',
          dragOver ? 'border-accent ring-2 ring-accent/30' : 'border-border',
        )}
      >
        {url ? (
          // 이미지 클릭 = 확대(라이트박스). 교체는 우상단 버튼·끌어놓기·⌘V.
          <ImageZoom src={url} alt={name} className="h-full w-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-muted to-border hover:opacity-90"
          >
            <span className="text-[56px] leading-none opacity-50">{emoji || '🛠️'}</span>
            <span className="text-[11px] text-ink/50">이미지 끌어놓기·클릭·붙여넣기(⌘V)</span>
          </button>
        )}
        {/* 업로드 중·드래그 오버레이 — pointer-events-none이라 이미지 클릭(확대)을 막지 않는다. */}
        {(uploading || dragOver) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-center text-xs text-white">
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> 업로드 중…
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" /> <span>여기에 놓기</span>
              </>
            )}
          </div>
        )}
        {url && !uploading && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="이미지 교체"
            className="absolute right-2 top-2 hidden items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-black/70 group-hover:flex"
          >
            <Upload className="h-3 w-3" /> 교체
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) run(() => uploadImageFile(f));
        }}
      />
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

// 자료(도구/프롬프트/가이드) 미리보기 — 발행 전 "실제 올라가는 모습" 검수·편집 표면.
// 도구: 본가 components/tools/ToolDetail.tsx 마크업 이식(2026-07-11 스냅샷, Snipit 목업 정합).
// onPatch/onBody를 넘기면 텍스트 클릭 → 인라인 수정 → 폼 상태로 커밋.
// 본가 렌더가 바뀌면 이 파일도 따라가야 한다(댓글·추천·좋아요 제외).

export interface ToolPreviewProps {
  category: 'tool' | 'prompt' | 'guide' | 'context-card';
  name: string;
  description?: string | null;
  url?: string | null;
  body: Record<string, unknown>;
  pricingLabel?: string | null;
  isPaid?: boolean | null;
  proPricing?: string | null;
  thumbnailUrl?: string | null;
  thumbnailEmoji?: string | null;
  jobTags?: string[];
  /** 메타(이름·설명·썸네일) 인라인 수정 커밋 */
  onPatch?: (patch: Partial<{ name: string; description: string; thumbnailUrl: string }>) => void;
  /** body(jsonb) 인라인 수정 커밋 */
  onBody?: (next: Record<string, unknown>) => void;
}

const upd = <T,>(arr: T[], i: number, v: T): T[] => arr.map((x, idx) => (idx === i ? v : x));

// 본가 ToolDetail의 Section — sec-label + h2 헤드라인 이중 구조
function Section({ label, title, children }: { label: string; title?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <div className="text-xs font-bold text-accent tracking-[0.06em] mb-1.5">{label}</div>
      {title && <h2 className="text-[22px] font-extrabold tracking-[-0.025em] mb-5 break-keep">{title}</h2>}
      {children}
    </section>
  );
}

function CopyBox({ text, onCommit }: { text: string; onCommit?: (v: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };
  return (
    <div className="rounded-lg border border-border bg-muted overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink/40">프롬프트</span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <Editable as="pre" multiline value={text} onCommit={onCommit} className="px-3 py-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap" />
    </div>
  );
}

function ToolDetailPreview({
  name,
  description,
  url,
  body,
  pricingLabel,
  isPaid,
  proPricing,
  thumbnailUrl,
  thumbnailEmoji,
  onPatch,
  onBody,
}: Omit<ToolPreviewProps, 'category' | 'jobTags'> & { body: ToolBody }) {
  const set = onBody && ((patch: Partial<ToolBody>) => onBody({ ...body, ...patch } as Record<string, unknown>));
  return (
    <div>
      {/* Hero — ToolDetail 정합: 썸네일 16:10(이미지→이모지 폴백) + 칩/태그/CTA */}
      <section className="grid grid-cols-1 md:grid-cols-[1fr_1.1fr] gap-6 md:gap-9 md:items-center mb-10">
        {onPatch ? (
          <HeroThumbnailField url={thumbnailUrl} emoji={thumbnailEmoji} name={name} onCommit={(u) => onPatch({ thumbnailUrl: u })} />
        ) : (
          <div className="aspect-[16/10] rounded-2xl overflow-hidden border border-border bg-muted">
            {thumbnailUrl ? (
              <ImageZoom src={thumbnailUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-border">
                <span className="text-[56px] opacity-50">{thumbnailEmoji || '🛠️'}</span>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3.5">
          <span className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-accent bg-accent-50 px-2.5 py-1 rounded">
            AI 도구
            {body.audience && (
              <span className="text-accent/70">
                · <Editable value={body.audience} onCommit={set && ((v) => set({ audience: v }))} />
              </span>
            )}
          </span>
          <Editable
            as="h1"
            value={name}
            placeholder="도구 이름"
            onCommit={onPatch && ((v) => onPatch({ name: v }))}
            className="text-[30px] md:text-[38px] font-extrabold leading-[1.2] tracking-[-0.03em] break-keep block"
          />
          <Editable
            as="p"
            multiline
            rich
            value={description ?? ''}
            placeholder={onPatch ? '한 줄 소개 (클릭해서 입력)' : ''}
            onCommit={onPatch && ((v) => onPatch({ description: v }))}
            className="text-base text-ink/60 leading-relaxed max-w-[520px] break-keep block"
          />
          <div className="flex flex-wrap gap-2 mt-1">
            {pricingLabel && (
              <span
                className={
                  isPaid
                    ? 'text-xs font-semibold text-ink/50 bg-muted px-2.5 py-1 rounded'
                    : 'text-xs font-semibold text-[#03b26c] bg-[#e8f8f0] px-2.5 py-1 rounded'
                }
              >
                {pricingLabel}
              </span>
            )}
            {proPricing && <span className="text-xs font-semibold text-ink/50 bg-muted px-2.5 py-1 rounded">{proPricing}</span>}
            {body.tags?.map((t, i) => (
              <Editable
                key={t}
                value={t}
                onCommit={set && ((v) => set({ tags: upd(body.tags!, i, v) }))}
                className="text-xs font-semibold text-ink/50 bg-muted px-2.5 py-1 rounded"
              />
            ))}
          </div>
          {url && (
            <div className="flex flex-wrap gap-2.5 mt-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white bg-ink rounded-[10px] hover:bg-black transition-colors"
              >
                공식 사이트 방문
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>
      </section>

      {body.about && (
        <Section
          label="어떤 서비스인가요"
          title={
            body.about.heading !== undefined ? (
              <Editable value={body.about.heading} onCommit={set && ((v) => set({ about: { ...body.about!, heading: v } }))} />
            ) : undefined
          }
        >
          <div className="space-y-3.5">
            {body.about.paragraphs.map((p, i) => (
              <div key={i} className="flex items-start gap-2">
                <Editable
                  as="p"
                  multiline
                  rich
                  value={p}
                  onCommit={set && ((v) => set({ about: { ...body.about!, paragraphs: upd(body.about!.paragraphs, i, v) } }))}
                  className="flex-1 text-[15.5px] leading-[1.75] text-ink/80 max-w-[680px] break-keep block"
                />
                {set && body.about!.paragraphs.length > 1 && (
                  <button
                    type="button"
                    title="이 문단 삭제"
                    onClick={() => set({ about: { ...body.about!, paragraphs: body.about!.paragraphs.filter((_, k) => k !== i) } })}
                    className="mt-1.5 shrink-0 text-ink/30 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {set && (
            <button
              type="button"
              onClick={() => set({ about: { ...body.about!, paragraphs: [...body.about!.paragraphs, ''] } })}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> 문단 추가
            </button>
          )}
        </Section>
      )}

      {body.whenToUse && body.whenToUse.length > 0 && (
        <Section label="언제 쓰면 좋은가요" title="이런 일을 할 때 가장 빛납니다">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {body.whenToUse.map((w, i) => (
              <div key={i} className="p-4 border border-border rounded-[10px] bg-white">
                <div className="flex items-start gap-2">
                  {w.icon && <span className="text-lg block mb-1.5">{w.icon}</span>}
                  <Editable
                    value={w.title}
                    onCommit={set && ((v) => set({ whenToUse: upd(body.whenToUse!, i, { ...w, title: v }) }))}
                    className="flex-1 text-sm font-bold tracking-[-0.02em] mb-1 break-keep block"
                  />
                  {set && (
                    <button
                      type="button"
                      title="이 항목 삭제"
                      onClick={() => set({ whenToUse: body.whenToUse!.filter((_, k) => k !== i) })}
                      className="shrink-0 text-ink/30 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Editable
                  as="div"
                  multiline
                  rich
                  value={w.desc}
                  onCommit={set && ((v) => set({ whenToUse: upd(body.whenToUse!, i, { ...w, desc: v }) }))}
                  className="text-[13px] text-ink/60 leading-relaxed break-keep block"
                />
              </div>
            ))}
          </div>
          {set && (
            <button
              type="button"
              onClick={() => set({ whenToUse: [...body.whenToUse!, { title: '', desc: '' }] })}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> 항목 추가
            </button>
          )}
        </Section>
      )}

      {body.features && body.features.length > 0 && (
        <Section label="주요 기능" title="이 도구가 잘하는 것">
          <div className="border-t border-border">
            {body.features.map((f, i) => (
              <div key={i} className="flex gap-4 py-4 border-b border-border items-start">
                <div className="text-[13px] font-extrabold text-ink/30 min-w-6 tracking-[0.04em]">{String(i + 1).padStart(2, '0')}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <Editable
                      value={f.title}
                      onCommit={set && ((v) => set({ features: upd(body.features!, i, { ...f, title: v }) }))}
                      className="flex-1 text-[15px] font-bold tracking-[-0.02em] mb-1 break-keep block"
                    />
                    {set && (
                      <button
                        type="button"
                        title="이 기능 삭제"
                        onClick={() => set({ features: body.features!.filter((_, k) => k !== i) })}
                        className="mt-0.5 shrink-0 text-ink/30 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <Editable
                    as="div"
                    multiline
                    rich
                    value={f.desc}
                    onCommit={set && ((v) => set({ features: upd(body.features!, i, { ...f, desc: v }) }))}
                    className="text-[13.5px] text-ink/60 leading-relaxed break-keep block"
                  />
                  {set ? (
                    <FeatureImageField image={f.image} onChange={(img) => set({ features: upd(body.features!, i, { ...f, image: img }) })} />
                  ) : (
                    f.image && (
                      <figure className="mt-3 rounded-xl border border-border overflow-hidden bg-muted">
                        <ImageZoom src={f.image.url} alt={f.image.caption ?? f.title} loading="lazy" className="block w-full" />
                        {f.image.caption && (
                          <figcaption className="border-t border-border bg-white px-3.5 py-2 text-[12px] text-ink/50 break-keep">
                            {f.image.caption}
                          </figcaption>
                        )}
                      </figure>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
          {set && (
            <button
              type="button"
              onClick={() => set({ features: [...body.features!, { title: '', desc: '' }] })}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> 기능 추가
            </button>
          )}
        </Section>
      )}

      {body.pricing && body.pricing.length > 0 && (
        <Section label="가격" title="요금 정보">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {body.pricing.map((p, i) => (
              <div key={i} className="p-5 border border-border rounded-xl bg-white">
                <div className="flex items-start gap-2">
                  <Editable
                    value={p.name}
                    onCommit={set && ((v) => set({ pricing: upd(body.pricing!, i, { ...p, name: v }) }))}
                    className="flex-1 text-[13px] font-bold text-ink/50 uppercase tracking-[0.04em] mb-1.5 block"
                  />
                  {set && (
                    <button
                      type="button"
                      title="이 플랜 삭제"
                      onClick={() => set({ pricing: body.pricing!.filter((_, k) => k !== i) })}
                      className="shrink-0 text-ink/30 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Editable
                  value={p.amount}
                  onCommit={set && ((v) => set({ pricing: upd(body.pricing!, i, { ...p, amount: v }) }))}
                  className="text-lg font-extrabold tracking-[-0.02em] mb-2 break-keep block"
                />
                <Editable
                  as="div"
                  multiline
                  rich
                  value={p.includes}
                  onCommit={set && ((v) => set({ pricing: upd(body.pricing!, i, { ...p, includes: v }) }))}
                  className="text-[13px] text-ink/60 leading-relaxed break-keep block"
                />
              </div>
            ))}
          </div>
          {set && (
            <button
              type="button"
              onClick={() => set({ pricing: [...body.pricing!, { name: '', amount: '', includes: '' }] })}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> 플랜 추가
            </button>
          )}
          {body.pricingNote !== undefined && (
            <Editable
              as="p"
              multiline
              rich
              value={body.pricingNote}
              onCommit={set && ((v) => set({ pricingNote: v }))}
              className="mt-3.5 text-[13px] text-ink/40 block"
            />
          )}
        </Section>
      )}

      {body.useCases && body.useCases.length > 0 && (
        <Section label="실전 사용기 · 옵션" title="이 도구를 직접 써본 케이스">
          <div className="grid gap-3.5">
            {body.useCases.map((u, i) => (
              <div key={i} className="block p-4 border border-border rounded-xl">
                <span className="inline-block text-[11px] font-bold text-accent bg-accent-50 px-2 py-0.5 rounded mb-1.5">{u.tag}</span>
                <h3 className="text-[15.5px] font-bold tracking-[-0.02em] leading-snug mb-1.5 break-keep">{u.title}</h3>
                <p className="text-xs text-ink/50">{u.meta}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 섹션 추가 — 없는 섹션을 편집 모드에서 바로 만든다(빈 도구도 이미지/기능을 붙일 수 있게). */}
      {set && (!body.about || !body.whenToUse?.length || !body.features?.length || !body.pricing?.length) && (
        <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-4">
          <span className="text-xs font-semibold text-ink/40">섹션 추가</span>
          {!body.about && (
            <button type="button" onClick={() => set({ about: { paragraphs: [''] } })} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-ink/60 hover:border-accent hover:text-accent">
              <Plus className="h-3 w-3" /> 소개
            </button>
          )}
          {!body.whenToUse?.length && (
            <button type="button" onClick={() => set({ whenToUse: [{ title: '', desc: '' }] })} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-ink/60 hover:border-accent hover:text-accent">
              <Plus className="h-3 w-3" /> 언제 쓰나
            </button>
          )}
          {!body.features?.length && (
            <button type="button" onClick={() => set({ features: [{ title: '', desc: '' }] })} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-ink/60 hover:border-accent hover:text-accent">
              <Plus className="h-3 w-3" /> 주요 기능(이미지)
            </button>
          )}
          {!body.pricing?.length && (
            <button type="button" onClick={() => set({ pricing: [{ name: '', amount: '', includes: '' }] })} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-ink/60 hover:border-accent hover:text-accent">
              <Plus className="h-3 w-3" /> 가격
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PromptCardPreview({
  name,
  description,
  url,
  body,
  onPatch,
  onBody,
}: Pick<ToolPreviewProps, 'name' | 'description' | 'url' | 'body' | 'onPatch' | 'onBody'>) {
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const howToUse = typeof body.howToUse === 'string' ? body.howToUse : '';
  const example = typeof body.example === 'string' ? body.example : '';
  const set = onBody && ((patch: Record<string, unknown>) => onBody({ ...body, ...patch }));
  return (
    <div className="mx-auto max-w-[640px] space-y-3">
      <div className="flex items-center gap-2">
        <span className="rounded-[5px] bg-accent-50 px-2 py-0.5 text-[11px] font-bold text-accent">프롬프트</span>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-ink/50 hover:text-accent">
            출처 ↗
          </a>
        )}
      </div>
      <Editable
        as="h1"
        value={name}
        placeholder="프롬프트 제목"
        onCommit={onPatch && ((v) => onPatch({ name: v }))}
        className="text-xl font-extrabold tracking-[-0.02em] break-keep block"
      />
      <Editable
        as="p"
        multiline
        rich
        value={description ?? ''}
        placeholder={onPatch ? '설명 (클릭해서 입력)' : ''}
        onCommit={onPatch && ((v) => onPatch({ description: v }))}
        className="text-sm text-ink/60 leading-relaxed break-keep block"
      />
      {(prompt || set) && <CopyBox text={prompt} onCommit={set && ((v) => set({ prompt: v }))} />}
      <p className="text-[13px] text-ink/60 leading-relaxed">
        <strong className="text-ink/80">사용법</strong> ·{' '}
        <Editable value={howToUse} multiline rich placeholder={set ? '클릭해서 입력' : ''} onCommit={set && ((v) => set({ howToUse: v }))} />
      </p>
      <p className="text-[13px] text-ink/60 leading-relaxed">
        <strong className="text-ink/80">예시</strong> ·{' '}
        <Editable value={example} multiline rich placeholder={set ? '클릭해서 입력' : ''} onCommit={set && ((v) => set({ example: v }))} />
      </p>
      <p className="text-[11px] text-ink/40">바로 복사 가능</p>
    </div>
  );
}

function GuideCardPreview({
  name,
  description,
  url,
  jobTags,
  onPatch,
}: Pick<ToolPreviewProps, 'name' | 'description' | 'url' | 'jobTags' | 'onPatch'>) {
  const host = (() => {
    try {
      return url ? new URL(url).host : '';
    } catch {
      return '';
    }
  })();
  return (
    <div className="mx-auto max-w-[360px]">
      <div className="rounded-[10px] border border-border bg-white overflow-hidden">
        <div className="flex h-20 items-center justify-center bg-muted text-sm font-bold text-ink/60">{jobTags?.[0] ?? '가이드'}</div>
        <div className="p-4 space-y-1.5">
          {jobTags?.[0] && (
            <span className="inline-block rounded-[3px] bg-accent-50 px-1.5 py-0.5 text-[9.5px] font-bold text-accent">{jobTags[0]}</span>
          )}
          <Editable
            as="div"
            value={name}
            placeholder="가이드 제목"
            onCommit={onPatch && ((v) => onPatch({ name: v }))}
            className="text-[13.5px] font-bold leading-snug break-keep block"
          />
          <Editable
            as="div"
            multiline
            value={description ?? ''}
            placeholder={onPatch ? '설명 (클릭해서 입력)' : ''}
            onCommit={onPatch && ((v) => onPatch({ description: v }))}
            className="text-xs text-ink/50 leading-relaxed break-keep block"
          />
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[11px] font-bold text-accent hover:underline">
              {host || url} <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-ink/40">공식 가이드 목록 카드 미리보기</p>
    </div>
  );
}

export function ToolPreview(props: ToolPreviewProps) {
  const { category, body, onBody } = props;
  const parsedTool = category === 'tool' ? ToolBodySchema.safeParse(body) : null;
  return (
    <div className="rounded-xl border border-border bg-bg">
      <div className="border-b border-border px-4 py-2 text-xs text-ink/50">
        라이브 미리보기 — 본가 {category === 'tool' ? '/tools 상세와 동일 마크업' : category === 'prompt' ? '/prompts 카드 근사' : '/guides 카드 근사'}
        {onBody && <span className="ml-2 font-semibold text-accent">텍스트를 클릭하면 바로 수정됩니다</span>}
      </div>
      <div className="mx-auto max-w-[760px] px-6 py-10">
        {category === 'tool' ? (
          parsedTool?.success ? (
            <ToolDetailPreview
              name={props.name}
              description={props.description}
              url={props.url}
              body={parsedTool.data}
              pricingLabel={props.pricingLabel}
              isPaid={props.isPaid}
              proPricing={props.proPricing}
              thumbnailUrl={props.thumbnailUrl}
              thumbnailEmoji={props.thumbnailEmoji}
              onPatch={props.onPatch}
              onBody={props.onBody}
            />
          ) : (
            <p className="text-sm text-red-600">
              본문(body)이 상세페이지 스키마와 달라 미리보기를 렌더할 수 없어요 — {parsedTool?.error.issues[0]?.message}
            </p>
          )
        ) : category === 'prompt' ? (
          <PromptCardPreview name={props.name} description={props.description} url={props.url} body={body} onPatch={props.onPatch} onBody={props.onBody} />
        ) : (
          <GuideCardPreview name={props.name} description={props.description} url={props.url} jobTags={props.jobTags} onPatch={props.onPatch} />
        )}
      </div>
    </div>
  );
}
