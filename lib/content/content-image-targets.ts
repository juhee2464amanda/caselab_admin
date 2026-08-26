// 콘텐츠(케이스·트렌드) 본문에서 "이미지 채우기"가 쓸 재료를 뽑고, 고른 이미지를 도로 꽂는다.
//
// 자료실(도구)에는 기능마다 이미지 슬롯(features[i].image)이 있지만 콘텐츠 본문에는 그런 칸이 없다.
// 대신 고정 섹션이 자유 블록 배열(what·why·deepDive·soWhat·caseIntro)이라 image 블록을 그 안에 넣을 수 있고,
// 매칭되는 섹션이 없으면 '추가 섹션'(body.sections)으로 보낸다 — ToolForm의 추가 섹션 폴백과 같은 규칙.
//
// 매칭 키는 **섹션 제목 문자열**이다(AI가 받은 제목을 그대로 돌려주므로). 운영자가 소제목을
// 바꿨으면 body.headings의 값이 제목이 되므로 그것으로 대상을 만든다.

import type { Block, CaseBody, ContentBody, RichSection, TrendBody } from '@/types/content';

/** 이미지가 들어갈 수 있는 본문 고정 섹션 (자유 블록 배열인 것만) */
const TREND_SLOTS = [
  { key: 'what', title: '무슨 소식이에요' },
  { key: 'why', title: '왜 지금 화두예요' },
  { key: 'deepDive', title: '좀 더 들어가면' },
  { key: 'soWhat', title: '그래서, 내 일엔?' },
] as const;

const CASE_SLOTS = [{ key: 'caseIntro', title: '어떤 케이스를 다루나요' }] as const;

type SlotKey = (typeof TREND_SLOTS)[number]['key'] | (typeof CASE_SLOTS)[number]['key'];
type Slot = { key: SlotKey; title: string };

function slotsOf(body: ContentBody): readonly Slot[] {
  return body.kind === 'trend' ? TREND_SLOTS : CASE_SLOTS;
}

export interface ImageTarget {
  title: string;
  desc?: string;
}

/** 블록 배열에서 앞부분 산문만 짧게 — AI가 "이 섹션이 무슨 얘긴지" 알 정도면 충분하다 */
function blocksExcerpt(blocks: Block[] | undefined, limit = 160): string {
  if (!blocks?.length) return '';
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'text' || b.type === 'callout') parts.push(b.markdown);
    else if (b.type === 'heading') parts.push(b.text);
    else if (b.type === 'checklist') parts.push(`${b.title} ${b.items.join(' ')}`);
    else if (b.type === 'prompt') parts.push(b.label);
    else if (b.type === 'bookmark') parts.push([b.title, b.description].filter(Boolean).join(' '));
    if (parts.join(' ').length >= limit) break;
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

/** 운영자가 고친 소제목이 있으면 그것이 제목 */
function slotTitle(body: ContentBody, key: string, fallback: string): string {
  const overridden = (body as { headings?: Record<string, string> }).headings?.[key];
  return overridden?.trim() || fallback;
}

function slotBlocks(body: ContentBody, key: SlotKey): Block[] | undefined {
  return (body as unknown as Record<string, Block[] | undefined>)[key];
}

/**
 * 이미지를 매칭할 대상 목록.
 * 내용이 있는 고정 섹션(제목+발췌) + 케이스 단계 카드 + 이미 있는 추가 섹션 제목.
 * 빈 섹션은 넣지 않는다 — 본문이 없는 자리에 화면만 꽂히면 맥락 없는 그림이 된다.
 */
export function imageTargets(body: ContentBody): ImageTarget[] {
  const out: ImageTarget[] = [];
  for (const s of slotsOf(body)) {
    const blocks = slotBlocks(body, s.key);
    if (!blocks?.length) continue;
    out.push({ title: slotTitle(body, s.key, s.title), desc: blocksExcerpt(blocks) });
  }
  // 케이스 단계 카드 — 넣을 칸은 없지만(구조 스키마) 좋은 매칭 대상이라 제목만 넘긴다.
  // 매칭되면 그 제목의 추가 섹션으로 들어간다.
  if (body.kind === 'case') {
    for (const s of (body as CaseBody).stepCards ?? []) {
      if (s?.label) out.push({ title: s.label, desc: [s.human, s.ai].filter(Boolean).join(' / ').slice(0, 160) });
    }
  }
  for (const s of body.sections ?? []) {
    const title = s.heading?.trim();
    if (title) out.push({ title, desc: blocksExcerpt(s.blocks) });
  }
  // 같은 제목이 두 번 오면 AI가 어디에 넣을지 모른다 — 먼저 나온 것만
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t.title) ? false : (seen.add(t.title), true)));
}

