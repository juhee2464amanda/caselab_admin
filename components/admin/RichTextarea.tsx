'use client';

import { useRef } from 'react';
import { Bold, Underline, Highlighter, Link2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// 폼용 마커 기반 리치 텍스트 입력 — 선택 구간을 **굵게**·__밑줄__·==형광펜==·[링크](url) 마커로 감싼다.
// 저장은 마커 문자열 그대로(lib/inline-md 규칙). 본가 renderInline이 같은 규칙으로 렌더한다.
// contentEditable(Editable)이 아니라 controlled textarea라서 폼 제출 시 값 유실·경쟁이 없다.
export function RichTextarea({
  value,
  onChange,
  className,
  rows,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  rows?: number;
  placeholder?: string;
  mono?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // 선택 구간을 마커로 감싸고, 감싼 텍스트를 다시 선택 상태로 둔다(연속 서식 편하게).
  const wrap = (marker: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    if (s === e) {
      el.focus();
      return;
    }
    const sel = value.slice(s, e);
    onChange(value.slice(0, s) + marker + sel + marker + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + marker.length, e + marker.length);
    });
  };

  const link = () => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    if (s === e) {
      el.focus();
      return;
    }
    const url = window.prompt('링크 URL:');
    if (!url || !url.trim()) return;
    const sel = value.slice(s, e);
    const safe = url.trim().replace(/[)\s]/g, '');
    onChange(value.slice(0, s) + `[${sel}](${safe})` + value.slice(e));
    requestAnimationFrame(() => el.focus());
  };

  const btn = 'rounded p-1 text-ink/70 hover:bg-muted';

  return (
    <div className={cn('rounded-md border border-border bg-white', className)}>
      <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1">
        <button type="button" title="굵게" onClick={() => wrap('**')} className={btn}>
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="밑줄" onClick={() => wrap('__')} className={btn}>
          <Underline className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="형광펜" onClick={() => wrap('==')} className={btn}>
          <Highlighter className="h-3.5 w-3.5 text-amber-600" />
        </button>
        <button type="button" title="링크" onClick={link} className={btn}>
          <Link2 className="h-3.5 w-3.5 text-accent" />
        </button>
        <span className="ml-auto pr-1 text-[10px] text-ink/35">텍스트 선택 후 서식</span>
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={cn('min-h-0 rounded-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0', mono && 'font-mono')}
      />
    </div>
  );
}
