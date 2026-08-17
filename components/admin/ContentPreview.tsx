'use client';

import { useState, useRef, type ReactNode } from 'react';
import { ArrowUpRight, Copy, Check, User, Bot, Plus, Trash2, Sparkles, ChevronUp, ChevronDown, AlignLeft, AlignCenter, AlignRight, PenLine, Paperclip, Terminal, Undo2 } from 'lucide-react';
import type { Block, ContentBody, JobTag, PainPoint, RichSection, StepCard, TakingPoint } from '@/types/content';
import { JOB_LABELS, HEADING_TAG, HEADING_CLASS, HEADING_LEVELS } from '@/types/content';
import { Editable } from '@/components/admin/Editable';
import { useRefine, sectionToLines } from '@/components/admin/RefinePanel';
import { sectionSpecs, isEmptySection, type SectionSpec } from '@/lib/content-sections';
import { ImageBlockField, GalleryField, BookmarkField, newBlock, type AddType } from '@/components/admin/BlockListEditor';
import { ContentGallery } from '@/components/admin/ContentGallery';
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

function SectionHeader({ num, title, onTitle, onRefine, onDelete }: { num: string; title: string; onTitle?: (v: string) => void; onRefine?: () => void; onDelete?: () => void }) {
  return (
    <>
      <div className="text-xs font-bold text-ink/40 tracking-[0.08em] mb-0.5">{num}</div>
      <div className="mb-5 flex items-center gap-2">
        {onTitle ? (
          <Editable
            as="h2"
            value={title}
            onCommit={onTitle}
            className="text-[22px] md:text-2xl font-extrabold tracking-[-0.025em] break-keep"
          />
        ) : (
          <h2 className="text-[22px] md:text-2xl font-extrabold tracking-[-0.025em] break-keep">{title}</h2>
        )}
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

function SectionLead({ text, onCommit }: { text: string; onCommit?: (v: string) => void }) {
  return (
    <Editable
      as="p"
      multiline
      value={text}
      onCommit={onCommit}
      className="text-[15px] text-ink/60 leading-[1.7] mb-4 max-w-[600px] break-keep block"
    />
  );
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
    // 본가 PromptInline/PromptBlock 정합 — 어두운 면 + 흰 복사 버튼(프롬프트 영역임을 명시)
    <div className="my-4 overflow-hidden rounded-xl bg-ink text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white/50">
          <Terminal className="h-3.5 w-3.5" aria-hidden />
          {label ?? '프롬프트'}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="프롬프트 복사"
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-sans text-[13px] font-bold transition-colors',
            copied ? 'bg-accent text-white' : 'bg-white text-ink hover:bg-white/85'
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? '복사됨' : '복사'}
        </button>
      </header>
      <Editable
        as="pre"
        multiline
        value={prompt}
        placeholder={onCommit ? '클릭해서 프롬프트를 입력하세요' : undefined}
        onCommit={onCommit}
        className="overflow-x-auto whitespace-pre-wrap px-4 py-4 font-mono text-[13px] leading-[1.75] text-white/85 hover:bg-white/10"
      />
    </div>
  );
}

// 본가 lib/content-render.tsx의 초안 관련 블록만 이식(text/heading/prompt/result-compare/role-card/checklist).
// onBlock을 넘기면 각 블록 텍스트가 클릭 인라인 편집 대상이 된다.
// 이미지 figure 크기·정렬 클래스(읽기/편집 공통). small·medium만 max-w+정렬, full은 본문폭.
function imgFigCls(size?: string, align?: string) {
  return [
    'my-6',
    size === 'small' ? 'max-w-[320px]' : size === 'medium' ? 'max-w-[480px]' : '',
    size === 'small' || size === 'medium' ? (align === 'left' ? 'mr-auto' : align === 'right' ? 'ml-auto' : 'mx-auto') : '',
  ]
    .filter(Boolean)
    .join(' ');
}

// 미리보기 인라인 이미지 — 실제 크기·정렬로 렌더 + hover 툴바(크기/정렬/교체) + 캡션 인라인.
// 업로드 전(url 없음)이면 드롭존(ImageBlockField).
function PreviewImage({ block, onChange }: { block: Extract<Block, { type: 'image' }>; onChange: (b: Block) => void }) {
  if (!block.url) {
    return (
      <div className="my-4">
        <ImageBlockField block={block} onChange={onChange} />
      </div>
    );
  }
  const size = block.size ?? 'full';
  const align = block.align ?? 'center';
  return (
    <figure className={cn('group/img relative', imgFigCls(block.size, block.align))}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={block.url} alt={block.alt ?? ''} className="w-full h-auto rounded-lg" />
      <div className="absolute left-1/2 top-2 z-10 hidden -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-white/95 px-1.5 py-1 shadow-md group-hover/img:flex">
        {([['small', 'S'], ['medium', 'M'], ['full', '전체']] as const).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange({ ...block, size: v })}
            className={cn('rounded px-1.5 py-0.5 text-[11px]', size === v ? 'bg-accent text-white' : 'text-ink/60 hover:bg-muted')}
          >
            {l}
          </button>
        ))}
        <span className="mx-0.5 h-3.5 w-px bg-border" />
        {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([v, Icon]) => (
          <button
            key={v}
            type="button"
            disabled={size === 'full'}
            title={size === 'full' ? '전체폭에선 정렬이 없어요' : '정렬'}
            onClick={() => onChange({ ...block, align: v })}
            className={cn('rounded p-1 disabled:opacity-25', align === v && size !== 'full' ? 'bg-accent text-white' : 'text-ink/60 hover:bg-muted')}
          >
            <Icon className="h-3 w-3" />
          </button>
        ))}
        <span className="mx-0.5 h-3.5 w-px bg-border" />
        <button type="button" onClick={() => onChange({ ...block, url: '' })} className="rounded px-1.5 py-0.5 text-[11px] text-accent hover:bg-muted">
          교체
        </button>
      </div>
      <figcaption className="mt-2 text-center text-[13px] text-ink/55">
        <Editable value={block.caption ?? ''} onCommit={(v) => onChange({ ...block, caption: v })} placeholder="＋ 캡션" className="inline-block min-w-[40px]" />
      </figcaption>
    </figure>
  );
}

