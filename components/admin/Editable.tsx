'use client';

import { createElement, useRef, useState, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Highlighter, Link2, RemoveFormatting, Sparkles, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inlineMdToHtml, htmlToInlineMd } from '@/lib/inline-md';

// 클릭 인라인 편집 — 라이브 미리보기(ContentPreview/ToolPreview)를 편집 표면으로 쓰기 위한 것.
// 클릭/탭 → contentEditable 진입(클릭 지점에 커서), blur/Enter(한 줄) 커밋, Escape 취소.
// (더블클릭이 아니라 단일 클릭 — 트랙패드·터치에서 반응이 없다는 피드백 반영, 2026-07-13)
// rich 모드: **굵게**·==형광펜== 마커(lib/inline-md.ts)를 강조 렌더하고,
// 편집 중에는 선택 후 플로팅 툴바(B/형광펜/서식지우기) 또는 Cmd+B로 서식 적용 → 커밋 시 마커로 저장.
// 편집 중에는 React가 텍스트 노드를 다시 그리지 않도록 커밋 시에만 부모 상태를 갱신한다.
//
// AI 수정 제안(NEXT_PUBLIC_LOCAL_AI=true일 때만): hover 시 ✨ 버튼, 편집 중 선택하면 툴바에 ✨.
// 지정 부분(드래그 선택 구간 또는 필드 전체)을 '수정 각도'대로 다시 쓴 후보 2~4개를 받아 골라 적용한다.

// 로컬(Claude CLI) 환경에서만 AI 버튼 노출 — Vercel엔 미설정(MdImport의 LOCAL_AI 게이팅과 동일).
const AI_REFINE = process.env.NEXT_PUBLIC_LOCAL_AI === 'true';

// 클릭한 화면 좌표(x,y)에 해당하는 캐럿 위치를 구한다. 지원 안 되면 텍스트 끝으로 폴백.
function caretRangeFromPoint(x: number, y: number, el: HTMLElement): Range {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let range: Range | null = null;
  if (doc.caretRangeFromPoint) {
    range = doc.caretRangeFromPoint(x, y);
  } else if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }
  if (!range || !el.contains(range.startContainer)) {
    range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false); // 끝으로
  }
  return range;
}

// ─────────────── AI 수정 제안 팝오버 ───────────────

const REFINE_PRESETS = ['더 간결하게', '더 쉽게 풀어서', '구체 사례·근거 추가', '문장 매끄럽게', '톤 다듬기'];

interface RefinePopoverProps {
  /** 수정 대상(선택 구간 또는 필드 전체 값) */
  target: string;
  /** 선택 구간만 대상인지(툴바 ✨) 필드 전체인지(hover ✨) — 표시용 */
  scope: 'selection' | 'field';
  /** rich 필드면 후보를 인라인 마크다운으로 렌더 */
  rich: boolean;
  /** 편집 위치 힌트(grounding) */
  context?: string;
  anchor: { top: number; left: number };
  onApply: (chosen: string) => void;
  onClose: () => void;
}

