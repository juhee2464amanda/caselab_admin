'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Sparkles, Loader2, X, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inlineMdToHtml } from '@/lib/inline-md';

// AI 부분 수정 제안 — 우측에 도킹되는 고정 패널.
// Editable(필드/선택) 또는 섹션 헤더(✨)가 "대상 + 적용 클로저"를 컨텍스트에 올리고(open),
// 이 패널이 '수정 각도'(+선택적 .md 참고자료)를 받아 후보 2~4개를 요청·표시한 뒤 request.apply로 되돌려준다.
//  - kind 'text'   : 필드/선택 구간 → 문자열 후보 (/api/studio/refine)
//  - kind 'section': 섹션 통째(카드 배열) → 구조 JSON 후보, 자유 재구성 (/api/studio/refine-section)

export interface RefineRequest {
  /** 표시용 대상 텍스트(섹션은 요약 텍스트) */
  target: string;
  /** 선택 구간 / 필드 / 섹션 */
  scope: 'selection' | 'field' | 'section';
  /** 후보 종류 */
  kind: 'text' | 'section';
  /** rich 필드면 후보를 인라인 마크다운으로 렌더(text kind) */
  rich: boolean;
  /** 편집 위치 힌트(grounding) */
  context?: string;
  /** section kind 전용 — 백엔드로 넘길 섹션 페이로드 */
  section?: { track?: 'case' | 'trend'; body: Record<string, unknown>; sectionKey: string; sectionLabel: string };
  /** 고른 후보 적용(text=string, section=구조값) */
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

// request 단위로 상태를 새로 시작하려고 key로 마운트를 교체한다.
function RefineForm({ request, onApply }: { request: RefineRequest; onApply: (chosen: unknown) => void }) {
  const { target, scope, kind, rich, context, section } = request;
  const [instruction, setInstruction] = useState('');
  const [reference, setReference] = useState('');
  const [refName, setRefName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<{ label?: string; value: unknown }[] | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const attach = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setReference(text.slice(0, 20000));
    setRefName(file.name);
  };

  const run = async (angle: string) => {
    const q = angle.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      const url = kind === 'section' ? '/api/studio/refine-section' : '/api/studio/refine';
      const payload =
        kind === 'section'
          ? { ...section, instruction: q, reference: reference || undefined }
          : { text: target, instruction: q, rich, context, reference: reference || undefined };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { candidates?: { label?: string; value: unknown }[]; error?: string };
      if (!res.ok) throw new Error(data.error || '제안 생성 실패');
      const list = (data.candidates ?? []).filter(
        (c) => c && c.value !== null && c.value !== undefined && !(typeof c.value === 'string' && !c.value.trim()),
      );
      if (list.length === 0) throw new Error('후보를 만들지 못했어요. 각도를 다르게 적어보세요.');
      setCandidates(list);
    } catch (e) {
      setError((e as Error).message);
      setCandidates(null);
    } finally {
      setBusy(false);
    }
  };

  const scopeLabel = scope === 'selection' ? '선택 구간' : scope === 'section' ? '이 섹션 전체' : '이 문단·필드';

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink/50">
        <span className={cn('rounded px-1.5 py-0.5', scope === 'selection' ? 'bg-amber-100 text-amber-700' : scope === 'section' ? 'bg-violet-100 text-violet-700' : 'bg-accent-50 text-accent')}>
          {scopeLabel}
        </span>
        수정 대상
      </div>
      <div className="max-h-32 overflow-y-auto rounded-md bg-muted px-2.5 py-2 text-[12.5px] leading-relaxed text-ink/70 whitespace-pre-wrap break-keep">
        {target.length > 800 ? target.slice(0, 800) + '…' : target}
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-semibold text-ink/50">수정 각도</div>
        <div className="mb-1.5 flex flex-wrap gap-1">
          {REFINE_PRESETS.map((p) => (
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
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              run(instruction);
            }
          }}
          placeholder="어떻게 고칠까요? (예: 더 구체적으로, 사례 하나 추가)"
          rows={3}
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
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 text-ink/50 hover:text-accent">
              <Paperclip className="h-3 w-3" /> 참고자료 .md 첨부
            </button>
          )}
        </div>

        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] text-ink/35">⌘/Ctrl+Enter</span>
          <button
            type="button"
            disabled={busy || !instruction.trim()}
            onClick={() => run(instruction)}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-[12px] font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {candidates ? '다시 제안' : '제안 받기'}
          </button>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 px-2.5 py-1.5 text-[12px] text-red-600">{error}</div>}

      {candidates && (
        <div className="space-y-1.5 border-t border-border pt-2.5">
          <div className="text-[11px] font-semibold text-ink/50">후보 {candidates.length}개 · 하나를 골라 적용</div>
          {candidates.map((c, i) => (
            <div key={i} className="rounded-md border border-border p-2 hover:border-accent">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">{i + 1}</span>
                {c.label && <span className="text-[11px] font-semibold text-accent">{c.label}</span>}
              </div>
              {kind === 'section' ? (
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
                  이 안으로
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
          문단 위 ✨ = 문단 하나, 일부 <b className="font-semibold text-ink/60">드래그</b> = 그 구간, 섹션 제목 옆 ✨ = 섹션 통째.
        </div>
      )}
    </div>
  );
}
