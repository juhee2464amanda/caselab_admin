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
  buildSeedSlidePlan,
  buildSlidePlan,
  buildToolSlidePlan,
  contentUrl,
  seedTitle,
  toolKindLabel,
  toolUrl,
  type ContentRowLite,
  type SeedRowLite,
  type SlidePlan,
  type SlidePlanItem,
  type ToolRowLite,
} from '@/lib/cardpress/mapping';

// AI 슬라이드용 재작성 (spec §3-②) — 매핑 계획(mapping.ts)의 섹션 재료를
// 슬라이드 규격(줄수·글자수)에 맞게 압축하고, 캡션·스레드 글·커버 메타포 검색어까지 한 번에.
// 규격 위반 시 위반 목록을 피드백으로 재압축 루프(최대 2회 추가 호출).

export type CardCtaType = 'info_save' | 'comment_dm';

/**
 * 카드 소스 3원화 — 본가에 발행돼 유저에게 보이는 것 전부 + 미발행 씨앗 원석.
 *  content  contents(case/trend)  → 본가 /cases · /trends
 *  tool     tools(가이드·프롬프트·도구) → 본가 /guides · /prompts · /tools
 *  seed     content_seeds          → 미발행(본가 링크 없음)
 */
export type CardSource =
  | { kind: 'content'; row: ContentRowLite }
  | { kind: 'tool'; tool: ToolRowLite }
  | { kind: 'seed'; seed: SeedRowLite };

function sourcePlan(src: CardSource): SlidePlan {
  if (src.kind === 'content') return buildSlidePlan(src.row);
  if (src.kind === 'tool') return buildToolSlidePlan(src.tool);
  return buildSeedSlidePlan(src.seed);
}

function sourceTitle(src: CardSource): string {
  if (src.kind === 'content') return src.row.title;
  if (src.kind === 'tool') return src.tool.name;
  return seedTitle(src.seed);
}

/** planPrompt 등 프롬프트 헤더의 한 줄 표기 */
function sourceLabel(src: CardSource): string {
  if (src.kind === 'content')
    return `${src.row.track === 'case' ? '실전 케이스' : 'AI 트렌드'} · ${src.row.title}`;
  if (src.kind === 'tool') return `${toolKindLabel(src.tool.category)} · ${src.tool.name}`;
  return `씨앗 원석 · ${seedTitle(src.seed)}`;
}

/** 스레드 글에 붙일 본가 URL — 씨앗은 아직 본가에 없으므로 null */
function sourceUrl(src: CardSource): string | null {
  if (src.kind === 'content') return contentUrl(src.row);
  if (src.kind === 'tool') return toolUrl(src.tool);
  return null;
}

export type CoverCandidate = { thumb: string; full: string; credit: string; creditLink: string };

export type CardSetDraft = {
  accent: CardAccent;
  slides: CardSlide[];
  extractedImages: string[];
  igCaption: string;
  threadsText: string;
  metaphorQueries: string[];
  /** AI가 정의한(또는 운영자가 지정한) 이 콘텐츠의 엣지 한 줄 — 검수 UI에서 수정·재생성 축 */
  edge: string;
  /** CTA 유형 — comment_dm(댓글→DM, ManyChat) | info_save(저장+프로필 링크) */
  ctaType: CardCtaType;
  /** comment_dm일 때 댓글 트리거 키워드 */
  ctaKeyword: string;
  /** 메타포 검색어로 Unsplash에서 자동 수급한 커버 후보 (키 없으면 빈 배열) */
  coverCandidates: CoverCandidate[];
};

const FIXED_TAGS = ['#케이스랩', '#AI활용', '#일잘러', '#업무효율', '#AI실험'];
const CATEGORY_TAGS: Record<CardAccent, string[]> = {
  'cat-case': ['#AI실전', '#업무자동화'],
  'cat-trend': ['#AI트렌드', '#AI소식'],
  'cat-tool': ['#AI도구', '#생산성툴'],
};