function RefinePopover({ target, scope, rich, context, anchor, onApply, onClose }: RefinePopoverProps) {
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

  return createPortal(
    <>
      {/* 바깥 클릭 → 닫기 */}
      <div className="fixed inset-0 z-[60]" onMouseDown={onClose} />
      <div
        className="absolute z-[61] w-[380px] max-w-[calc(100vw-24px)] rounded-xl border border-border bg-white p-3 shadow-xl"
        style={{
          top: anchor.top,
          left: Math.min(anchor.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 396),
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-accent">
            <Sparkles className="h-3.5 w-3.5" /> AI 수정 제안
            <span className="font-normal text-ink/40">· {scope === 'selection' ? '선택 구간' : '이 문단/필드'}</span>
          </div>
          <button type="button" onClick={onClose} className="rounded p-0.5 text-ink/40 hover:bg-muted hover:text-ink">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mb-2 max-h-16 overflow-y-auto rounded-md bg-muted px-2.5 py-1.5 text-[12px] leading-snug text-ink/60 whitespace-pre-wrap break-keep">
          {target.length > 200 ? target.slice(0, 200) + '…' : target}
        </div>

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
          rows={2}
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

        {error && <div className="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-[12px] text-red-600">{error}</div>}

        {candidates && (
          <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
            {candidates.map((c, i) => (
              <div key={i} className="group rounded-md border border-border p-2 hover:border-accent">
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
                    className="rounded-md bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-white opacity-70 hover:opacity-100"
                  >
                    이 안으로
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

interface EditableProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange' | 'children'> {
  value: string;
  /** 수정 확정 시 호출(변경 없으면 호출 안 함). 없으면 일반 텍스트로만 렌더. */
  onCommit?: (next: string) => void;
  /** 렌더 태그 (기본 span) */
  as?: string;
  /** true면 Enter로 줄바꿈(blur로 커밋), false면 Enter가 커밋 */
  multiline?: boolean;
  /** true면 **굵게**·==형광펜== 마커 렌더 + 편집 툴바 제공 */
  rich?: boolean;
  /** AI 수정 제안에 넘길 편집 위치 힌트(grounding). 예: "실전 케이스 · 문단" */
  refineContext?: string;
  placeholder?: string;
}

export function Editable({ value, onCommit, as = 'span', multiline, rich, refineContext, placeholder, className, ...rest }: EditableProps) {
  const [editing, setEditing] = useState(false);
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
  const [refine, setRefine] = useState<{
    target: string;
    scope: 'selection' | 'field';
    range: Range | null;
    anchor: { top: number; left: number };
  } | null>(null);
  const ref = useRef<HTMLElement | null>(null);
  const refiningRef = useRef(false); // 리파인 팝오버로 포커스가 옮겨간 동안 blur-커밋을 막는다(선택 구간 보존).
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!onCommit) {
    if (rich && value) {
      return createElement(as, { className, dangerouslySetInnerHTML: { __html: inlineMdToHtml(value) }, ...rest });
    }
    return createElement(as, { className, ...rest }, value || placeholder || '');
  }

  const commit = () => {
    if (!editing) return;
    if (refiningRef.current) return; // 리파인 팝오버로 포커스가 이동 → 편집 상태 유지
    setEditing(false);
    setToolbar(null);
    const el = ref.current;
    if (!el) return;
    const raw = rich ? htmlToInlineMd(el) : (el.innerText ?? '').replace(/\n+$/, '');
    const next = multiline ? raw : raw.replace(/\s+/g, ' ').trim();
    if (next !== value) onCommit(next);
    else resetDom(); // 공백·서식 노이즈만 생긴 경우 원복
  };

  const resetDom = () => {
    const el = ref.current;
    if (!el) return;
    if (rich) el.innerHTML = value ? inlineMdToHtml(value) : '';
    else el.innerText = value;
  };

  const cancel = () => {
    resetDom();
    setEditing(false);
    setToolbar(null);
  };

  const exec = (fn: () => void) => {
    ref.current?.focus();
    fn();
  };

  const wrapSelection = (build: (text: string) => string) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString();
    document.execCommand('insertHTML', false, build(text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')));
  };

  // 필드 위쪽에 뜨는 컨트롤 바 앵커(hover·편집 공통).
  const anchorFor = (): { top: number; left: number } | null => {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { top: rect.top + window.scrollY - 40, left: Math.max(8, rect.left + window.scrollX) };
  };

  // AI 수정 팝오버 열기. 편집 중 선택 구간이 있으면 그 구간만, 아니면 필드 전체 값을 대상으로.
  const openRefine = () => {
    const el = ref.current;
    const sel = window.getSelection();
    let target = '';
    let scope: 'selection' | 'field' = 'field';
    let range: Range | null = null;
    if (editing && el && sel && !sel.isCollapsed && sel.rangeCount && el.contains(sel.anchorNode)) {
      target = sel.toString().trim();
      if (target) {
        scope = 'selection';
        range = sel.getRangeAt(0).cloneRange();
      }
    }
    if (!target) {
      scope = 'field';
      target = (editing && el ? (rich ? htmlToInlineMd(el) : el.innerText ?? '') : value).trim();
    }
    if (!target) return;
    refiningRef.current = scope === 'selection'; // 선택 구간 모드만 편집 유지(DOM 보존)
    const rect = el?.getBoundingClientRect();
    const anchor = rect
      ? { top: rect.bottom + window.scrollY + 6, left: Math.max(8, rect.left + window.scrollX) }
      : { top: 80, left: 80 };
    setToolbar(null);
    setRefine({ target, scope, range, anchor });
  };

  const applyRefine = (chosen: string) => {
    const r = refine;
    setRefine(null);
    if (r?.scope === 'selection' && r.range) {
      // 선택 구간 교체 — 저장한 Range를 복원해 그 자리에 삽입 후 커밋.
      refiningRef.current = false;
      const el = ref.current;
      if (el) {
        el.focus();
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r.range);
        if (rich) document.execCommand('insertHTML', false, inlineMdToHtml(chosen));
        else document.execCommand('insertText', false, chosen);
      }
      commit();
    } else {
      // 필드 전체 교체.
      refiningRef.current = false;
      setEditing(false);
      setToolbar(null);
      if (chosen !== value) onCommit(chosen);
    }
  };

  const closeRefine = () => {
    const wasSelection = refine?.scope === 'selection';
    const range = refine?.range ?? null;
    setRefine(null);
    refiningRef.current = false;
    if (wasSelection) {
      // 편집은 유지 — 포커스·선택 복원.
      const el = ref.current;
      el?.focus();
      if (range) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    } else if (editing) {
      cancel();
    }
  };

  const showFormat = editing && rich; // 서식 버튼(B/형광펜/링크/서식지우기)
  const showBar = !!toolbar && (showFormat || AI_REFINE);

  const content: Record<string, unknown> = {};
  if (rich) content.dangerouslySetInnerHTML = { __html: value ? inlineMdToHtml(value) : editing ? '' : `<span class="opacity-40">${placeholder ?? ''}</span>` };

  return (
    <>
      {createElement(
        as,
        {
          ref,
          contentEditable: editing,
          suppressContentEditableWarning: true,
          spellCheck: false,
          title: editing ? undefined : '클릭하면 바로 수정',
          onMouseEnter: () => {
            if (editing || !AI_REFINE) return;
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
            setToolbar(anchorFor());
          },
          onMouseLeave: () => {
            if (editing || !AI_REFINE) return;
            hoverTimer.current = setTimeout(() => {
              setToolbar(null);
            }, 160);
          },
          onClick: (e: React.MouseEvent) => {
            if (editing) return;
            e.preventDefault();
            e.stopPropagation();
            // 클릭 지점(커서 위치)을 기억 → 편집 진입 후 그 자리에 캐럿을 놓는다.
            const x = e.clientX;
            const y = e.clientY;
            setEditing(true);
            requestAnimationFrame(() => {
              const el = ref.current;
              if (!el) return;
              el.focus();
              const sel = window.getSelection();
              const range = caretRangeFromPoint(x, y, el);
              sel?.removeAllRanges();
              sel?.addRange(range);
              if (rich || AI_REFINE) setToolbar(anchorFor());
            });
          },
          onBlur: commit,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (!editing) return;
            e.stopPropagation();
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            } else if (e.key === 'Enter' && !multiline) {
              e.preventDefault();
              commit();
            }
          },
          className: cn(
            className,
            'transition-colors',
            // multiline은 개행(\n)을 문단으로 보여준다 — 호출부가 whitespace-*를 이미 지정했으면 건드리지 않음.
            multiline && !/whitespace-/.test(className ?? '') && 'whitespace-pre-line',
            editing
              ? 'cursor-text rounded-sm bg-white outline outline-2 outline-accent/70 -outline-offset-1'
              : 'cursor-text rounded-sm hover:bg-accent-50/60 hover:outline hover:outline-1 hover:outline-accent/30',
          ),
          ...content,
          ...rest,
        },
        rich ? undefined : value || placeholder || '',
      )}

      {showBar &&
        createPortal(
          <div
            className="absolute z-50 flex items-center gap-0.5 rounded-lg border border-border bg-white p-1 shadow-lg"
            style={{ top: toolbar!.top, left: toolbar!.left }}
            onMouseEnter={() => {
              if (hoverTimer.current) clearTimeout(hoverTimer.current);
            }}
            onMouseLeave={() => {
              if (!editing) {
                setToolbar(null);
              }
            }}
            onMouseDown={(e) => e.preventDefault() /* 포커스·선택 유지 */}
          >
            {showFormat && (
              <>
                <button type="button" title="굵게 (⌘B)" className="rounded p-1.5 hover:bg-muted" onClick={() => exec(() => document.execCommand('bold'))}>
                  <Bold className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="형광펜"
                  className="rounded p-1.5 hover:bg-muted"
                  onClick={() => exec(() => wrapSelection((t) => `<mark class="rounded-sm bg-amber-200/80 px-0.5">${t}</mark>`))}
                >
                  <Highlighter className="h-3.5 w-3.5 text-amber-600" />
                </button>
                <button
                  type="button"
                  title="링크"
                  className="rounded p-1.5 hover:bg-muted"
                  onClick={() => {
                    const url = window.prompt('링크 URL:');
                    if (url && url.trim()) {
                      const safe = url.trim().replace(/["<>]/g, '');
                      exec(() => wrapSelection((t) => `<a href="${safe}" target="_blank" rel="noopener noreferrer" class="text-accent underline underline-offset-2">${t}</a>`));
                    }
                  }}
                >
                  <Link2 className="h-3.5 w-3.5 text-accent" />
                </button>
                <button
                  type="button"
                  title="서식 지우기"
                  className="rounded p-1.5 hover:bg-muted"
                  onClick={() =>
                    exec(() => {
                      document.execCommand('removeFormat');
                      wrapSelection((t) => t);
                    })
                  }
                >
                  <RemoveFormatting className="h-3.5 w-3.5 text-ink/50" />
                </button>
              </>
            )}
            {AI_REFINE && (
              <>
                {showFormat && <span className="mx-0.5 h-4 w-px bg-border" />}
                <button
                  type="button"
                  title="AI로 수정 (선택 구간 또는 이 필드 전체)"
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent-50"
                  onClick={openRefine}
                >
                  <Sparkles className="h-3.5 w-3.5" /> AI 수정
                </button>
              </>
            )}
          </div>,
          document.body,
        )}

      {refine && (
        <RefinePopover
          target={refine.target}
          scope={refine.scope}
          rich={!!rich}
          context={refineContext}
          anchor={refine.anchor}
          onApply={applyRefine}
          onClose={closeRefine}
        />
      )}
    </>
  );
}
