'use client';

// 트렌드 세부 유형 비교 카드 — 씨앗 채택(SeedCuration)·MD 직행(MdImport) 공용.
// AI 추천(1·2순위)과 기존형을 나란히 보여주고 운영자가 고른다. 미선택(null) = 기존 자유 포맷.
// 골격 미리보기는 lib/trend-variants.ts 상수라 AI 호출 없이 즉시 그려진다.

import { cn } from '@/lib/utils';
import {
  CLASSIC_FORMAT_CARD,
  TREND_VARIANTS,
  trendVariantProfile,
  type TrendVariant,
} from '@/lib/content/trend-variants';

interface VariantRank {
  variant: string;
  why: string;
}

export default function TrendVariantPicker({
  ranking,
  value,
  onChange,
  disabled,
}: {
  /** AI 추천(1·2순위 순). 아직 없으면 undefined — 4유형 전체를 추천 배지 없이 보여준다. */
  ranking?: VariantRank[];
  /** 선택된 유형. null = 기존형(자유 포맷). */
  value: TrendVariant | null;
  onChange: (v: TrendVariant | null) => void;
  disabled?: boolean;
}) {
  const ranked = (ranking ?? []).filter((r): r is { variant: TrendVariant; why: string } =>
    TREND_VARIANTS.some((v) => v.variant === r.variant),
  );
  const hasRanking = ranked.length > 0;
  // 추천이 있으면 1·2순위만 카드로, 나머지는 하단 칩. 없으면 4유형 전부 카드.
  const cardVariants = hasRanking ? ranked.map((r) => r.variant) : TREND_VARIANTS.map((v) => v.variant);
  const restVariants = TREND_VARIANTS.map((v) => v.variant).filter((v) => !cardVariants.includes(v));

  const card = (
    key: string,
    selected: boolean,
    onClick: () => void,
    head: React.ReactNode,
    fits: string,
    readTime: string,
    skeleton: readonly string[],
    why?: string,
  ) => (
    <button
      key={key}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-lg border p-2.5 text-left transition-colors disabled:opacity-60',
        selected ? 'border-accent bg-white ring-1 ring-accent' : 'border-border bg-white hover:bg-muted/60',
      )}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5">{head}</div>
      {why && <p className="mb-1 text-[11px] leading-snug text-ink/60">{why}</p>}
      <p className="mb-1.5 text-[11px] leading-snug text-ink/50">
        {fits} · 읽기 {readTime}
      </p>
      <ul className="space-y-0.5">
        {skeleton.map((s, i) => (
          <li key={i} className="text-[10.5px] leading-snug text-ink/45">
            · {s}
          </li>
        ))}
      </ul>
      <span className={cn('mt-1.5 inline-block text-[10px]', selected ? 'text-accent' : 'text-ink/40')}>
        {selected ? '✓ 이 골격으로 생성' : '이 골격 쓰기'}
      </span>
    </button>
  );

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-snug text-ink/50">
        <span className="font-medium text-ink/70">유형 비교</span> — 골격을 고르면 그 유형의 분량·섹션 규칙으로
        생성돼요. 기존형은 지금까지의 자유 포맷 그대로.
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {cardVariants.map((v, i) => {
          const p = trendVariantProfile(v);
          const why = ranked.find((r) => r.variant === v)?.why;
          return card(
            v,
            value === v,
            () => onChange(v),
            <>
              <span className="text-xs font-semibold">{p.label}</span>
              {hasRanking && (
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px]',
                    i === 0 ? 'bg-accent/10 text-accent font-medium' : 'bg-muted text-ink/60',
                  )}
                >
                  {i === 0 ? '추천 1순위' : '2순위'}
                </span>
              )}
            </>,
            p.fits,
            p.readTime,
            p.skeleton,
            why,
          );
        })}
        {card(
          'classic',
          value === null,
          () => onChange(null),
          <span className="text-xs font-semibold">{CLASSIC_FORMAT_CARD.label}</span>,
          CLASSIC_FORMAT_CARD.fits,
          CLASSIC_FORMAT_CARD.readTime,
          CLASSIC_FORMAT_CARD.skeleton,
        )}
      </div>
      {restVariants.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-ink/40">다른 유형:</span>
          {restVariants.map((v) => {
            const p = trendVariantProfile(v);
            return (
              <button
                key={v}
                type="button"
                disabled={disabled}
                onClick={() => onChange(v)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10.5px] transition-colors disabled:opacity-60',
                  value === v
                    ? 'border-accent text-accent bg-white ring-1 ring-accent'
                    : 'border-border text-ink/60 bg-white hover:bg-muted/60',
                )}
              >
                {p.label} · {p.readTime}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