const GenOutputSchema = z.object({
  edge: z.string().min(1),
  ctaKeyword: z.string().optional(), // comment_dm일 때 댓글 트리거 키워드 제안 (≤6자)
  slides: z.array(
    z.union([
      z.object({ skip: z.literal(true), sourceSection: z.string().optional() }),
      z.object({
        template: z.string(),
        sourceSection: z.string().optional(),
        props: z.record(z.string(), z.unknown()),
      }),
    ])
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

/** **강조** 구절 개수 — P 계열은 슬라이드 전체 1구절이 상한(벤치마크 룰) */
function countEm(text?: string): number {
  return text ? (text.match(/\*\*.+?\*\*/g) ?? []).length : 0;
}

/** 두 텍스트가 같은 정보를 반복하는지 — 공백 제거 후 5자 이상 공통 부분 문자열 검출 */
function sharesLongSubstring(a?: string, b?: string, min = 5): boolean {
  if (!a || !b) return false;
  const x = plain(a).replace(/\s/g, '');
  const y = plain(b).replace(/\s/g, '');
  for (let i = 0; i + min <= x.length; i++) if (y.includes(x.slice(i, i + min))) return true;
  return false;
}

/** 커버 전용 검사 — ① 소스 제목의 영문 키워드(제품·모델명)가 커버 텍스트에 존재 ② 필드 간 정보 중복 금지 */
function lintCover(props: Record<string, string>, sourceTitle: string): string[] {
  const issues: string[] = [];
  const coverText = ['kicker', 'eyebrow', 'title', 'sub', 'big', 'resolve']
    .map((k) => props[k] ?? '')
    .join(' ');
  // 제품·모델명 휴리스틱: 소스 제목 속 영문(+숫자) 토큰 (예: "Fable 5", "NotebookLM")
  const keywords = sourceTitle.match(/[A-Za-z][A-Za-z0-9.-]*(?: \d+[A-Za-z0-9.]*)?/g) ?? [];
  const norm = (s: string) => s.toLowerCase().replace(/\s/g, '');
  if (keywords.length > 0 && !keywords.some((k) => norm(coverText).includes(norm(k)))) {
    issues.push(`핵심 키워드(${keywords.join('/')})가 커버 텍스트에 없음 — 무엇에 관한 글인지 커버에서 보여야 함`);
  }
  const pairs: Array<[string, string]> = [
    ['kicker', 'sub'], ['kicker', 'title'], ['eyebrow', 'sub'], ['eyebrow', 'title'], ['sub', 'title'],
  ];
  for (const [a, b] of pairs)
    if (sharesLongSubstring(props[a], props[b]))
      issues.push(`${a}와 ${b}가 같은 정보 반복("${props[a]}" ↔ "${props[b]}") — 각 필드는 서로 다른 정보 1개씩`);
  return issues;
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
    items?: string[];
  };
  const issues: string[] = [];
  const at = (msg: string) => `[${template}] ${msg}`;
  const push = (arr: string[]) => issues.push(...arr.map(at));

  switch (template) {
    case 'C1':
    case 'C2':
    case 'C3':
      push(lintLen('kicker', p.kicker, 15));
      push(lintLines('title', p.title ?? '', 13, 3));
      push(lintLen('sub', p.sub, 30));
      push(lintLen('footer', p.footer, 22));
      if (p.hl && !(p.title ?? '').includes(p.hl)) push([`hl "${p.hl}"이 title 안에 없음`]);
      break;
    case 'C5':
      push(lintLen('kicker', p.kicker, 22));
      push(lintLen('big', p.big, 6));
      push(lintLines('resolve', p.resolve ?? '', 17, 2));
      push(lintLen('footer', p.footer, 22));
      break;
    case 'B4':
      push(lintLines('title', p.title ?? '', 14, 3));
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
      // 개요 모드(lead 있음)는 핵심 한 줄이 큰 패널로 서므로 불릿은 3개 이하로 — 위계가 살아야 함
      push(lintLen('lead', p.lead, 34));
      if (p.lead && (p.bullets ?? []).length > 3)
        push([`lead가 있는 개요 슬라이드는 bullets 3개 이하 (현재 ${p.bullets!.length}개)`]);
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
      push(lintLen('patternEn', p.patternEn, 30));
      push(lintLen('patternName', p.patternName, 12));
      push(lintLen('when', p.when, 24));
      push(lintLen('effect', p.effect, 22));
      if ((p.lines ?? []).length > 4) push([`lines ${p.lines!.length}줄 (맛보기 최대 4줄)`]);
      for (const l of p.lines ?? []) push(lintLen('line', l, 24));
      break;
    // ── P 계열 (사진 편집형) — 강조는 카드당 1구절이 벤치마크 룰 ──
    case 'P1':
    case 'P5':
      push(lintLen('lead', p.lead, 30));
      for (const it of p.items ?? []) push(lintLen('item', it, 32));
      if (countEm(p.lead) + (p.items ?? []).reduce((n, it) => n + countEm(it), 0) > 1)
        push(['**강조**는 슬라이드 전체에서 1구절만 (벤치마크: 카드당 정확히 1구절)']);
      break;
    case 'P2':
      push(lintLines('heading', p.heading ?? '', 14, 2));
      push(lintLen('sub', p.sub, 26));
      push(lintLen('body', p.body, 120));
      break;
    case 'P3':
      push(lintLines('title', p.title ?? '', 15, 3));
      for (const it of p.items ?? []) push(lintLen('item', it, 34));
      break;
    case 'P4':
      push(lintLen('quote', p.quote, 48));
      push(lintLen('attribution', p.attribution, 24));
      break;
    case 'P6':
      push(lintLen('big', p.big, 6));
      push(lintLines('resolve', p.resolve ?? '', 20, 2));
      break;
    default:
      break;
  }
  return issues;
}

// ── 프롬프트 ──────────────────────────────────────────────

const TEMPLATE_SPECS = `[템플릿별 props 규격 — 줄바꿈은 문자열 안 "\\n", **강조**는 포인트색 볼드 마커]
- C1 사진몰입 커버 / C2 문장형 다크 커버 / C3 툴 커버: {"kicker":"≤14자 프레이밍 한 줄(C1, 선택 — '~의 경제학'·'~시대의 사건' 식)","title":"2~3줄, 줄당 ≤12자","hl":"title 속 핵심 단어 1개(부분 문자열 그대로, 짧게)","sub":"≤28자 — 궁금증을 증폭하는 한 줄 또는 구체 스펙(N개 중 M개는 ~, 대상 독자). '읽기 N분·적용 N분' 같은 시간 표기 금지(웹 개념 — 인스타에선 무의미)","footer":"@영문개념 ≤20자(C1, 선택 — 예: @BLINDSPOT PASS)"} (C2는 "eyebrow":"≤16자 도입" 추가 가능)
- C5 빅넘버 커버: {"kicker":"≤20자 맥락 1줄","big":"거대 숫자/단어 ≤6자 (예: 10배, 11, FOCUS)","resolve":"1~2줄, 줄당 ≤16자 해소 문장 (**강조** 1개)","footer":"@영문개념(선택)"} — 핵심이 숫자/단어 하나로 요약될 때. 사진 없어도 성립
- B1 타임라인: {"lead":"≤36자 도입(선택, **강조** 1개)","heading":"≤13자 한 줄","hl":"heading 속 핵심 구","rows":[{"term":"≤8자","desc":"≤14자"}] 2~5개}
- B2 불릿/개요: {"banner":"≤14자(✓ 접두 가능)","lead":"≤32자 — 이 장에서 가장 중요한 사실 한 줄 (개요 역할 슬라이드는 필수)","bullets":["≤30자, **강조** 각 1개"] 2~4개}
  · lead를 넣으면 개요 모드로 렌더된다: lead가 큰 패널로 서고 bullets는 번호 목록(01·02·03)으로 뒷받침 — 이때 bullets는 3개 이하.
  · lead에 담을 것: 독자가 이 글에서 딱 하나만 가져간다면 그것(핵심 변화·숫자·판정). bullets는 lead를 뒷받침하는 사실만 — lead 문장을 다시 쓰지 말 것.
  · 재료에 "(역할: 개요…)" 표시가 있으면 반드시 lead를 채울 것. 일반 본문 슬라이드는 lead 없이 bullets만.
- B3 용어: {"badge":"기본 '30초 개념'(생략 가능)","term":"≤10자 핵심 용어","termEn":"영문(선택)","lead":"≤20자 한 줄 정의","body":"≤58자 부연, **강조** 1개"}
- B4 인용/선언: {"title":"2~3줄, 줄당 ≤13자 선언 문장","hl":"핵심 단어","attribution":"— 출처 느낌 한 줄(선택)"}
- B5 잘된것/별로였던것: {"good":["≤55자"] 1~2개,"bad":["≤55자"] 1~2개} — 솔직하게, 실패를 뭉개지 말 것
- B6 스텝: {"heading":"≤13자","hl":"핵심 구","steps":[{"title":"≤12자","desc":"≤18자"}] 2~4개}
- B7 숫자: {"big":"숫자만 ≤4자","unit":"%·배 등(선택)","cap":"1~2줄, 줄당 ≤16자, **강조** 1개","sub":"≤38자(선택)"} — 재료에 실제로 있는 숫자만
- B8 프롬프트 패턴: {"badge":"'패턴 03' 등 ≤8자(선택)","patternEn":"영어 패턴명 원문 그대로(재료에 있으면 필수 — 예: Blindspot Pass) ≤30자","patternName":"≤12자 한글 패턴명(patternEn 아래 부제로 렌더)","when":"≤22자 — 어떤 상황에서 쓰는지 (따옴표 없이)","lines":["≤22자/줄"] 3~4줄 핵심 맛보기 — 전문이 아니라 구조가 보이는 핵심만, 변수는 [대괄호],"effect":"≤20자 기대 효과 (실측·구체적으로)"} — 인스타에선 복사 불가이므로 '복사' 언급 금지. 이 슬라이드의 목표는 "나도 써보고 싶다". CTA(댓글 유도 등)는 캡션이 전담 — 슬라이드에 ctaLine 생성 금지

[템플릿 선택 규칙 — 사진 우선]
- 계획 줄에 **📷사진 있음** 표시가 있으면 그 장은 **P 계열을 우선 선택**한다(대안에 있는 경우).
  정보 나열이면 P1, 설명·맥락이면 P2, 한 문장이 강하면 P3/P4. 사진을 두고 흰 카드를 고르지 말 것.
- 시각적으로 후킹되는 소재(도구·서비스 소개, 제작기, 게임/화면 결과물, 실행 스크린샷)는
  텍스트로 설명하지 말고 **사진형(P1·P2·P3)으로 보여줄 것** — 결과물이 보이는 게 설명보다 강하다.
- 사진 표시가 없으면 B 계열 또는 P5/P6(블랙아웃)을 쓴다. 없는 사진을 지어내지 말 것.

[P 계열 — 사진 편집형 본문. 벤치마크 문법(전 장 사진+스크림): 이미지가 있는 재료에서 우선 선택]
공통: **강조**는 슬라이드 전체 1구절만(골드로 렌더). "image"는 생성하지 말 것 — 시스템이 재료 이미지/검색으로 채운다.
- P1 사진+번호목록: {"eyebrow":"≤14자 라벨(선택)","lead":"≤28자 핵심 한 줄","items":["≤30자"] 2~4개} — 개요·정보 나열의 기본값. B2와 같은 자리에서 사진이 있으면 P1
- P2 사진+문단: {"eyebrow":"≤14자(선택)","heading":"1~2줄, 줄당 ≤12자","sub":"≤24자 부제(선택)","body":"≤110자 문단"} — 설명·맥락 서술. 제목→부제→본문 3단 위계로 읽힌다
- P3 풀사진+하단: {"label":"≤14자(선택)","title":"2~3줄, 줄당 ≤13자","items":["≤32자"] 0~3개(선택)","footer":"@영문개념(선택)"} — 사진이 주인공인 전환·강조 장. 텍스트 적을수록 강하다
- P4 사진인용: {"quote":"≤44자 인용/선언 (따옴표 자동)","attribution":"≤22자 출처(선택)"} — B4의 사진 버전. 강한 한 문장이 있을 때
- P5 블랙+번호목록: {"index":"'02' 같은 진행표시(선택)","eyebrow":"≤14자","lead":"≤28자","items":["≤30자"] 2~4개,"footer":"@영문개념(선택)"} — 사진이 없거나 프롬프트·코드 소재의 폴백. 타이포가 주인공
- P6 블랙+빅넘버: {"kicker":"≤18자 맥락","big":"≤6자 거대 숫자/단어","resolve":"1~2줄, 줄당 ≤18자 해소","footer":"(선택)"} — 본문 중간에 숫자 한 방. 재료에 실재하는 숫자만`;

const SYSTEM = `당신은 케이스랩(caselab)의 SNS 콘텐츠 에디터입니다. 발행된 웹 콘텐츠를 인스타그램 캐러셀 슬라이드 규격으로 압축 재작성합니다.

[caselab 정체성 — 반드시 지킬 것]
- 과장 금지: "무조건", "100%", "혁명" 같은 표현 대신 실측·체감 위주의 담백한 톤
- 형광펜(hl 또는 **강조**)은 슬라이드당 딱 1개
- 솔직함: 잘된 것/별로였던 것(B5)의 실패 부분을 절대 미화하지 말 것
- 재료에 없는 사실·숫자를 지어내지 말 것 (압축·재배열만)

[0단계 — 엣지 정의 (가장 먼저)]
이 콘텐츠가 다른 비슷한 글과 구별되는 지점(edge)을 한 줄로 정의하세요 — 출처의 신뢰성("앤트로픽 엔지니어가 직접"), 실측 결과, 반직관적 관점 등. 이 edge는:
- 출력 JSON의 "edge" 필드에 담고
- 커버(eyebrow·sub)와 신뢰/선언 슬라이드에 반드시 드러나게 반영하세요. 운영자가 [운영자 지정 엣지]를 준 경우 그것을 최우선으로 따르세요.

[독자 의식 흐름 — 서사 규칙]
- 스파인: 후킹 커버 → 왜 믿을 만한가(edge) → 문제 제기/오버뷰 → 실물(프롬프트·구체 항목) → 정리(P5 — 결론 한 줄 + 행동 2~3개). 저장·댓글 유도 문구는 캡션 전담, 슬라이드에 쓰지 말 것
- 슬라이드마다 "새 정보 1개". 직전 슬라이드와 소재·표현 중복 금지 (특히 오버뷰 슬라이드와 개별 항목 슬라이드가 같은 문장을 반복하지 않게)
- 각 슬라이드는 "다음 장을 넘길 이유"를 남길 것
- 개요(오버뷰) 슬라이드는 스토리의 지도다 — 나열이 아니라 위계로 쓴다: 가장 중요한 사실 1개를 lead에,
  나머지는 그것을 뒷받침하는 사실 2~3개로. 커버에서 미룬 답을 여기서 처음 밝히는 자리이기도 하다.
- 슬라이드 하나에 항목을 욱여넣지 말 것 — 한 장의 텍스트가 많을수록 렌더 글씨가 작아져 폰에서 안 읽힌다
- 시각 리듬: 같은 레이아웃이 3장 연속되면 손가락이 멈춘다. 계획의 대안(alternatives) 안에서
  정보형(P1/P2·B계열) 사이에 호흡 장(P3 풀사진·P4 인용·P6 빅넘버)을 끼워 밀도를 번갈아줄 것.
  단, 형식을 위해 내용을 늘리지 말 것 — 재료가 없는 호흡 장은 만들지 않는다.

[커버 헤드라인 공식 — 벤치마크 검증 룰, 우선순위대로 시도]
1. 이상하게 구체적인 숫자를 박는다 ("11가지"보다 "0.3초에", "80%는 앞쪽 106석"이 강함)
2. 반전 부정문 ("~가 아닙니다") — 상식을 뒤집고 정답은 다음 장으로 미룬다
3. 미완결 호기심 ("~한 이유", "~한 계산법") — 이유를 커버에서 절대 말하지 않는다
4. 고유명사 실명 박기 (앤트로픽, Claude Code — "한 빅테크가" 같은 익명화 금지)
- 종결어미는 "~습니다/이었다" 단정 서술형, 물음표는 피한다
- 커버 템플릿 선택: 핵심이 숫자/단어 하나로 요약되면 C5(빅넘버), 강한 인용 한 문장이 있으면 C2(선언), 그 외 C1/C2 — 계획의 대안 안에서 판단

[커버 필수 체크 — 어기면 반려]
1. 핵심 대상 명시: 이 글이 "무엇에 관한" 글인지(제품·모델·주제명 — 예: Fable 5)가 kicker·title·sub 중 최소 한 곳에 반드시 등장. 후킹 각도를 잡느라 주제어를 떨어뜨리지 말 것 — 독자는 커버만 보고 자기 관심사인지 판단한다
2. 필드 간 중복 금지: kicker·title·sub·footer는 각자 다른 정보 1개씩 — 신뢰(출처)는 한 필드에서만, 같은 사실을 두 필드에 반복하지 말 것
3. sub의 역할: title 재서술이 아니라 궁금증 증폭 또는 스펙 제공(N가지·읽는 시간·대상 독자)

[커버 이미지 검색어(metaphorQueries) — 4단 우선순위]
1순위 리터럴: 본문에 등장하는 구체 사물 그대로 (naengmyeon, rolex watch macro)
2순위 은유: 개념을 설명하는 관용적 사물 — 치환표: 병목→steel chain macro / 집중→dartboard bullseye / 니치→ant macro / 불확실성→foggy mountain / 관문·심사→old door knocker / 유입 경로→fishing net silhouette / 성장→seedling soil / 함정→mousetrap / 데이터·AI→matrix code dark, server room dark / 계약→contract fountain pen / 돈·가격→coins macro
3순위 장면: 이야기의 분위기 컷 (old office desk night, contract signing) — 사람은 back view·crowd·distant 강제
4순위 텍스처: 무드 배경 (dark green matrix code, old world map dark)
규칙: 영어 2~4단어 + 구체 명사 필수 + 촬영 스타일 단어 1개(macro/close up/dark/moody/silhouette/minimal). 3개를 1→2→3순위 순서로.

[작업]
아래 슬라이드 계획의 각 항목에 대해, 주어진 재료(material)를 해당 템플릿 규격에 맞게 압축한 props를 작성하세요.
- 계획의 템플릿을 기본으로 쓰되, alternatives에 있는 템플릿이 재료에 더 맞으면 교체 가능 (예: 재료의 핵심이 강한 숫자 1개면 B2 대신 B7)
- (선정) 표시가 붙은 항목: 전부 쓰지 말고 "가장 저장하고 싶을" 대표만 골라 작성하고, 나머지는 {"skip":true}로 반환하세요. 대표 개수는 계획에 명시된 목표를 따르세요. 선정 기준: 범용성(직무 무관 바로 사용)·의외성·실물 가치.
- B3 용어 카드의 term은 개념·용어만 — 인명·회사명 금지 (신뢰 전달은 커버 eyebrow나 B4 attribution의 몫)
- 글자수 제한은 공백 포함 엄격 적용 — 넘치면 렌더가 깨집니다

${TEMPLATE_SPECS}

[CTA 유형 — 캡션·스레드·마무리의 문법을 결정]
- comment_dm: 댓글 참여형. 캡션 마지막은 '댓글에 "키워드"를 남기면 DM으로 전문/자료를 보내드려요' 문구. ctaKeyword 필드로 짧은 한글 키워드(≤6자, 예: "프롬프트")를 제안하세요. 캡션에 프롬프트 전문을 넣지 말 것(DM 유인이 죽음) — 대신 맛보기와 효과로 욕망을 만들 것.
- info_save: 정보 제공형. 캡션에 대표 프롬프트 1개 전문 포함(따옴표 블록) + "나머지는 프로필 링크에서".

[함께 생성]
- igCaption: 인스타 캡션 — **카드뉴스를 다 넘겨본 사람에게 이어서 말을 거는 글**. 요약 리포트가 아니다.
  구조(4단):
  ① 독자의 경험을 먼저 깨운다 — 이 이야기가 건드리는 "당신도 겪은 그 상황"을 질문이나 단정으로 연다.
     (예: 기술이 부족해서 접어둔 아이디어, 폴더에만 남은 기획안 — 읽는 사람이 자기 얘기로 느끼게)
     ❌ "개발자 A가 ~했습니다"로 시작하지 말 것. 사실 보고가 아니라 공감 유발이 먼저다.
  ② 그런데 실제로 해본 사람이 있다 — 누가·무엇으로·어떤 결과였는지 구체적으로(실명·숫자).
  ③ 진짜 포인트 하나 — 카드에서 못 다 한 통찰. "핵심은 X가 아니라 Y였다" 식으로 뒤집어 준다.
  ④ CTA 유형에 맞는 마무리.
  톤: 말하듯이. 문장을 짧게 끊고, 문단 사이를 비운다. 앞 문장이 다음 문장을 부르게 이어 쓸 것
  (한 문장씩 독립된 정보를 나열하지 말 것 — 그게 '요약체'가 되는 원인).
  해시태그는 쓰지 말 것(시스템이 붙임). 이모지는 절제.
- threadsText: 스레드 네이티브 톤으로 재작성한 글 300~450자 — 대화하듯, 핵심 발견 1~2개 + 솔직 후기 한 줄. 링크는 쓰지 말 것(시스템이 붙임).
- metaphorQueries: 커버 배경 이미지 검색어 3개 — 제목·후킹 문장 속 "구체적 사물/장면"을 영어로 (주제어 말고 명사. 예: "airplane cabin aisle interior", "colored pencils macro"). 구체 명사가 없으면 개념을 사물로 치환(집중→과녁, 선택→갈림길). 어둡고 대비 강한 톤 선호("dark", "moody", "silhouette" 등 톤 단어 1개 포함), 알아볼 수 있는 얼굴은 피할 것(뒷모습·손·오브젝트 위주).

[출력 — JSON 하나만, 설명 없이]
{"edge":"이 콘텐츠의 엣지 한 줄","ctaKeyword":"댓글 키워드(comment_dm일 때)","slides":[{"template":"C1","sourceSection":"계획의 sourceSection 그대로","props":{...}} 또는 {"skip":true,"sourceSection":"..."}, ...],"igCaption":"...","threadsText":"...","metaphorQueries":["...","...","..."]}
슬라이드 배열의 순서·개수는 계획과 1:1 동일해야 합니다(선정 제외는 skip 객체로 자리를 지킬 것).`;

function planPrompt(
  source: CardSource,
  plan: SlidePlan,
  operatorEdge?: string,
  ctaType: CardCtaType = 'comment_dm'
): string {
  // 재료는 항목당 500자로 절단 — 프롬프트가 커질수록 구독 CLI 타임아웃 위험이 커진다
  const clip = (t: string) => (t.length > 500 ? `${t.slice(0, 500)}…` : t);
  const slideLines = plan.slides
    .map(
      (s, i) =>
        `${i + 1}. template=${s.template}${s.alternatives?.length ? ` (대안: ${s.alternatives.join(',')})` : ''} · sourceSection=${s.sourceSection}${s.image ? ' · 📷사진 있음' : ''}${s.optional ? ' · (선정)' : ''}${s.required ? ` · ${s.required}` : ''}\n재료:\n${clip(s.material)}`
    )
    .join('\n\n');
  const optCount = plan.slides.filter((s) => s.optional).length;
  const selectLine =
    optCount > 0 && plan.selectTarget
      ? `\n(선정) 후보 ${optCount}개 중 대표 ${plan.selectTarget}개만 작성하고 나머지는 skip.`
      : '';
  const header =
    source.kind === 'content'
      ? `트랙: ${source.row.track === 'case' ? '실전 케이스' : 'AI 트렌드'}
제목: ${source.row.title}
요약: ${source.row.summary ?? '(없음)'}`
      : source.kind === 'tool'
        ? `소재: 본가 자료실 ${toolKindLabel(source.tool.category)} (이미 발행돼 유저에게 보이는 자료)
제목: ${source.tool.name}
설명: ${source.tool.description ?? '(없음)'}
원본 링크: ${source.tool.url ?? '(없음)'}`
        : `소재: 씨앗 아카이브 원석 (미발행 수집 글 — 재료가 거칠 수 있음. 재료에 실제로 있는 사실만 사용)
제목: ${seedTitle(source.seed)}
추천 각도: ${source.seed.suggested_angle ?? '(없음)'}`;
  return `[콘텐츠]
${header}
CTA 유형: ${ctaType}${operatorEdge ? `\n\n[운영자 지정 엣지 — 최우선] ${operatorEdge}` : ''}

[슬라이드 계획 — ${plan.slides.length}장]${selectLine}
${slideLines}`;
}

// ── 커버 후보 자동 수급 — 메타포 검색어 → Unsplash (IMAGE-SOURCES.md: portrait·다크 톤 우선) ──
// 검수 피로를 줄이기 위해 "가장 연관도 높은 2장"만: 검색어별 최상위 결과에서 서로 다른 검색어 우선으로 2장.
async function fetchCoverCandidates(queries: string[]): Promise<CoverCandidate[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key || queries.length === 0) return [];
  const results = await Promise.all(
    queries.slice(0, 3).map(async (q) => {
      try {
        const res = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=2&orientation=portrait&content_filter=high`,
          { headers: { Authorization: `Client-ID ${key}` } }
        );
        if (!res.ok) return [];
        const data = (await res.json()) as {
          results: Array<{
            urls: { raw: string; small: string };
            user: { name: string; links: { html: string } };
          }>;
        };
        return data.results.map((r) => ({
          thumb: r.urls.small,
          full: `${r.urls.raw}&w=1080&h=1350&fit=crop&fm=jpg&q=80`,
          credit: r.user.name,
          creditLink: r.user.links.html,
        }));
      } catch {
        return [];
      }
    })
  );
  // 1순위 검색어의 1등 → 2순위 검색어의 1등 → (부족하면) 남은 결과에서 채움
  const flat: CoverCandidate[] = [];
  for (let i = 0; i < 2; i++) for (const r of results) if (r[i]) flat.push(r[i]);
  return flat.slice(0, 2);
}

// ── 생성 본체 ──────────────────────────────────────────────

type RawSlide = z.infer<typeof GenOutputSchema>['slides'][number];
type ParsedSlide = CardSlide & { planIndex: number };

const COVER_TEMPLATES: CardTemplateId[] = ['C1', 'C2', 'C3', 'C5'];

function validateSlides(
  raw: RawSlide[],
  plan: SlidePlan,
  sourceTitle: string
): { issues: string[]; parsed: ParsedSlide[] } {
  const issues: string[] = [];
  const parsed: ParsedSlide[] = [];

  if (raw.length !== plan.slides.length)
    issues.push(`슬라이드 개수 ${raw.length}개 — 계획(${plan.slides.length}개)과 다름`);

  raw.forEach((s, i) => {
    const planned: SlidePlanItem | undefined = plan.slides[i];
    if ('skip' in s) {
      if (planned && !planned.optional)
        issues.push(`${i + 1}번(${planned.template}): (선정) 대상이 아닌 슬라이드는 skip 불가`);
      return;
    }
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
    if (COVER_TEMPLATES.includes(check.data.template))
      issues.push(
        ...lintCover(s.props as Record<string, string>, sourceTitle).map((m) => `${i + 1}번 [커버] ${m}`)
      );
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

/** page 자동 기입 + 계획 이미지 배치.
 *  CTA(댓글 키워드 안내 포함)는 캡션·스레드 전담 — O1 삭제(2026-08-13)로 슬라이드 내 CTA 예외도 사라짐. */
function finalizeSlides(
  slides: ParsedSlide[],
  plan: SlidePlan,
  ctaType: CardCtaType,
  ctaKeyword: string
): CardSlide[] {
  const total = slides.length;
  const PAGED: CardTemplateId[] = ['B1', 'B2', 'B3', 'B5', 'B6', 'B7', 'B8', 'B9'];
  return slides.map(({ planIndex, ...s }, i) => {
    const props = { ...s.props };
    if (PAGED.includes(s.template)) props.page = `${i + 1} / ${total}`;
    if (s.template === 'B8') {
      delete props.ctaLine; // CTA는 캡션 전담
      delete props.tip; // 구 '복사' 문법 제거
    }
    // 커버 이미지 배치: C5는 텍스처로 깔리므로 허용
    if (s.template === 'C5' && planIndex === 0 && plan.slides[0]?.image && !props.coverImage)
      props.coverImage = plan.slides[0].image;
    const planned = plan.slides[planIndex];
    if (planned?.image) {
      // C2·C3는 사진 없는 다크 커버 — coverImage는 사진형(C1·B4)에만
      if ((s.template === 'C1' || s.template === 'B4') && !props.coverImage)
        props.coverImage = planned.image;
      if (s.template === 'B2' && !props.media) props.media = planned.image;
      if (s.template === 'B9' && !props.shot) props.shot = planned.image;
      // P 계열은 사진이 정체성 — 계획에 이미지가 있으면 항상 image로 (AI는 image를 생성하지 않는다)
      if (s.template.startsWith('P') && !props.image) props.image = planned.image;
    }
    return { ...s, order: i + 1, props };
  });
}

/** 단일 슬라이드 재작성 — 검수 UI의 템플릿 교체(B2↔B7 등)·"AI로 다시 쓰기"용.
 *  재료는 저장하지 않으므로 소스 콘텐츠에서 매핑 계획을 다시 만들어 찾는다. */
export async function rewriteSlide(
  source: CardSource,
  sourceSection: string,
  targetTemplate: CardTemplateId,
  instruction?: string
): Promise<{ template: CardTemplateId; props: Record<string, unknown> }> {
  const plan = sourcePlan(source);
  const item = plan.slides.find((s) => s.sourceSection === sourceSection);
  if (!item) throw new Error(`sourceSection "${sourceSection}"에 해당하는 재료가 없어요`);

  const base = `[콘텐츠] ${sourceLabel(source)}

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
        timeoutMs: 900_000,
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

/** 슬라이드 AI 수정 초안 N개 — 운영자 수정 방향(instruction)을 받아 서로 다른 접근의 후보를 제안.
 *  (검수 UI: 방향 입력 → 초안 3개 썸네일 비교 → 적용) */
export async function rewriteSlideVariants(
  source: CardSource,
  sourceSection: string,
  template: CardTemplateId,
  opts: { instruction?: string; currentProps?: Record<string, unknown>; count?: number }
): Promise<Array<Record<string, unknown>>> {
  const plan = sourcePlan(source);
  const item = plan.slides.find((s) => s.sourceSection === sourceSection);
  const count = Math.min(3, Math.max(2, opts.count ?? 3));

  const prompt = `[콘텐츠] ${sourceLabel(source)}

[슬라이드 수정 — template=${template} · sourceSection=${sourceSection}]
원본 재료:
${item?.material?.slice(0, 500) ?? '(없음 — 현재 버전을 기준으로)'}

현재 버전:
${JSON.stringify(opts.currentProps ?? {})}
${opts.instruction ? `\n[운영자 수정 방향 — 최우선] ${opts.instruction}` : ''}

[작업] 위 수정 방향을 반영해 서로 다른 접근의 후보 ${count}개를 만드세요.
- 각 후보는 워딩·강조점이 실제로 달라야 함 (미세 변형 금지)
- page·ctaLine은 건드리지 말 것 (시스템 관리)

[출력 — JSON 하나만] {"candidates":[{"props":{...}}${count > 1 ? ',…' : ''}]}`;

  let lastIssues: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await callModel(SYSTEM, attempt === 0 ? prompt : `${prompt}\n\n[이전 시도 문제] ${lastIssues.join(' / ')} — 규격을 지켜 다시`, {
        allowedTools: [],
        model: 'sonnet',
        timeoutMs: 300_000,
      });
    } catch (e) {
      lastIssues = [`모델 호출 실패: ${(e as Error).message}`];
      continue;
    }
    let json: { candidates?: Array<{ props?: Record<string, unknown> }> };
    try {
      json = JSON.parse(extractJson(raw));
    } catch {
      lastIssues = ['응답이 JSON이 아님'];
      continue;
    }
    const valid: Array<Record<string, unknown>> = [];
    const allIssues: string[] = [];
    for (const c of json.candidates ?? []) {
      const check = RenderSlideSchema.safeParse({ template, accent: plan.accent, props: c.props });
      if (!check.success) continue;
      // 시스템 관리·이미지 필드는 현재 값 유지 (후보가 빠뜨려도 잃지 않게)
      const merged = { ...c.props } as Record<string, unknown>;
      for (const k of ['page', 'ctaLine', 'coverImage', 'media', 'shot'])
        if (opts.currentProps?.[k] && !merged[k]) merged[k] = opts.currentProps[k];
      if (COVER_TEMPLATES.includes(template)) {
        const coverIssues = lintCover(merged as Record<string, string>, sourceTitle(source));
        if (coverIssues.length) {
          allIssues.push(...coverIssues);
          continue;
        }
      }
      valid.push(merged);
    }
    if (valid.length > 0) return valid.slice(0, count);
    lastIssues = allIssues.length ? allIssues : ['유효한 후보가 없음 — 템플릿 props 스키마를 지킬 것'];
  }
  throw new Error(`AI 초안 생성 실패: ${lastIssues.join(' / ')}`);
}

export async function generateCardSet(
  source: CardSource,
  opts?: { edge?: string; ctaType?: CardCtaType; ctaKeyword?: string }
): Promise<CardSetDraft> {
  const ctaType: CardCtaType = opts?.ctaType ?? 'comment_dm';
  const plan = sourcePlan(source);
  const userPrompt = planPrompt(source, plan, opts?.edge, ctaType);

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
        timeoutMs: 900_000,
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
    const result = validateSlides(parsed.data.slides, plan, sourceTitle(source));
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
  // 씨앗 소스는 본가 페이지가 없음 — 스레드에 URL을 붙이지 않는다
  const url = sourceUrl(source);
  const threads =
    !url || lastRaw.threadsText.includes(url)
      ? lastRaw.threadsText.trim()
      : `${lastRaw.threadsText.trim()}\n\n👉 전체 과정: ${url}`;
  const ctaKeyword = opts?.ctaKeyword?.trim() || lastRaw.ctaKeyword?.trim() || '프롬프트';
  const metaphorQueries = lastRaw.metaphorQueries ?? [];

  return {
    accent: plan.accent,
    slides: finalizeSlides(slides, plan, ctaType, ctaKeyword),
    extractedImages: plan.images,
    igCaption: `${lastRaw.igCaption.trim()}\n\n${tags.join(' ')}`,
    threadsText: threads,
    metaphorQueries,
    edge: opts?.edge?.trim() || lastRaw.edge.trim(),
    ctaType,
    ctaKeyword,
    coverCandidates: await fetchCoverCandidates(metaphorQueries),
  };
}
