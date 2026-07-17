import { z } from 'zod';
import { callModel } from '@/lib/ai-draft';
import { extractJson } from '@/lib/claude-cli';
import {
  RenderSlideSchema,
  type CardAccent,
  type CardSlide,
  type CardTemplateId,
} from '@/types/cardpress';
import {
  buildSlidePlan,
  contentUrl,
  type ContentRowLite,
  type SlidePlan,
  type SlidePlanItem,
} from '@/lib/cardpress/mapping';

// AI 슬라이드용 재작성 (spec §3-②) — 매핑 계획(mapping.ts)의 섹션 재료를
// 슬라이드 규격(줄수·글자수)에 맞게 압축하고, 캡션·스레드 글·커버 메타포 검색어까지 한 번에.
// 규격 위반 시 위반 목록을 피드백으로 재압축 루프(최대 2회 추가 호출).

export type CardSetDraft = {
  accent: CardAccent;
  slides: CardSlide[];
  extractedImages: string[];
  igCaption: string;
  threadsText: string;
  metaphorQueries: string[];
};

const FIXED_TAGS = ['#케이스랩', '#AI활용', '#일잘러', '#업무효율', '#AI실험'];
const CATEGORY_TAGS: Record<CardAccent, string[]> = {
  'cat-case': ['#AI실전', '#업무자동화'],
  'cat-trend': ['#AI트렌드', '#AI소식'],
  'cat-tool': ['#AI도구', '#생산성툴'],
};

const GenOutputSchema = z.object({
  slides: z.array(
    z.object({
      template: z.string(),
      sourceSection: z.string().optional(),
      props: z.record(z.string(), z.unknown()),
    })
  ),
  igCaption: z.string().min(1),
  threadsText: z.string().min(1),
  metaphorQueries: z.array(z.string()).optional(),
});

// ── 규격 검사 ──────────────────────────────────────────────

const plain = (s: string) => s.replace(/\*\*/g, '');
const lines = (s: string) => s.split('\n');

function lintLines(name: string, text: string, maxPerLine: number, maxLines: number): string[] {
  const issues: string[] = [];
  const ls = lines(plain(text));
  if (ls.length > maxLines) issues.push(`${name}: ${ls.length}줄 (최대 ${maxLines}줄)`);
  for (const l of ls)
    if (l.length > maxPerLine) issues.push(`${name} "${l}": ${l.length}자 (줄당 최대 ${maxPerLine}자)`);
  return issues;
}

function lintLen(name: string, text: string | undefined, max: number): string[] {
  if (!text) return [];
  const t = plain(text);
  return t.length > max ? [`${name} "${t.slice(0, 20)}…": ${t.length}자 (최대 ${max}자)`] : [];
}

