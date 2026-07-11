'use client';

import { useState } from 'react';
import { ArrowUpRight, Copy, Check, ExternalLink } from 'lucide-react';
import { ToolBodySchema, type ToolBody } from '@/lib/tool-body';
import { Editable } from '@/components/admin/Editable';

// 자료(도구/프롬프트/가이드) 미리보기 — 발행 전 "실제 올라가는 모습" 검수·편집 표면.
// 도구: 본가 components/tools/ToolDetail.tsx 마크업 이식(2026-07-11 스냅샷, Snipit 목업 정합).
// onPatch/onBody를 넘기면 텍스트 더블클릭 → 인라인 수정 → 폼 상태로 커밋.
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
  /** 메타(이름·설명) 인라인 수정 커밋 */
  onPatch?: (patch: Partial<{ name: string; description: string }>) => void;
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
        <div className="aspect-[16/10] rounded-2xl overflow-hidden border border-border bg-muted">
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-border">
              <span className="text-[56px] opacity-50">{thumbnailEmoji || '🛠️'}</span>
            </div>
          )}
        </div>
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
            value={description ?? ''}
            placeholder={onPatch ? '한 줄 소개 (더블클릭해서 입력)' : ''}
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
              <Editable
                key={i}
                as="p"
                multiline
                rich
                value={p}
                onCommit={set && ((v) => set({ about: { ...body.about!, paragraphs: upd(body.about!.paragraphs, i, v) } }))}
                className="text-[15.5px] leading-[1.75] text-ink/80 max-w-[680px] break-keep block"
              />
            ))}
          </div>
        </Section>
      )}

      {body.whenToUse && body.whenToUse.length > 0 && (
        <Section label="언제 쓰면 좋은가요" title="이런 일을 할 때 가장 빛납니다">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {body.whenToUse.map((w, i) => (
              <div key={i} className="p-4 border border-border rounded-[10px] bg-white">
                {w.icon && <span className="text-lg block mb-1.5">{w.icon}</span>}
                <Editable
                  value={w.title}
                  onCommit={set && ((v) => set({ whenToUse: upd(body.whenToUse!, i, { ...w, title: v }) }))}
                  className="text-sm font-bold tracking-[-0.02em] mb-1 break-keep block"
                />
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
        </Section>
      )}

      {body.features && body.features.length > 0 && (
        <Section label="주요 기능" title="이 도구가 잘하는 것">
          <div className="border-t border-border">
            {body.features.map((f, i) => (
              <div key={i} className="flex gap-4 py-4 border-b border-border items-start">
                <div className="text-[13px] font-extrabold text-ink/30 min-w-6 tracking-[0.04em]">{String(i + 1).padStart(2, '0')}</div>
                <div className="flex-1 min-w-0">
                  <Editable
                    value={f.title}
                    onCommit={set && ((v) => set({ features: upd(body.features!, i, { ...f, title: v }) }))}
                    className="text-[15px] font-bold tracking-[-0.02em] mb-1 break-keep block"
                  />
                  <Editable
                    as="div"
                    multiline
                    rich
                    value={f.desc}
                    onCommit={set && ((v) => set({ features: upd(body.features!, i, { ...f, desc: v }) }))}
                    className="text-[13.5px] text-ink/60 leading-relaxed break-keep block"
                  />
                  {f.image && (
                    <figure className="mt-3 rounded-xl border border-border overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.image.url} alt={f.image.caption ?? f.title} loading="lazy" className="block w-full" />
                      {f.image.caption && (
                        <figcaption className="border-t border-border bg-white px-3.5 py-2 text-[12px] text-ink/50 break-keep">
                          {f.image.caption}
                        </figcaption>
                      )}
                    </figure>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {body.pricing && body.pricing.length > 0 && (
        <Section label="가격" title="요금 정보">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {body.pricing.map((p, i) => (
              <div key={i} className="p-5 border border-border rounded-xl bg-white">
                <Editable
                  value={p.name}
                  onCommit={set && ((v) => set({ pricing: upd(body.pricing!, i, { ...p, name: v }) }))}
                  className="text-[13px] font-bold text-ink/50 uppercase tracking-[0.04em] mb-1.5 block"
                />
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
          {body.pricingNote !== undefined && (
            <Editable
              as="p"
              multiline
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
        value={description ?? ''}
        placeholder={onPatch ? '설명 (더블클릭해서 입력)' : ''}
        onCommit={onPatch && ((v) => onPatch({ description: v }))}
        className="text-sm text-ink/60 leading-relaxed break-keep block"
      />
      {(prompt || set) && <CopyBox text={prompt} onCommit={set && ((v) => set({ prompt: v }))} />}
      <p className="text-[13px] text-ink/60 leading-relaxed">
        <strong className="text-ink/80">사용법</strong> ·{' '}
        <Editable value={howToUse} multiline placeholder={set ? '더블클릭해서 입력' : ''} onCommit={set && ((v) => set({ howToUse: v }))} />
      </p>
      <p className="text-[13px] text-ink/60 leading-relaxed">
        <strong className="text-ink/80">예시</strong> ·{' '}
        <Editable value={example} multiline placeholder={set ? '더블클릭해서 입력' : ''} onCommit={set && ((v) => set({ example: v }))} />
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
            placeholder={onPatch ? '설명 (더블클릭해서 입력)' : ''}
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
        {onBody && <span className="ml-2 font-semibold text-accent">텍스트를 더블클릭하면 바로 수정됩니다</span>}
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
