'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Sparkles, Loader2, X, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inlineMdToHtml } from '@/lib/inline-md';
import { sectionSpecs, isEmptySection } from '@/lib/content-sections';

// AI 부분 수정 제안 — 우측에 도킹되는 고정 패널.
// Editable(필드/선택) 또는 섹션 헤더(✨)가 "대상 + 적용 클로저"를 컨텍스트에 올리고(open),
// 이 패널이 '수정 각도'(+선택적 .md 참고자료)를 받아 후보 2~4개를 요청·표시한 뒤 request.apply로 되돌려준다.
//  - kind 'text'    : 필드/선택 구간 → 문자열 후보 (/api/studio/refine)
//  - kind 'section' : 섹션 통째(카드 배열) → 구조 JSON 후보, 자유 재구성 (/api/studio/refine-section)
//  - kind 'document': 문서 전체(모든 섹션) → body 전체 후보, 톤·용어 통일 (/api/studio/refine-document)

export interface RefineRequest {
  /** 표시용 대상 텍스트(섹션·문서는 요약 텍스트) */
  target: string;
  /** 선택 구간 / 필드 / 섹션 / 문서 전체 */
  scope: 'selection' | 'field' | 'section' | 'document';
  /** 후보 종류 */
  kind: 'text' | 'section' | 'document';
  /** 기존 수정(refine)인지 빈 대상 새로 생성(generate)인지. 기본 refine.
   *  generate + kind 'section' = 빈 섹션 생성, generate + kind 'text' = 빈 문단 초안. */
  mode?: 'refine' | 'generate';
  /** generate(text) 진입점 — 'direction'(방향 적고 초안) / 'file'(파일 넣고 초안, 패널이 파일창을 바로 연다). */
  draftSource?: 'direction' | 'file';
  /** rich 필드면 후보를 인라인 마크다운으로 렌더(text kind) */
  rich: boolean;
  /** 편집 위치 힌트(grounding) */
  context?: string;
  /** section kind 전용 — 백엔드로 넘길 섹션 페이로드.
   *  freeBlocks=자유 섹션(body.sections[i].blocks) — 현재 값을 currentValue로 직접 넘긴다. */
  section?: {
    track?: 'case' | 'trend';
    body: Record<string, unknown>;
    sectionKey: string;
    /** 화면상 한 섹션이지만 body 키가 여러 개일 때(예: 좋았던 점·아쉬웠던 점 = pros + cons). */
    sectionKeys?: string[];
    sectionLabel: string;
    freeBlocks?: boolean;
    currentValue?: unknown;
  };
  /** document kind 전용 — 문서 전체 페이로드. 후보는 { title?, summary?, body } 꼴로 돌아온다. */
  document?: {
    track: 'case' | 'trend';
    body: Record<string, unknown>;
    title?: string;
    summary?: string;
  };
  /** 고른 후보 적용(text=string, section=구조값, document={title?,summary?,body}) */
  apply: (chosen: unknown) => void;
  /** 적용 없이 닫을 때(편집 상태 복원·정리) */
  onClose?: () => void;
}

interface RefineCtx {
  active: { req: RefineRequest; id: number } | null;
  open: (req: RefineRequest) => void;
  close: () => void;
  finish: () => void;
}

const Ctx = createContext<RefineCtx | null>(null);

/** Editable/섹션헤더/RefinePanel이 공유하는 수정 요청 채널. 프로바이더 없으면 null(→ AI 버튼 숨김). */
export function useRefine(): RefineCtx | null {
  return useContext(Ctx);
}

export function RefineProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<{ req: RefineRequest; id: number } | null>(null);
  const reqRef = useRef<RefineRequest | null>(null);
  const idRef = useRef(0);

  const open = useCallback((req: RefineRequest) => {
    reqRef.current?.onClose?.(); // 이전 요청이 있으면 취소(편집 복원)
    reqRef.current = req;
    idRef.current += 1;
    setActive({ req, id: idRef.current });
  }, []);

  const close = useCallback(() => {
    reqRef.current?.onClose?.();
    reqRef.current = null;
    setActive(null);
  }, []);

  const finish = useCallback(() => {
    reqRef.current = null;
    setActive(null);
  }, []);

  return <Ctx.Provider value={{ active, open, close, finish }}>{children}</Ctx.Provider>;
}

