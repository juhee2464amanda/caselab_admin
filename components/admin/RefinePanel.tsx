'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Sparkles, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inlineMdToHtml } from '@/lib/inline-md';

// AI 부분 수정 제안 — 우측에 도킹되는 고정 패널.
// Editable(필드 하나)이 ✨를 누르면 "대상 텍스트 + 적용 클로저"를 컨텍스트에 올리고(open),
// 이 패널이 '수정 각도'를 받아 후보 2~4개를 요청·표시한 뒤, 고른 후보를 request.apply로 되돌려준다.
// (예전의 필드 옆 떠다니는 팝오버를 대체 — 후보를 넉넉히 검토할 공간 확보)

export interface RefineRequest {
  /** 수정 대상(드래그 선택 구간 또는 필드 전체 값) */
  target: string;
  /** 선택 구간만인지(툴바 ✨) 필드 전체인지(hover ✨) */
  scope: 'selection' | 'field';
  /** rich 필드면 후보를 인라인 마크다운으로 렌더 */
  rich: boolean;
  /** 편집 위치 힌트(grounding) */
  context?: string;
  /** 고른 후보를 해당 Editable에 적용(선택 구간 교체 or 필드 전체 교체) */
  apply: (chosen: string) => void;
  /** 적용 없이 닫을 때 호출(편집 상태 복원·정리) */
  onClose?: () => void;
}

interface RefineCtx {
  active: { req: RefineRequest; id: number } | null;
  /** ✨ 클릭 — 새 수정 요청 등록(이전 요청은 자동 취소) */
  open: (req: RefineRequest) => void;
  /** 적용 없이 닫기(onClose 실행) */
  close: () => void;
  /** 적용 완료 후 정리(onClose 실행 안 함 — apply가 이미 마무리) */
  finish: () => void;
}

const Ctx = createContext<RefineCtx | null>(null);

/** Editable/RefinePanel이 공유하는 수정 요청 채널. 프로바이더 없으면 null(→ AI 버튼 숨김). */
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

// 실제 제안 UI — request 단위로 상태를 새로 시작하기 위해 key로 마운트 교체한다.
function RefineForm({ request, onApply }: { request: RefineRequest; onApply: (chosen: string) => void }) {
  const { target, scope, rich, context } = request;
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<string[] | null>(null);

  const run = async (angle: string) => {
    const q = angle.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: target, instruction: q, rich, context }),
      });
      const data = (await res.json()) as { candidates?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || '제안 생성 실패');
      const list = (data.candidates ?? []).filter((s) => s && s.trim());
      if (list.length === 0) throw new Error('후보를 만들지 못했어요. 각도를 다르게 적어보세요.');
      setCandidates(list);
    } catch (e) {
      setError((e as Error).message);
      setCandidates(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink/50">
        <span className={cn('rounded px-1.5 py-0.5', scope === 'selection' ? 'bg-amber-100 text-amber-700' : 'bg-accent-50 text-accent')}>
          {scope === 'selection' ? '선택 구간' : '이 문단·필드'}
        </span>
        수정 대상
      </div>
      <div className="max-h-28 overflow-y-auto rounded-md bg-muted px-2.5 py-2 text-[12.5px] leading-relaxed text-ink/70 whitespace-pre-wrap break-keep">
        {target.length > 600 ? target.slice(0, 600) + '…' : target}
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
              {rich ? (
                <div
                  className="text-[13px] leading-relaxed text-ink/85 whitespace-pre-wrap break-keep"
                  dangerouslySetInnerHTML={{ __html: inlineMdToHtml(c) }}
                />
              ) : (
                <div className="text-[13px] leading-relaxed text-ink/85 whitespace-pre-wrap break-keep">{c}</div>
              )}
              <div className="mt-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onApply(c)}
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
          왼쪽 초안에서 고칠 부분을 <b className="font-semibold text-ink/60">클릭</b>하거나 일부를 <b className="font-semibold text-ink/60">드래그 선택</b>한 뒤
          <br />
          <span className="inline-flex items-center gap-0.5 text-accent">
            <Sparkles className="h-3 w-3" /> AI 수정
          </span>
          을 누르면 여기에 제안이 떠요.
        </div>
      )}
    </div>
  );
}
