'use client';

import { useState } from 'react';
import { ArrowUpRight, Copy, Check, User, Bot } from 'lucide-react';
import type { Block, ContentBody, JobTag, PainPoint, StepCard, TakingPoint } from '@/types/content';
import { JOB_LABELS } from '@/types/content';

// 콘텐츠 미리보기 — 본가 cases/[slug]·trends/[slug] 상세 마크업 이식(2026-07-11 스냅샷).
// 초안을 발행 전에 "실제 올라가는 모습"으로 검수하기 위한 것. 스타일 토큰(ink/accent/muted/border,
// prose-caselab)은 본가와 admin이 공유하므로 클래스 그대로 가져왔다.
// 원본: caselab/app/(public)/{cases,trends}/[slug]/page.tsx + components/content/*
// 본가 렌더가 바뀌면 이 파일도 따라가야 한다(검수용 근사 — 댓글·추천·트래커는 제외).

export interface ContentPreviewProps {
  track: 'case' | 'trend';
  title: string;
  summary?: string | null;
  jobTags?: JobTag[];
  readMin?: number;
  applyMin?: number;
  authorQuote?: string | null;
  body: ContentBody;
}

function SectionHeader({ num, title }: { num: string; title: string }) {
  return (
    <>
      <div className="text-xs font-bold text-ink/40 tracking-[0.08em] mb-0.5">{num}</div>
      <h2 className="text-[22px] md:text-2xl font-extrabold tracking-[-0.025em] mb-5 break-keep">{title}</h2>
    </>
  );
}

function SectionLead({ text }: { text: string }) {
  return <p className="text-[15px] text-ink/60 leading-[1.7] mb-4 max-w-[600px] break-keep">{text}</p>;
}

function PromptBlockView({ label, prompt }: { label?: string; prompt: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };
  return (
    <div className="my-4 rounded-md border border-border bg-ink text-white overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/60">{label ?? '프롬프트'}</span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? '복사됨' : '복사'}
        </button>
      </header>
      <pre className="px-4 py-3 text-sm whitespace-pre-wrap font-sans leading-relaxed">{prompt}</pre>
    </div>
  );
}

// 본가 lib/content-render.tsx의 초안 관련 블록만 이식(text/heading/prompt/result-compare/role-card/checklist).
// 그 외 고급 블록은 미리보기에서 타입 라벨만 표시.
function renderBlock(block: Block, key: string | number) {
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
      return <PromptBlockView key={key} label={block.label} prompt={block.prompt} />;
    case 'result-compare':
      return (
        <div key={key} className="my-4 grid gap-3 sm:grid-cols-2">
          <article className="rounded-md border-2 border-green-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase text-green-700 tracking-wider mb-2">잘된 결과</div>
            <p className="text-sm text-ink/85 leading-relaxed whitespace-pre-wrap">{block.good}</p>
          </article>
          <article className="rounded-md border-2 border-red-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase text-red-700 tracking-wider mb-2">별로인 결과</div>
            <p className="text-sm text-ink/85 leading-relaxed whitespace-pre-wrap">{block.bad}</p>
          </article>
        </div>
      );
    case 'role-card':
      return (
        <div key={key} className="my-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-white p-4">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-ink/60">
              <User className="h-3.5 w-3.5" /> 사람이 할 일
            </div>
            <p className="text-sm text-ink/85 leading-relaxed">{block.human}</p>
          </div>
          <div className="rounded-md border border-border bg-muted p-4">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-ink/60">
              <Bot className="h-3.5 w-3.5" /> AI가 할 일
            </div>
            <p className="text-sm text-ink/85 leading-relaxed">{block.ai}</p>
          </div>
        </div>
      );
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
    default:
      return (
        <p key={key} className="my-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-ink/40">
          [{(block as { type: string }).type}] 블록 — 라이브에서 전용 컴포넌트로 렌더됩니다
        </p>
      );
  }
}

const renderBlocks = (blocks: Block[] | undefined, prefix: string) =>
  (blocks ?? []).map((b, i) => renderBlock(b, `${prefix}-${i}`));