const REFINE_PRESETS = ['더 간결하게', '더 쉽게 풀어서', '구체 사례·근거 추가', '문장 매끄럽게', '톤 다듬기'];

// 문서 전체 수정은 "섹션 하나"가 아니라 "문서 전체에서 일관되게"가 목적이라 각도 예시가 다르다.
const DOC_PRESETS = ['톤·용어 통일', '전체적으로 더 간결하게', '초보자도 읽히게 쉽게', '실무 적용 관점 강화', '중복 내용 정리'];

/** document 후보 값 — 서버 lib/ai-draft.DocumentCandidate와 같은 모양. */
export interface DocumentCandidateValue {
  title?: string;
  summary?: string;
  body: Record<string, unknown>;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * 문서 전체 후보를 "무엇이 바뀌었는지"로 요약 — 본문을 통째로 다시 읽지 않고 후보를 고를 수 있게.
 * 안 바뀐 섹션은 개수만 세고, 바뀐 섹션만 펼쳐볼 수 있게 내용을 함께 담는다.
 */
function documentChanges(
  track: 'case' | 'trend',
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): { rows: { label: string; state: 'changed' | 'emptied' | 'filled'; lines: string }[]; unchanged: number } {
  const rows: { label: string; state: 'changed' | 'emptied' | 'filled'; lines: string }[] = [];
  let unchanged = 0;
  const push = (label: string, before: unknown, after: unknown) => {
    if (sameJson(before, after)) {
      if (!isEmptySection(after)) unchanged += 1;
      return;
    }
    rows.push({
      label,
      state: isEmptySection(after) ? 'emptied' : isEmptySection(before) ? 'filled' : 'changed',
      lines: sectionToLines(after),
    });
  };
  const specs = sectionSpecs(track);
  for (const s of specs) push(s.label, prev[s.key], next[s.key]);
  // 고정 스펙 밖 키(자유 섹션·소제목 오버라이드 등) — 키 이름 그대로 보여준다.
  const known = new Set([...specs.map((s) => s.key), 'kind']);
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (known.has(k)) continue;
    push(k === 'sections' ? '추가 섹션' : k === 'headings' ? '섹션 소제목' : k, prev[k], next[k]);
  }
  return { rows, unchanged };
}

// 섹션/블록 값(배열·객체)을 사람이 읽는 여러 줄 요약으로. 대상 미리보기·구조 후보 렌더에 공용.
export function sectionToLines(v: unknown): string {
  const pickStr = (o: Record<string, unknown>) =>
    Object.values(o).filter((x): x is string => typeof x === 'string' && x.trim().length > 0).join(' — ');
  const one = (it: unknown): string => {
    if (typeof it === 'string') return it;
    if (it && typeof it === 'object') {
      const o = it as Record<string, unknown>;
      if (typeof o.markdown === 'string') return o.markdown;
      if (typeof o.text === 'string') return o.text;
      return pickStr(o);
    }
    return '';
  };
  if (Array.isArray(v)) {
    return v.map((it) => `• ${one(it)}`).filter((s) => s.trim() !== '•').join('\n');
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.markdown === 'string') return o.markdown;
    return Object.entries(o)
      .map(([k, val]) => (typeof val === 'string' ? `${k}: ${val}` : ''))
      .filter(Boolean)
      .join('\n');
  }
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/**
 * 문서 전체 후보 미리보기 — 바뀐 섹션만 목록으로, 각 줄을 펼치면 새 내용을 볼 수 있다.
 * 문서 전체 텍스트를 그대로 뿌리면 후보 2개만으로도 패널이 수천 줄이 되어 고를 수가 없다.
 */
