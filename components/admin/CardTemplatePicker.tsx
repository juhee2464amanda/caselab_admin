'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { renderSlide } from '@/lib/cardpress/templates';
import { RenderSlideSchema } from '@/types/cardpress';
import type { CardAccent, CardSlide, CardTemplateId } from '@/types/cardpress';
import {
  convertProps,
  hasImageSlot,
  sampleProps,
  TEMPLATE_DESC,
  TEMPLATE_GROUPS,
  TEMPLATE_LABEL,
} from '@/lib/cardpress/convert';

// 템플릿 시각 피커 — 이름만 나열하던 선택을 실제 모양으로 바꾼다.
// · 슬라이드 교체: 지금 슬라이드의 글을 각 템플릿에 얹은 모습으로 미리 본다(로컬 변환, AI 호출 없음).
// · 새 슬라이드: 샘플 문구로 레이아웃을 보여준다.
// 재료가 모자라 그대로 못 옮기는 템플릿은 "재료 부족"으로 표시하고 AI 재작성 경로로 넘긴다.

const CELL_W = 1080;
const CELL_H = 1350;

function TemplateThumb({
  template,
  accent,
  props,
}: {
  template: CardTemplateId;
  accent: CardAccent;
  props: Record<string, unknown>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const parsed = RenderSlideSchema.safeParse({ template, accent, props });
  const scale = w > 0 ? w / CELL_W : 0;
  return (
    <div ref={ref} className="relative w-full overflow-hidden bg-ink/5" style={{ aspectRatio: '4 / 5' }}>
      {scale > 0 && parsed.success ? (
        <div
          style={{
            width: CELL_W,
            height: CELL_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif",
            pointerEvents: 'none',
          }}
        >
          {renderSlide(parsed.data)}
        </div>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-ink/30">
          미리보기 불가
        </span>
      )}
    </div>
  );
}

export type PickResult = {
  template: CardTemplateId;
  props: Record<string, unknown>;
  /** 채우지 못한 필수 재료 (빈 배열이면 그대로 변환 가능) */
  missing: string[];
};

export function CardTemplatePicker({
  open,
  onOpenChange,
  accent,
  /** 있으면 "교체" 모드 — 이 슬라이드의 글을 각 템플릿으로 변환해 보여준다 */
  slide,
  /** 사진 자리가 있는 템플릿에 미리 꽂아둘 이미지 (없으면 그라데이션 폴백) */
  fallbackImage,
  /** 계획(plan)이 추천한 템플릿 — 맨 위에 "추천"으로 뜬다 */
  recommended = [],
  busy = false,
  onPick,
  /** 재료가 부족한 템플릿을 고를 때의 경로 (없으면 그 템플릿은 잠긴다) */
  onAiRewrite,
  title = '템플릿 고르기',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accent: CardAccent;
  slide?: CardSlide;
  fallbackImage?: string;
  recommended?: CardTemplateId[];
  busy?: boolean;
  onPick: (r: PickResult) => void;
  onAiRewrite?: (t: CardTemplateId) => void;
  title?: string;
}) {
  const [photoOnly, setPhotoOnly] = useState(false);

  // 템플릿별 미리보기 props + 부족한 재료 — 열려 있을 때만 계산(21장 렌더는 가볍지 않다)
  const previews = useMemo(() => {
    if (!open) return new Map<CardTemplateId, PickResult & { preview: Record<string, unknown> }>();
    const map = new Map<CardTemplateId, PickResult & { preview: Record<string, unknown> }>();
    for (const g of TEMPLATE_GROUPS) {
      for (const t of g.items) {
        if (slide) {
          const { props, missing } = convertProps(slide.template, t, slide.props as Record<string, unknown>);
          // 재료가 모자라도 레이아웃은 보여준다 — 무엇을 고르는지가 먼저다
          const preview = missing.length ? sampleProps(t, fallbackImage ?? (props.image as string | undefined)) : props;
          map.set(t, { template: t, props, missing, preview });
        } else {
          const props = sampleProps(t, fallbackImage);
          const missing = t === 'B9' && !fallbackImage ? ['스크린샷'] : [];
          map.set(t, { template: t, props, missing, preview: props });
        }
      }
    }
    return map;
  }, [open, slide, fallbackImage]);

  const groups = TEMPLATE_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((t) => (photoOnly ? hasImageSlot(t) : true) && t !== slide?.template),
  })).filter((g) => g.items.length > 0);

  const recoItems = recommended.filter((t) => previews.has(t) && t !== slide?.template);

  function Cell({ t, tag }: { t: CardTemplateId; tag?: string }) {
    const p = previews.get(t);
    if (!p) return null;
    const blocked = p.missing.length > 0;
    const locked = blocked && !onAiRewrite;
    return (
      <button
        key={`${tag ?? ''}${t}`}
        disabled={busy || locked}
        onClick={() => {
          if (blocked) onAiRewrite?.(t);
          else onPick(p);
        }}
        className={`group text-left rounded-lg border overflow-hidden transition ${
          locked ? 'border-border opacity-40 cursor-not-allowed' : 'border-border hover:border-accent hover:shadow-elevated'
        }`}
        title={blocked ? `재료 부족(${p.missing.join('·')}) — AI가 이 템플릿에 맞게 다시 씁니다` : TEMPLATE_DESC[t]}
      >
        <div className="relative">
          <TemplateThumb template={t} accent={accent} props={p.preview} />
          {hasImageSlot(t) && (
            <span className="absolute top-1 right-1 text-[9px] rounded px-1 py-0.5 bg-black/55 text-white">사진 ○</span>
          )}
          {tag && (
            <span className="absolute top-1 left-1 text-[9px] rounded px-1 py-0.5 bg-accent text-white">{tag}</span>
          )}
          {blocked && (
            <span className="absolute bottom-1 left-1 right-1 text-[9px] rounded px-1 py-0.5 bg-amber-500/90 text-white text-center">
              {locked ? `재료 부족 · ${p.missing.join('·')}` : `AI 재작성 · ${p.missing.join('·')}`}
            </span>
          )}
        </div>
        <div className="px-2 py-1.5">
          <div className="text-[11px] font-semibold truncate">{TEMPLATE_LABEL[t]}</div>
          <div className="text-[10px] text-ink/40 leading-snug line-clamp-2">{TEMPLATE_DESC[t]}</div>
        </div>
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto p-5">
        <DialogHeader className="mb-3">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <p className="text-xs text-ink/50 mt-1">
            {slide
              ? '지금 슬라이드의 글을 각 템플릿에 얹어 본 모습입니다. 클릭하면 그대로 옮겨져요 (AI 호출 없음).'
              : '샘플 문구로 레이아웃만 보여줍니다. 고르면 빈 슬라이드가 추가되고 바로 편집할 수 있어요.'}
          </p>
        </DialogHeader>

        <label className="flex items-center gap-1.5 text-xs text-ink/60 mb-3">
          <input type="checkbox" checked={photoOnly} onChange={(e) => setPhotoOnly(e.target.checked)} />
          사진이 들어가는 템플릿만 보기
        </label>

        {recoItems.length > 0 && !photoOnly && (
          <section className="mb-4">
            <div className="text-xs font-semibold mb-1.5">
              추천 <span className="text-ink/40 font-normal">· 이 재료에 맞다고 판단된 것</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
              {recoItems.map((t) => (
                <Cell key={`reco-${t}`} t={t} tag="추천" />
              ))}
            </div>
          </section>
        )}

        {groups.map((g) => (
          <section key={g.label} className="mb-4">
            <div className="text-xs font-semibold mb-1.5">
              {g.label} <span className="text-ink/40 font-normal">· {g.hint}</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
              {g.items.map((t) => (
                <Cell key={t} t={t} />
              ))}
            </div>
          </section>
        ))}

        {busy && <p className="text-xs text-accent">작업 중…</p>}
      </DialogContent>
    </Dialog>
  );
}
