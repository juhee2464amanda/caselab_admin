'use client';

import { createElement, useEffect, useMemo, useRef, useState, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Underline, Highlighter, Link2, Palette, RemoveFormatting, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inlineMdToHtml, htmlToInlineMd, INLINE_COLORS, type InlineColorName } from '@/lib/inline-md';
import { useRefine } from '@/components/admin/RefinePanel';

// 클릭 인라인 편집 — 라이브 미리보기(ContentPreview/ToolPreview)를 편집 표면으로 쓰기 위한 것.
// 클릭/탭 → contentEditable 진입(클릭 지점에 커서), blur/Enter(한 줄) 커밋, Escape 취소.
// (더블클릭이 아니라 단일 클릭 — 트랙패드·터치에서 반응이 없다는 피드백 반영, 2026-07-13)
// rich 모드: **굵게**·==형광펜== 마커(lib/inline-md.ts)를 강조 렌더하고,
// 편집 중에는 선택 후 플로팅 툴바(B/형광펜/서식지우기) 또는 Cmd+B로 서식 적용 → 커밋 시 마커로 저장.
// 편집 중에는 React가 텍스트 노드를 다시 그리지 않도록 커밋 시에만 부모 상태를 갱신한다.
//
// AI 수정 제안(RefineProvider 안): hover 시 ✨(필드 전체), 편집 중 드래그
// 선택 후 툴바 ✨(선택 구간). 대상+적용클로저를 useRefine().open으로 우측 RefinePanel에 올린다.
// 노출 여부는 프로바이더(우측 패널) 유무로만 판단 — 섹션 수정 버튼·RefinePanel과 동일 기준으로 맞춘다.
// (예전엔 여기만 추가로 NEXT_PUBLIC_LOCAL_AI를 요구해 패널·섹션 버튼은 뜨는데 ✨만 사라지는 불일치가 있었음, 2026-07-15)

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
  /** true면 마운트 직후 편집 모드로 시작(빈 문단 "직접 쓰기" 진입용) — 커서는 끝에. */
  autoEdit?: boolean;
  placeholder?: string;
}