function DocumentCandidatePreview({
  prev,
  value,
}: {
  prev: NonNullable<RefineRequest['document']>;
  value: DocumentCandidateValue;
}) {
  const { rows, unchanged } = documentChanges(prev.track, prev.body, value.body ?? {});
  const titleChanged = value.title !== undefined && value.title !== (prev.title ?? '');
  const summaryChanged = value.summary !== undefined && value.summary !== (prev.summary ?? '');
  const emptied = rows.filter((r) => r.state === 'emptied');

  return (
    <div className="space-y-1 text-[12.5px] leading-relaxed text-ink/85">
      {(titleChanged || summaryChanged) && (
        <div className="rounded-md bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">
          {titleChanged && (
            <div>
              <b className="font-semibold">제목</b> → {value.title}
            </div>
          )}
          {summaryChanged && (
            <div className="mt-0.5">
              <b className="font-semibold">요약</b> → {value.summary}
            </div>
          )}
        </div>
      )}
      {emptied.length > 0 && (
        <div className="rounded-md bg-red-50 px-2 py-1 text-[11.5px] text-red-600 break-keep">
          비워지는 섹션 {emptied.length}개: {emptied.map((r) => r.label).join(', ')} — 적용하면 미리보기에서 사라져요.
        </div>
      )}
      {rows.length === 0 ? (
        <div className="text-ink/50">본문 변경 없음(제목·요약만 바뀜)</div>
      ) : (
        rows.map((r) => (
          <details key={r.label} className="rounded border border-border/70 px-2 py-1">
            <summary className="cursor-pointer list-none text-[12px] font-medium text-ink/70">
              <span
                className={cn(
                  'mr-1.5 rounded px-1 py-0.5 text-[10px] font-semibold',
                  r.state === 'emptied' ? 'bg-red-100 text-red-600' : r.state === 'filled' ? 'bg-green-100 text-green-700' : 'bg-accent-50 text-accent',
                )}
              >
                {r.state === 'emptied' ? '비움' : r.state === 'filled' ? '새로 채움' : '고침'}
              </span>
              {r.label}
            </summary>
            <div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-keep text-[12.5px] text-ink/80">
              {r.lines || '(빈 값)'}
            </div>
          </details>
        ))
      )}
      {unchanged > 0 && <div className="text-[11px] text-ink/40">그대로 {unchanged}개 섹션</div>}
    </div>
  );
}

