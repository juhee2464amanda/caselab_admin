import type { CardSlide, CardTemplateId } from '@/types/cardpress';
import { IMAGE_KEY } from '@/lib/cardpress/convert';

// 사진 출처 표기 — 카드에 실제로 깔린 사진의 출처를 캡션·스레드 글에 넣는다.
//
// 왜 필요한가:
//  · Unsplash API Guidelines는 라이선스와 별개로 구속력이 있다 — 사진가·Unsplash 출처 표기 필수(UTM 포함).
//    lib/cardpress/generate.ts가 photoCredits를 계산해 놓고도 저장하지 않아 지금까지 버려지고 있었다.
//  · 원본 콘텐츠에서 긁어온 사진(2026-08-15 추가)은 남의 저작물이라 인용 표기가 필요하다.
//
// 원칙: 출처는 "지금 카드에 실제로 남아 있는 사진"에서만 계산한다. 사진을 갈아끼우면 표기도 따라 바뀐다.

export const UNSPLASH_UTM = 'utm_source=caselab&utm_medium=referral';

export type PhotoCredit = {
  /** 사진 URL — 이 값으로 슬라이드의 사진과 대조한다 */
  url: string;
  /** 표기할 이름 (Unsplash 사진가명 / 웹 출처는 호스트) */
  credit: string;
  /** 사진가 프로필 또는 원본 페이지 URL */
  creditLink?: string;
  source: 'unsplash' | 'web';
};

/** 캡션 안에서 출처 블록을 찾아내는 마커 — 재삽입 시 중복 대신 교체하기 위한 것 */
const MARK = '📷 사진';

/** 슬라이드(활성)에 실제로 깔린 사진 URL — 스레드 커버 포함 */
export function usedImageUrls(slides: CardSlide[], threadsCover?: string | null): string[] {
  const urls: string[] = [];
  for (const s of slides) {
    if (!s.enabled) continue;
    const key = IMAGE_KEY[s.template as CardTemplateId];
    const v = key ? (s.props as Record<string, unknown>)[key] : undefined;
    if (typeof v === 'string' && v.startsWith('http')) urls.push(v);
  }
  if (threadsCover?.startsWith('http')) urls.push(threadsCover);
  return Array.from(new Set(urls));
}

/** 실제로 쓰인 사진의 출처만 추린다 (카탈로그에 없는 URL = 본가 본문 이미지 등, 표기 대상 아님) */
export function usedCredits(
  slides: CardSlide[],
  catalog: Map<string, PhotoCredit>,
  threadsCover?: string | null
): PhotoCredit[] {
  const out: PhotoCredit[] = [];
  const seen = new Set<string>();
  for (const url of usedImageUrls(slides, threadsCover)) {
    const c = catalog.get(url);
    if (!c) continue;
    // 같은 사진가·같은 출처가 여러 장이면 한 번만 적는다
    const key = `${c.source}:${c.credit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * 출처 블록 문자열.
 * withLinks=true(스레드)면 링크를 함께 — 인스타 캡션은 링크가 안 눌리므로 이름만 적는다.
 */
export function creditBlock(credits: PhotoCredit[], withLinks = false): string {
  if (credits.length === 0) return '';
  const unsplash = credits.filter((c) => c.source === 'unsplash');
  const web = credits.filter((c) => c.source === 'web');
  const lines: string[] = [];
  if (unsplash.length) {
    const names = unsplash
      .map((c) => (withLinks && c.creditLink ? `${c.credit}(${withUtm(c.creditLink)})` : c.credit))
      .join(' · ');
    lines.push(`${MARK}: Unsplash — ${names}`);
  }
  if (web.length) {
    const names = web
      .map((c) => (withLinks && c.creditLink ? `${c.credit} ${c.creditLink}` : c.credit))
      .join(' · ');
    lines.push(`${MARK} 출처: ${names}`);
  }
  return lines.join('\n');
}

function withUtm(link: string): string {
  return link.includes('utm_source') ? link : `${link}${link.includes('?') ? '&' : '?'}${UNSPLASH_UTM}`;
}

/** 기존 출처 블록 제거 — 재삽입할 때 중복으로 쌓이지 않게 */
export function stripCreditBlock(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) =>
      para
        .split('\n')
        .filter((l) => !l.trimStart().startsWith(MARK))
        .join('\n')
    )
    .filter((para) => para.trim())
    .join('\n\n');
}

/**
 * 출처 블록을 넣는다(있으면 교체).
 * 해시태그 문단이 맨 끝이면 그 앞에 — 캡션 마지막 줄은 해시태그로 끝나는 게 이 계정 문법이다.
 */
export function upsertCreditBlock(text: string, block: string): string {
  const base = stripCreditBlock(text).trim();
  if (!block) return base;
  const paras = base ? base.split(/\n{2,}/) : [];
  const last = paras[paras.length - 1];
  if (last && /^#/.test(last.trim())) {
    paras.splice(paras.length - 1, 0, block);
    return paras.join('\n\n');
  }
  return [...paras, block].join('\n\n');
}

/** 이미 그 출처 블록이 들어가 있는지 (안내 문구용) */
export function hasCreditBlock(text: string, block: string): boolean {
  if (!block) return true;
  return block.split('\n').every((line) => text.includes(line));
}
