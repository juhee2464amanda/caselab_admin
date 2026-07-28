import type { Block, CaseBody, TrendBody, ContentBody } from '@/types/content';
import type { CardAccent, CardTemplateId } from '@/types/cardpress';

// 카드프레스 자동 매핑 엔진 — docs/09_card_press_spec.md §3-① 블록→슬라이드 테이블.
// track별 레시피를 출발점으로 "실제 존재하는 섹션만" 결정적으로 매핑한다(AI 없이).
// 텍스트 압축·props 생성은 lib/cardpress/generate.ts (AI)의 몫.

export type ContentRowLite = {
  id: string;
  track: 'case' | 'trend';
  title: string;
  summary: string | null;
  slug: string;
  thumbnail_url: string | null;
  read_min: number | null;
  apply_min: number | null;
  body: ContentBody | null;
};

export type SlidePlanItem = {
  template: CardTemplateId;
  sourceSection: string;
  /** AI에 주는 원문 재료 (이 섹션의 실제 텍스트) */
  material: string;
  /** 섹션당 후보 템플릿 복수 시 대안 (검수 UI에서 교체 제시) */
  alternatives?: CardTemplateId[];
  /** 정체성 가드레일 등으로 빠질 수 없는 슬라이드인 이유 */
  required?: string;
  /** 이 슬라이드에 배치할 이미지 후보 (media/shot/cover) */
  image?: string;
  /** 선정 대상 후보 — AI가 대표만 작성하고 나머지는 skip 가능 (리스트형 항목) */
  optional?: boolean;
};

export type SlidePlan = {
  accent: CardAccent;
  slides: SlidePlanItem[];
  /** 본문에서 추출한 이미지 전체 (검수 UI 이미지 트레이) */
  images: string[];
  /** optional 후보 중 AI가 작성해야 할 대표 개수 (≈ 후보의 50%, 최대 6) */
  selectTarget?: number;
};

/** 리스트형 본문 항목 — deepDive 등에서 heading 단위 세그먼트로 분해한 것 */
export type ListItem = {
  id: string; // "01" 등 — sourceSection 'deepDive#01'
  heading: string;
  text: string;
  prompt?: string;
};

/** heading으로 세그먼트를 나누고, 프롬프트가 있거나 번호 매긴 항목(01. …)이면 리스트 항목으로 인정.
 *  ("프롬프트 11가지" 같은 모음형 콘텐츠가 슬라이드 1장으로 뭉개지는 것 방지 — 항목당 슬라이드 후보) */
export function splitListItems(blocks: Block[] | undefined): ListItem[] {
  if (!blocks?.length) return [];
  type Seg = { heading: string; texts: string[]; prompt?: string };
  const segs: Seg[] = [];
  let cur: Seg | null = null;
  for (const b of blocks) {
    if (b.type === 'heading') {
      if (cur) segs.push(cur);
      cur = { heading: b.text.trim(), texts: [] };
    } else if (cur) {
      if (b.type === 'text') cur.texts.push(b.markdown.replace(MD_IMAGE_RE, '').trim());
      else if (b.type === 'prompt' && !cur.prompt) cur.prompt = b.prompt;
    }
  }
  if (cur) segs.push(cur);
  // 프롬프트 모음형이면 프롬프트 있는 세그먼트만 항목 (그룹 소제목 "1. Pre-implementation" 오인 방지),
  // 프롬프트 없는 리스트형(도구 7가지 등)은 번호 매긴 소제목을 항목으로.
  const hasPrompts = segs.some((s) => s.prompt);
  const items = segs.filter((s) =>
    hasPrompts ? !!s.prompt : /^\d{1,2}[.)]\s*/.test(s.heading) && s.texts.length > 0
  );
  return items.map((s, i) => ({
    id: String(i + 1).padStart(2, '0'),
    heading: s.heading,
    text: s.texts.join('\n'),
    prompt: s.prompt,
  }));
}

const MD_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)\)/g;

