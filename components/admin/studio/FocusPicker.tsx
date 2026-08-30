'use client';

import { useRef, useState, type MouseEvent } from 'react';

// 깜빡임(포커스) 영역 선택기 — 이미지를 전체가 보이게(contain) 띄우고 드래그하면
// "pct:x,y,w,h" (이미지 기준 백분율)로 반환한다. 캔버스 좌표 변환은 서버가 fit·크기에 맞게 한다.
// 좌표를 손으로 입력하다 문장이 들어가는 사고(2026-08-30)를 막는다.

export function FocusPicker({
  imageUrl,
  value,
  onChange,
}: {
  imageUrl: string;
  value: string; // "pct:x,y,w,h" 또는 ''
  onChange: (focus: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const toLocal = (e: MouseEvent) => {
    const b = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - b.left, 0), b.width),
      y: Math.min(Math.max(e.clientY - b.top, 0), b.height),
    };
  };

  /** contain으로 띄운 이미지의 실제 콘텐츠 박스(레터박스 제외) */
  const contentBox = () => {
    const b = boxRef.current!.getBoundingClientRect();
    const img = imgRef.current;
    if (!img?.naturalWidth) return { ox: 0, oy: 0, cw: b.width, ch: b.height };
    const s = Math.min(b.width / img.naturalWidth, b.height / img.naturalHeight);
    const cw = img.naturalWidth * s;
    const ch = img.naturalHeight * s;
    return { ox: (b.width - cw) / 2, oy: (b.height - ch) / 2, cw, ch };
  };

  const finish = (r: { x: number; y: number; w: number; h: number }) => {
    const { ox, oy, cw, ch } = contentBox();
    // 레터박스 밖은 잘라내고 이미지 기준 백분율로
    const x1 = Math.max(r.x, ox);
    const y1 = Math.max(r.y, oy);
    const x2 = Math.min(r.x + r.w, ox + cw);
    const y2 = Math.min(r.y + r.h, oy + ch);
    if (x2 - x1 < 4 || y2 - y1 < 4) return;
    const pct = (v: number) => Math.round(v * 1000) / 10;
    onChange(`pct:${pct((x1 - ox) / cw)},${pct((y1 - oy) / ch)},${pct((x2 - x1) / cw)},${pct((y2 - y1) / ch)}`);
  };

  return (
    <div>
      <div
        ref={boxRef}
        className="relative w-full max-w-[280px] select-none overflow-hidden rounded border border-border bg-ink/10"
        style={{ aspectRatio: '4 / 5', cursor: 'crosshair' }}
        onMouseDown={(e) => {
          e.preventDefault();
          setDrag(toLocal(e));
          setRect(null);
          onChange('');
        }}
        onMouseMove={(e) => {
          if (!drag) return;
          const p = toLocal(e);
          setRect({ x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) });
        }}
        onMouseUp={() => {
          if (drag && rect && rect.w > 8 && rect.h > 8) finish(rect);
          setDrag(null);
        }}
        onMouseLeave={() => setDrag(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={imageUrl} alt="영역 선택" draggable={false} className="h-full w-full" style={{ objectFit: 'contain' }} />
        {rect && (
          <div
            className="pointer-events-none absolute border-2 border-amber-400 bg-amber-400/15"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          />
        )}
      </div>
      <p className="mt-1 text-[10px] text-ink/40">
        {value ? `영역 지정됨 — 다시 드래그하면 교체` : '이미지 위를 드래그해서 깜빡일 영역을 지정 (선택)'}
      </p>
    </div>
  );
}