/** 템플릿별 글자수/줄수 규격 — Satori 렌더에서 넘치지 않는 경험적 한계값 */
function lintSlide(template: CardTemplateId, props: Record<string, unknown>): string[] {
  const p = props as Record<string, string> & {
    bullets?: string[];
    good?: string[];
    bad?: string[];
    rows?: { term: string; desc?: string }[];
    steps?: { title: string; desc?: string }[];
    lines?: string[];
  };
  const issues: string[] = [];
  const at = (msg: string) => `[${template}] ${msg}`;
  const push = (arr: string[]) => issues.push(...arr.map(at));

  switch (template) {
    case 'C1':
    case 'C2':
    case 'C3':
      push(lintLines('title', p.title ?? '', 13, 3));
      push(lintLen('sub', p.sub, 30));
      if (p.hl && !(p.title ?? '').includes(p.hl)) push([`hl "${p.hl}"이 title 안에 없음`]);
      break;
    case 'B4':
      push(lintLines('title', p.title ?? '', 14, 3));
      if (p.hl && !(p.title ?? '').includes(p.hl)) push([`hl "${p.hl}"이 title 안에 없음`]);
      break;
    case 'O1':
      push(lintLines('title', p.title ?? '', 12, 2));
      push(lintLen('body', p.body, 65));
      if (p.hl && !(p.title ?? '').includes(p.hl)) push([`hl "${p.hl}"이 title 안에 없음`]);
      break;
    case 'B1':
      push(lintLen('lead', p.lead, 40));
      push(lintLines('heading', p.heading ?? '', 14, 1));
      for (const r of p.rows ?? []) {
        push(lintLen(`rows.term`, r.term, 8));
        push(lintLen(`rows.desc`, r.desc, 14));
      }
      break;
    case 'B2':
      push(lintLen('banner', p.banner, 15));
      for (const b of p.bullets ?? []) push(lintLen('bullet', b, 32));
      break;
    case 'B3':
      push(lintLen('term', p.term, 10));
      push(lintLen('lead', p.lead, 22));
      push(lintLen('body', p.body, 62));
      break;
    case 'B5':
      for (const g of p.good ?? []) push(lintLen('good', g, 58));
      for (const b of p.bad ?? []) push(lintLen('bad', b, 58));
      break;
    case 'B6':
      push(lintLines('heading', p.heading ?? '', 14, 1));
      for (const s of p.steps ?? []) {
        push(lintLen('steps.title', s.title, 12));
        push(lintLen('steps.desc', s.desc, 20));
      }
      break;
    case 'B7':
      push(lintLen('big', p.big, 4));
      push(lintLines('cap', p.cap ?? '', 17, 2));
      push(lintLen('sub', p.sub, 40));
      break;
    case 'B8':
      for (const l of p.lines ?? []) push(lintLen('line', l, 24));
      break;
    default:
      break;
  }
  return issues;
}

// ── 프롬프트 ──────────────────────────────────────────────

const TEMPLATE_SPECS = `[템플릿별 props 규격 — 줄바꿈은 문자열 안 "\\n", **강조**는 포인트색 볼드 마커]
- C1 사진몰입 커버 / C2 문장형 다크 커버 / C3 툴 커버: {"title":"2~3줄, 줄당 ≤12자","hl":"title 속 핵심 단어 1개(부분 문자열 그대로, 짧게)","sub":"≤28자 부제(읽기·적용 시간 있으면 활용)"} (C2는 "eyebrow":"≤16자 도입" 추가 가능)
- B1 타임라인: {"lead":"≤36자 도입(선택, **강조** 1개)","heading":"≤13자 한 줄","hl":"heading 속 핵심 구","rows":[{"term":"≤8자","desc":"≤14자"}] 2~5개}
- B2 불릿: {"banner":"≤14자(✓ 접두 가능)","bullets":["≤30자, **강조** 각 1개"] 2~4개}
- B3 용어: {"badge":"기본 '30초 개념'(생략 가능)","term":"≤10자 핵심 용어","termEn":"영문(선택)","lead":"≤20자 한 줄 정의","body":"≤58자 부연, **강조** 1개"}
- B4 인용/선언: {"title":"2~3줄, 줄당 ≤13자 선언 문장","hl":"핵심 단어","attribution":"— 출처 느낌 한 줄(선택)"}
- B5 잘된것/별로였던것: {"good":["≤55자"] 1~2개,"bad":["≤55자"] 1~2개} — 솔직하게, 실패를 뭉개지 말 것
- B6 스텝: {"heading":"≤13자","hl":"핵심 구","steps":[{"title":"≤12자","desc":"≤18자"}] 2~4개}
- B7 숫자: {"big":"숫자만 ≤4자","unit":"%·배 등(선택)","cap":"1~2줄, 줄당 ≤16자, **강조** 1개","sub":"≤38자(선택)"} — 재료에 실제로 있는 숫자만
- B8 프롬프트: {"lines":["≤22자/줄"] 3~8줄, 변수는 [대괄호], 첫 줄 '# 제목' 주석 권장} — 원문 프롬프트를 압축, 의미 왜곡 금지
- O1 마무리: {"eyebrow":"기본 '오늘의 정리'(생략 가능)","title":"2줄, 줄당 ≤11자 핵심 요약","hl":"핵심 단어","body":"≤58자"} — actions/handle은 생성하지 말 것(시스템 기본값 사용)`;