/** 블록 배열 → AI 재료용 평문. 이미지·북마크는 텍스트 없음(이미지는 collectImages가 수집). */
export function blocksToText(blocks: Block[] | undefined): string {
  if (!blocks?.length) return '';
  const parts: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'text':
        parts.push(b.markdown.replace(MD_IMAGE_RE, '').trim());
        break;
      case 'heading':
        parts.push(`[소제목] ${b.text}`);
        break;
      case 'prompt':
        parts.push(`[프롬프트${b.label ? ` · ${b.label}` : ''}] ${b.prompt}`);
        break;
      case 'result-compare':
        parts.push(`[좋은 결과] ${b.good}\n[아쉬운 결과] ${b.bad}`);
        break;
      case 'role-card':
        parts.push(`[사람] ${b.human}\n[AI] ${b.ai}`);
        break;
      case 'intent':
        parts.push(`[의도 ${b.step}] ${b.text}`);
        break;
      case 'evaluation':
        parts.push(`[잘된 것] ${b.good}\n[아쉬운 것] ${b.bad}`);
        break;
      case 'rebuttal':
        parts.push(`[가설] ${b.hypothesis}\n[반박] ${b.counter}`);
        break;
      case 'framework-ref':
        parts.push(`[프레임워크] ${b.name}`);
        break;
      case 'context-card':
        parts.push(`[${b.title}] ${b.fields.map((f) => `${f.label}: ${f.value}`).join(' · ')}`);
        break;
      case 'checklist':
        parts.push(`[체크리스트 · ${b.title}] ${b.items.join(' / ')}`);
        break;
      case 'failure':
        parts.push(`[실패 사례 · ${b.title}]\n${blocksToText(b.blocks)}`);
        break;
      default:
        break;
    }
  }
  return parts.filter(Boolean).join('\n');
}

function imagesFromBlocks(blocks: Block[] | undefined): string[] {
  if (!blocks?.length) return [];
  const urls: string[] = [];
  for (const b of blocks) {
    if (b.type === 'image') urls.push(b.url);
    else if (b.type === 'gallery') urls.push(...b.images.map((i) => i.url));
    else if (b.type === 'bookmark' && b.image) urls.push(b.image);
    else if (b.type === 'text') {
      for (const m of b.markdown.matchAll(MD_IMAGE_RE)) urls.push(m[1]);
    } else if (b.type === 'failure') urls.push(...imagesFromBlocks(b.blocks));
  }
  return urls;
}

/** 본문 이미지 자동 추출 — 썸네일·본문 image/gallery 블록·마크다운 이미지·프레임워크 출처 썸네일 (spec §3-①) */
export function collectImages(row: ContentRowLite): string[] {
  const urls: string[] = [];
  if (row.thumbnail_url) urls.push(row.thumbnail_url);
  const body = row.body;
  if (body?.kind === 'case') {
    if (body.frameworkReference?.sourceThumbnail) urls.push(body.frameworkReference.sourceThumbnail);
    for (const key of ['caseIntro', 'essence', 'failures', 'review'] as const)
      urls.push(...imagesFromBlocks(body[key]));
    for (const s of body.sections ?? []) urls.push(...imagesFromBlocks(s.blocks));
  } else if (body?.kind === 'trend') {
    for (const key of ['what', 'why', 'deepDive', 'soWhat'] as const)
      urls.push(...imagesFromBlocks(body[key]));
  }
  return Array.from(new Set(urls.filter((u) => u.startsWith('http'))));
}

function coverMaterial(row: ContentRowLite): string {
  // 읽기/적용 시간은 본가 웹 개념 — 인스타 커버에선 무의미해서 재료에서 제외 (운영자 결정 2026-07-21)
  return `제목: ${row.title}\n요약: ${row.summary ?? ''}`;
}

