'use client';

import { createElement, useRef, useState, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Highlighter, RemoveFormatting } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inlineMdToHtml, htmlToInlineMd } from '@/lib/inline-md';

// 더블클릭 인라인 편집 — 라이브 미리보기(ContentPreview/ToolPreview)를 편집 표면으로 쓰기 위한 것.
// 더블클릭 → contentEditable 진입, blur/Enter(한 줄) 커밋, Escape 취소.
// rich 모드: **굵게**·==형광펜== 마커(lib/inline-md.ts)를 강조 렌더하고,
// 편집 중에는 선택 후 플로팅 툴바(B/형광펜/서식지우기) 또는 Cmd+B로 서식 적용 → 커밋 시 마커로 저장.
// 편집 중에는 React가 텍스트 노드를 다시 그리지 않도록 커밋 시에만 부모 상태를 갱신한다.

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
  placeholder?: string;
}

export function Editable({ value, onCommit, as = 'span', multiline, rich, placeholder, className, ...rest }: EditableProps) {
  const [editing, setEditing] = useState(false);
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLElement | null>(null);

  if (!onCommit) {
    if (rich && value) {
      return createElement(as, { className, dangerouslySetInnerHTML: { __html: inlineMdToHtml(value) }, ...rest });
    }
    return createElement(as, { className, ...rest }, value || placeholder || '');
  }

  const commit = () => {
    if (!editing) return;
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
          title: editing ? undefined : '더블클릭하면 바로 수정',
          onDoubleClick: (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (editing) return;
            setEditing(true);
            requestAnimationFrame(() => {
              const el = ref.current;
              if (!el) return;
              el.focus();
              const sel = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(el);
              range.collapse(false);
              sel?.removeAllRanges();
              sel?.addRange(range);
              if (rich) {
                const rect = el.getBoundingClientRect();
                setToolbar({ top: rect.top + window.scrollY - 40, left: Math.max(8, rect.left + window.scrollX) });
              }
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
            editing
              ? 'cursor-text rounded-sm bg-white outline outline-2 outline-accent/70 -outline-offset-1'
              : 'cursor-text rounded-sm hover:bg-accent-50/60 hover:outline hover:outline-1 hover:outline-accent/30',
          ),
          ...content,
          ...rest,
        },
        rich ? undefined : value || placeholder || '',
      )}

      {editing && rich && toolbar &&
        createPortal(
          <div
            className="absolute z-50 flex items-center gap-0.5 rounded-lg border border-border bg-white p-1 shadow-lg"
            style={{ top: toolbar.top, left: toolbar.left }}
            onMouseDown={(e) => e.preventDefault() /* 포커스·선택 유지 */}
          >
            <button
              type="button"
              title="굵게 (⌘B)"
              className="rounded p-1.5 hover:bg-muted"
              onClick={() => exec(() => document.execCommand('bold'))}
            >
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
            <span className="px-1.5 text-[10px] text-ink/40">텍스트 선택 후 적용</span>
          </div>,
          document.body,
        )}
    </>
  );
}