// 미리보기 인라인 소제목 — 실제 크기로 렌더 + 대/중/소(H2/H3/H4) 레벨 선택 툴바.
// BlockListEditor의 드롭다운과 동일한 HEADING_LEVELS를 공유. 항상 보이되(발견성) hover 시 진해짐.
function PreviewHeading({ block, onChange }: { block: Extract<Block, { type: 'heading' }>; onChange: (b: Block) => void }) {
  return (
    <div className="group/hd relative">
      <div className="absolute -top-3 left-0 z-10 flex items-center gap-0.5 rounded-full border border-border bg-white/95 px-1 py-0.5 shadow-sm opacity-70 transition-opacity group-hover/hd:opacity-100">
        {HEADING_LEVELS.map((hd) => (
          <button
            key={hd.level}
            type="button"
            onClick={() => onChange({ ...block, level: hd.level })}
            title={`소제목 ${hd.label} (H${hd.level})`}
            className={cn(
              'rounded px-1.5 py-0.5 text-[11px] leading-none',
              block.level === hd.level ? 'bg-accent text-white' : 'text-ink/60 hover:bg-muted',
            )}
          >
            {hd.label}
          </button>
        ))}
      </div>
      <Editable
        as={HEADING_TAG[block.level]}
        value={block.text}
        placeholder="소제목을 입력하세요"
        onCommit={(v) => onChange({ ...block, text: v })}
        className={`${HEADING_CLASS[block.level]} block`}
      />
    </div>
  );
}

const TEXT_BASE_CLS = 'text-[16px] text-ink/85 my-4 whitespace-pre-wrap block';
// 줄간격 · 여백 높이 · 구분선 굵기/색 · 콜아웃 배경 — 본가 content-render.tsx와 같은 값으로 유지.
const TEXT_LEADING: Record<string, string> = { tight: 'leading-[1.5]', normal: 'leading-[1.75]', loose: 'leading-[2.1]' };
const TEXT_SPACING_OPTS = [['tight', '좁게'], ['normal', '보통'], ['loose', '넓게']] as const;
const TEXT_BLOCK_CLS = cn(TEXT_BASE_CLS, TEXT_LEADING.normal);
const SPACER_H: Record<string, string> = { sm: 'h-6', md: 'h-12', lg: 'h-20' };
const SPACER_OPTS = [['sm', '좁게'], ['md', '보통'], ['lg', '넓게']] as const;
const DIVIDER_THICK: Record<string, string> = { thin: 'border-t', medium: 'border-t-2', thick: 'border-t-4' };
const DIVIDER_THICK_OPTS = [['thin', '가늘게'], ['medium', '보통'], ['thick', '굵게']] as const;
const DIVIDER_COLOR: Record<string, string> = { gray: 'border-border', black: 'border-ink', accent: 'border-accent' };
const DIVIDER_COLOR_OPTS = [['gray', '회색'], ['black', '검정'], ['accent', '포인트']] as const;
const CALLOUT_BOX: Record<string, string> = {
  yellow: 'bg-amber-50 border-amber-200',
  blue: 'bg-blue-50 border-blue-200',
  green: 'bg-green-50 border-green-200',
  red: 'bg-red-50 border-red-200',
  gray: 'bg-muted border-border',
};
const CALLOUT_DOT: Record<string, string> = { yellow: 'bg-amber-300', blue: 'bg-blue-300', green: 'bg-green-300', red: 'bg-red-300', gray: 'bg-ink/25' };
const CALLOUT_COLOR_ORDER = ['yellow', 'blue', 'green', 'red', 'gray'] as const;

// 작은 세그먼트 토글 — hover 툴바 안 옵션(줄간격·굵기·색 등) 공통.
function SegToggle<T extends string>({ options, value, onPick }: { options: readonly (readonly [T, string])[]; value: T; onPick: (v: T) => void }) {
  return (
    <>
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className={cn('rounded px-1.5 py-0.5 text-[11px] leading-none', value === v ? 'bg-accent text-white' : 'text-ink/60 hover:bg-muted')}
        >
          {l}
        </button>
      ))}
    </>
  );
}

// 미리보기 인라인 문단 — 실제 크기로 렌더 + 줄간격(좁게/보통/넓게) hover 툴바.
function PreviewText({ block, onBlock }: { block: Extract<Block, { type: 'text' }>; onBlock: (b: Block) => void }) {
  return (
    <div className="group/txt relative">
      <div className="absolute -top-3 right-0 z-10 flex items-center gap-0.5 rounded-full border border-border bg-white/95 px-1.5 py-0.5 shadow-sm opacity-0 transition-opacity group-hover/txt:opacity-100">
        <span className="mr-0.5 text-[10px] text-ink/40">줄간격</span>
        <SegToggle options={TEXT_SPACING_OPTS} value={block.spacing ?? 'normal'} onPick={(v) => onBlock({ ...block, spacing: v })} />
      </div>
      <Editable
        as="p"
        multiline
        rich
        value={block.markdown}
        placeholder="클릭해서 문단 내용을 입력하세요"
        onCommit={(v) => onBlock({ ...block, markdown: v })}
        className={cn(TEXT_BASE_CLS, TEXT_LEADING[block.spacing ?? 'normal'])}
      />
    </div>
  );
}

// 미리보기 인라인 여백 — 편집 시 점선 자리표시 + 높이(좁게/보통/넓게) 툴바. 읽기: 순수 빈 공간.
function PreviewSpacer({ block, onChange }: { block: Extract<Block, { type: 'spacer' }>; onChange: (b: Block) => void }) {
  return (
    <div className={cn('group/sp relative my-1 flex items-center justify-center rounded-md border border-dashed border-accent/25 bg-accent/[0.03]', SPACER_H[block.size ?? 'md'])}>
      <div className="flex items-center gap-0.5 rounded-full border border-border bg-white/95 px-1.5 py-0.5 shadow-sm opacity-70 transition-opacity group-hover/sp:opacity-100">
        <span className="mr-0.5 text-[10px] text-ink/40">여백</span>
        <SegToggle options={SPACER_OPTS} value={block.size ?? 'md'} onPick={(v) => onChange({ ...block, size: v })} />
      </div>
    </div>
  );
}