function planCase(row: ContentRowLite, body: CaseBody, images: string[]): SlidePlanItem[] {
  const slides: SlidePlanItem[] = [];

  slides.push({
    template: 'C1',
    sourceSection: 'title+summary',
    material: coverMaterial(row),
    alternatives: ['C2', 'C5'],
    image: images[0],
  });

  const intro = blocksToText(body.caseIntro);
  if (intro) slides.push({ template: 'B4', sourceSection: 'caseIntro', material: intro });

  if (body.painPoints?.length) {
    slides.push({
      template: 'B2',
      sourceSection: 'painPoints',
      material: body.painPoints
        .map((p) => `${p.num}. ${p.title} — 증상: ${p.symptom} / 근본 원인: ${p.rootCause}`)
        .join('\n'),
      alternatives: ['B7'],
    });
  }

  if (body.frameworkReference && (body.stepCards?.length ?? 0) >= 2) {
    slides.push({
      template: 'B1',
      sourceSection: 'frameworkReference+stepCards',
      material: `프레임워크: ${body.frameworkReference.name} — ${body.frameworkReference.description}\n단계: ${body
        .stepCards!.map((s) => `${s.num}. ${s.label} (사람: ${s.human} / AI: ${s.ai})`)
        .join('\n')}`,
    });
  }

  if (body.stepCards?.length) {
    slides.push({
      template: 'B6',
      sourceSection: 'stepCards',
      material: body.stepCards
        .map(
          (s) =>
            `${s.num}. ${s.label}${s.description ? ` — ${s.description}` : ''} (사람: ${s.human} / AI: ${s.ai})${s.goodResult ? `\n  좋았던 결과: ${s.goodResult}` : ''}${s.badResult ? `\n  아쉬운 결과: ${s.badResult}` : ''}`
        )
        .join('\n'),
      alternatives: ['B2'],
      image: images[1],
    });
  }

  // 프롬프트 실물은 저장가치의 핵심 — 스텝별 B8 후보로 전부 올리고, 많으면 AI가 대표만 선정(skip)
  const promptSteps = (body.stepCards ?? []).filter((s) => s.prompt?.trim());
  const stepOptional = promptSteps.length > 2;
  for (const s of promptSteps) {
    slides.push({
      template: 'B8',
      sourceSection: `stepCards#${s.num}`,
      material: `${s.label}\n${s.prompt}`,
      optional: stepOptional,
    });
  }

  if (body.pros?.length || body.cons?.length) {
    slides.push({
      template: 'B5',
      sourceSection: 'pros/cons',
      material: `잘된 것:\n${(body.pros ?? []).map((p) => `- ${p}`).join('\n')}\n별로였던 것:\n${(body.cons ?? []).map((c) => `- ${c}`).join('\n')}`,
      required: body.cons?.length ? 'cons 존재 — 정체성 가드레일상 B5 필수' : undefined,
    });
  }

  slides.push({
    template: 'O1',
    sourceSection: 'takingPoints',
    material:
      body.takingPoints?.length
        ? body.takingPoints
            .map((t) => `${t.title}: ${t.description}${t.action ? ` → ${t.action}` : ''}`)
            .join('\n')
        : coverMaterial(row),
  });

  return slides;
}

function planTrend(row: ContentRowLite, body: TrendBody, images: string[]): SlidePlanItem[] {
  const slides: SlidePlanItem[] = [];

  slides.push({
    template: 'C2',
    sourceSection: 'title+summary',
    material: coverMaterial(row),
    alternatives: ['C1', 'C5'],
    image: images[0],
  });

  const what = blocksToText(body.what);
  if (what) slides.push({ template: 'B3', sourceSection: 'what', material: what });

  const items = splitListItems(body.deepDive);

  if (body.keyPoints?.length) {
    slides.push({
      template: 'B2',
      sourceSection: 'keyPoints',
      material: `(역할: 전체 오버뷰/목차 — 뒤에 나올 개별 항목 슬라이드와 표현·내용이 겹치지 않게)\n${body.keyPoints.map((k) => `- ${k}`).join('\n')}`,
      alternatives: ['B7'],
    });
  }

  const why = blocksToText(body.why);
  if (why) slides.push({ template: 'B4', sourceSection: 'why', material: why });

  if (items.length >= 3) {
    // 리스트형(모음) 콘텐츠 — 항목당 슬라이드 후보. 프롬프트 있으면 B8(실물), 없으면 B2.
    for (const it of items) {
      slides.push({
        template: it.prompt ? 'B8' : 'B2',
        sourceSection: `deepDive#${it.id}`,
        material: `${it.heading}\n${it.text}${it.prompt ? `\n[프롬프트 원문]\n${it.prompt}` : ''}`,
        optional: true,
      });
    }
  } else {
    const deepDive = blocksToText(body.deepDive);
    if (deepDive)
      slides.push({
        template: 'B2',
        sourceSection: 'deepDive',
        material: deepDive,
        image: images[1],
      });
  }

  const soWhat = blocksToText(body.soWhat);
  slides.push({
    template: 'O1',
    sourceSection: 'soWhat',
    material: soWhat || coverMaterial(row),
  });

  return slides;
}

// ── 씨앗(content_seeds) 소스 — 미발행 원석(raw_text)에서 바로 카드뉴스 ──────────

export type SeedRowLite = {
  id: string;
  title: string;
  raw_text: string;
  lane: string | null;
  suggested_angle: string | null;
  note: string | null;
  /** 채점 시 적재되는 핵심 요약 { headline, what/whyNow/pain … } */
  essence: Record<string, string> | null;
  source_url: string | null;
};