const SYSTEM = `당신은 케이스랩(caselab)의 SNS 콘텐츠 에디터입니다. 발행된 웹 콘텐츠를 인스타그램 캐러셀 슬라이드 규격으로 압축 재작성합니다.

[caselab 정체성 — 반드시 지킬 것]
- 과장 금지: "무조건", "100%", "혁명" 같은 표현 대신 실측·체감 위주의 담백한 톤
- 형광펜(hl 또는 **강조**)은 슬라이드당 딱 1개
- 솔직함: 잘된 것/별로였던 것(B5)의 실패 부분을 절대 미화하지 말 것
- 재료에 없는 사실·숫자를 지어내지 말 것 (압축·재배열만)

[작업]
아래 슬라이드 계획의 각 항목에 대해, 주어진 재료(material)를 해당 템플릿 규격에 맞게 압축한 props를 작성하세요.
- 계획의 템플릿을 기본으로 쓰되, alternatives에 있는 템플릿이 재료에 더 맞으면 교체 가능 (예: 재료의 핵심이 강한 숫자 1개면 B2 대신 B7)
- 글자수 제한은 공백 포함 엄격 적용 — 넘치면 렌더가 깨집니다

${TEMPLATE_SPECS}

[함께 생성]
- igCaption: 인스타 캡션 — 첫 줄 후킹 → 3~5문장(요약+핵심 시사점) → "자세한 과정은 프로필 링크에서". 해시태그는 쓰지 말 것(시스템이 붙임). 이모지는 절제.
- threadsText: 스레드 네이티브 톤으로 재작성한 글 300~450자 — 대화하듯, 핵심 발견 1~2개 + 솔직 후기 한 줄. 링크는 쓰지 말 것(시스템이 붙임).
- metaphorQueries: 커버 배경 이미지 검색어 3개 — 제목·후킹 문장 속 "구체적 사물/장면"을 영어로 (주제어 말고 명사. 예: "airplane cabin aisle interior", "colored pencils macro"). 구체 명사가 없으면 개념을 사물로 치환(집중→과녁, 선택→갈림길).

[출력 — JSON 하나만, 설명 없이]
{"slides":[{"template":"C1","sourceSection":"계획의 sourceSection 그대로","props":{...}}, ...],"igCaption":"...","threadsText":"...","metaphorQueries":["...","...","..."]}
슬라이드 순서·개수는 계획과 동일하게 유지하세요(템플릿 교체만 허용).`;

function planPrompt(row: ContentRowLite, plan: SlidePlan): string {
  const slideLines = plan.slides
    .map(
      (s, i) =>
        `${i + 1}. template=${s.template}${s.alternatives?.length ? ` (대안: ${s.alternatives.join(',')})` : ''} · sourceSection=${s.sourceSection}${s.required ? ` · ${s.required}` : ''}\n재료:\n${s.material}`
    )
    .join('\n\n');
  return `[콘텐츠]
트랙: ${row.track === 'case' ? '실전 케이스' : 'AI 트렌드'}
제목: ${row.title}
요약: ${row.summary ?? '(없음)'}

[슬라이드 계획 — ${plan.slides.length}장]
${slideLines}`;
}

// ── 생성 본체 ──────────────────────────────────────────────

type RawSlide = z.infer<typeof GenOutputSchema>['slides'][number];
type ParsedSlide = CardSlide & { planIndex: number };