// 미리보기 인라인 구분선 — 실제 실선 렌더 + 굵기·색 hover 툴바.
function PreviewDivider({ block, onChange }: { block: Extract<Block, { type: 'divider' }>; onChange: (b: Block) => void }) {
  return (
    <div className="group/dv relative my-6">
      <hr className={cn(DIVIDER_THICK[block.thickness ?? 'medium'], DIVIDER_COLOR[block.color ?? 'gray'])} />
      <div className="absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-white/95 px-1.5 py-0.5 shadow-sm opacity-0 transition-opacity group-hover/dv:opacity-100">
        <SegToggle options={DIVIDER_THICK_OPTS} value={block.thickness ?? 'medium'} onPick={(v) => onChange({ ...block, thickness: v })} />
        <span className="mx-0.5 h-3.5 w-px bg-border" />
        <SegToggle options={DIVIDER_COLOR_OPTS} value={block.color ?? 'gray'} onPick={(v) => onChange({ ...block, color: v })} />
      </div>
    </div>
  );
}

// 미리보기 인라인 강조 박스 — 실제 배경색 박스 + 아이콘(클릭 편집)·본문(rich) 인라인 편집 + 색상 hover 팔레트.
function PreviewCallout({ block, onChange }: { block: Extract<Block, { type: 'callout' }>; onChange: (b: Block) => void }) {
  return (
    <div className={cn('group/co relative my-4 flex gap-3 rounded-lg border p-4', CALLOUT_BOX[block.color ?? 'yellow'])}>
      <Editable
        value={block.icon ?? '💡'}
        onCommit={(v) => onChange({ ...block, icon: v.trim() || undefined })}
        className="shrink-0 text-lg leading-[1.6]"
        title="클릭해서 아이콘(이모지) 변경"
      />
      <Editable
        as="div"
        multiline
        rich
        value={block.markdown}
        placeholder="강조할 내용을 입력하세요"
        onCommit={(v) => onChange({ ...block, markdown: v })}
        className="min-w-0 flex-1 text-[15px] leading-[1.7] text-ink/85 whitespace-pre-wrap block"
      />
      <div className="absolute -top-3 left-3 z-10 flex items-center gap-1 rounded-full border border-border bg-white/95 px-2 py-1 shadow-sm opacity-0 transition-opacity group-hover/co:opacity-100">
        {CALLOUT_COLOR_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange({ ...block, color: c })}
            className={cn('h-4 w-4 rounded-full ring-offset-1 hover:ring-2 hover:ring-accent/50', CALLOUT_DOT[c], (block.color ?? 'yellow') === c && 'ring-2 ring-accent/60')}
          />
        ))}
      </div>
    </div>
  );
}

// 빈 문단 — 바로 ✨AI수정 대신 채우는 방법을 먼저 고르게 한다:
// ✍ 직접 쓰기(즉시 편집 진입) / ✨ 방향 적고 AI 초안 / 📎 파일 넣고 AI 초안(우측 패널 generate·text 모드).
function EmptyTextBlock({ block, onBlock }: { block: Extract<Block, { type: 'text' }>; onBlock: (nb: Block) => void }) {
  const refine = useRefine();
  const [writing, setWriting] = useState(false);

  const openDraft = (source: 'direction' | 'file') => {
    refine?.open({
      target: '',
      scope: 'field',
      kind: 'text',
      mode: 'generate',
      draftSource: source,
      rich: true,
      context: '본문 문단',
      apply: (chosen) => onBlock({ ...block, markdown: String(chosen) }),
      onClose: () => {},
    });
  };

  if (writing) {
    // 아무것도 안 쓰고 나가면(blur 커밋 후에도 빈 값) 선택지 바로 복귀
    return (
      <div onBlur={() => setTimeout(() => setWriting(false), 120)}>
        <Editable as="p" multiline rich autoEdit value={block.markdown} placeholder="문단 내용을 입력하세요" onCommit={(v) => onBlock({ ...block, markdown: v })} className={TEXT_BLOCK_CLS} />
      </div>
    );
  }

  const btn = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors';
  return (
    <div className="my-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3">
      <span className="text-[12px] text-ink/45">빈 문단 —</span>
      <button type="button" onClick={() => setWriting(true)} className={cn(btn, 'border-border bg-white text-ink/70 hover:border-ink/30 hover:text-ink')}>
        <PenLine className="h-3 w-3" /> 직접 쓰기
      </button>
      {refine && (
        <>
          <button type="button" onClick={() => openDraft('direction')} className={cn(btn, 'border-accent/40 bg-white text-accent hover:bg-accent-50')}>
            <Sparkles className="h-3 w-3" /> 방향 적고 AI 초안
          </button>
          <button type="button" onClick={() => openDraft('file')} className={cn(btn, 'border-accent/40 bg-white text-accent hover:bg-accent-50')}>
            <Paperclip className="h-3 w-3" /> 파일 넣고 AI 초안
          </button>
        </>
      )}
    </div>
  );
}