/** 씨앗 표시 제목 — essence.headline 우선, 없으면 "[lane] " 태그 벗긴 원제목 */
export function seedTitle(seed: Pick<SeedRowLite, 'title' | 'essence'>): string {
  return seed.essence?.headline?.trim() || seed.title.replace(/^\s*\[[^\]]*\]\s*/, '');
}

/** raw_text → 문단 세그먼트 (빈 줄 기준, 너무 짧은 조각은 앞 문단에 흡수) */
function splitSeedSegments(rawText: string): string[] {
  const paras = rawText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const segs: string[] = [];
  for (const p of paras) {
    if (p.length < 40 && segs.length > 0) segs[segs.length - 1] += `\n${p}`;
    else segs.push(p);
  }
  return segs;
}

/** 씨앗 → 슬라이드 계획. 구조화 본문이 없으므로 문단 단위로 후보를 깔고 AI가 대표를 선정한다. */
export function buildSeedSlidePlan(seed: SeedRowLite): SlidePlan {
  const title = seedTitle(seed);
  const essenceLines = Object.entries(seed.essence ?? {})
    .filter(([k, v]) => k !== 'headline' && v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const angle = seed.suggested_angle?.trim();
  const segments = splitSeedSegments(seed.raw_text);

  const coverMat = [
    `제목: ${title}`,
    angle ? `추천 각도: ${angle}` : '',
    essenceLines,
    segments[0] ? `도입: ${segments[0]}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const slides: SlidePlanItem[] = [
    { template: 'C2', sourceSection: 'seed:cover', material: coverMat, alternatives: ['C1', 'C5'] },
  ];

  if (segments.length === 0) {
    slides.push({ template: 'B4', sourceSection: 'seed:body', material: seed.raw_text, alternatives: ['B2', 'B3'] });
  } else {
    // 문단당 슬라이드 후보 — 3개 초과면 (선정)으로 AI가 대표만 작성
    const optional = segments.length > 3;
    segments.slice(0, 6).forEach((seg, i) => {
      slides.push({
        template: 'B2',
        sourceSection: `seed:seg#${String(i + 1).padStart(2, '0')}`,
        material: seg,
        alternatives: ['B7', 'B4', 'B3'],
        optional,
      });
    });
  }

  slides.push({
    template: 'O1',
    sourceSection: 'seed:outro',
    material: [angle ? `핵심 각도: ${angle}` : '', `제목: ${title}`, segments.at(-1) ?? ''].filter(Boolean).join('\n'),
  });

  const optCount = slides.filter((s) => s.optional).length;
  const selectTarget = optCount > 0 ? Math.min(6, Math.max(3, Math.round(optCount / 2))) : undefined;
  // 씨앗은 대부분 트렌드성 소식/발견 — 트렌드 액센트, 이미지는 없음(커버 후보는 메타포 검색으로)
  return { accent: 'cat-trend', slides, images: [], selectTarget };
}

/** 발행 콘텐츠 → 슬라이드 계획. 섹션이 없으면 해당 슬라이드가 빠진다(장수 가변이 정상). */
export function buildSlidePlan(row: ContentRowLite): SlidePlan {
  const accent: CardAccent = row.track === 'case' ? 'cat-case' : 'cat-trend';
  const images = collectImages(row);
  const body = row.body;
  const slides =
    body?.kind === 'case'
      ? planCase(row, body, images)
      : body?.kind === 'trend'
        ? planTrend(row, body, images)
        : [
            // body가 비면 커버+아웃트로 최소 세트
            {
              template: 'C1' as const,
              sourceSection: 'title+summary',
              material: coverMaterial(row),
              image: images[0],
            },
            { template: 'O1' as const, sourceSection: 'title+summary', material: coverMaterial(row) },
          ];
  // 선정 대표 개수 ≈ 후보의 50% (사용자 결정: 11개면 5개 수준), 최소 3·최대 6
  const optCount = slides.filter((s) => s.optional).length;
  const selectTarget = optCount > 0 ? Math.min(6, Math.max(3, Math.round(optCount / 2))) : undefined;
  return { accent, slides, images, selectTarget };
}

/** 본가 콘텐츠 URL (스레드 글에 첨부 — 유입 트래픽 확보) */
export function contentUrl(row: Pick<ContentRowLite, 'track' | 'slug'>): string {
  const base = (process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? 'https://caselab.kr').replace(/\/$/, '');
  return `${base}/${row.track === 'case' ? 'cases' : 'trends'}/${row.slug}`;
}
