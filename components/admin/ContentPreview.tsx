'use client';

import { useState, useRef } from 'react';
import { ArrowUpRight, Copy, Check, User, Bot, Plus, Trash2, Sparkles } from 'lucide-react';
import type { Block, ContentBody, JobTag, PainPoint, StepCard, TakingPoint } from '@/types/content';
import { JOB_LABELS } from '@/types/content';
import { Editable } from '@/components/admin/Editable';
import { useRefine, sectionToLines } from '@/components/admin/RefinePanel';
import { sectionSpecs, isEmptySection, type SectionSpec } from '@/lib/content-sections';
import { ImageBlockField, newBlock, type AddType } from '@/components/admin/BlockListEditor';
import { cn } from '@/lib/utils';

// 콘텐츠 미리보기 — 본가 cases/[slug]·trends/[slug] 상세 마크업 이식(2026-07-11 스냅샷).
// onPatch/onBody를 넘기면 "편집 표면"이 된다: 텍스트 클릭 → 인라인 수정 → 폼 상태로 커밋.
// 원본: caselab/app/(public)/{cases,trends}/[slug]/page.tsx + components/content/*
// 본가 렌더가 바뀌면 이 파일도 따라가야 한다(댓글·추천·트래커는 제외).

type CaseBodyT = Extract<ContentBody, { kind: 'case' }>;
type TrendBodyT = Extract<ContentBody, { kind: 'trend' }>;

export interface ContentPreviewProps {
  track: 'case' | 'trend';
  title: string;
  summary?: string | null;
  jobTags?: JobTag[];
  readMin?: number;
  applyMin?: number;
  authorQuote?: string | null;
  body: ContentBody;
  /** 메타 텍스트(제목·요약·인용) 인라인 수정 커밋 */
  onPatch?: (patch: Partial<{ title: string; summary: string; authorQuote: string }>) => void;
  /** 본문(body) 인라인 수정 커밋 */
  onBody?: (next: ContentBody) => void;
}

const upd = <T,>(arr: T[], i: number, v: T): T[] => arr.map((x, idx) => (idx === i ? v : x));

function SectionHeader({ num, title, onRefine, onDelete }: { num: string; title: string; onRefine?: () => void; onDelete?: () => void }) {
  return (
    <>
      <div className="text-xs font-bold text-ink/40 tracking-[0.08em] mb-0.5">{num}</div>
      <div className="mb-5 flex items-center gap-2">
        <h2 className="text-[22px] md:text-2xl font-extrabold tracking-[-0.025em] break-keep">{title}</h2>
        {onRefine && (
          <button
            type="button"
            onClick={onRefine}
            title="이 섹션 전체를 AI로 수정(자유 재구성)"
            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-accent/30 px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent-50"
          >
            <Sparkles className="h-3 w-3" /> 섹션 수정
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`"${title}" 섹션을 삭제할까요? (내용이 비워지고 미리보기·라이브에서 사라져요)`)) onDelete();
            }}
            title="이 섹션 삭제(내용 비우기)"
            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-ink/45 hover:border-red-300 hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" /> 삭제
          </button>
        )}
      </div>
    </>
  );
}

function SectionLead({ text }: { text: string }) {
  return <p className="text-[15px] text-ink/60 leading-[1.7] mb-4 max-w-[600px] break-keep">{text}</p>;
}

function PromptBlockView({ label, prompt, onCommit }: { label?: string; prompt: string; onCommit?: (v: string) => void }) {
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
      <Editable
        as="pre"
        multiline
        value={prompt}
        onCommit={onCommit}
        className="px-4 py-3 text-sm whitespace-pre-wrap font-sans leading-relaxed hover:bg-white/10"
      />
    </div>
  );
}