// request 단위로 상태를 새로 시작하려고 key로 마운트를 교체한다.
function RefineForm({ request, onApply }: { request: RefineRequest; onApply: (chosen: unknown) => void }) {
  const { target, scope, kind, rich, context, section, document, mode, draftSource } = request;
  const generate = mode === 'generate';
  const doc = kind === 'document';
  const draftText = generate && kind === 'text'; // 빈 문단 초안 — 방향 또는 파일만으로 생성 가능
  const [instruction, setInstruction] = useState('');
  const [reference, setReference] = useState('');
  const [refName, setRefName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<{ label?: string; value: unknown }[] | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const instructionRef = useRef<HTMLTextAreaElement | null>(null);

  const attach = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setReference(text.slice(0, 20000));
    setRefName(file.name);
  };

  // 요청이 열릴 때(= key 교체로 이 폼이 새로 마운트될 때) 패널을 화면 안으로 데려온다.
  // TrackForm 그리드가 xl(1280px) 이상에서만 2단이라, 그 미만 창에서는 우측 레일이 본문 미리보기
  // '아래로' 쌓인다. 스크롤을 옮기지 않으면 지시 입력란이 화면 밖에 남아 "수정을 눌러도 아무 일도
  // 안 일어난다"로 보인다(2026-08-07). 넓은 창에서는 이미 보이는 위치라 스크롤이 사실상 무해.
  // "파일로 초안" 진입은 파일 선택창을 바로 열어야 하므로 포커스를 뺏지 않는다.
  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (draftSource === 'file') fileRef.current?.click();
    else instructionRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (angle: string) => {
    const q = angle.trim();
    if ((!q && !(draftText && reference)) || busy) return; // 문단 초안은 파일만 있어도 OK
    setBusy(true);
    setError(null);
    try {
      const url =
        kind === 'section'
          ? '/api/studio/refine-section'
          : doc
            ? '/api/studio/refine-document'
            : '/api/studio/refine';
      const payload =
        kind === 'section'
          ? { ...section, instruction: q, reference: reference || undefined }
          : doc
            ? { ...document, instruction: q, reference: reference || undefined }
            : { text: target, instruction: q, rich, context, reference: reference || undefined, mode: draftText ? 'draft' : undefined };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        candidates?: { label?: string; value: unknown }[];
        error?: string;
        note?: string;
      };
      if (!res.ok) throw new Error(data.error || '제안 생성 실패');
      const list = (data.candidates ?? []).filter(
        (c) => c && c.value !== null && c.value !== undefined && !(typeof c.value === 'string' && !c.value.trim()),
      );
      // 모델이 초안 대신 되물음을 보냈으면 그 문장을 그대로 보여준다(무엇을 더 줘야 하는지 알 수 있게).
      if (list.length === 0) {
        throw new Error(
          data.note
            ? `AI가 초안 대신 이렇게 답했어요 —\n\n"${data.note}"\n\n필요한 내용을 지시문에 적거나 참고자료(.md)를 첨부해 주세요.`
            : '후보를 만들지 못했어요. 각도를 다르게 적어보세요.',
        );
      }
      setCandidates(list);
    } catch (e) {
      setError((e as Error).message);
      setCandidates(null);
    } finally {
      setBusy(false);
    }
  };

  const scopeLabel = generate
    ? draftText
      ? '새 문단 초안'
      : '새 섹션 생성'
    : doc
      ? '문서 전체'
      : scope === 'selection'
        ? '선택 구간'
        : scope === 'section'
          ? '이 섹션 전체'
          : '이 문단·필드';

  return (
    <div ref={rootRef} className="space-y-2.5 scroll-mt-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink/50">
        <span className={cn('rounded px-1.5 py-0.5', generate ? 'bg-green-100 text-green-700' : doc ? 'bg-indigo-100 text-indigo-700' : scope === 'selection' ? 'bg-amber-100 text-amber-700' : scope === 'section' ? 'bg-violet-100 text-violet-700' : 'bg-accent-50 text-accent')}>
          {scopeLabel}
        </span>
        {generate ? (section?.sectionLabel ?? context) : doc ? (context ?? '문서 전체') : '수정 대상'}
      </div>
      {/* 문서 전체는 대상이 본문 전부라 원문을 되뿌리지 않는다 — 무엇이 바뀔지만 미리 알린다. */}
      {doc ? (
        <div className="rounded-md bg-muted px-2.5 py-2 text-[12px] leading-relaxed text-ink/60 break-keep">
          본문의 <b className="font-semibold text-ink/75">모든 섹션</b>을 한 번에 다시 씁니다. 각도에 제목·요약을 적으면 그 둘도 같이 바뀌어요.
          적용 후에는 제목 위 <b className="font-semibold text-ink/75">되돌리기</b>로 직전 상태로 돌아갈 수 있어요.
        </div>
      ) : (
        !generate && (
          <div className="max-h-32 overflow-y-auto rounded-md bg-muted px-2.5 py-2 text-[12.5px] leading-relaxed text-ink/70 whitespace-pre-wrap break-keep">
            {target.length > 800 ? target.slice(0, 800) + '…' : target}
          </div>
        )
      )}

      <div>
        <div className="mb-1.5 text-[11px] font-semibold text-ink/50">
          {generate ? (draftText ? '쓰고 싶은 내용 · 방향' : '넣을 핵심 내용 · 방향 · 주의사항') : '수정 각도'}
        </div>
        {!generate && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {(doc ? DOC_PRESETS : REFINE_PRESETS).map((p) => (
              <button
                key={p}
                type="button"
                disabled={busy}
                onClick={() => {
                  setInstruction(p);
                  run(p);
                }}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink/70 hover:border-accent hover:text-accent disabled:opacity-40"
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={instructionRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              run(instruction);
            }
          }}
          placeholder={
            draftText
              ? '이 문단에 쓰고 싶은 내용·방향을 적어주세요 (예: OO 경험 소개, 독자에게 XX 제안). 파일만 첨부하고 비워둬도 돼요'
              : generate
                ? '이 섹션에 넣을 핵심 내용·방향·주의사항을 적어주세요 (예: OO을 강조, XX는 빼고, 카드 3개로)'
                : doc
                  ? '문서 전체를 어떻게 고칠까요? (예: 톤·용어 통일하고 문장 짧게. 제목·요약도 같이 고쳐줘)'
                  : '어떻게 고칠까요? (예: 더 구체적으로, 사례 하나 추가)'
          }
          rows={generate ? 4 : 3}
          className="w-full resize-none rounded-md border border-border px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
        />

        {/* 추가 참고자료(.md) — 각도에 반영할 info */}
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="hidden"
          onChange={(e) => attach(e.target.files?.[0])}
        />
        <div className="mt-1.5 flex items-center gap-2 text-[11px]">
          {refName ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-accent-50 px-1.5 py-0.5 text-accent">
              <Paperclip className="h-3 w-3" /> {refName}
              <button
                type="button"
                onClick={() => {
                  setReference('');
                  setRefName('');
                  if (fileRef.current) fileRef.current.value = '';
                }}
                className="ml-0.5 hover:text-ink"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn('inline-flex items-center gap-1 hover:text-accent', draftText ? 'font-semibold text-accent' : 'text-ink/50')}
            >
              <Paperclip className="h-3 w-3" /> {draftText ? '파일 첨부 (.md·.txt) — 이 내용으로 초안' : '참고자료 .md 첨부'}
            </button>
          )}
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          {/* 문서 전체는 본문을 통째로 다시 쓰므로 섹션 수정보다 훨씬 오래 걸린다 — 기다림을 미리 알린다. */}
          <span className="text-[11px] text-ink/35 break-keep">{doc ? '⌘/Ctrl+Enter · 본문 전체라 3~5분 걸려요' : '⌘/Ctrl+Enter'}</span>
          <button
            type="button"
            disabled={busy || (!instruction.trim() && !(draftText && reference))}
            onClick={() => run(instruction)}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-[12px] font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {candidates ? (generate ? '다시 생성' : '다시 제안') : generate ? '초안 생성' : '제안 받기'}
          </button>
        </div>
      </div>

      {error && (
        <div className="whitespace-pre-wrap break-keep rounded-md bg-red-50 px-2.5 py-1.5 text-[12px] leading-relaxed text-red-600">
          {error}
        </div>
      )}

      {candidates && (
        <div className="space-y-1.5 border-t border-border pt-2.5">
          <div className="text-[11px] font-semibold text-ink/50">후보 {candidates.length}개 · 하나를 골라 적용</div>
          {candidates.map((c, i) => (
            <div key={i} className="rounded-md border border-border p-2 hover:border-accent">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">{i + 1}</span>
                {c.label && <span className="text-[11px] font-semibold text-accent">{c.label}</span>}
              </div>
              {doc ? (
                <DocumentCandidatePreview prev={document!} value={c.value as DocumentCandidateValue} />
              ) : kind === 'section' ? (
                <div className="text-[13px] leading-relaxed text-ink/85 whitespace-pre-wrap break-keep">{sectionToLines(c.value)}</div>
              ) : rich ? (
                <div
                  className="text-[13px] leading-relaxed text-ink/85 whitespace-pre-wrap break-keep"
                  dangerouslySetInnerHTML={{ __html: inlineMdToHtml(String(c.value)) }}
                />
              ) : (
                <div className="text-[13px] leading-relaxed text-ink/85 whitespace-pre-wrap break-keep">{String(c.value)}</div>
              )}
              <div className="mt-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onApply(c.value)}
                  className="rounded-md bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-white opacity-80 hover:opacity-100"
                >
                  {doc ? '이 안으로 전체 교체' : '이 안으로'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 우측에 도킹되는 AI 수정 제안 패널. RefineProvider 안에서만 동작. */
export function RefinePanel({ className }: { className?: string }) {
  const ctx = useRefine();
  if (!ctx) return null;
  const { active, close, finish } = ctx;

  return (
    <div className={cn('card sticky top-4 p-4', className)}>
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-accent">
          <Sparkles className="h-4 w-4" /> AI 수정 제안
        </div>
        {active && (
          <button type="button" onClick={close} title="닫기" className="rounded p-0.5 text-ink/40 hover:bg-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      {active ? (
        <RefineForm
          key={active.id}
          request={active.req}
          onApply={(c) => {
            active.req.apply(c);
            finish();
          }}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12.5px] leading-relaxed text-ink/45 break-keep">
          왼쪽 초안에서 고칠 곳을 고르고 <span className="inline-flex items-center gap-0.5 text-accent"><Sparkles className="h-3 w-3" /> AI 수정</span>을 누르세요.
          <br />
          문단 위 ✨ = 문단 하나, 일부 <b className="font-semibold text-ink/60">드래그</b> = 그 구간, 섹션 제목 옆 ✨ = 섹션 통째,
          제목 위 <b className="font-semibold text-ink/60">AI 전체수정</b> = 본문 전체.
          <br />빈 문단은 <b className="font-semibold text-ink/60">방향 적고 / 파일 넣고 AI 초안</b>으로 새로 쓸 수 있어요.
        </div>
      )}
    </div>
  );
}
