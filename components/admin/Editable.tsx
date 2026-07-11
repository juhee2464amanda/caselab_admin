'use client';

import { createElement, useRef, useState, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// 더블클릭 인라인 편집 — 라이브 미리보기(ContentPreview/ToolPreview)를 편집 표면으로 쓰기 위한 것.
// 더블클릭 → contentEditable 진입, blur/Enter(한 줄) 커밋, Escape 취소.
// 편집 중에는 React가 텍스트 노드를 다시 그리지 않도록 value 재렌더에 의존하지 않는다
// (타이핑 동안 상태 변화 없음 → 커밋 시에만 부모 상태 갱신).

interface EditableProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange' | 'children'> {
  value: string;
  /** 수정 확정 시 호출(변경 없으면 호출 안 함). 없으면 일반 텍스트로만 렌더. */
  onCommit?: (next: string) => void;
  /** 렌더 태그 (기본 span) */
  as?: string;
  /** true면 Enter로 줄바꿈(blur로 커밋), false면 Enter가 커밋 */
  multiline?: boolean;
  placeholder?: string;
}

export function Editable({ value, onCommit, as = 'span', multiline, placeholder, className, ...rest }: EditableProps) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  if (!onCommit) {
    return createElement(as, { className, ...rest }, value || placeholder || '');
  }

  const commit = () => {
    if (!editing) return;
    setEditing(false);
    const text = (ref.current?.innerText ?? '').replace(/\n+$/, '');
    const next = multiline ? text : text.replace(/\s+/g, ' ').trim();
    if (next !== value) onCommit(next);
    else if (ref.current) ref.current.innerText = value; // 공백만 바뀐 경우 원복
  };

  const cancel = () => {
    if (ref.current) ref.current.innerText = value;
    setEditing(false);
  };

  return createElement(
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
          // 커서를 끝으로
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
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
      ...rest,
    },
    value || placeholder || '',
  );
}