// 본가 lib/content-render.tsx의 초안 관련 블록만 이식(text/heading/prompt/result-compare/role-card/checklist).
// onBlock을 넘기면 각 블록 텍스트가 클릭 인라인 편집 대상이 된다.
function renderBlock(block: Block, key: string | number, onBlock?: (nb: Block) => void) {
  switch (block.type) {
    case 'text':
      return (
        <Editable
          key={key}
          as="p"
          multiline
          rich
          value={block.markdown}
          onCommit={onBlock && ((v) => onBlock({ ...block, markdown: v }))}
          className="text-[16px] leading-[1.75] text-ink/85 my-4 whitespace-pre-wrap block"
        />
      );
    case 'heading':
      return (
        <Editable
          key={key}
          as={block.level === 2 ? 'h2' : 'h3'}
          value={block.text}
          onCommit={onBlock && ((v) => onBlock({ ...block, text: v }))}
          className={
            block.level === 2 ? 'font-serif text-2xl font-semibold mt-10 mb-3 block' : 'font-serif text-xl font-semibold mt-8 mb-2 block'
          }
        />
      );
    case 'prompt':
      return (
        <PromptBlockView key={key} label={block.label} prompt={block.prompt} onCommit={onBlock && ((v) => onBlock({ ...block, prompt: v }))} />
      );
    case 'result-compare':
      return (
        <div key={key} className="my-4 grid gap-3 sm:grid-cols-2">
          <article className="rounded-md border-2 border-green-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase text-green-700 tracking-wider mb-2">잘된 결과</div>
            <Editable
              as="p"
              multiline
              rich
              value={block.good}
              onCommit={onBlock && ((v) => onBlock({ ...block, good: v }))}
              className="text-sm text-ink/85 leading-relaxed whitespace-pre-wrap block"
            />
          </article>
          <article className="rounded-md border-2 border-red-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase text-red-700 tracking-wider mb-2">별로인 결과</div>
            <Editable
              as="p"
              multiline
              rich
              value={block.bad}
              onCommit={onBlock && ((v) => onBlock({ ...block, bad: v }))}
              className="text-sm text-ink/85 leading-relaxed whitespace-pre-wrap block"
            />
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
            <Editable
              as="p"
              multiline
              rich
              value={block.human}
              onCommit={onBlock && ((v) => onBlock({ ...block, human: v }))}
              className="text-sm text-ink/85 leading-relaxed block"
            />
          </div>
          <div className="rounded-md border border-border bg-muted p-4">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-ink/60">
              <Bot className="h-3.5 w-3.5" /> AI가 할 일
            </div>
            <Editable
              as="p"
              multiline
              rich
              value={block.ai}
              onCommit={onBlock && ((v) => onBlock({ ...block, ai: v }))}
              className="text-sm text-ink/85 leading-relaxed block"
            />
          </div>
        </div>
      );
    case 'checklist':
      return (
        <div key={key} className="my-4 rounded-md border border-border bg-white p-5">
          <Editable as="h4" value={block.title} onCommit={onBlock && ((v) => onBlock({ ...block, title: v }))} className="font-semibold mb-3 block" />
          <ul className="space-y-1.5">
            {block.items.map((it, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink/85">
                <span className="text-accent">✓</span>
                <Editable value={it} rich onCommit={onBlock && ((v) => onBlock({ ...block, items: upd(block.items, i, v) }))} />
              </li>
            ))}
          </ul>
        </div>
      );
    case 'image':
      // 편집 모드: 업로드/드래그/붙여넣기 UI. 읽기: figure+img.
      if (onBlock) {
        return (
          <div key={key} className="my-4">
            <ImageBlockField block={block} onChange={onBlock} />
          </div>
        );
      }
      return (
        <figure key={key} className="my-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url} alt={block.alt ?? ''} className="w-full h-auto rounded-lg" loading="lazy" />
          {block.caption && <figcaption className="mt-2 text-center text-[13px] text-ink/55">{block.caption}</figcaption>}
        </figure>
      );
    default:
      return (
        <p key={key} className="my-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-ink/40">
          [{(block as { type: string }).type}] 블록 — 라이브에서 전용 컴포넌트로 렌더됩니다
        </p>
      );
  }
}

