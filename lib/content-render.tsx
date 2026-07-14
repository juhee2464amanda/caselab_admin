import type * as React from 'react';
import type { Block } from '@/types/content';
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

export function renderBlock(block: Block, key: string | number): React.ReactElement {
  switch (block.type) {
    case 'text':
      return (
        <p key={key} className="text-[16px] leading-[1.75] text-ink/85 my-4 whitespace-pre-wrap">
          {block.markdown}
        </p>
      );
    case 'heading':
      return block.level === 2 ? (
        <h2 key={key} className="font-serif text-2xl font-semibold mt-10 mb-3">
          {block.text}
        </h2>
      ) : (
        <h3 key={key} className="font-serif text-xl font-semibold mt-8 mb-2">
          {block.text}
        </h3>
      );
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
    default: {
      const _exhaustive: never = block;
      return <></>;
    }
  }
}

export function renderBlocks(blocks: Block[], keyPrefix = 'b'): React.ReactElement[] {
  return blocks.map((b, i) => renderBlock(b, `${keyPrefix}-${i}`));
}
