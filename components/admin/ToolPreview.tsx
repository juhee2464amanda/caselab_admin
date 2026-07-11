'use client';

import { useState } from 'react';
import { ArrowUpRight, Copy, Check } from 'lucide-react';
import { ToolBodySchema, type ToolBody } from '@/lib/tool-body';

// 자료(도구/프롬프트/가이드) 미리보기 — 본가 상세·카드 렌더의 근사(2026-07-11 목업 스터디 기준).
// 도구: tools/[slug] 상세 섹션(어떤 서비스/언제/기능/가격). 프롬프트: prompts 복사 카드.
// 가이드: guides 링크 카드. 발행 전 "실제 올라가는 모습" 검수용.

export interface ToolPreviewProps {
  category: 'tool' | 'prompt' | 'guide' | 'context-card';
  name: string;
  description?: string | null;
  url?: string | null;
  body: Record<string, unknown>;
  pricingLabel?: string | null;
  isPaid?: boolean | null;
  jobTags?: string[];
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[22px] font-extrabold tracking-[-0.025em] mb-4 break-keep">{children}</h2>;
}

function CopyBox({ text }: { text: string }) {
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
      <pre className="px-3 py-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{text}</pre>
    </div>
  );
}

function ToolDetailPreview({ name, description, body }: { name: string; description?: string | null; body: ToolBody }) {
  return (
    <div className="space-y-10">
      <header>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="rounded-[5px] bg-accent-50 px-2 py-0.5 text-xs font-bold text-accent">AI 도구</span>
          {body.audience && <span className="text-xs text-ink/50">{body.audience}</span>}
          {(body.tags ?? []).map((t) => (
            <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-ink/60">{t}</span>
          ))}
        </div>
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em] mb-2 break-keep">{name}</h1>
        {description && <p className="text-[15px] text-ink/60 leading-relaxed max-w-[600px] break-keep">{description}</p>}
      </header>

      {body.about && (
        <section>
          <SectionTitle>{body.about.heading ?? '어떤 서비스인가요'}</SectionTitle>
          <div className="max-w-[680px] space-y-3">
            {body.about.paragraphs.map((p, i) => (
              <p key={i} className="text-[15px] leading-[1.75] text-ink/85 break-keep">{p}</p>
            ))}
          </div>
        </section>
      )}

      {body.whenToUse && body.whenToUse.length > 0 && (
        <section>
          <SectionTitle>언제 쓰면 좋은가요</SectionTitle>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {body.whenToUse.map((w, i) => (
              <div key={i} className="rounded-xl border border-border bg-white p-4">
                <div className="text-sm font-bold text-ink mb-1">{w.icon ? `${w.icon} ` : ''}{w.title}</div>
                <div className="text-[13px] text-ink/60 leading-relaxed break-keep">{w.desc}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {body.features && body.features.length > 0 && (
        <section>
          <SectionTitle>주요 기능</SectionTitle>
          <ol className="space-y-3.5">
            {body.features.map((f, i) => (
              <li key={i} className="flex gap-4 items-start border-b border-border pb-3.5 last:border-b-0">
                <span className="text-xs font-bold text-ink/40 min-w-[28px] pt-0.5 tracking-[0.04em]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <div className="text-[15px] font-bold text-ink mb-1">{f.title}</div>
                  <div className="text-[13.5px] text-ink/60 leading-[1.6] break-keep">{f.desc}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {body.pricing && body.pricing.length > 0 && (
        <section>
          <SectionTitle>가격</SectionTitle>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {body.pricing.map((p, i) => (
              <div key={i} className="rounded-xl border border-border bg-white p-4">
                <div className="text-sm font-bold text-ink">{p.name}</div>
                <div className="text-[15px] font-extrabold text-accent my-1">{p.amount}</div>
                <div className="text-[13px] text-ink/60 leading-relaxed break-keep">{p.includes}</div>
              </div>
            ))}
          </div>
          {body.pricingNote && <p className="mt-2 text-[13px] text-ink/40">{body.pricingNote}</p>}
        </section>
      )}
    </div>
  );
}

function PromptCardPreview({ name, description, url, body }: { name: string; description?: string | null; url?: string | null; body: Record<string, unknown> }) {
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const howToUse = typeof body.howToUse === 'string' ? body.howToUse : '';
  const example = typeof body.example === 'string' ? body.example : '';
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
      <h1 className="text-xl font-extrabold tracking-[-0.02em] break-keep">{name}</h1>
      {description && <p className="text-sm text-ink/60 leading-relaxed break-keep">{description}</p>}
      {prompt && <CopyBox text={prompt} />}
      {howToUse && (
        <p className="text-[13px] text-ink/60 leading-relaxed">
          <strong className="text-ink/80">사용법</strong> · {howToUse}
        </p>
      )}
      {example && (
        <p className="text-[13px] text-ink/60 leading-relaxed">
          <strong className="text-ink/80">예시</strong> · {example}
        </p>
      )}
      <p className="text-[11px] text-ink/40">바로 복사 가능</p>
    </div>
  );
}

function GuideCardPreview({ name, description, url, jobTags }: { name: string; description?: string | null; url?: string | null; jobTags?: string[] }) {
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
        <div className="flex h-20 items-center justify-center bg-muted text-sm font-bold text-ink/60">
          {jobTags?.[0] ?? '가이드'}
        </div>
        <div className="p-4 space-y-1.5">
          {jobTags?.[0] && (
            <span className="inline-block rounded-[3px] bg-accent-50 px-1.5 py-0.5 text-[9.5px] font-bold text-accent">{jobTags[0]}</span>
          )}
          <div className="text-[13.5px] font-bold leading-snug break-keep line-clamp-2">{name}</div>
          {description && <div className="text-xs text-ink/50 leading-relaxed break-keep line-clamp-2">{description}</div>}
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
  const { category, body } = props;
  const parsedTool = category === 'tool' ? ToolBodySchema.safeParse(body) : null;
  return (
    <div className="rounded-xl border border-border bg-bg">
      <div className="border-b border-border px-4 py-2 text-xs text-ink/50">
        라이브 미리보기 — 본가 {category === 'tool' ? '/tools 상세' : category === 'prompt' ? '/prompts 카드' : '/guides 카드'} 근사 (검수용)
      </div>
      <div className="px-6 py-10">
        {category === 'tool' ? (
          parsedTool?.success ? (
            <ToolDetailPreview name={props.name} description={props.description} body={parsedTool.data} />
          ) : (
            <p className="text-sm text-red-600">
              본문(body)이 상세페이지 스키마와 달라 미리보기를 렌더할 수 없어요 — {parsedTool?.error.issues[0]?.message}
            </p>
          )
        ) : category === 'prompt' ? (
          <PromptCardPreview name={props.name} description={props.description} url={props.url} body={body} />
        ) : (
          <GuideCardPreview name={props.name} description={props.description} url={props.url} jobTags={props.jobTags} />
        )}
      </div>
    </div>
  );
}