function validateSlides(
  raw: RawSlide[],
  plan: SlidePlan
): { issues: string[]; parsed: ParsedSlide[] } {
  const issues: string[] = [];
  const parsed: ParsedSlide[] = [];

  if (raw.length !== plan.slides.length)
    issues.push(`슬라이드 개수 ${raw.length}개 — 계획(${plan.slides.length}개)과 다름`);

  raw.forEach((s, i) => {
    const planned: SlidePlanItem | undefined = plan.slides[i];
    const allowed = planned ? [planned.template, ...(planned.alternatives ?? [])] : [];
    if (planned && !allowed.includes(s.template as CardTemplateId)) {
      issues.push(`${i + 1}번: template=${s.template} — 허용(${allowed.join(',')}) 밖`);
      return;
    }
    const check = RenderSlideSchema.safeParse({
      template: s.template,
      accent: plan.accent,
      props: s.props,
    });
    if (!check.success) {
      issues.push(
        `${i + 1}번(${s.template}) 스키마 오류: ${check.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(' / ')}`
      );
      return;
    }
    issues.push(...lintSlide(check.data.template, s.props).map((m) => `${i + 1}번 ${m}`));
    parsed.push({
      template: check.data.template,
      order: i + 1,
      enabled: true,
      props: s.props,
      sourceSection: planned?.sourceSection ?? s.sourceSection,
      required: planned?.required,
      planIndex: i,
    });
  });

  return { issues, parsed };
}

/** page 지원 템플릿에 "n / total" 자동 기입 + 계획된 이미지 자동 배치 */
function finalizeSlides(slides: ParsedSlide[], plan: SlidePlan): CardSlide[] {
  const total = slides.length;
  const PAGED: CardTemplateId[] = ['B1', 'B2', 'B3', 'B5', 'B6', 'B7', 'B8', 'B9', 'O1'];
  return slides.map(({ planIndex, ...s }, i) => {
    const props = { ...s.props };
    if (PAGED.includes(s.template)) props.page = `${i + 1} / ${total}`;
    const planned = plan.slides[planIndex];
    if (planned?.image) {
      // C2·C3는 사진 없는 다크 커버 — coverImage는 사진형(C1·B4)에만
      if ((s.template === 'C1' || s.template === 'B4') && !props.coverImage)
        props.coverImage = planned.image;
      if (s.template === 'B2' && !props.media) props.media = planned.image;
      if (s.template === 'B9' && !props.shot) props.shot = planned.image;
    }
    return { ...s, order: i + 1, props };
  });
}

/** 단일 슬라이드 재작성 — 검수 UI의 템플릿 교체(B2↔B7 등)·"AI로 다시 쓰기"용.
 *  재료는 저장하지 않으므로 소스 콘텐츠에서 매핑 계획을 다시 만들어 찾는다. */
export async function rewriteSlide(
  row: ContentRowLite,
  sourceSection: string,
  targetTemplate: CardTemplateId,
  instruction?: string
): Promise<{ template: CardTemplateId; props: Record<string, unknown> }> {
  const plan = buildSlidePlan(row);
  const item = plan.slides.find((s) => s.sourceSection === sourceSection);
  if (!item) throw new Error(`sourceSection "${sourceSection}"에 해당하는 재료가 없어요`);

  const base = `[콘텐츠] ${row.track === 'case' ? '실전 케이스' : 'AI 트렌드'} · ${row.title}

[슬라이드 1장만 작성]
template=${targetTemplate} · sourceSection=${sourceSection}
재료:
${item.material}${instruction ? `\n\n[운영자 요청] ${instruction}` : ''}

[출력 — JSON 하나만] {"template":"${targetTemplate}","props":{...}}`;

  let lastIssues: string[] = [];
  let lastJson: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt =
      attempt === 0 || lastJson == null
        ? base
        : `${base}\n\n[이전 시도]\n${JSON.stringify(lastJson)}\n\n[규격 위반 — 더 짧게 압축해 다시]\n${lastIssues.map((i) => `- ${i}`).join('\n')}`;
    let raw: string;
    try {
      raw = await callModel(SYSTEM, prompt, {
        allowedTools: [],
        model: 'sonnet',
        timeoutMs: 480_000,
      });
    } catch (e) {
      lastIssues = [`모델 호출 실패: ${(e as Error).message}`];
      lastJson = null;
      continue;
    }
    let json: { template?: string; props?: Record<string, unknown> };
    try {
      json = JSON.parse(extractJson(raw));
    } catch {
      lastIssues = ['응답이 JSON이 아님'];
      lastJson = null;
      continue;
    }
    lastJson = json;
    const check = RenderSlideSchema.safeParse({
      template: targetTemplate,
      accent: plan.accent,
      props: json.props,
    });
    if (!check.success) {
      lastIssues = check.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
      continue;
    }
    lastIssues = lintSlide(targetTemplate, json.props ?? {});
    if (lastIssues.length === 0 || attempt === 2)
      return { template: targetTemplate, props: json.props ?? {} };
  }
  throw new Error(`슬라이드 재작성 실패: ${lastIssues.slice(0, 3).join(' / ')}`);
}