export function Editable({ value, onCommit, as = 'span', multiline, rich, refineContext, autoEdit, placeholder, className, ...rest }: EditableProps) {
  const [editing, setEditing] = useState(!!autoEdit);
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
  const [colorOpen, setColorOpen] = useState(false); // 글자색 팔레트 드롭다운
  const colorRange = useRef<Range | null>(null); // 팔레트 연 순간의 선택 구간 — 드롭다운 클릭으로 선택이 풀려도 복원용
  const lastRange = useRef<Range | null>(null); // 편집 중 마지막 유효 드래그 구간 — 툴바로 가는 사이 선택이 풀리는 브라우저(Safari) 대비
  const ref = useRef<HTMLElement | null>(null);
  const refiningRef = useRef(false); // 리파인 패널로 포커스가 옮겨간 동안 blur-커밋을 막는다(선택 구간 보존).
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refine = useRefine();
  const canRefine = !!refine; // 프로바이더(우측 패널)가 있을 때만 ✨ 노출 — 섹션 수정 버튼·패널과 동일 기준

  // autoEdit — 마운트하자마자 포커스 + 커서 끝(클릭 진입과 같은 상태로 시작)
  useEffect(() => {
    if (!autoEdit) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    if (rich || canRefine) setToolbar(anchorFor());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 편집 중 선택 변화를 지켜보며 마지막 비어있지 않은(드래그) 구간을 저장한다.
  // Safari는 툴바(팔레트)로 마우스가 가는 사이 선택을 풀어버려서, 적용 시점엔 이 스냅샷으로 복원한다.
  useEffect(() => {
    if (!editing) return;
    lastRange.current = null;
    const onSel = () => {
      const el = ref.current;
      const sel = window.getSelection();
      // 시작·끝이 모두 이 필드 안일 때만 저장 — Safari가 툴바 클릭으로 선택을 밖으로 확장해버린 오염 구간은 무시
      if (el && sel && !sel.isCollapsed && sel.rangeCount && el.contains(sel.anchorNode) && el.contains(sel.focusNode)) {
        lastRange.current = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [editing]);

  const commit = () => {
    if (!editing) return;
    if (refiningRef.current) return; // 리파인 패널로 포커스가 이동 → 편집 상태 유지
    setEditing(false);
    setToolbar(null);
    setColorOpen(false);
    const el = ref.current;
    if (!el) return;
    const raw = rich ? htmlToInlineMd(el) : (el.innerText ?? '').replace(/\n+$/, '');
    const next = multiline ? raw : raw.replace(/\s+/g, ' ').trim();
    if (next !== value) onCommit?.(next);
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
    setColorOpen(false);
  };

  const exec = (fn: () => void) => {
    ref.current?.focus();
    fn();
  };

  // 선택 구간을 순수 텍스트로 치환(내부 서식 제거) — 서식지우기 전용.
  const wrapSelection = (build: (text: string) => string) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString();
    const html = build(text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    if (!document.execCommand('insertHTML', false, html)) {
      // execCommand 미지원/실패 폴백 — Range로 직접 치환
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      range.insertNode(tpl.content);
      sel.removeAllRanges();
    }
  };

  // 선택 구간을 래퍼 요소로 감싼다 — extractContents()로 내부 서식(<b>·<mark>·색상 span…)을
  // 보존해 효과 중첩(볼드+색상 등)이 가능하게. dedupeSelector와 같은 종류가 조각 안에 있으면
  // 먼저 벗겨서 같은 효과의 이중 중첩(마커 파싱 불가)을 막는다.
  const wrapSelectionNode = (makeWrapper: () => HTMLElement, dedupeSelector?: string) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const frag = range.extractContents();
    if (dedupeSelector) {
      frag.querySelectorAll(dedupeSelector).forEach((n) => {
        const parent = n.parentNode;
        if (!parent) return;
        while (n.firstChild) parent.insertBefore(n.firstChild, n);
        parent.removeChild(n);
      });
    }
    const wrapper = makeWrapper();
    wrapper.appendChild(frag);
    range.insertNode(wrapper);
    // 적용 후 캐럿을 래퍼 뒤로(선택 해제) — 선택을 남겨두면 다음 드래그가 Safari에서
    // '선택 텍스트 끌어 옮기기'로 발동해 서식 span이 깨진다(색 유실, 2026-07-16 프로드 피드백).
    const r = document.createRange();
    r.setStartAfter(wrapper);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  };

  // 선택 구간이 이미 형광펜(<mark>) 안이면 그 <mark>를 벗겨 강조를 지운다. 아니면 false.
  const clearHighlight = (): boolean => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return false;
    let node: Node | null = sel.anchorNode;
    while (node && node !== el) {
      if (node instanceof HTMLElement && node.tagName === 'MARK') {
        const parent = node.parentNode;
        if (parent) {
          while (node.firstChild) parent.insertBefore(node.firstChild, node);
          parent.removeChild(node);
        }
        return true;
      }
      node = node.parentNode;
    }
    return false;
  };

  // 형광펜 토글 — 강조 안이면 지우고, 아니면 선택 구간을 <mark>로 감싼다(내부 서식 보존).
  const toggleHighlight = () => {
    if (clearHighlight()) return;
    wrapSelectionNode(() => {
      const m = document.createElement('mark');
      m.className = 'rounded-sm bg-amber-200/80 px-0.5';
      return m;
    }, 'mark');
  };

  // 선택 구간이 색상 span({red|…} 마커) 안이면 그 span을 벗긴다. 아니면 false.
  const clearColor = (): boolean => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return false;
    let node: Node | null = sel.anchorNode;
    while (node && node !== el) {
      if (node instanceof HTMLElement && node.tagName === 'SPAN' && node.hasAttribute('data-color')) {
        const parent = node.parentNode;
        if (parent) {
          while (node.firstChild) parent.insertBefore(node.firstChild, node);
          parent.removeChild(node);
        }
        return true;
      }
      node = node.parentNode;
    }
    return false;
  };

  // 팔레트 버튼 mousedown — 클릭(mouseup)이 선택을 망가뜨리기 전에 지금 선택 구간을 확정해 둔다.
  // (Safari는 preventDefault해도 mouseup에서 기존 선택을 클릭 지점으로 확장해버림 → click 시점엔 이미 오염)
  const captureColorRange = () => {
    if (colorOpen) return;
    const el = ref.current;
    const sel = window.getSelection();
    colorRange.current =
      el && sel && !sel.isCollapsed && sel.rangeCount && el.contains(sel.anchorNode) && el.contains(sel.focusNode)
        ? sel.getRangeAt(0).cloneRange()
        : lastRange.current; // 이미 선택이 풀렸으면 편집 중 마지막 드래그 구간으로
  };

  // 글자색 적용 — 저장한 선택 구간을 복원한 뒤, 기존 색을 벗기고 새 색으로 감싼다. null이면 기본색(벗기기만).
  const applyColor = (name: InlineColorName | null) => {
    setColorOpen(false);
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && colorRange.current) {
      sel.removeAllRanges();
      sel.addRange(colorRange.current);
    }
    clearColor();
    if (name) {
      const c = INLINE_COLORS.find((x) => x.name === name);
      if (c)
        wrapSelectionNode(() => {
          const s = document.createElement('span');
          s.setAttribute('data-color', name);
          s.className = c.cls;
          return s;
        }, 'span[data-color]');
    }
    colorRange.current = null;
  };

  // 필드 위쪽에 뜨는 컨트롤 바 앵커(hover·편집 공통).
  const anchorFor = (): { top: number; left: number } | null => {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { top: rect.top + window.scrollY - 40, left: Math.max(8, rect.left + window.scrollX) };
  };

  // 고른 후보를 이 필드에 적용. 선택 구간 모드면 저장한 Range 자리만 교체, 아니면 필드 전체 교체.
  const applyChosen = (chosen: string, scope: 'selection' | 'field', range: Range | null) => {
    refiningRef.current = false;
    if (scope === 'selection' && range) {
      const el = ref.current;
      if (el) {
        el.focus();
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        if (rich) document.execCommand('insertHTML', false, inlineMdToHtml(chosen));
        else document.execCommand('insertText', false, chosen);
      }
      commit();
    } else {
      setEditing(false);
      setToolbar(null);
      if (chosen !== value) onCommit?.(chosen);
    }
  };

  // 적용 없이 닫힘 — 편집 상태 정리(선택 구간 모드는 포커스·선택 복원).
  const closeChosen = (scope: 'selection' | 'field', range: Range | null) => {
    refiningRef.current = false;
    if (scope === 'selection') {
      const el = ref.current;
      el?.focus();
      if (range) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  // ✨ — 편집 중 선택 구간이 있으면 그 구간만, 아니면 필드 전체 값을 대상으로 우측 패널에 요청 등록.
  const openRefine = () => {
    if (!refine) return;
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
    setToolbar(null);
    refine.open({
      target,
      scope,
      kind: 'text',
      rich: !!rich,
      context: refineContext,
      apply: (chosen) => applyChosen(String(chosen), scope, range),
      onClose: () => closeChosen(scope, range),
    });
  };

  const showFormat = editing && rich; // 서식 버튼(B/형광펜/링크/서식지우기)
  const showBar = !!toolbar && (showFormat || canRefine);

  // 편집 표면 요소는 메모이즈 — 툴바 위치·팔레트 열림 같은 내부 상태 리렌더가
  // contentEditable의 innerHTML을 같은 내용으로 다시 써서 브라우저 선택과 저장한 Range를
  // 붕괴시키는 문제(팔레트 색 적용 실패의 원인, 2026-07-16 WebKit 재현)를 막는다.
  // 아래 deps가 바뀔 때만 React가 이 DOM을 건드린다. toolbar/colorOpen은 의도적으로 제외.
  const editableNode = useMemo(() => {
    const content: Record<string, unknown> = {};
    if (rich) content.dangerouslySetInnerHTML = { __html: value ? inlineMdToHtml(value) : editing ? '' : `<span class="opacity-40">${placeholder ?? ''}</span>` };
    return createElement(
      as,
      {
        ref,
        contentEditable: editing,
          suppressContentEditableWarning: true,
          spellCheck: false,
          title: editing ? undefined : '클릭하면 바로 수정',
          onMouseEnter: () => {
            if (editing || !canRefine) return;
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
            setToolbar(anchorFor());
          },
          onMouseLeave: () => {
            if (editing || !canRefine) return;
            hoverTimer.current = setTimeout(() => setToolbar(null), 160);
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
              if (rich || canRefine) setToolbar(anchorFor());
            });
          },
          onBlur: commit,
          // 편집 중 선택 텍스트의 드래그 이동(drag-move) 차단 — 이동 드롭 과정에서 서식
          // span·마커가 깨지고(색 유실), 드래그가 새 선택 대신 이동으로 발동해 혼란을 준다.
          onDragStart: (e: React.DragEvent) => {
            if (editing) e.preventDefault();
          },
          onKeyDown: (e: React.KeyboardEvent) => {
            if (!editing) return;
            e.stopPropagation();
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            } else if (e.key === 'Enter' && !multiline) {
              e.preventDefault();
              commit();
            } else if (e.key === 'Enter' && multiline) {
              // 기본 Enter는 <div> 블록을 만들어 기존 개행(\n, pre-wrap)과 줄 간격이 달라진다(제각각으로 보이는 원인).
              // <br> 줄바꿈으로 통일 — htmlToInlineMd가 \n으로 저장하므로 읽기 모드와 같은 간격.
              e.preventDefault();
              if (!document.execCommand('insertLineBreak')) document.execCommand('insertText', false, '\n');
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
    );
    // rest 스프레드·핸들러가 참조하는 값은 아래 deps로 충분(핸들러는 그 외에 ref·안정 setter만 사용).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [as, value, editing, multiline, rich, className, placeholder, canRefine, onCommit]);

  if (!onCommit) {
    if (rich && value) {
      return createElement(as, { className, dangerouslySetInnerHTML: { __html: inlineMdToHtml(value) }, ...rest });
    }
    return createElement(as, { className, ...rest }, value || placeholder || '');
  }

  return (
    <>
      {editableNode}

      {showBar &&
        createPortal(
          <div
            className="absolute z-50 flex items-center gap-0.5 rounded-lg border border-border bg-white p-1 shadow-lg"
            style={{ top: toolbar!.top, left: toolbar!.left }}
            onMouseEnter={() => {
              if (hoverTimer.current) clearTimeout(hoverTimer.current);
            }}
            onMouseLeave={() => {
              if (!editing) setToolbar(null);
            }}
            onMouseDown={(e) => e.preventDefault() /* 포커스·선택 유지 */}
            onMouseUp={(e) => e.preventDefault() /* Safari가 mouseup에서 선택을 확장하는 것 방지 */}
          >
            {showFormat && (
              <>
                <button type="button" title="굵게 (⌘B)" className="rounded p-1.5 hover:bg-muted" onClick={() => exec(() => document.execCommand('bold'))}>
                  <Bold className="h-3.5 w-3.5" />
                </button>
                <button type="button" title="밑줄 (⌘U)" className="rounded p-1.5 hover:bg-muted" onClick={() => exec(() => document.execCommand('underline'))}>
                  <Underline className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="형광펜 (다시 누르면 지움)"
                  className="rounded p-1.5 hover:bg-muted"
                  onClick={() => exec(toggleHighlight)}
                >
                  <Highlighter className="h-3.5 w-3.5 text-amber-600" />
                </button>
                <span className="relative">
                  <button
                    type="button"
                    title="글자 색"
                    className={cn('rounded p-1.5 hover:bg-muted', colorOpen && 'bg-muted')}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      captureColorRange();
                    }}
                    onClick={() => setColorOpen((v) => !v)}
                  >
                    <Palette className="h-3.5 w-3.5 text-rose-500" />
                  </button>
                  {colorOpen && (
                    <span className="absolute left-0 top-full z-10 mt-1.5 flex items-center gap-1.5 rounded-lg border border-border bg-white px-2 py-1.5 shadow-lg">
                      {INLINE_COLORS.map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          title={c.label}
                          onClick={() => applyColor(c.name)}
                          className={cn('h-4 w-4 rounded-full ring-offset-1 hover:ring-2 hover:ring-accent/50', c.dot)}
                        />
                      ))}
                      <span className="h-4 w-px bg-border" />
                      <button
                        type="button"
                        title="기본색으로 (색 지우기)"
                        onClick={() => applyColor(null)}
                        className="flex h-4 w-4 items-center justify-center rounded-full border border-border bg-white text-[9px] leading-none text-ink/50 hover:ring-2 hover:ring-accent/50 ring-offset-1"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  title="링크"
                  className="rounded p-1.5 hover:bg-muted"
                  onClick={() => {
                    const url = window.prompt('링크 URL:');
                    if (url && url.trim()) {
                      const safe = url.trim().replace(/["<>]/g, '');
                      exec(() =>
                        wrapSelectionNode(() => {
                          const a = document.createElement('a');
                          a.href = safe;
                          a.target = '_blank';
                          a.rel = 'noopener noreferrer';
                          a.className = 'text-accent underline underline-offset-2';
                          return a;
                        }, 'a'),
                      );
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
            {canRefine && (
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
    </>
  );
}
