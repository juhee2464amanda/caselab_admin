import type { SupabaseClient } from '@supabase/supabase-js';

// 발행 직전 가격 재검증 — 카드에 박힌 가격이 소스 공식 사이트의 현재가와 다르면 경고.
// 배경: 수집(8/7) 시 $2.99였던 도구가 발행(8/16) 전 $4.99로 인상됐는데,
//       파이프라인이 저장본만 믿어서 틀린 가격이 카드로 나갈 뻔했다.
// 원칙: 경고이지 차단이 아니다 — 사이트가 죽었거나 JS 렌더라 가격을 못 찾으면
//       '확인 불가'로 알리고 발행은 그대로 진행할 수 있게 한다.

const PRICE_RE = /[$₩]\s?\d[\d,]*(?:\.\d{1,2})?/g;

function normalize(p: string): string {
  return p.replace(/[\s,]/g, '');
}

export function extractPrices(text: string): string[] {
  return [...new Set((text.match(PRICE_RE) ?? []).map(normalize))];
}

export type PriceCheckResult = {
  /** tool 소스이고 카드에 가격 표기($·₩)가 있을 때만 true — 아니면 검사 대상 아님 */
  applicable: boolean;
  url?: string;
  /** 카드 슬라이드·IG캡션·스레드 글에 박힌 가격 */
  cardPrices?: string[];
  /** 공식 사이트에서 지금 보이는 가격 */
  livePrices?: string[];
  /** 카드에는 있는데 사이트에는 없는 가격 — 이게 차 있으면 경고 */
  mismatches?: string[];
  /** 확인 불가 사유 (fetch 실패·가격 미발견 등) */
  error?: string;
};

export async function verifyCardPrices(
  admin: SupabaseClient,
  card: {
    source_type: string;
    source_id: string;
    slides: unknown;
    ig_caption: string | null;
    threads_text: string | null;
  }
): Promise<PriceCheckResult> {
  const cardText = [JSON.stringify(card.slides), card.ig_caption ?? '', card.threads_text ?? ''].join(
    '\n'
  );
  const cardPrices = extractPrices(cardText);
  if (card.source_type !== 'tool' || cardPrices.length === 0) return { applicable: false };

  const { data: tool } = await admin
    .from('tools')
    .select('url')
    .eq('id', card.source_id)
    .maybeSingle();
  const url = tool?.url as string | undefined;
  if (!url || !/^https?:\/\//.test(url)) return { applicable: false };

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'Mozilla/5.0 (caselab-admin cardpress price-check)' },
    });
    if (!res.ok) return { applicable: true, url, cardPrices, error: `사이트 응답 ${res.status}` };
    const livePrices = extractPrices(await res.text());
    if (livePrices.length === 0)
      return { applicable: true, url, cardPrices, livePrices, error: '사이트에서 가격 표기를 찾지 못함' };
    return { applicable: true, url, cardPrices, livePrices, mismatches: cardPrices.filter((p) => !livePrices.includes(p)) };
  } catch {
    return { applicable: true, url, cardPrices, error: '사이트 접속 실패' };
  }
}