function renderBlock(block: Block, key: string | number, onBlock?: (nb: Block) => void) {
  switch (block.type) {
    case 'text':
      // 빈 문단(새로 추가 or 내용 지움)은 채우기 선택지부터 — 직접 쓰기 / AI 초안(방향·파일)
      if (onBlock && !block.markdown.trim()) return <EmptyTextBlock key={key} block={block} onBlock={onBlock} />;
      // 편집: 줄간격 툴바 + 인라인 편집. 읽기: 저장된 줄간격으로 렌더.
      if (onBlock) return <PreviewText key={key} block={block} onBlock={onBlock} />;
      return (
        <Editable
          key={key}
          as="p"
          multiline
          rich
          value={block.markdown}
          className={cn(TEXT_BASE_CLS, TEXT_LEADING[block.spacing ?? 'normal'])}
        />
      );
    case 'heading':
      // 편집: 대/중/소 레벨 선택 툴바 + 인라인 텍스트 편집. 읽기: 해당 레벨 태그로만 렌더.
      if (onBlock) return <PreviewHeading key={key} block={block} onChange={onBlock} />;
      return (
        <Editable
          key={key}
          as={HEADING_TAG[block.level]}
          value={block.text}
          className={`${HEADING_CLASS[block.level]} block`}
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
          <Editable as="h4" value={block.title} placeholder={onBlock ? '체크리스트 제목' : undefined} onCommit={onBlock && ((v) => onBlock({ ...block, title: v }))} className="font-semibold mb-3 block" />
          <ul className="space-y-1.5">
            {block.items.map((it, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink/85">
                <span className="text-accent">✓</span>
                <Editable value={it} rich placeholder={onBlock ? '항목 내용' : undefined} onCommit={onBlock && ((v) => onBlock({ ...block, items: upd(block.items, i, v) }))} />
              </li>
            ))}
          </ul>
        </div>
      );
    case 'image':
      // 편집: 실제 크기·정렬로 렌더 + hover 툴바(크기/정렬/교체). 업로드 전이면 드롭존.
      if (onBlock) return <PreviewImage key={key} block={block} onChange={onBlock} />;
      return (
        <figure key={key} className={imgFigCls(block.size, block.align)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url} alt={block.alt ?? ''} className="w-full h-auto rounded-lg" loading="lazy" />
          {block.caption && <figcaption className="mt-2 text-center text-[13px] text-ink/55">{block.caption}</figcaption>}
        </figure>
      );
    case 'gallery':
      // 편집: 카드뉴스 미리보기 + 관리(추가·순서·삭제). 읽기: 캐러셀.
      if (onBlock) {
        return (
          <div key={key} className="my-4 space-y-2">
            {block.images.length > 0 && <ContentGallery images={block.images} />}
            <GalleryField block={block} onChange={onBlock} />
          </div>
        );
      }
      return <ContentGallery key={key} images={block.images} />;
    case 'bookmark':
      if (onBlock) {
        return (
          <div key={key} className="my-4">
            <BookmarkField block={block} onChange={onBlock} />
          </div>
        );
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
            {block.siteName && <div className="mt-2 text-[11px] text-ink/45">{block.siteName}</div>}
          </div>
          {block.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={block.image} alt="" className="w-28 shrink-0 object-cover sm:w-40" />
          )}
        </a>
      );
    case 'spacer':
      if (onBlock) return <PreviewSpacer key={key} block={block} onChange={onBlock} />;
      return <div key={key} aria-hidden className={SPACER_H[block.size ?? 'md']} />;
    case 'divider':
      if (onBlock) return <PreviewDivider key={key} block={block} onChange={onBlock} />;
      return <hr key={key} className={cn('my-6', DIVIDER_THICK[block.thickness ?? 'medium'], DIVIDER_COLOR[block.color ?? 'gray'])} />;
    case 'callout':
      if (onBlock) return <PreviewCallout key={key} block={block} onChange={onBlock} />;
      return (
        <div key={key} className={cn('my-4 flex gap-3 rounded-lg border p-4', CALLOUT_BOX[block.color ?? 'yellow'])}>
          <span className="shrink-0 text-lg leading-[1.6]">{block.icon || '💡'}</span>
          <Editable as="div" rich value={block.markdown} className="min-w-0 flex-1 text-[15px] leading-[1.7] text-ink/85 whitespace-pre-wrap block" />
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

// 미리보기 삽입 메뉴 — 노션식 hover "+". 블록 사이/끝에서 이미지·문단·소제목·프롬프트·체크리스트 삽입.
const INSERT_ITEMS: { type: AddType; label: string }[] = [
  { type: 'image', label: '🖼  이미지' },
  { type: 'gallery', label: '🎞  갤러리(카드뉴스)' },
  { type: 'bookmark', label: '🔖  북마크' },
  { type: 'text', label: '¶  문단' },
  { type: 'heading', label: 'H  소제목' },
  { type: 'callout', label: '💡  강조 박스' },
  { type: 'divider', label: '―  구분선' },
  { type: 'spacer', label: '↕  여백' },
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
  const moveAt = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[idx], next[j]] = [next[j], next[idx]];
    onBlocks(next);
  };
  const nodes: JSX.Element[] = [];
  list.forEach((b, i) => {
    nodes.push(<InsertBar key={`${prefix}-ins-${i}`} onInsert={(nb) => insertAt(i, nb)} />);
    nodes.push(
      <div key={`${prefix}-row-${i}`} className="group/blk relative">
        {/* hover 컨트롤 — 위/아래 이동 + 삭제 */}
        <div className="absolute -right-1 -top-2 z-10 hidden items-center gap-0.5 rounded-full border border-border bg-white px-1 py-0.5 shadow-sm group-hover/blk:flex">
          <button type="button" onClick={() => moveAt(i, -1)} disabled={i === 0} title="위로" className="p-0.5 text-ink/50 hover:text-ink disabled:opacity-25">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => moveAt(i, 1)} disabled={i === list.length - 1} title="아래로" className="p-0.5 text-ink/50 hover:text-ink disabled:opacity-25">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => removeAt(i)} title="삭제" className="p-0.5 text-red-500 hover:text-red-700">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {renderBlock(b, `${prefix}-${i}`, (nb) => onBlocks(upd(list, i, nb)))}
      </div>,
    );
  });
  nodes.push(<InsertBar key={`${prefix}-ins-end`} onInsert={(nb) => insertAt(list.length, nb)} />);
  return nodes;
}

