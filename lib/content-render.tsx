import type * as React from 'react';
import type { Block } from '@/types/content';
import { HEADING_TAG, HEADING_CLASS } from '@/types/content';
import { IntentBox } from '@/components/content/IntentBox';
import { EvaluationBox } from '@/components/content/EvaluationBox';
import { RebuttalBox } from '@/components/content/RebuttalBox';
import { FailureSection } from '@/components/content/FailureSection';
import { ContextCard } from '@/components/content/ContextCard';
import { PromptBlock } from '@/components/content/PromptBlock';
import { ResultCompare } from '@/components/content/ResultCompare';
import { RoleCard } from '@/components/content/RoleCard';
import { FrameworkRef } from '@/components/content/FrameworkRef';
import { ContentGallery } from '@/components/admin/ContentGallery';

// 텍스트 줄간격 · 여백 높이 · 구분선 굵기/색 · 콜아웃 배경 — 본가·ContentPreview와 같은 값으로 유지.
const TEXT_LEADING: Record<string, string> = { tight: 'leading-[1.5]', normal: 'leading-[1.75]', loose: 'leading-[2.1]' };
const SPACER_H: Record<string, string> = { sm: 'h-6', md: 'h-12', lg: 'h-20' };
const DIVIDER_THICK: Record<string, string> = { thin: 'border-t', medium: 'border-t-2', thick: 'border-t-4' };
const DIVIDER_COLOR: Record<string, string> = { gray: 'border-border', black: 'border-ink', accent: 'border-accent' };
const CALLOUT_BOX: Record<string, string> = {
  yellow: 'bg-amber-50 border-amber-200',
  blue: 'bg-blue-50 border-blue-200',
  green: 'bg-green-50 border-green-200',
  red: 'bg-red-50 border-red-200',
  gray: 'bg-muted border-border',
};

export function renderBlock(block: Block, key: string | number): React.ReactElement {
  switch (block.type) {
    case 'text':
      return (
        <p
          key={key}
          className={`text-[16px] ${TEXT_LEADING[block.spacing ?? 'normal']} text-ink/85 my-4 whitespace-pre-wrap`}
        >
          {block.markdown}
        </p>
      );
    case 'heading': {
      const Tag = HEADING_TAG[block.level];
      return (
        <Tag key={key} className={HEADING_CLASS[block.level]}>
          {block.text}
        </Tag>
      );
    }
    case 'prompt':
      return <PromptBlock key={key} label={block.label} prompt={block.prompt} />;
    case 'result-compare':
      return <ResultCompare key={key} good={block.good} bad={block.bad} />;
    case 'role-card':
      return <RoleCard key={key} human={block.human} ai={block.ai} />;
    case 'intent':
      return <IntentBox key={key} step={block.step} text={block.text} />;
    case 'evaluation':
      return <EvaluationBox key={key} good={block.good} bad={block.bad} />;
    case 'rebuttal':
      return <RebuttalBox key={key} hypothesis={block.hypothesis} counter={block.counter} />;
    case 'framework-ref':
      return <FrameworkRef key={key} name={block.name} url={block.url} />;
    case 'context-card':
      return <ContextCard key={key} title={block.title} fields={block.fields} />;
    case 'checklist':
      return (
        <div key={key} className="my-4 rounded-md border border-border bg-white p-5">
          <h4 className="font-semibold mb-3">{block.title}</h4>
          <ul className="space-y-1.5">
            {block.items.map((it, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink/85">
                <span className="text-accent">✓</span>
                {it}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'image':
      return (
        <figure
          key={key}
          className={[
            'my-6',
            block.size === 'small' ? 'max-w-[320px]' : block.size === 'medium' ? 'max-w-[480px]' : '',
            block.size === 'small' || block.size === 'medium'
              ? block.align === 'left'
                ? 'mr-auto'
                : block.align === 'right'
                  ? 'ml-auto'
                  : 'mx-auto'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url} alt={block.alt ?? ''} className="w-full h-auto rounded-lg" loading="lazy" />
          {block.caption && (
            <figcaption className="mt-2 text-center text-[13px] text-ink/55">{block.caption}</figcaption>
          )}
        </figure>
      );
    case 'gallery':
      return <ContentGallery key={key} images={block.images} />;
    case 'bookmark': {
      let host = block.url;
      try {
        host = new URL(block.url).hostname.replace(/^www\./, '');
      } catch {
        /* noop */
      }
      return (
        <a
          key={key}
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="my-4 flex overflow-hidden rounded-lg border border-border no-underline transition-colors hover:bg-muted/40"
        >
          <div className="min-w-0 flex-1 p-3.5">
            <div className="line-clamp-1 font-medium text-ink">{block.title || block.url}</div>
            {block.description && <div className="mt-1 line-clamp-2 text-xs text-ink/60">{block.description}</div>}
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink/45">
              {block.favicon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={block.favicon} alt="" className="h-3.5 w-3.5 rounded-sm" />
              )}
              <span className="line-clamp-1">{block.siteName || host}</span>
            </div>
          </div>
          {block.image && (
            <div className="w-28 shrink-0 sm:w-40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={block.image} alt="" className="h-full w-full object-cover" />
            </div>
          )}
        </a>
      );
    }
    case 'failure':
      return (
        <FailureSection key={key} title={block.title}>
          {block.blocks.map((b, i) => renderBlock(b, `${key}-${i}`))}
        </FailureSection>
      );
    case 'spacer':
      return <div key={key} aria-hidden className={SPACER_H[block.size ?? 'md']} />;
    case 'divider':
      return (
        <hr key={key} className={`my-6 ${DIVIDER_THICK[block.thickness ?? 'medium']} ${DIVIDER_COLOR[block.color ?? 'gray']}`} />
      );
    case 'callout':
      return (
        <div key={key} className={`my-4 flex gap-3 rounded-lg border p-4 ${CALLOUT_BOX[block.color ?? 'yellow']}`}>
          <span className="shrink-0 text-lg leading-[1.6]">{block.icon || '💡'}</span>
          <div className="min-w-0 flex-1 text-[15px] leading-[1.7] text-ink/85 whitespace-pre-wrap">{block.markdown}</div>
        </div>
      );
    default: {
      const _exhaustive: never = block;
      return <></>;
    }
  }
}

export function renderBlocks(blocks: Block[], keyPrefix = 'b'): React.ReactElement[] {
  return blocks.map((b, i) => renderBlock(b, `${keyPrefix}-${i}`));
}