/** 본문에서 훑을 만한 주소 후보 — 트렌드 출처, 북마크 블록, 케이스 프레임워크 출처 */
export function captureUrlCandidates(body: ContentBody): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  const push = (label: string, url?: string) => {
    if (url && /^https?:\/\//.test(url)) out.push({ label: label.trim() || url, url });
  };

  if (body.kind === 'trend') {
    for (const s of (body as TrendBody).sources ?? []) push(s.label, s.url);
  } else {
    const ref = (body as CaseBody).frameworkReference;
    if (ref) push(ref.sourceLabel || ref.sourceTitle || ref.name, ref.sourceUrl);
  }

  // 본문 어디에 있든 북마크(링크 카드)는 그 글이 가리키는 원문이다
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const b = node as Partial<Block> & Record<string, unknown>;
    if (b.type === 'bookmark' && typeof b.url === 'string') {
      push(typeof b.title === 'string' && b.title ? b.title : (b.siteName as string) ?? '링크', b.url);
    }
    Object.values(node).forEach(walk);
  };
  walk(body);

  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true))).slice(0, 6);
}

/** 썸네일 검색어용 본문 발췌 — 제목·요약만으로는 추상어 검색으로 흐른다 */
export function bodyExcerptForThumbnail(body: ContentBody): string {
  const parts: string[] = [];
  if (body.kind === 'trend') {
    const t = body as TrendBody;
    parts.push(blocksExcerpt(t.what, 400));
    if (t.keyPoints?.length) parts.push(t.keyPoints.join(' / '));
    parts.push(blocksExcerpt(t.why, 300));
  } else {
    const c = body as CaseBody;
    parts.push(blocksExcerpt(c.caseIntro, 400));
    if (c.painPoints?.length) parts.push(c.painPoints.map((p) => p.title).join(' / '));
    if (c.stepCards?.length) parts.push(c.stepCards.map((s) => s.label).join(' / '));
  }
  return parts.filter(Boolean).join('\n').slice(0, 900);
}

export interface PlacedImage {
  title: string;
  url: string;
  alt?: string;
  caption?: string;
}

/**
 * 고른 이미지를 본문에 꽂는다. 배치 우선순위:
 *  1. 제목이 고정 섹션과 같으면 그 섹션 블록 맨 뒤
 *  2. 이미 있는 추가 섹션 제목과 같으면 그 섹션 블록 맨 뒤
 *  3. 아니면 그 제목으로 추가 섹션을 새로 만든다
 * 같은 자리에 두 장을 골라도 둘 다 남는다(체크한 이미지는 버리지 않는다).
 */
export function applyImagesToBody(body: ContentBody, images: PlacedImage[]): ContentBody {
  if (!images.length) return body;
  const next = { ...body } as ContentBody & Record<string, unknown>;
  const sections: RichSection[] = [...(body.sections ?? [])];
  const slots = slotsOf(body);

  for (const img of images) {
    const block: Block = {
      type: 'image',
      url: img.url,
      ...(img.alt ? { alt: img.alt } : {}),
      ...(img.caption ? { caption: img.caption } : {}),
    };
    const title = img.title.trim();

    const slot = slots.find((s) => slotTitle(body, s.key, s.title) === title);
    if (slot && (next[slot.key] as Block[] | undefined)?.length) {
      next[slot.key] = [...(next[slot.key] as Block[]), block];
      continue;
    }
    const hit = sections.findIndex((s) => s.heading?.trim() === title);
    if (hit !== -1) {
      sections[hit] = { ...sections[hit], blocks: [...sections[hit].blocks, block] };
      continue;
    }
    sections.push({ heading: title, blocks: [block] });
  }

  if (sections.length) next.sections = sections;
  return next as ContentBody;
}
