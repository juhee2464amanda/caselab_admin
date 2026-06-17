'use client';

import type { ReactNode } from 'react';

/**
 * #6 Phase 3 — 본문 에디터 섹션 래퍼.
 * 번호·제목·설명 헤더 + 내용. 라이브 콘텐츠 페이지 섹션 구조와 시각 정합.
 */
export function BodySection({
  num,
  title,
  hint,
  children,
}: {
  num?: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="mb-3">
        {num && <div className="text-[11px] font-bold tracking-[0.08em] text-ink/40">{num}</div>}
        <h3 className="text-sm font-bold tracking-[-0.01em]">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-ink/50 break-keep">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
