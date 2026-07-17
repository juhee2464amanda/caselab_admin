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
};

export type SlidePlan = {
  accent: CardAccent;
  slides: SlidePlanItem[];
  /** 본문에서 추출한 이미지 전체 (검수 UI 이미지 트레이) */
  images: string[];
};

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
  const time =
    row.read_min || row.apply_min
      ? `\n읽기/적용 시간: ${[row.read_min ? `읽는 데 ${row.read_min}분` : '', row.apply_min ? `적용 ${row.apply_min}분` : ''].filter(Boolean).join(' · ')}`
      : '';
  return `제목: ${row.title}\n요약: ${row.summary ?? ''}${time}`;
}

function planCase(row: ContentRowLite, body: CaseBody, images: string[]): SlidePlanItem[] {
  const slides: SlidePlanItem[] = [];

  slides.push({
    template: 'C1',
    sourceSection: 'title+summary',
    material: coverMaterial(row),
    alternatives: ['C2'],
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

  const prompt = body.stepCards?.find((s) => s.prompt?.trim())?.prompt;
  if (prompt) slides.push({ template: 'B8', sourceSection: 'stepCards.prompt', material: prompt });

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
    alternatives: ['C1'],
    image: images[0],
  });

  const what = blocksToText(body.what);
  if (what) slides.push({ template: 'B3', sourceSection: 'what', material: what });

  if (body.keyPoints?.length) {
    slides.push({
      template: 'B2',
      sourceSection: 'keyPoints',
      material: body.keyPoints.map((k) => `- ${k}`).join('\n'),
      alternatives: ['B7'],
    });
  }

  const why = blocksToText(body.why);
  if (why) slides.push({ template: 'B4', sourceSection: 'why', material: why });

  const deepDive = blocksToText(body.deepDive);
  if (deepDive)
    slides.push({
      template: 'B2',
      sourceSection: 'deepDive',
      material: deepDive,
      image: images[1],
    });

  const soWhat = blocksToText(body.soWhat);
  slides.push({
    template: 'O1',
    sourceSection: 'soWhat',
    material: soWhat || coverMaterial(row),
  });

  return slides;
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
  return { accent, slides, images };
}

/** 본가 콘텐츠 URL (스레드 글에 첨부 — 유입 트래픽 확보) */
export function contentUrl(row: Pick<ContentRowLite, 'track' | 'slug'>): string {
  const base = (process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? 'https://caselab.kr').replace(/\/$/, '');
  return `${base}/${row.track === 'case' ? 'cases' : 'trends'}/${row.slug}`;
}