export async function generateCardSet(row: ContentRowLite): Promise<CardSetDraft> {
  const plan = buildSlidePlan(row);
  const userPrompt = planPrompt(row, plan);

  let lastRaw: z.infer<typeof GenOutputSchema> | null = null;
  let lastIssues: string[] = [];
  let slides: ParsedSlide[] = [];

  // 첫 호출 + 규격 위반 시 재압축 루프 최대 2회 (spec §3-② 텍스트 오버플로우 자동 검사)
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt =
      attempt === 0 || !lastRaw
        ? userPrompt
        : `${userPrompt}

[이전 시도 결과]
${JSON.stringify(lastRaw)}

[규격 위반 — 아래 항목만 더 짧게 압축해서, 전체 JSON을 다시 출력하세요]
${lastIssues.map((i) => `- ${i}`).join('\n')}`;

    let raw: string;
    try {
      raw = await callModel(SYSTEM, prompt, {
        allowedTools: [],
        model: 'sonnet',
        // 구독 CLI는 기동·큐 지연 편차가 큼 (150s·300s 실측 타임아웃) — 로컬 한정이라 넉넉히.
        // prod(Vercel)는 AI_PROVIDER=apikey 경로라 이 값에 안 걸린다.
        timeoutMs: 480_000,
      });
    } catch (e) {
      lastIssues = [`모델 호출 실패: ${(e as Error).message}`];
      lastRaw = null;
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(extractJson(raw));
    } catch {
      lastIssues = ['응답이 JSON이 아님 — JSON 객체 하나만 출력하세요'];
      lastRaw = null;
      continue;
    }
    const parsed = GenOutputSchema.safeParse(json);
    if (!parsed.success) {
      lastIssues = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
      lastRaw = null;
      continue;
    }
    lastRaw = parsed.data;
    const result = validateSlides(parsed.data.slides, plan);
    if (result.issues.length === 0) {
      slides = result.parsed;
      break;
    }
    lastIssues = result.issues;
    // 마지막 시도까지 위반이 남으면, 파싱된 것만이라도 사용(검수 UI에서 수정)
    if (attempt === 2) slides = result.parsed;
  }

  if (!lastRaw || slides.length === 0) {
    throw new Error(`카드 생성 실패: ${lastIssues.slice(0, 5).join(' / ') || 'AI 응답 파싱 불가'}`);
  }

  const tags = [...FIXED_TAGS, ...CATEGORY_TAGS[plan.accent]];
  const url = contentUrl(row);
  const threads = lastRaw.threadsText.includes(url)
    ? lastRaw.threadsText
    : `${lastRaw.threadsText.trim()}\n\n👉 전체 과정: ${url}`;

  return {
    accent: plan.accent,
    slides: finalizeSlides(slides, plan),
    extractedImages: plan.images,
    igCaption: `${lastRaw.igCaption.trim()}\n\n${tags.join(' ')}`,
    threadsText: threads,
    metaphorQueries: lastRaw.metaphorQueries ?? [],
  };
}