// 미리보기 삽입 메뉴 — 노션식 hover "+". 블록 사이/끝에서 이미지·문단·소제목·프롬프트·체크리스트 삽입.
const INSERT_ITEMS: { type: AddType; label: string }[] = [
  { type: 'image', label: '🖼  이미지' },
  { type: 'text', label: '¶  문단' },
  { type: 'heading', label: 'H  소제목' },
  { type: 'prompt', label: '</>  프롬프트' },
  { type: 'checklist', label: '☑  체크리스트' },
];

function InsertBar({ onInsert }: { onInsert: (b: Block) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group/ins relative flex h-7 items-center justify-center">
      {/* 은은한 점선 — 항상 보이고 hover 시 진해짐 */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-accent/20 group-hover/ins:border-accent/40 transition-colors" />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="여기에 블록 삽입"
        className={cn(
          'relative z-10 flex items-center gap-1 rounded-full border border-accent/40 bg-white px-2.5 py-1 text-[11px] font-medium text-accent shadow-sm transition-all',
          open ? 'opacity-100' : 'opacity-60 group-hover/ins:opacity-100',
        )}
      >
        <Plus className="h-3 w-3" /> 삽입
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute top-8 z-30 flex flex-col overflow-hidden rounded-lg border border-border bg-white py-1 shadow-lg">
            {INSERT_ITEMS.map((it) => (
              <button
                key={it.type}
                type="button"
                onClick={() => {
                  onInsert(newBlock(it.type));
                  setOpen(false);
                }}
                className="whitespace-nowrap px-4 py-1.5 text-left text-sm hover:bg-muted"
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// 읽기: 블록만 렌더. 편집(onBlocks 있음): 블록 사이/끝에 삽입바 + 블록별 삭제 버튼.
function renderBlocks(blocks: Block[] | undefined, prefix: string, onBlocks?: (next: Block[]) => void) {
  const list = blocks ?? [];
  if (!onBlocks) return list.map((b, i) => renderBlock(b, `${prefix}-${i}`));
  const insertAt = (idx: number, b: Block) => onBlocks([...list.slice(0, idx), b, ...list.slice(idx)]);
  const removeAt = (idx: number) => onBlocks(list.filter((_, k) => k !== idx));
  const nodes: JSX.Element[] = [];
  list.forEach((b, i) => {
    nodes.push(<InsertBar key={`${prefix}-ins-${i}`} onInsert={(nb) => insertAt(i, nb)} />);
    nodes.push(
      <div key={`${prefix}-row-${i}`} className="group/blk relative">
        <button
          type="button"
          onClick={() => removeAt(i)}
          title="이 블록 삭제"
          className="absolute -right-1 -top-1 z-10 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-white text-red-500 shadow-sm hover:bg-red-50 group-hover/blk:flex"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        {renderBlock(b, `${prefix}-${i}`, (nb) => onBlocks(upd(list, i, nb)))}
      </div>,
    );
  });
  nodes.push(<InsertBar key={`${prefix}-ins-end`} onInsert={(nb) => insertAt(list.length, nb)} />);
  return nodes;
}

function PreviewHeader({ track, title, summary, jobTags, readMin, applyMin, onPatch }: ContentPreviewProps) {
  const primaryJob = jobTags?.[0];
  const trackLabel = track === 'case' ? '실전 케이스' : 'AI 트렌드';
  return (
    <header className="py-10 md:py-14">
      <span className="inline-block text-xs font-bold text-accent bg-accent-50 px-2.5 py-1 rounded mb-4">
        {trackLabel}
        {primaryJob ? ` · ${JOB_LABELS[primaryJob] ?? primaryJob}` : ''}
      </span>
      <Editable
        as="h1"
        value={title}
        placeholder="제목"
        onCommit={onPatch && ((v) => onPatch({ title: v }))}
        className="text-[28px] md:text-[36px] font-extrabold leading-[1.3] tracking-[-0.03em] mb-3 break-keep block"
      />
      <Editable
        as="p"
        multiline
        value={summary ?? ''}
        placeholder={onPatch ? '요약 (클릭해서 입력)' : ''}
        onCommit={onPatch && ((v) => onPatch({ summary: v }))}
        className="text-[17px] text-ink/60 leading-relaxed max-w-[600px] mb-5 break-keep block"
      />
      <div className="flex flex-wrap gap-3 text-[13px] text-ink/40 pb-6 border-b border-border">
        <span>{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        {readMin ? <span>읽는데 {readMin}분</span> : null}
        {track === 'case' && applyMin ? <span>적용 {applyMin}분</span> : null}
      </div>
    </header>
  );
}

function CasePreviewBody({ body, onBody, onSectionRefine, onSectionDelete }: { body: CaseBodyT; onBody?: (next: ContentBody) => void; onSectionRefine?: (key: string, label: string) => void; onSectionDelete?: (key: string) => void }) {
  const set = onBody && ((patch: Partial<CaseBodyT>) => onBody({ ...body, ...patch }));
  const sh = (key: string, label: string) => (onSectionRefine ? () => onSectionRefine(key, label) : undefined);
  const del = (key: string) => (onSectionDelete ? () => onSectionDelete(key) : undefined);
  return (
    <div className="prose-caselab">
      {body.forWho && body.forWho.length > 0 && (
        <section className="pt-2">
          <SectionHeader num="01" title="이런 분들을 위한 글이에요" onRefine={sh('forWho', '이런 분들을 위한 글이에요')} onDelete={del('forWho')} />
          <div className="bg-muted rounded-xl p-6">
            <div className="flex flex-col gap-2">
              {body.forWho.map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-[14.5px] text-ink/80 leading-[1.55]">
                  <span className="text-ink/50 font-bold flex-shrink-0 mt-0.5">✓</span>
                  <Editable value={t} rich onCommit={set && ((v) => set({ forWho: upd(body.forWho!, i, v) }))} className="break-keep" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {body.caseIntro && body.caseIntro.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num="02" title="어떤 케이스를 다루나요" onRefine={sh('caseIntro', '어떤 케이스를 다루나요')} onDelete={del('caseIntro')} />
          {renderBlocks(body.caseIntro, 'intro', set && ((next) => set({ caseIntro: next })))}
        </section>
      )}

      {body.painPoints && body.painPoints.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num="03" title="보통 이런 일에서 막히는 이유" onRefine={sh('painPoints', '보통 이런 일에서 막히는 이유')} onDelete={del('painPoints')} />
          <SectionLead text="실무에서 반복적으로 나오는 3가지 문제와, 그 근본 원인을 정리했습니다." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            {body.painPoints.map((p, i) => {
              const setP = set && ((patch: Partial<PainPoint>) => set({ painPoints: upd(body.painPoints!, i, { ...p, ...patch }) }));
              return (
                <div key={i} className="p-5 border border-border rounded-xl bg-white">
                  <div className="text-xs font-bold text-ink/40 tracking-[0.06em] mb-2.5">{p.num}</div>
                  <Editable
                    value={p.title}
                    onCommit={setP && ((v) => setP({ title: v }))}
                    className="text-[15px] font-bold tracking-[-0.02em] mb-2 text-ink leading-[1.4] block"
                  />
                  <div className="text-[13.5px] text-ink/60 leading-[1.65] break-keep">
                    <Editable value={p.symptom} multiline rich onCommit={setP && ((v) => setP({ symptom: v }))} />{' '}
                    <strong className="text-ink font-semibold">원인</strong>:{' '}
                    <Editable value={p.rootCause} multiline rich onCommit={setP && ((v) => setP({ rootCause: v }))} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {body.frameworkReference && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num="04" title="적용한 Framework" onRefine={sh('frameworkReference', '적용한 Framework')} onDelete={del('frameworkReference')} />
          <div className="border border-border rounded-xl p-6 bg-white">
            <div className="text-[11px] font-bold tracking-[0.06em] text-ink/40 uppercase mb-3">Framework</div>
            <Editable
              value={body.frameworkReference.name}
              onCommit={set && ((v) => set({ frameworkReference: { ...body.frameworkReference!, name: v } }))}
              className="text-[17px] font-extrabold tracking-[-0.02em] mb-2 text-ink block"
            />
            <Editable
              as="p"
              multiline
              rich
              value={body.frameworkReference.description}
              onCommit={set && ((v) => set({ frameworkReference: { ...body.frameworkReference!, description: v } }))}
              className="text-sm text-ink/60 leading-[1.65] break-keep block"
            />
          </div>
        </section>
      )}

      {body.stepCards && body.stepCards.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num="05" title="단계별 AI 활용" onRefine={sh('stepCards', '단계별 AI 활용')} onDelete={del('stepCards')} />
          <SectionLead text='단계마다 사람이 먼저 손으로 만든 입력이 있어야 AI 출력이 쓸 만합니다. 각 단계는 "사람이 할 일 / AI에 시킬 일 / 프롬프트 / 결과 비교" 4개로 구성됩니다.' />
          <div className="flex flex-col gap-3.5 mt-3.5">
            {body.stepCards.map((step, i) => (
              <StepCardView
                key={step.num}
                step={step}
                onStep={set && ((ns) => set({ stepCards: upd(body.stepCards!, i, ns) }))}
              />
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
                ['↑ 좋았던 점', body.pros, (next: string[]) => set?.({ pros: next })] as const,
                ['↓ 아쉬웠던 점', body.cons, (next: string[]) => set?.({ cons: next })] as const,
              ] as const
            ).map(([label, items, commit]) => (
              <div key={label} className="p-6 rounded-xl border border-border bg-white">
                <div className="text-xs font-bold text-ink/50 uppercase tracking-[0.06em] mb-3.5">{label}</div>
                <ul className="flex flex-col gap-2.5 list-none">
                  {items.map((t, i) => (
                    <li key={i} className="text-[14.5px] leading-[1.65] text-ink/80 flex gap-2.5 items-start break-keep">
                      <span className="w-1 h-1 rounded-full bg-ink/40 flex-shrink-0 mt-2.5" />
                      <Editable value={t} multiline rich onCommit={set && ((v) => commit(upd(items, i, v)))} />
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
          <SectionHeader num="07" title="핵심 Taking point" onRefine={sh('takingPoints', '핵심 Taking point')} onDelete={del('takingPoints')} />
          <SectionLead text="이 글에서 가져갈 3가지. 본인 일에 바로 옮길 수 있는 액션도 함께." />
          <div className="flex flex-col gap-2.5 mt-2">
            {body.takingPoints.map((tp, i) => {
              const setT = set && ((patch: Partial<TakingPoint>) => set({ takingPoints: upd(body.takingPoints!, i, { ...tp, ...patch }) }));
              return (
                <div key={i} className="flex gap-5 p-6 border border-border rounded-xl bg-white items-start">
                  <span className="text-[13px] font-bold text-ink/40 tracking-[0.06em] leading-[1.5] min-w-[24px] mt-0.5 flex-shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <Editable
                      value={tp.title}
                      onCommit={setT && ((v) => setT({ title: v }))}
                      className="text-base font-extrabold tracking-[-0.02em] mb-1.5 text-ink leading-[1.45] block"
                    />
                    <Editable
                      as="div"
                      multiline
                      rich
                      value={tp.description}
                      onCommit={setT && ((v) => setT({ description: v }))}
                      className="text-sm text-ink/60 leading-[1.65] mb-2.5 break-keep block"
                    />
                    {tp.action && (
                      <Editable
                        as="div"
                        value={tp.action}
                        onCommit={setT && ((v) => setT({ action: v }))}
                        className="inline-block text-[12.5px] font-semibold text-ink/60 bg-muted px-2.5 py-1 rounded-md"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function StepCardView({ step, onStep }: { step: StepCard; onStep?: (next: StepCard) => void }) {
  const set = onStep && ((patch: Partial<StepCard>) => onStep({ ...step, ...patch }));
  return (
    <div className="p-6 bg-white border border-border rounded-2xl">
      <div className="pb-3.5 mb-4 border-b border-border flex items-center gap-2">
        <span className="inline-block text-[11px] font-bold text-ink/50 bg-muted px-2.5 py-1 rounded-full tracking-[0.04em]">
          Step {step.num}
        </span>
        <span className="text-[15px] font-bold text-ink tracking-[-0.02em]">
          — <Editable value={step.label} onCommit={set && ((v) => set({ label: v }))} />
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3.5">
        <div className="bg-muted rounded-xl p-4">
          <div className="text-[11px] font-bold text-ink/50 uppercase tracking-[0.06em] mb-1.5">사람이 할 일</div>
          <Editable as="p" multiline rich value={step.human} onCommit={set && ((v) => set({ human: v }))} className="text-sm text-ink/80 leading-[1.6] block" />
        </div>
        <div className="bg-muted rounded-xl p-4">
          <div className="text-[11px] font-bold text-ink/50 uppercase tracking-[0.06em] mb-1.5">AI에게 시킬 것</div>
          <Editable as="p" multiline rich value={step.ai} onCommit={set && ((v) => set({ ai: v }))} className="text-sm text-ink/80 leading-[1.6] block" />
        </div>
      </div>
      {step.prompt !== undefined && (
        <PromptBlockView label={step.label} prompt={step.prompt} onCommit={set && ((v) => set({ prompt: v }))} />
      )}
      {(step.goodResult || step.badResult) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {step.goodResult && (
            <div className="bg-muted rounded-xl p-4 text-sm leading-[1.6]">
              <div className="text-xs font-bold text-ink/50 mb-2">✓ 잘된 것</div>
              <Editable as="div" multiline rich value={step.goodResult} onCommit={set && ((v) => set({ goodResult: v }))} className="text-ink/80 break-keep block" />
            </div>
          )}
          {step.badResult && (
            <div className="bg-muted rounded-xl p-4 text-sm leading-[1.6]">
              <div className="text-xs font-bold text-ink/40 mb-2">✗ 별로인 것</div>
              <Editable as="div" multiline rich value={step.badResult} onCommit={set && ((v) => set({ badResult: v }))} className="text-ink/80 break-keep block" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrendPreviewBody({ body, onBody, onSectionRefine, onSectionDelete }: { body: TrendBodyT; onBody?: (next: ContentBody) => void; onSectionRefine?: (key: string, label: string) => void; onSectionDelete?: (key: string) => void }) {
  const set = onBody && ((patch: Partial<TrendBodyT>) => onBody({ ...body, ...patch }));
  const sh = (key: string, label: string) => (onSectionRefine ? () => onSectionRefine(key, label) : undefined);
  const del = (key: string) => (onSectionDelete ? () => onSectionDelete(key) : undefined);
  let n = 0;
  const num = () => String(++n).padStart(2, '0');
  return (
    <div className="prose-caselab">
      {body.what && body.what.length > 0 && (
        <section className="pt-2">
          <SectionHeader num={num()} title="무슨 소식이에요" onRefine={sh('what', '무슨 소식이에요')} onDelete={del('what')} />
          {renderBlocks(body.what, 'what', set && ((next) => set({ what: next })))}
        </section>
      )}

      {body.why && body.why.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num={num()} title="왜 지금 화두예요" onRefine={sh('why', '왜 지금 화두예요')} onDelete={del('why')} />
          {renderBlocks(body.why, 'why', set && ((next) => set({ why: next })))}
        </section>
      )}

      {body.forWho && body.forWho.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num={num()} title="누구한테 중요해요" onRefine={sh('forWho', '누구한테 중요해요')} onDelete={del('forWho')} />
          <div className="grid gap-3 sm:grid-cols-2 mt-1">
            {body.forWho.map((w, i) => (
              <div key={i} className="rounded-xl border border-border bg-white p-4">
                <Editable
                  value={w.role}
                  onCommit={set && ((v) => set({ forWho: upd(body.forWho!, i, { ...w, role: v }) }))}
                  className="text-sm font-bold text-accent mb-1 block"
                />
                <Editable
                  as="div"
                  multiline
                  rich
                  value={w.why}
                  onCommit={set && ((v) => set({ forWho: upd(body.forWho!, i, { ...w, why: v }) }))}
                  className="text-[13.5px] text-ink/70 leading-relaxed break-keep block"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {body.keyPoints && body.keyPoints.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num={num()} title="핵심만 빠르게" onRefine={sh('keyPoints', '핵심만 빠르게')} onDelete={del('keyPoints')} />
          <ul className="flex flex-col gap-2.5 mt-1">
            {body.keyPoints.map((k, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-50 text-[11px] font-bold text-accent">
                  {i + 1}
                </span>
                <Editable
                  value={k}
                  multiline
                  rich
                  onCommit={set && ((v) => set({ keyPoints: upd(body.keyPoints!, i, v) }))}
                  className="text-[15px] text-ink/80 leading-relaxed break-keep"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {body.deepDive && body.deepDive.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num={num()} title="좀 더 들어가면" onRefine={sh('deepDive', '좀 더 들어가면')} onDelete={del('deepDive')} />
          {renderBlocks(body.deepDive, 'deep', set && ((next) => set({ deepDive: next })))}
        </section>
      )}

      {body.soWhat && body.soWhat.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num={num()} title="그래서, 내 일엔?" onRefine={sh('soWhat', '그래서, 내 일엔?')} onDelete={del('soWhat')} />
          <div className="rounded-xl border border-accent/20 bg-accent-50/40 p-5">
            {renderBlocks(body.soWhat, 'so', set && ((next) => set({ soWhat: next })))}
          </div>
        </section>
      )}

      {body.sources && body.sources.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <div className="text-xs font-bold text-ink/40 tracking-[0.08em] mb-3">출처·더 보기</div>
          <ul className="flex flex-col gap-1.5">
            {body.sources.map((s, i) => (
              <li key={i} className="flex items-center gap-1">
                <Editable
                  value={s.label}
                  onCommit={set && ((v) => set({ sources: upd(body.sources!, i, { ...s, label: v }) }))}
                  className="text-sm font-medium text-accent"
                />
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline" title={s.url}>
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

// 빈 섹션을 골라 AI 초안으로 채우는 "섹션 추가" 바 — 본문 맨 아래.
function AddSectionBar({ specs, onAdd }: { specs: SectionSpec[]; onAdd: (s: SectionSpec) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-8 border-t border-dashed border-border pt-5">
      <div className="relative flex justify-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-white px-3.5 py-1.5 text-[13px] font-medium text-accent shadow-sm hover:bg-accent-50"
        >
          <Plus className="h-3.5 w-3.5" /> 섹션 추가 <span className="text-ink/40">· AI 초안</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute top-10 z-30 w-64 overflow-hidden rounded-lg border border-border bg-white py-1 shadow-lg">
              <div className="px-3 py-1.5 text-[11px] text-ink/45">빈 섹션을 골라 AI 초안으로 채워요</div>
              {specs.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    onAdd(s);
                    setOpen(false);
                  }}
                  className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-muted"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ContentPreview(props: ContentPreviewProps) {
  const { authorQuote, body, onPatch, onBody, track } = props;
  const refine = useRefine();
  // 최신 body를 apply 시점에 읽어(요청 열고 다른 필드 편집해도 그 편집 보존) 섹션만 교체.
  const bodyRef = useRef(body);
  bodyRef.current = body;

  // 섹션 수정(refine) / 빈 섹션 새로 생성(generate) 공용 — 우측 패널에 요청 등록.
  const openSection = (sectionKey: string, sectionLabel: string, mode: 'refine' | 'generate') => {
    if (!onBody || !refine) return;
    const cur = (body as unknown as Record<string, unknown>)[sectionKey];
    refine.open({
      target: mode === 'refine' ? sectionToLines(cur) : '',
      scope: 'section',
      kind: 'section',
      mode,
      rich: false,
      context: `${track === 'case' ? '실전 케이스' : 'AI 트렌드'} · ${sectionLabel}`,
      section: {
        track: body.kind === 'case' || body.kind === 'trend' ? body.kind : undefined,
        body: body as unknown as Record<string, unknown>,
        sectionKey,
        sectionLabel,
      },
      apply: (chosen) => onBody({ ...(bodyRef.current as object), [sectionKey]: chosen } as ContentBody),
      onClose: () => {},
    });
  };
  const onSectionRefine = onBody && refine ? (k: string, l: string) => openSection(k, l, 'refine') : undefined;

  // 섹션 삭제 — 내용을 비워 미리보기·라이브에서 사라지게(배열→[], 객체→undefined).
  const onSectionDelete = onBody
    ? (sectionKey: string) => {
        const b = bodyRef.current as unknown as Record<string, unknown>;
        const empty = Array.isArray(b[sectionKey]) ? [] : undefined;
        onBody({ ...(bodyRef.current as object), [sectionKey]: empty } as unknown as ContentBody);
      }
    : undefined;

  // 추가 가능한(현재 비어있는) 섹션 목록.
  const emptySpecs =
    onBody && refine ? sectionSpecs(track).filter((s) => isEmptySection((body as unknown as Record<string, unknown>)[s.key])) : [];

  return (
    <div className="rounded-xl border border-border bg-bg">
      <div className="border-b border-border px-4 py-2 text-xs text-ink/50">
        라이브 미리보기 — 본가 {props.track === 'case' ? '/cases' : '/trends'} 상세와 동일 마크업
        {onBody && <span className="ml-2 font-semibold text-accent">텍스트를 클릭하면 바로 수정됩니다</span>}
      </div>
      <article className="mx-auto max-w-[760px] px-6 pb-14">
        <PreviewHeader {...props} />
        {(authorQuote || onPatch) && (
          <blockquote className="mt-6 rounded-xl bg-muted p-5 text-[15px] italic leading-relaxed text-ink/70 break-keep">
            “
            <Editable
              value={authorQuote ?? ''}
              multiline
              placeholder={onPatch ? '운영자 한 줄 (클릭해서 입력)' : ''}
              onCommit={onPatch && ((v) => onPatch({ authorQuote: v }))}
            />
            ”<span className="mt-1 block not-italic text-xs text-ink/40">— 케이스랩 운영자</span>
          </blockquote>
        )}
        <div className="mt-4">
          {body.kind === 'case' ? (
            <CasePreviewBody body={body} onBody={onBody} onSectionRefine={onSectionRefine} onSectionDelete={onSectionDelete} />
          ) : body.kind === 'trend' ? (
            <TrendPreviewBody body={body} onBody={onBody} onSectionRefine={onSectionRefine} onSectionDelete={onSectionDelete} />
          ) : null}
        </div>

        {emptySpecs.length > 0 && (
          <AddSectionBar specs={emptySpecs} onAdd={(s) => openSection(s.key, s.label, 'generate')} />
        )}
      </article>
    </div>
  );
}