function PreviewHeader({ track, title, summary, jobTags, readMin, applyMin }: ContentPreviewProps) {
  const primaryJob = jobTags?.[0];
  const trackLabel = track === 'case' ? '실전 케이스' : 'AI 트렌드';
  return (
    <header className="py-10 md:py-14">
      <span className="inline-block text-xs font-bold text-accent bg-accent-50 px-2.5 py-1 rounded mb-4">
        {trackLabel}
        {primaryJob ? ` · ${JOB_LABELS[primaryJob] ?? primaryJob}` : ''}
      </span>
      <h1 className="text-[28px] md:text-[36px] font-extrabold leading-[1.3] tracking-[-0.03em] mb-3 break-keep">{title}</h1>
      {summary && <p className="text-[17px] text-ink/60 leading-relaxed max-w-[600px] mb-5 break-keep">{summary}</p>}
      <div className="flex flex-wrap gap-3 text-[13px] text-ink/40 pb-6 border-b border-border">
        <span>{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        {readMin ? <span>읽는데 {readMin}분</span> : null}
        {track === 'case' && applyMin ? <span>적용 {applyMin}분</span> : null}
      </div>
    </header>
  );
}

function AuthorQuoteView({ quote }: { quote: string }) {
  return (
    <blockquote className="rounded-xl bg-muted p-5 text-[15px] italic leading-relaxed text-ink/70 break-keep">
      “{quote}”<span className="mt-1 block not-italic text-xs text-ink/40">— 케이스랩 운영자</span>
    </blockquote>
  );
}

function PainPointsGrid({ items }: { items: PainPoint[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
      {items.map((p, i) => (
        <div key={i} className="p-5 border border-border rounded-xl bg-white">
          <div className="text-xs font-bold text-ink/40 tracking-[0.06em] mb-2.5">{p.num}</div>
          <div className="text-[15px] font-bold tracking-[-0.02em] mb-2 text-ink leading-[1.4]">{p.title}</div>
          <div className="text-[13.5px] text-ink/60 leading-[1.65] break-keep">
            {p.symptom} <strong className="text-ink font-semibold">원인</strong>: {p.rootCause}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepCardView({ step }: { step: StepCard }) {
  return (
    <div className="p-6 bg-white border border-border rounded-2xl">
      <div className="pb-3.5 mb-4 border-b border-border flex items-center gap-2">
        <span className="inline-block text-[11px] font-bold text-ink/50 bg-muted px-2.5 py-1 rounded-full tracking-[0.04em]">
          Step {step.num}
        </span>
        <span className="text-[15px] font-bold text-ink tracking-[-0.02em]">— {step.label}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3.5">
        <div className="bg-muted rounded-xl p-4">
          <div className="text-[11px] font-bold text-ink/50 uppercase tracking-[0.06em] mb-1.5">사람이 할 일</div>
          <p className="text-sm text-ink/80 leading-[1.6]">{step.human}</p>
        </div>
        <div className="bg-muted rounded-xl p-4">
          <div className="text-[11px] font-bold text-ink/50 uppercase tracking-[0.06em] mb-1.5">AI에게 시킬 것</div>
          <p className="text-sm text-ink/80 leading-[1.6]">{step.ai}</p>
        </div>
      </div>
      {step.prompt && <PromptBlockView label={step.label} prompt={step.prompt} />}
      {(step.goodResult || step.badResult) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {step.goodResult && (
            <div className="bg-muted rounded-xl p-4 text-sm leading-[1.6]">
              <div className="text-xs font-bold text-ink/50 mb-2">✓ 잘된 것</div>
              <div className="text-ink/80 break-keep">{step.goodResult}</div>
            </div>
          )}
          {step.badResult && (
            <div className="bg-muted rounded-xl p-4 text-sm leading-[1.6]">
              <div className="text-xs font-bold text-ink/40 mb-2">✗ 별로인 것</div>
              <div className="text-ink/80 break-keep">{step.badResult}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TakingPointsList({ items }: { items: TakingPoint[] }) {
  return (
    <div className="flex flex-col gap-2.5 mt-2">
      {items.map((tp, i) => (
        <div key={i} className="flex gap-5 p-6 border border-border rounded-xl bg-white items-start">
          <span className="text-[13px] font-bold text-ink/40 tracking-[0.06em] leading-[1.5] min-w-[24px] mt-0.5 flex-shrink-0">
            {String(i + 1).padStart(2, '0')}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-base font-extrabold tracking-[-0.02em] mb-1.5 text-ink leading-[1.45]">{tp.title}</div>
            <div className="text-sm text-ink/60 leading-[1.65] mb-2.5 break-keep">{tp.description}</div>
            {tp.action && (
              <div className="inline-block text-[12.5px] font-semibold text-ink/60 bg-muted px-2.5 py-1 rounded-md">{tp.action}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CasePreviewBody({ body }: { body: Extract<ContentBody, { kind: 'case' }> }) {
  return (
    <div className="prose-caselab">
      {body.forWho && body.forWho.length > 0 && (
        <section className="pt-2">
          <SectionHeader num="01" title="이런 분들을 위한 글이에요" />
          <div className="bg-muted rounded-xl p-6">
            <div className="flex flex-col gap-2">
              {body.forWho.map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-[14.5px] text-ink/80 leading-[1.55]">
                  <span className="text-ink/50 font-bold flex-shrink-0 mt-0.5">✓</span>
                  <span className="break-keep">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {body.caseIntro && body.caseIntro.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num="02" title="어떤 케이스를 다루나요" />
          {renderBlocks(body.caseIntro, 'intro')}
        </section>
      )}

      {body.painPoints && body.painPoints.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num="03" title="보통 이런 일에서 막히는 이유" />
          <SectionLead text="실무에서 반복적으로 나오는 3가지 문제와, 그 근본 원인을 정리했습니다." />
          <PainPointsGrid items={body.painPoints} />
        </section>
      )}

      {body.frameworkReference && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num="04" title="적용한 Framework" />
          <div className="border border-border rounded-xl p-6 bg-white">
            <div className="text-[11px] font-bold tracking-[0.06em] text-ink/40 uppercase mb-3">Framework</div>
            <div className="text-[17px] font-extrabold tracking-[-0.02em] mb-2 text-ink">{body.frameworkReference.name}</div>
            <p className="text-sm text-ink/60 leading-[1.65] break-keep">{body.frameworkReference.description}</p>
          </div>
        </section>
      )}

      {body.stepCards && body.stepCards.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num="05" title="단계별 AI 활용" />
          <SectionLead text='단계마다 사람이 먼저 손으로 만든 입력이 있어야 AI 출력이 쓸 만합니다. 각 단계는 "사람이 할 일 / AI에 시킬 일 / 프롬프트 / 결과 비교" 4개로 구성됩니다.' />
          <div className="flex flex-col gap-3.5 mt-3.5">
            {body.stepCards.map((step) => (
              <StepCardView key={step.num} step={step} />
            ))}
          </div>
        </section>
      )}

      {body.pros && body.cons && (body.pros.length > 0 || body.cons.length > 0) && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num="06" title="좋았던 점 · 아쉬웠던 점" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            {(
              [
                ['↑ 좋았던 점', body.pros],
                ['↓ 아쉬웠던 점', body.cons],
              ] as const
            ).map(([label, items]) => (
              <div key={label} className="p-6 rounded-xl border border-border bg-white">
                <div className="text-xs font-bold text-ink/50 uppercase tracking-[0.06em] mb-3.5">{label}</div>
                <ul className="flex flex-col gap-2.5 list-none">
                  {items.map((t, i) => (
                    <li key={i} className="text-[14.5px] leading-[1.65] text-ink/80 flex gap-2.5 items-start break-keep">
                      <span className="w-1 h-1 rounded-full bg-ink/40 flex-shrink-0 mt-2.5" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {body.takingPoints && body.takingPoints.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num="07" title="핵심 Taking point" />
          <SectionLead text="이 글에서 가져갈 3가지. 본인 일에 바로 옮길 수 있는 액션도 함께." />
          <TakingPointsList items={body.takingPoints} />
        </section>
      )}
    </div>
  );
}

function TrendPreviewBody({ body }: { body: Extract<ContentBody, { kind: 'trend' }> }) {
  let n = 0;
  const num = () => String(++n).padStart(2, '0');
  return (
    <div className="prose-caselab">
      {body.what && body.what.length > 0 && (
        <section className="pt-2">
          <SectionHeader num={num()} title="무슨 소식이에요" />
          {renderBlocks(body.what, 'what')}
        </section>
      )}

      {body.why && body.why.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num={num()} title="왜 지금 화두예요" />
          {renderBlocks(body.why, 'why')}
        </section>
      )}

      {body.forWho && body.forWho.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num={num()} title="누구한테 중요해요" />
          <div className="grid gap-3 sm:grid-cols-2 mt-1">
            {body.forWho.map((w, i) => (
              <div key={i} className="rounded-xl border border-border bg-white p-4">
                <div className="text-sm font-bold text-accent mb-1">{w.role}</div>
                <div className="text-[13.5px] text-ink/70 leading-relaxed break-keep">{w.why}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {body.keyPoints && body.keyPoints.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num={num()} title="핵심만 빠르게" />
          <ul className="flex flex-col gap-2.5 mt-1">
            {body.keyPoints.map((k, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-50 text-[11px] font-bold text-accent">
                  {i + 1}
                </span>
                <span className="text-[15px] text-ink/80 leading-relaxed break-keep">{k}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {body.deepDive && body.deepDive.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num={num()} title="좀 더 들어가면" />
          {renderBlocks(body.deepDive, 'deep')}
        </section>
      )}

      {body.soWhat && body.soWhat.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num={num()} title="그래서, 내 일엔?" />
          <div className="rounded-xl border border-accent/20 bg-accent-50/40 p-5">{renderBlocks(body.soWhat, 'so')}</div>
        </section>
      )}

      {body.sources && body.sources.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <div className="text-xs font-bold text-ink/40 tracking-[0.08em] mb-3">출처·더 보기</div>
          <ul className="flex flex-col gap-1.5">
            {body.sources.map((s, i) => (
              <li key={i}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                >
                  {s.label}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function ContentPreview(props: ContentPreviewProps) {
  const { track, authorQuote, body } = props;
  return (
    <div className="rounded-xl border border-border bg-bg">
      <div className="border-b border-border px-4 py-2 text-xs text-ink/50">
        라이브 미리보기 — 본가 {track === 'case' ? '/cases' : '/trends'} 상세와 동일 마크업 (댓글·추천 영역 제외)
      </div>
      <article className="mx-auto max-w-[760px] px-6 pb-14">
        <PreviewHeader {...props} />
        {authorQuote && (
          <div className="mt-6">
            <AuthorQuoteView quote={authorQuote} />
          </div>
        )}
        <div className="mt-4">
          {body.kind === 'case' ? <CasePreviewBody body={body} /> : body.kind === 'trend' ? <TrendPreviewBody body={body} /> : null}
        </div>
      </article>
    </div>
  );
}