// 자유 섹션(body.sections) — 고정 스펙 밖에서 운영자가 직접 만든 섹션.
// 본가 components/content/RichSections.tsx와 동일 마크업(라벨 eyebrow → h2 → 블록).
// 케이스는 본문 맨 끝, 트렌드는 '출처·더 보기' 바로 위에 순서대로 렌더된다.
function FreeSections({
  sections,
  onSections,
  onRefine,
}: {
  sections: RichSection[];
  onSections?: (next: RichSection[]) => void;
  onRefine?: (index: number) => void;
}) {
  // 읽기 모드는 본가와 동일하게 블록 없는 섹션을 건너뛴다(편집 모드는 채울 수 있게 보여줌).
  const list = onSections ? sections : sections.filter((s) => s.blocks?.length);
  if (list.length === 0) return null;
  const setAt = (i: number, next: RichSection) => onSections?.(upd(sections, i, next));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (!onSections || j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    onSections(next);
  };
  return (
    <>
      {list.map((s, i) => {
        // 첫 블록이 소제목이면 그게 사실상 섹션 제목 → 빈 label/heading 슬롯을 띄우지 않는다(중복 제목 방지).
        const ownTitle = s.blocks?.[0]?.type === 'heading';
        return (
        <section key={i} className="pt-11 mt-11 border-t border-border">
          {(s.label || (onSections && !ownTitle)) && (
            <Editable
              value={s.label ?? ''}
              placeholder={onSections ? '라벨 (선택)' : undefined}
              onCommit={onSections && ((v) => setAt(i, { ...s, label: v.trim() || undefined }))}
              className="text-xs font-bold text-ink/40 tracking-[0.08em] mb-0.5 block"
            />
          )}
          <div className={cn('flex items-center gap-2', (s.heading || (onSections && !ownTitle)) ? 'mb-5' : 'mb-2')}>
            {(s.heading || (onSections && !ownTitle)) && (
              <Editable
                as="h2"
                value={s.heading ?? ''}
                placeholder={onSections ? '섹션 제목 (선택)' : undefined}
                onCommit={onSections && ((v) => setAt(i, { ...s, heading: v.trim() || undefined }))}
                className="text-[22px] md:text-2xl font-extrabold tracking-[-0.025em] break-keep"
              />
            )}
            {onRefine && (
              <button
                type="button"
                onClick={() => onRefine(i)}
                title="이 섹션 내용을 AI로 쓰기·다시 쓰기"
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-accent/30 px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent-50"
              >
                <Sparkles className="h-3 w-3" /> {s.blocks?.length ? '섹션 수정' : 'AI 초안'}
              </button>
            )}
            {onSections && (
              <>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="위 섹션과 순서 바꾸기" className="shrink-0 rounded-full border border-border p-1 text-ink/45 hover:text-ink disabled:opacity-25">
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === sections.length - 1} title="아래 섹션과 순서 바꾸기" className="shrink-0 rounded-full border border-border p-1 text-ink/45 hover:text-ink disabled:opacity-25">
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('이 섹션을 삭제할까요? (블록까지 함께 지워져요)')) onSections(sections.filter((_, k) => k !== i));
                  }}
                  title="이 섹션 삭제"
                  className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-ink/45 hover:border-red-300 hover:text-red-500"
                >
                  <Trash2 className="h-3 w-3" /> 삭제
                </button>
              </>
            )}
          </div>
          {onSections && !s.blocks?.length && (
            <p className="mb-2 rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-ink/45">
              블록이 하나도 없어요. 아래 &lsquo;삽입&rsquo;으로 내용을 넣어야 라이브에 보여요.
            </p>
          )}
          {renderBlocks(s.blocks ?? [], `free-${i}`, onSections && ((next) => setAt(i, { ...s, blocks: next })))}
        </section>
        );
      })}
    </>
  );
}

function PreviewHeader({
  track,
  title,
  summary,
  jobTags,
  readMin,
  applyMin,
  onPatch,
  onDocRefine,
  onUndoDoc,
}: ContentPreviewProps & {
  /** 제목 위 'AI 전체수정' — 우측 패널에 문서 전체 수정 요청을 올린다. 편집 모드에서만 전달된다. */
  onDocRefine?: () => void;
  /** 직전 전체수정 되돌리기 — 적용 후에만 전달된다. */
  onUndoDoc?: () => void;
}) {
  const primaryJob = jobTags?.[0];
  const trackLabel = track === 'case' ? '실전 케이스' : 'AI 트렌드';
  return (
    <header className="py-10 md:py-14">
      {/* 트랙 뱃지 + 문서 전체 수정 — 제목 바로 위 한 줄. 부분 수정(문단·섹션 ✨)과 짝을 이루는 진입점. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="inline-block text-xs font-bold text-accent bg-accent-50 px-2.5 py-1 rounded">
          {trackLabel}
          {primaryJob ? ` · ${JOB_LABELS[primaryJob] ?? primaryJob}` : ''}
        </span>
        {onDocRefine && (
          <div className="ml-auto flex items-center gap-1.5">
            {onUndoDoc && (
              <button
                type="button"
                onClick={onUndoDoc}
                title="직전 전체수정 적용을 취소하고 이전 본문으로"
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-ink/60 hover:bg-muted"
              >
                <Undo2 className="h-3 w-3" /> 전체수정 되돌리기
              </button>
            )}
            <button
              type="button"
              onClick={onDocRefine}
              title="본문 전체를 AI로 수정(모든 섹션 한 번에)"
              className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-50 px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent hover:text-white"
            >
              <Sparkles className="h-3 w-3" /> AI 전체수정
            </button>
          </div>
        )}
      </div>
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

function CasePreviewBody({ body, onBody, onSectionRefine, onSectionDelete, onFreeRefine, addBar }: { body: CaseBodyT; onBody?: (next: ContentBody) => void; onSectionRefine?: (key: string, label: string, keys?: string[]) => void; onSectionDelete?: (key: string, keys?: string[]) => void; onFreeRefine?: (index: number) => void; addBar?: ReactNode }) {
  const set = onBody && ((patch: Partial<CaseBodyT>) => onBody({ ...body, ...patch }));
  // keys = 복합 섹션(화면상 한 섹션인데 body 키가 여럿). 안 주면 key 하나짜리 일반 섹션.
  const sh = (key: string, label: string, keys?: string[]) =>
    onSectionRefine ? () => onSectionRefine(key, label, keys) : undefined;
  const del = (key: string, keys?: string[]) => (onSectionDelete ? () => onSectionDelete(key, keys) : undefined);
  // 소제목·리드 오버라이드 — 기본 문구를 클릭 편집으로 덮어씀(비우면 기본 복귀).
  const h = (key: string, def: string) => body.headings?.[key]?.trim() || def;
  const setH = (key: string) =>
    set &&
    ((v: string) => {
      const headings = { ...(body.headings ?? {}) };
      if (v.trim()) headings[key] = v;
      else delete headings[key];
      set({ headings });
    });
  return (
    <div className="prose-caselab">
      {body.forWho && body.forWho.length > 0 && (
        <section className="pt-2">
          <SectionHeader num="01" title={h('forWho', '이런 분들을 위한 글이에요')} onTitle={setH('forWho')} onRefine={sh('forWho', '이런 분들을 위한 글이에요')} onDelete={del('forWho')} />
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
          <SectionHeader num="02" title={h('caseIntro', '어떤 케이스를 다루나요')} onTitle={setH('caseIntro')} onRefine={sh('caseIntro', '어떤 케이스를 다루나요')} onDelete={del('caseIntro')} />
          {renderBlocks(body.caseIntro, 'intro', set && ((next) => set({ caseIntro: next })))}
        </section>
      )}

      {body.painPoints && body.painPoints.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num="03" title={h('painPoints', '보통 이런 일에서 막히는 이유')} onTitle={setH('painPoints')} onRefine={sh('painPoints', '보통 이런 일에서 막히는 이유')} onDelete={del('painPoints')} />
          <SectionLead text={h('painPoints.lead', '실무에서 반복적으로 나오는 3가지 문제와, 그 근본 원인을 정리했습니다.')} onCommit={setH('painPoints.lead')} />
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
          <SectionHeader num="04" title={h('frameworkReference', '적용한 Framework')} onTitle={setH('frameworkReference')} onRefine={sh('frameworkReference', '적용한 Framework')} onDelete={del('frameworkReference')} />
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
          <SectionHeader num="05" title={h('stepCards', '단계별 AI 활용')} onTitle={setH('stepCards')} onRefine={sh('stepCards', '단계별 AI 활용')} onDelete={del('stepCards')} />
          <SectionLead text={h('stepCards.lead', '단계마다 사람이 먼저 손으로 만든 입력이 있어야 AI 출력이 쓸 만합니다. 각 단계는 "사람이 할 일 / AI에 시킬 일 / 프롬프트 / 결과 비교" 4개로 구성됩니다.')} onCommit={setH('stepCards.lead')} />
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
          {/* 복합 섹션 — 화면상 한 섹션이지만 body는 pros·cons 두 키다. 둘을 함께 재구성/삭제한다. */}
          <SectionHeader
            num="06"
            title={h('prosCons', '좋았던 점 · 아쉬웠던 점')}
            onTitle={setH('prosCons')}
            onRefine={sh('pros', '좋았던 점 · 아쉬웠던 점', ['pros', 'cons'])}
            onDelete={del('pros', ['pros', 'cons'])}
          />
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
          <SectionHeader num="07" title={h('takingPoints', '핵심 Taking point')} onTitle={setH('takingPoints')} onRefine={sh('takingPoints', '핵심 Taking point')} onDelete={del('takingPoints')} />
          <SectionLead text={h('takingPoints.lead', '이 글에서 가져갈 3가지. 본인 일에 바로 옮길 수 있는 액션도 함께.')} onCommit={setH('takingPoints.lead')} />
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

      {/* 자유 섹션 — 본가 케이스 상세도 고정 섹션 뒤에 이어서 렌더 */}
      <FreeSections
        sections={body.sections ?? []}
        onSections={set && ((next) => set({ sections: next }))}
        onRefine={onFreeRefine}
      />

      {/* 섹션 추가 바 — 케이스는 출처 섹션이 없어 본문 맨 끝이 곧 삽입 지점 */}
      {addBar}
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
      {/* 본가 StepCard는 헤더에 스텝 제목이 아니라 '프롬프트' 고정 라벨 — label 안 넘긴다 */}
      {step.prompt !== undefined && (
        <PromptBlockView prompt={step.prompt} onCommit={set && ((v) => set({ prompt: v }))} />
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

function TrendPreviewBody({ body, onBody, onSectionRefine, onSectionDelete, onFreeRefine, addBar }: { body: TrendBodyT; onBody?: (next: ContentBody) => void; onSectionRefine?: (key: string, label: string, keys?: string[]) => void; onSectionDelete?: (key: string, keys?: string[]) => void; onFreeRefine?: (index: number) => void; addBar?: ReactNode }) {
  const set = onBody && ((patch: Partial<TrendBodyT>) => onBody({ ...body, ...patch }));
  // keys = 복합 섹션(화면상 한 섹션인데 body 키가 여럿). 안 주면 key 하나짜리 일반 섹션.
  const sh = (key: string, label: string, keys?: string[]) =>
    onSectionRefine ? () => onSectionRefine(key, label, keys) : undefined;
  const del = (key: string, keys?: string[]) => (onSectionDelete ? () => onSectionDelete(key, keys) : undefined);
  // 소제목 오버라이드 — 기본 문구를 클릭 편집으로 덮어씀(비우면 기본 복귀).
  const h = (key: string, def: string) => body.headings?.[key]?.trim() || def;
  const setH = (key: string) =>
    set &&
    ((v: string) => {
      const headings = { ...(body.headings ?? {}) };
      if (v.trim()) headings[key] = v;
      else delete headings[key];
      set({ headings });
    });
  let n = 0;
  const num = () => String(++n).padStart(2, '0');
  return (
    <div className="prose-caselab">
      {body.what && body.what.length > 0 && (
        <section className="pt-2">
          <SectionHeader num={num()} title={h('what', '무슨 소식이에요')} onTitle={setH('what')} onRefine={sh('what', '무슨 소식이에요')} onDelete={del('what')} />
          {renderBlocks(body.what, 'what', set && ((next) => set({ what: next })))}
        </section>
      )}

      {body.why && body.why.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num={num()} title={h('why', '왜 지금 화두예요')} onTitle={setH('why')} onRefine={sh('why', '왜 지금 화두예요')} onDelete={del('why')} />
          {renderBlocks(body.why, 'why', set && ((next) => set({ why: next })))}
        </section>
      )}

      {body.forWho && body.forWho.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num={num()} title={h('forWho', '누구한테 중요해요')} onTitle={setH('forWho')} onRefine={sh('forWho', '누구한테 중요해요')} onDelete={del('forWho')} />
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
          <SectionHeader num={num()} title={h('keyPoints', '핵심만 빠르게')} onTitle={setH('keyPoints')} onRefine={sh('keyPoints', '핵심만 빠르게')} onDelete={del('keyPoints')} />
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
          <SectionHeader num={num()} title={h('deepDive', '좀 더 들어가면')} onTitle={setH('deepDive')} onRefine={sh('deepDive', '좀 더 들어가면')} onDelete={del('deepDive')} />
          {renderBlocks(body.deepDive, 'deep', set && ((next) => set({ deepDive: next })))}
        </section>
      )}

      {body.soWhat && body.soWhat.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <SectionHeader num={num()} title={h('soWhat', '그래서, 내 일엔?')} onTitle={setH('soWhat')} onRefine={sh('soWhat', '그래서, 내 일엔?')} onDelete={del('soWhat')} />
          <div className="rounded-xl border border-accent/20 bg-accent-50/40 p-5">
            {renderBlocks(body.soWhat, 'so', set && ((next) => set({ soWhat: next })))}
          </div>
        </section>
      )}

      {/* 자유 섹션 — 고정 6섹션 뒤, '출처·더 보기' 앞(본가 트렌드 상세와 동일 순서) */}
      <FreeSections
        sections={body.sections ?? []}
        onSections={set && ((next) => set({ sections: next }))}
        onRefine={onFreeRefine}
      />

      {/* 섹션 추가 바도 출처 위 — 출처는 언제나 본문 맨 끝이고, 새 섹션은 그 위에 쌓인다.
          (바가 출처 아래 있으면 "여기 누르면 여기 생긴다"는 위치 감각이 어긋난다) */}
      {addBar}

      {body.sources && body.sources.length > 0 && (
        <section className="pt-11 mt-11 border-t border-border">
          <Editable
            value={h('sources', '출처·더 보기')}
            onCommit={setH('sources')}
            className="text-xs font-bold text-ink/40 tracking-[0.08em] mb-3 block"
          />
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

// 섹션 추가 바 — 본문 맨 아래. 항상 노출된다(고정 섹션이 다 차 있어도 자유 섹션은 계속 추가 가능).
//  1) 비어있는 고정 섹션 → AI 초안으로 채우기
//  2) 새 자유 섹션 → AI 초안으로 통째 쓰기
//  3) 새 자유 섹션 → 콘텐츠 타입(문단·이미지·갤러리…)을 골라 빈 블록으로 시작
function AddSectionBar({
  specs,
  onFillEmpty,
  onAddFree,
  onAddFreeAi,
}: {
  specs: SectionSpec[];
  onFillEmpty: (s: SectionSpec) => void;
  onAddFree: (type: AddType) => void;
  onAddFreeAi: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
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
            <div className="fixed inset-0 z-20" onClick={close} />
            <div className="absolute top-10 z-30 max-h-[60vh] w-72 overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-lg">
              {specs.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-ink/45">빈 섹션 채우기 · AI 초안</div>
                  {specs.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => {
                        onFillEmpty(s);
                        close();
                      }}
                      className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      {s.label}
                    </button>
                  ))}
                  <div className="my-1 border-t border-border" />
                </>
              )}

              <div className="px-3 py-1.5 text-[11px] font-semibold text-ink/45">새 섹션 추가</div>
              <button
                type="button"
                onClick={() => {
                  onAddFreeAi();
                  close();
                }}
                className="flex w-full items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-left text-sm font-medium text-accent hover:bg-accent-50"
              >
                <Sparkles className="h-3.5 w-3.5" /> AI 초안으로 새 섹션
              </button>
              <div className="px-3 pb-1 pt-1.5 text-[11px] text-ink/45">직접 만들기 — 콘텐츠 타입 선택</div>
              {INSERT_ITEMS.map((it) => (
                <button
                  key={it.type}
                  type="button"
                  onClick={() => {
                    onAddFree(it.type);
                    close();
                  }}
                  className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-muted"
                >
                  {it.label}
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
  const { authorQuote, body, onPatch, onBody, track, title, summary } = props;
  const refine = useRefine();
  // 최신 body를 apply 시점에 읽어(요청 열고 다른 필드 편집해도 그 편집 보존) 섹션만 교체.
  const bodyRef = useRef(body);
  bodyRef.current = body;

  // ── 문서 전체 수정 — 모든 섹션을 한 번에. 되돌릴 수 있게 적용 직전 상태를 들고 있는다.
  // (부분 수정과 달리 한 번에 본문 전체가 갈아엎히므로 실수하면 복구 수단이 없다)
  const [docUndo, setDocUndo] = useState<{ body: ContentBody; title: string; summary: string } | null>(null);

  const openDocument = () => {
    if (!onBody || !refine) return;
    const trackLabel = track === 'case' ? '실전 케이스' : 'AI 트렌드';
    refine.open({
      target: '',
      scope: 'document',
      kind: 'document',
      rich: false,
      context: `${trackLabel} · 본문 전체`,
      document: {
        track,
        body: bodyRef.current as unknown as Record<string, unknown>,
        title,
        summary: summary ?? undefined,
      },
      apply: (chosen) => {
        const v = chosen as { title?: string; summary?: string; body: Record<string, unknown> };
        if (!v?.body) return;
        setDocUndo({ body: bodyRef.current, title, summary: summary ?? '' });
        onBody(v.body as unknown as ContentBody);
        // 제목·요약은 각도가 요구했을 때만 후보에 들어온다 → 있을 때만 덮어쓴다.
        if (onPatch && (v.title !== undefined || v.summary !== undefined)) {
          onPatch({ ...(v.title !== undefined ? { title: v.title } : {}), ...(v.summary !== undefined ? { summary: v.summary } : {}) });
        }
      },
      onClose: () => {},
    });
  };

  const undoDocument = () => {
    if (!docUndo || !onBody) return;
    onBody(docUndo.body);
    onPatch?.({ title: docUndo.title, summary: docUndo.summary });
    setDocUndo(null);
  };

  // 섹션 수정(refine) / 빈 섹션 새로 생성(generate) 공용 — 우측 패널에 요청 등록.
  // keys를 주면 복합 섹션(화면상 한 섹션인데 body 키가 여럿, 예: pros+cons)으로 다룬다.
  const openSection = (sectionKey: string, sectionLabel: string, mode: 'refine' | 'generate', keys?: string[]) => {
    if (!onBody || !refine) return;
    const b = body as unknown as Record<string, unknown>;
    const cur = keys ? Object.fromEntries(keys.map((k) => [k, b[k]])) : b[sectionKey];
    refine.open({
      target: mode === 'refine' ? sectionToLines(cur) : '',
      scope: 'section',
      kind: 'section',
      mode,
      rich: false,
      context: `${track === 'case' ? '실전 케이스' : 'AI 트렌드'} · ${sectionLabel}`,
      section: {
        track: body.kind === 'case' || body.kind === 'trend' ? body.kind : undefined,
        body: b,
        sectionKey,
        sectionKeys: keys,
        sectionLabel,
      },
      // 복합 섹션의 후보는 { pros:…, cons:… } 꼴이라 body에 통째로 펼친다.
      apply: (chosen) =>
        onBody({
          ...(bodyRef.current as object),
          ...(keys ? (chosen as Record<string, unknown>) : { [sectionKey]: chosen }),
        } as ContentBody),
      onClose: () => {},
    });
  };
  const onSectionRefine =
    onBody && refine ? (k: string, l: string, keys?: string[]) => openSection(k, l, 'refine', keys) : undefined;

  // 섹션 삭제 — 내용을 비워 미리보기·라이브에서 사라지게(배열→[], 객체→undefined).
  // 복합 섹션은 구성 키를 모두 비워야 섹션이 사라진다(하나만 비우면 반쪽이 남는다).
  const onSectionDelete = onBody
    ? (sectionKey: string, keys?: string[]) => {
        const b = bodyRef.current as unknown as Record<string, unknown>;
        const blank = (k: string) => (Array.isArray(b[k]) ? [] : undefined);
        const patch = Object.fromEntries((keys ?? [sectionKey]).map((k) => [k, blank(k)]));
        onBody({ ...(bodyRef.current as object), ...patch } as unknown as ContentBody);
      }
    : undefined;

  // ── 자유 섹션(body.sections) — 고정 스펙이 다 차 있어도 계속 추가할 수 있는 확장 슬롯.
  const setFreeSections = (next: RichSection[]) =>
    onBody?.({ ...(bodyRef.current as object), sections: next } as ContentBody);

  // 콘텐츠 타입을 골라 새 자유 섹션 추가 — 해당 타입 블록 하나로 시작.
  const addFreeSection = (type: AddType) => {
    const cur = ((bodyRef.current as unknown as { sections?: RichSection[] }).sections ?? []) as RichSection[];
    setFreeSections([...cur, { blocks: [newBlock(type)] }]);
  };

  // 새 자유 섹션을 AI 초안으로 통째 생성(먼저 빈 섹션을 붙이고, 그 blocks를 후보로 채운다).
  const addFreeSectionAi = () => {
    const cur = ((bodyRef.current as unknown as { sections?: RichSection[] }).sections ?? []) as RichSection[];
    const index = cur.length;
    setFreeSections([...cur, { blocks: [] }]);
    openFreeSection(index);
  };

  // 자유 섹션 blocks 생성/수정 — 고정 섹션과 달리 body 경로가 단순 키가 아니라 currentValue로 넘긴다.
  const openFreeSection = (index: number) => {
    if (!onBody || !refine) return;
    const cur = ((bodyRef.current as unknown as { sections?: RichSection[] }).sections ?? []) as RichSection[];
    const blocks = cur[index]?.blocks ?? [];
    const empty = blocks.length === 0;
    const label = cur[index]?.heading?.trim() || '새 섹션';
    refine.open({
      target: empty ? '' : sectionToLines(blocks),
      scope: 'section',
      kind: 'section',
      mode: empty ? 'generate' : 'refine',
      rich: false,
      context: `${track === 'case' ? '실전 케이스' : 'AI 트렌드'} · ${label}`,
      section: {
        track: body.kind === 'case' || body.kind === 'trend' ? body.kind : undefined,
        body: body as unknown as Record<string, unknown>,
        sectionKey: 'sections',
        sectionLabel: label,
        freeBlocks: true,
        currentValue: empty ? undefined : blocks,
      },
      apply: (chosen) => {
        const list = ((bodyRef.current as unknown as { sections?: RichSection[] }).sections ?? []) as RichSection[];
        if (!list[index]) return;
        setFreeSections(upd(list, index, { ...list[index], blocks: chosen as Block[] }));
      },
      onClose: () => {},
    });
  };
  const onFreeRefine = onBody && refine ? openFreeSection : undefined;

  // 추가 가능한(현재 비어있는) 고정 섹션 목록. 없어도 바 자체는 계속 노출된다(자유 섹션 추가용).
  const emptySpecs =
    onBody && refine ? sectionSpecs(track).filter((s) => isEmptySection((body as unknown as Record<string, unknown>)[s.key])) : [];

  // 섹션 추가 바 — 렌더 위치는 각 트랙 본문이 정한다(트렌드는 출처 위, 케이스는 맨 끝).
  const addBar =
    onBody && refine ? (
      <AddSectionBar
        specs={emptySpecs}
        onFillEmpty={(s) => openSection(s.key, s.label, 'generate')}
        onAddFree={addFreeSection}
        onAddFreeAi={addFreeSectionAi}
      />
    ) : null;

  return (
    <div className="rounded-xl border border-border bg-bg">
      <div className="border-b border-border px-4 py-2 text-xs text-ink/50">
        라이브 미리보기 — 본가 {props.track === 'case' ? '/cases' : '/trends'} 상세와 동일 마크업
        {onBody && <span className="ml-2 font-semibold text-accent">텍스트를 클릭하면 바로 수정됩니다</span>}
      </div>
      <article className="mx-auto max-w-[760px] px-6 pb-14">
        <PreviewHeader
          {...props}
          onDocRefine={onBody && refine ? openDocument : undefined}
          onUndoDoc={docUndo && onBody ? undoDocument : undefined}
        />
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
            <CasePreviewBody body={body} onBody={onBody} onSectionRefine={onSectionRefine} onSectionDelete={onSectionDelete} onFreeRefine={onFreeRefine} addBar={addBar} />
          ) : body.kind === 'trend' ? (
            <TrendPreviewBody body={body} onBody={onBody} onSectionRefine={onSectionRefine} onSectionDelete={onSectionDelete} onFreeRefine={onFreeRefine} addBar={addBar} />
          ) : null}
        </div>
      </article>
    </div>
  );
}
