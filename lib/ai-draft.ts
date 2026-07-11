import Anthropic from '@anthropic-ai/sdk';
import { ContentBodySchema, type ContentBody } from '@/types/content';
import { runClaudeSubscription, extractJson } from '@/lib/claude-cli';
import { BUCKETS, bucketProfile, isSeedBucket, type SeedBucket } from '@/lib/seed-curation';
import { lintToolBody } from '@/lib/tool-body';
import { sourceProfile } from '@/lib/seed-sources';
import type { SeedTrack } from '@/lib/seed-tracks';
import { trackEdge } from '@/lib/track-edges';

// 본문(블록 배열) 작성 규칙 — D70 스키마의 BlockSchema는 "type" 판별자가 필수다.
// 초안 단계에선 가장 안전한 두 블록만 쓰게 강제(운영자가 폼에서 다른 블록 추가).
const BLOCK_RULE = `[중요] "블록 배열" 필드는 각 원소가 아래 두 종류 중 하나여야 합니다(반드시 "type" 포함):
- {"type":"text","markdown":"문단 텍스트(마크다운 허용, 여러 문장 가능)"}
- {"type":"heading","level":2,"text":"소제목"}   // level은 2 또는 3만`;

// 모든 생성 트랙 공통 리서치 규칙 — 지어내기 방지, 실제 확인된 것만.
const RESEARCH_RULE = `[리서치 규칙] 이름·수치·날짜·URL은 WebSearch/WebFetch로 실제 확인한 것만 쓰세요. 확인 못 한 통계·인용·출처는 지어내지 말고 생략하세요. 출처/URL 필드에는 실제로 열어본 URL만 넣고, 확실하지 않으면 빈 문자열/생략하세요.`;

// 씨앗의 출처(provenance)·AI 분류(bucket)를 생성 프롬프트에 컨텍스트로 주입(리서치 방향 grounding).
function contextBlock(input: { sourceType?: string; bucket?: string }): string {
  const lines: string[] = [];
  const src = sourceProfile(input.sourceType);
  if (src) lines.push(`[출처] ${src.label} — ${src.criteria}`);
  const b = isSeedBucket(input.bucket) ? bucketProfile(input.bucket) : undefined;
  if (b) lines.push(`[AI 분류 참고] ${b.label} — ${b.criteria} (참고용, 콘텐츠 방향은 아래 '기획방향'을 최우선으로)`);
  return lines.length ? '\n' + lines.join('\n') : '';
}

// 사람이 작성한 '기획방향' — 모든 트랙에서 생성의 최우선 축. 소스를 이 방향에 맞게 재구성/variation한다.
function directionBlock(direction?: string): string {
  const d = direction?.trim();
  if (!d) return '';
  return `\n[기획방향 — 최우선] ${d}\n→ 위 기획방향을 반드시 중심축으로 삼으세요. 원문(소스)은 이 방향을 뒷받침하는 재료로 재구성·선별하고, 방향과 무관한 내용은 덜어내세요.`;
}

// 사람이 확정한 '개요(목차)' — 단계적 구체화의 뼈대. 본문은 이 구조를 따라 살을 붙인다.
function outlineBlock(outline?: string[]): string {
  const items = (outline ?? []).map((s) => s.trim()).filter(Boolean);
  if (!items.length) return '';
  return `\n[확정 개요 — 이 구조를 따르세요] 아래 항목 순서·범위를 유지하며 각 항목을 본문으로 구체화하세요(항목을 임의로 추가·삭제하지 말 것).\n${items.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
}

const CASE_SYSTEM = `당신은 케이스랩(Caselab)의 운영자 어시스턴트입니다.

"실전 케이스" 콘텐츠 초안을 D70 스키마에 맞춰 작성합니다. 웹 리서치로 사실을 확인하세요.

${BLOCK_RULE}

응답은 아래 JSON 객체 하나만 반환하세요(설명 없이, "kind" 필수):
{
  "kind": "case",
  "forWho": ["기획자", "1인 사업가"],                              // 이 사례가 유용한 직무 2~4개
  "caseIntro": [{"type":"text","markdown":"이 사례 소개 2~3문단"}], // 블록 배열
  "painPoints": [{"num":"01","title":"문제 제목","symptom":"겉으로 드러난 증상","rootCause":"근본 원인"}],
  "frameworkReference": {"name":"활용한 프레임워크/접근","description":"한두 문장 설명"},
  "stepCards": [
    {"num":1,"label":"단계 이름","description":"이 단계 설명","human":"사람이 하는 일","ai":"AI가 하는 일","prompt":"실제로 넣은 프롬프트","goodResult":"좋은 결과 예시","badResult":"안 좋은 결과 예시"}
  ],
  "pros": ["이 방식의 장점"],
  "cons": ["한계/주의점"],
  "takingPoints": [{"title":"핵심 테이크어웨이","description":"왜 중요한지","action":"바로 할 수 있는 행동"}]
}

stepCards는 2~5개, num은 1부터 정수. 한국어, 1인칭 운영자 톤. 광고/유료강의 링크 금지.`;

const TREND_SYSTEM = `당신은 케이스랩(Caselab)의 운영자 어시스턴트입니다.

"AI 트렌드" 콘텐츠 초안을 D70 스키마에 맞춰 작성합니다. 웹 리서치로 최신 사실을 확인하세요.

${BLOCK_RULE}

응답은 아래 JSON 객체 하나만 반환하세요(설명 없이, "kind" 필수):
{
  "kind": "trend",
  "what": [{"type":"text","markdown":"이 트렌드가 무엇인지 2~3문단"}],     // 블록 배열
  "why": [{"type":"text","markdown":"왜 지금 중요한지"}],                  // 블록 배열
  "forWho": [{"role":"기획자","why":"이 직무에 왜 중요한지"}],            // 2~4개
  "keyPoints": ["핵심 요점 3~5개(짧은 문장)"],
  "deepDive": [{"type":"heading","level":2,"text":"소제목"},{"type":"text","markdown":"더 깊은 설명"}],
  "soWhat": [{"type":"text","markdown":"그래서 실무에서 무엇을 해야 하나"}],
  "sources": [{"label":"출처 이름","url":"https://..."}]
}

한국어, 1인칭 운영자 톤. 광고/제휴 링크 금지. 출처는 리서치로 확인된 실제 URL만.`;

const TOOL_SYSTEM = `당신은 케이스랩(Caselab) 자료실의 운영자 어시스턴트입니다.

"AI 도구" 카드 초안을 작성합니다. 웹에서 해당 도구의 공식 정보를 리서치해 정확하게 채우세요.
- name: 도구의 정확한 정식 명칭
- description: 한 문단(2~3문장) 한국어 소개. 무엇을 하는 도구이고 누구에게 유용한지.
- category: "tool" 고정 (도구 카드)
- pricing_tier: "free" | "freemium" | "paid" | "custom" 중 실제에 맞게
- url: 공식 사이트 URL (확실할 때만)
- body: 서비스 상세 페이지가 렌더하는 스키마. 아래 정의된 키 외에는 절대 넣지 마세요.
  - audience: 대상 한 구절 (예: "마케터·기획자")
  - about: { "heading": 섹션 제목, "paragraphs": ["소개 문단"] } — 문단 2~3개
  - whenToUse: [{ "title": "...", "desc": "..." }] — 언제 쓰면 좋은지 2~4개
  - features: [{ "title": "...", "desc": "..." }] — 주요 기능 3~5개
  - pricing: [{ "name": "플랜명", "amount": "가격", "includes": "포함 내용" }] — 리서치로 확인한 것만, 불확실하면 필드 생략
  - pricingNote: 가격 하단 주석 (선택)
  - useCases는 내부 케이스 링크 전용이므로 생성 금지.

광고/제휴 링크 금지. 한국어, 1인칭 톤.

응답은 다음 JSON 객체만 반환:
{
  "name": "...",
  "description": "...",
  "category": "tool",
  "pricing_tier": "free",
  "url": "https://...",
  "body": {
    "audience": "...",
    "about": { "heading": "어떤 도구인가", "paragraphs": ["...", "..."] },
    "whenToUse": [{ "title": "...", "desc": "..." }],
    "features": [{ "title": "...", "desc": "..." }],
    "pricing": [{ "name": "Free", "amount": "$0", "includes": "..." }],
    "pricingNote": "..."
  }
}`;

const PROMPT_SYSTEM = `당신은 케이스랩(Caselab) 자료실의 운영자 어시스턴트입니다.

"프롬프트" 카드 초안을 작성합니다. 바로 복사해 쓸 수 있는 실전 프롬프트 1개를 만드세요.
- name: 이 프롬프트를 한눈에 알 수 있는 짧은 제목
- description: 한 문단(2~3문장) 한국어 소개. 무엇을 해주는 프롬프트이고 누구에게 유용한지.
- pricing_tier: "free" 고정
- url: 참고 출처가 명확할 때만(없으면 생략)
- body: { "prompt": "실제 프롬프트 전문(여러 줄 가능, {{변수}} 표기 허용)", "howToUse": "어떻게 쓰는지 한두 문장", "example": "기대 결과/활용 예시" }

광고/제휴 링크 금지. 한국어, 1인칭 톤.

응답은 다음 JSON 객체만 반환:
{
  "name": "...",
  "description": "...",
  "category": "prompt",
  "pricing_tier": "free",
  "url": "...",
  "body": { "prompt": "...", "howToUse": "...", "example": "..." }
}`;

const GUIDE_SYSTEM = `당신은 케이스랩(Caselab) 자료실의 운영자 어시스턴트입니다.

"가이드"는 외부 좋은 글/문서로 가는 링크 보관 카드입니다(본문 없음). 브리핑 원문에서 링크와 핵심을 추려 정리하세요. 웹 리서치로 제목·URL을 확인하세요.
- name: 가이드(외부 글)의 제목
- description: 1~2문장. 이 글이 무엇을 다루고 왜 볼 만한지.
- url: 가이드 원문 URL(공식/원출처. 확실할 때만, 불확실하면 빈 문자열)
- jobTag: 분류 태그 1개. 가능하면 제공처 기준(예: "OpenAI" | "Anthropic" | "Google") 또는 주제 한 단어.

광고/제휴 링크 금지. 한국어.

응답은 다음 JSON 객체만 반환:
{
  "name": "...",
  "description": "...",
  "url": "https://...",
  "jobTag": "..."
}`;

const APIKEY_MODEL = 'claude-opus-4-8';

function provider(): 'subscription' | 'apikey' {
  return process.env.AI_PROVIDER === 'apikey' ? 'apikey' : 'subscription';
}

interface CallOpts {
  /** 허용 도구. 기본 web 리서치. 채점처럼 불필요하면 [] 전달 → 웹콜 없이 빠르게. */
  allowedTools?: string[];
  /** 모델. 기본 opus. 채점 등 가벼운 분류는 sonnet로 속도↑. */
  model?: string;
  timeoutMs?: number;
}

/** 시스템+유저 프롬프트로 모델을 호출해 응답 텍스트를 반환. 프로바이더에 따라 구독 CLI / API키 분기. */
async function callModel(system: string, userPrompt: string, opts: CallOpts = {}): Promise<string> {
  if (provider() === 'subscription') {
    return runClaudeSubscription({ system, prompt: userPrompt, ...opts });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 미설정 (AI_PROVIDER=apikey)');
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: APIKEY_MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('AI 응답이 비었어요');
  return textBlock.text;
}

export interface DraftInput {
  track: 'case' | 'trend';
  title: string;
  summary?: string;
  /** 사람이 작성한 기획방향(필수). 모든 트랙에서 이 방향을 중심축으로 소스를 재구성. */
  direction?: string;
  /** 사람이 확정한 개요(목차). 있으면 본문이 이 구조를 따른다(단계적 구체화). */
  outline?: string[];
  /** 씨앗 출처 provenance(source_type). 리서치 방향 grounding. */
  sourceType?: string;
  /** AI 분류(bucket). 참고용. */
  bucket?: string;
}

/** 케이스/트렌드 초안 생성. ContentBodySchema 검증 + 실패 시 1회 repair 패스. */
export async function generateDraft(input: DraftInput): Promise<ContentBody> {
  const systemPrompt = `${input.track === 'case' ? CASE_SYSTEM : TREND_SYSTEM}\n\n${RESEARCH_RULE}`;
  const userPrompt =
    `제목: ${input.title}\n요약: ${input.summary ?? ''}` +
    contextBlock(input) +
    directionBlock(input.direction) +
    outlineBlock(input.outline) +
    `\n\n위 주제로 초안 JSON만 반환하세요.`;

  let raw = await callModel(systemPrompt, userPrompt);
  let result = ContentBodySchema.safeParse(JSON.parse(extractJson(raw)));

  if (!result.success) {
    // repair: 스키마에 정확히 맞는 JSON만 다시 받기
    const repairPrompt = `${userPrompt}\n\n[중요] 직전 출력이 스키마 검증에 실패했습니다. 설명 없이 스키마에 정확히 일치하는 JSON 객체 하나만 반환하세요.`;
    raw = await callModel(systemPrompt, repairPrompt);
    result = ContentBodySchema.safeParse(JSON.parse(extractJson(raw)));
  }

  if (!result.success) {
    throw new Error('AI 응답 검증 실패: ' + result.error.message);
  }
  return result.data;
}

export interface ToolDraft {
  name?: string;
  description: string;
  category: 'tool' | 'prompt' | 'guide' | 'context-card';
  pricing_tier: 'free' | 'freemium' | 'paid' | 'custom';
  url?: string;
  body: Record<string, unknown>;
}

const PRICING_TIERS = ['free', 'freemium', 'paid', 'custom'];

/** 자료실(tool/prompt/guide) 생성 입력 — 기획방향(필수)·개요·출처·분류 컨텍스트 공통. */
export interface LibraryDraftInput {
  title: string;
  summary?: string;
  direction?: string;
  outline?: string[];
  sourceType?: string;
  bucket?: string;
}

/** AI 도구 초안 생성. body는 본가 ToolBody 계약(lib/tool-body.ts) 검증 + 실패 시 1회 repair. */
export async function generateToolDraft(input: LibraryDraftInput): Promise<ToolDraft> {
  const systemPrompt = `${TOOL_SYSTEM}\n\n${RESEARCH_RULE}`;
  const userPrompt =
    `도구명/주제: ${input.title}\n참고(브리핑 원문): ${input.summary ?? ''}` +
    contextBlock(input) +
    directionBlock(input.direction) +
    outlineBlock(input.outline) +
    `\n\n위 도구를 리서치해 카드 초안 JSON만 반환하세요.`;
  const raw = await callModel(systemPrompt, userPrompt);

  try {
    let parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
    let body = (parsed.body && typeof parsed.body === 'object' ? parsed.body : {}) as Record<string, unknown>;

    const bodyIssue = lintToolBody(body);
    if (bodyIssue) {
      // repair: 본가 상세가 렌더 못 하는 body → 계약에 맞는 JSON만 다시 받기 (generateDraft와 동일 패턴)
      const repairPrompt = `${userPrompt}\n\n[중요] 직전 출력의 body가 상세페이지 스키마 검증에 실패했습니다(${bodyIssue}). 시스템 프롬프트의 body 스키마에 정확히 일치하는 JSON 객체 하나만 다시 반환하세요.`;
      const repaired = JSON.parse(extractJson(await callModel(systemPrompt, repairPrompt))) as Record<string, unknown>;
      const repairedBody = (repaired.body && typeof repaired.body === 'object' ? repaired.body : {}) as Record<string, unknown>;
      if (!lintToolBody(repairedBody)) {
        parsed = repaired;
        body = repairedBody;
      }
      // repair도 실패하면 원본 body 유지 — ToolForm 발행 게이트가 스키마 위반으로 차단하고 운영자가 보정
    }

    const pricing = typeof parsed.pricing_tier === 'string' && PRICING_TIERS.includes(parsed.pricing_tier)
      ? (parsed.pricing_tier as ToolDraft['pricing_tier'])
      : 'free';
    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : input.title,
      category: 'tool',
      pricing_tier: pricing,
      url: typeof parsed.url === 'string' ? parsed.url : undefined,
      body,
    };
  } catch {
    // 파싱 실패 → 원문을 description/body에 담아 폴백 (게이트가 발행을 막고, 운영자가 ToolForm에서 보정)
    return {
      description: raw.slice(0, 2000),
      category: 'tool',
      pricing_tier: 'free',
      body: { raw },
    };
  }
}

/** 프롬프트 카드 초안 생성. tools(category='prompt')로 적재. 파싱 실패 시 폴백. */
export async function generatePromptDraft(input: LibraryDraftInput): Promise<ToolDraft> {
  const userPrompt =
    `주제/제목: ${input.title}\n참고(브리핑 원문): ${input.summary ?? ''}` +
    contextBlock(input) +
    directionBlock(input.direction) +
    outlineBlock(input.outline) +
    `\n\n위 주제로 바로 쓸 수 있는 프롬프트 카드 초안 JSON만 반환하세요.`;
  const raw = await callModel(PROMPT_SYSTEM, userPrompt);

  try {
    const parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : input.title,
      description: typeof parsed.description === 'string' ? parsed.description : input.title,
      category: 'prompt',
      pricing_tier: 'free',
      url: typeof parsed.url === 'string' && parsed.url ? parsed.url : undefined,
      body: (parsed.body && typeof parsed.body === 'object' ? parsed.body : { prompt: raw.slice(0, 2000) }) as Record<string, unknown>,
    };
  } catch {
    return {
      name: input.title,
      description: input.title,
      category: 'prompt',
      pricing_tier: 'free',
      body: { prompt: raw.slice(0, 2000) },
    };
  }
}

export interface GuideDraft {
  name: string;
  description: string;
  url: string;
  jobTag?: string;
}

/** 가이드(외부 링크) 카드 초안 생성. tools(category='guide')로 적재. 본문 없음(메타만). */
export async function generateGuideDraft(input: LibraryDraftInput): Promise<GuideDraft> {
  const userPrompt =
    `주제/제목: ${input.title}\n참고(브리핑 원문): ${input.summary ?? ''}` +
    contextBlock(input) +
    directionBlock(input.direction) +
    outlineBlock(input.outline) +
    `\n\n위 주제의 외부 가이드 링크 카드 초안 JSON만 반환하세요.`;
  const raw = await callModel(`${GUIDE_SYSTEM}\n\n${RESEARCH_RULE}`, userPrompt);

  try {
    const parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : input.title,
      description: typeof parsed.description === 'string' ? parsed.description : '',
      url: typeof parsed.url === 'string' ? parsed.url : '',
      jobTag: typeof parsed.jobTag === 'string' && parsed.jobTag ? parsed.jobTag : undefined,
    };
  } catch {
    // 파싱 실패 → 운영자가 GuideManager/ToolForm에서 URL·설명 보정
    return { name: input.title, description: raw.slice(0, 500), url: '' };
  }
}

// ─────────────── 개요 생성(단계적 구체화 1단계) ───────────────

export interface OutlineInput {
  track: SeedTrack;
  title: string;
  summary?: string;
  direction?: string;
  sourceType?: string;
  bucket?: string;
}

const TRACK_LABEL: Record<SeedTrack, string> = {
  case: '실전 케이스',
  trend: 'AI 트렌드',
  tool: 'AI 도구 카드',
  prompt: '프롬프트 카드',
  guide: '외부 가이드 링크',
};

// 본문을 쓰기 전, 기획방향+소스로 "개요(목차)"만 먼저 제안. 사람이 확인·수정 후 본문 생성으로 넘어감.
const OUTLINE_SYSTEM = `당신은 케이스랩(Caselab)의 운영자 어시스턴트입니다.
콘텐츠 본문을 쓰기 전에, 소스와 사람이 준 '기획방향'을 바탕으로 **개요(목차)**만 먼저 제안합니다.
- 기획방향을 최우선 축으로, 소스에서 그 방향을 뒷받침하는 뼈대만 추립니다.
- 각 항목은 한 줄(소제목 또는 핵심 포인트). 5~9개.
- 아직 본문 문장은 쓰지 마세요. 구조(뼈대)만.

${RESEARCH_RULE}

응답은 아래 JSON 객체 하나만 반환하세요(설명 없이):
{ "title": "다듬은 제목", "outline": ["항목1", "항목2", "…"] }`;

/** 개요(목차) 생성. 사람이 편집 후 generateDraft/Library에 outline으로 넘김. 로컬 전제. */
export async function generateOutline(input: OutlineInput): Promise<{ title: string; outline: string[] }> {
  const userPrompt =
    `콘텐츠 종류: ${TRACK_LABEL[input.track]}\n제목: ${input.title}\n요약: ${input.summary ?? ''}` +
    contextBlock(input) +
    directionBlock(input.direction) +
    `\n\n위를 바탕으로 개요 JSON만 반환하세요.`;
  const raw = await callModel(OUTLINE_SYSTEM, userPrompt);

  try {
    const parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
    const outline = Array.isArray(parsed.outline)
      ? parsed.outline.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : input.title;
    return { title, outline };
  } catch {
    return { title: input.title, outline: [] };
  }
}

// ─────────────── 엣지 제안(MD 직행 레인) ───────────────

export interface EdgeProposal {
  /** 이 트랙으로 풀 때의 각도 한 줄 */
  angle: string;
  /** 트랙 상세 페이지 섹션별 — 문서의 어떤 내용을 어떻게 배치할지 */
  plan: { section: string; note: string }[];
  /** 트랙 형식이 요구하지만 문서에 없는 것(지어내지 말고 보강·생략 판단용) */
  missing: string[];
}

/**
 * 완성 MD 문서를 특정 트랙의 상세 형식(lib/track-edges.ts 프로파일)에 대고 분석해
 * 각도·섹션별 배치·부족한 부분을 제안. 사람이 확인·수정 후 생성에 주입한다.
 * 분류·배치 작업이므로 웹서치 불필요 + 가벼운 모델(채점과 동일 설정).
 */
export async function proposeEdge(input: { track: SeedTrack; title: string; markdown: string }): Promise<EdgeProposal> {
  const edge = trackEdge(input.track);
  const system = `당신은 케이스랩(Caselab)의 콘텐츠 에디터입니다.
기획·리서치가 끝난 MD 문서를 "${TRACK_LABEL[input.track]}" 형식으로 재구성하기 전에, 배치 계획만 제안합니다.

[이 형식의 엣지] ${edge.edge}
[상세 페이지 섹션 — 이 이름 그대로 계획을 세우세요]
${edge.sections.map((s) => `- ${s.name}: ${s.need}`).join('\n')}
[이 형식에 맞는 소재] ${edge.fits}
[덜어낼 것] ${edge.cuts}
[형식 규칙] ${edge.guide}

- angle: 이 문서를 이 형식으로 풀 때의 각도 한 줄(문서의 논지를 형식의 엣지에 맞게).
- plan: 위 섹션 각각에 대해, 문서의 어떤 내용을 어떻게 배치·압축할지 한 줄씩. 문서에 근거가 없는 섹션은 note에 "문서에 없음 — " 으로 시작해 대안(생략/보강)을 적으세요.
- missing: 이 형식이 요구하지만 문서에 없는 것들(지어내면 안 되는 것). 없으면 빈 배열.

응답은 아래 JSON 객체 하나만 반환하세요(설명 없이):
{ "angle": "…", "plan": [{ "section": "섹션 이름", "note": "배치 계획 한 줄" }], "missing": ["…"] }`;

  const userPrompt = `제목: ${input.title}\n\n[문서]\n${input.markdown.slice(0, 16000)}\n\n위 문서의 배치 계획 JSON만 반환하세요.`;
  const raw = await callModel(system, userPrompt, { allowedTools: [], model: 'sonnet', timeoutMs: 90_000 });

  try {
    const parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
    const plan = Array.isArray(parsed.plan)
      ? parsed.plan
          .map((p) => {
            const o = p as Record<string, unknown>;
            return {
              section: typeof o.section === 'string' ? o.section.trim() : '',
              note: typeof o.note === 'string' ? o.note.trim() : '',
            };
          })
          .filter((p) => p.section && p.note)
      : [];
    const missing = Array.isArray(parsed.missing)
      ? parsed.missing.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    return {
      angle: typeof parsed.angle === 'string' ? parsed.angle.trim() : '',
      plan,
      missing,
    };
  } catch {
    // 파싱 실패 → 빈 제안(운영자가 직접 작성하거나 제안 없이 생성)
    return { angle: '', plan: [], missing: [] };
  }
}

// ─────────────── 씨앗 채점(큐레이션) ───────────────

export interface SeedScore {
  bucket: SeedBucket;
  score: number; // 0~100
  reason: string;
  suggestedAngle: string;
  /** 제목 대체용 한 줄 핵심(버킷 성격 반영) */
  headline: string;
  /** 버킷별 상세(카드 펼침): service={what,feature,category} / trend={whyNow} / painpoint={who,pain} */
  essence: Record<string, string>;
}

// 채점 시스템 프롬프트는 lib/seed-curation.ts의 BUCKETS 정의에서 생성(단일 출처).
const SCORE_SYSTEM = `당신은 케이스랩(Caselab)의 콘텐츠 큐레이터입니다. 케이스랩 독자는 AI를 실무에 쓰려는 직무인(기획자·마케터·1인 사업가 등)입니다.

HERMES가 수집한 "씨앗(브리핑 원문)" 하나를 평가해 ① 목적 버킷 분류 ② 0~100 점수 ③ 근거 ④ 콘텐츠화 각도를 매깁니다.

[버킷]
${BUCKETS.map((b) => `- "${b.key}" (${b.label}): ${b.criteria}`).join('\n')}
- "etc": 위 셋 중 어디에도 안 맞거나 광고·홍보·출처불명 루머·기존과 중복으로 가치 낮음.

[점수 4축 — 각 0~100을 매긴 뒤 버킷별 가중치로 가중평균]
- timeliness(시의성): 지금 화제이고 최신인가
- practical(실무가치): 우리 독자가 바로 써먹을 수 있나
- fit(케이스랩 적합성): 우리 톤·포맷으로 차별화해 풀 수 있나
- trust(신뢰도): 출처가 분명하고 광고·루머가 아닌가
버킷별 가중치(합 100):
${BUCKETS.map((b) => `- ${b.key}: 시의성 ${b.weights.timeliness} / 실무 ${b.weights.practical} / 적합 ${b.weights.fit} / 신뢰 ${b.weights.trust}`).join('\n')}
- etc로 분류하면 score는 40 이하로.

[출처 힌트] 씨앗에 출처가 주어지면 참고하되, 실제 버킷은 내용으로 판단하세요(힌트는 강제 아님).

[suggestedAngle] 이 씨앗을 콘텐츠로 만든다면 어떤 각도로 풀지 한 줄(대상·핵심 메시지).

[headline] 이 씨앗의 핵심을 한 줄로 정제(브리핑 원문 제목 대체용). 무엇에 관한 건지 즉시 파악되게.
- service면 "서비스명 — 무엇을 하는지"(예: "Cursor — AI 페어프로그래밍 코드 에디터").
- trend면 "무슨 트렌드인지"(예: "OpenAI GPT-5 멀티모달 에이전트 공개").
- painpoint면 "누가 무엇에 막히는지"(예: "기획자, AI 자료조사 반복작업에 시간 낭비").

[essence] 버킷별 상세를 아래 키로. 원문에서 근거를 못 찾으면 빈 문자열(지어내지 말 것 → 그런 씨앗은 감점).
- service: {"what":"무엇을 하는 서비스","feature":"핵심 기능","category":"도구 카테고리(예: 코드/글쓰기/이미지/리서치/자동화)","useCase":"누가 어떤 업무를 할 때 효율을 높여주는지 한 줄"}
- trend: {"whyNow":"왜 지금 중요한지 한 줄","implication":"이 트렌드가 현재 AI 전체 흐름에서 의미하는 바·시사점(해석) 한두 줄"}
- painpoint: {"who":"대상 직무","pain":"핵심 페인 한 줄","suggest":"그래서 어떤 서비스/기능이 이들에게 필요한지 → 케이스랩이 콘텐츠로 제안할 방향 한 줄"}
- etc: {}

응답은 아래 JSON 객체 하나만 반환하세요(설명 없이):
{ "bucket": "trend|service|painpoint|etc", "score": 0-100정수, "reason": "점수 근거 한 줄", "suggestedAngle": "콘텐츠화 각도 한 줄", "headline": "한 줄 핵심", "essence": { } }`;

/** 씨앗 1개를 채점(버킷 분류 + 0~100). 로컬 작업장 전제. */
export async function scoreSeed(input: { title: string; rawText?: string; sourceType?: string }): Promise<SeedScore> {
  const src = sourceProfile(input.sourceType);
  const sourceHint = src
    ? `\n[출처] ${src.label} — ${src.criteria}${src.bucketHint ? ` (보통 '${src.bucketHint}' 버킷 소재)` : ''}` +
      (src.qualitySignal
        ? `\n[이 출처의 품질 신호] ${src.qualitySignal}\n→ 이 신호가 원문에 없으면 trust·practical을 낮게 매기세요(원문 근거 없는 얇은 씨앗은 감점).`
        : '')
    : '';
  const userPrompt = `제목: ${input.title}\n원문: ${(input.rawText ?? '').slice(0, 4000)}${sourceHint}\n\n위 씨앗을 평가해 JSON만 반환하세요.`;
  // 채점은 주어진 원문을 분류·점수 매기는 작업 → 웹서치 불필요(웹툴 제거로 속도↑) + 가벼운 모델.
  const raw = await callModel(SCORE_SYSTEM, userPrompt, { allowedTools: [], model: 'sonnet', timeoutMs: 60_000 });

  try {
    const parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
    const bucket = isSeedBucket(parsed.bucket) ? parsed.bucket : 'etc';
    const n = typeof parsed.score === 'number' ? Math.round(parsed.score) : Number(parsed.score);
    const score = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
    // essence: 문자열 값만 추려 담는다(버킷별 키는 프롬프트가 결정).
    const essence: Record<string, string> = {};
    if (parsed.essence && typeof parsed.essence === 'object') {
      for (const [k, v] of Object.entries(parsed.essence as Record<string, unknown>)) {
        if (typeof v === 'string' && v.trim()) essence[k] = v.trim();
      }
    }
    return {
      bucket,
      score,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      suggestedAngle: typeof parsed.suggestedAngle === 'string' ? parsed.suggestedAngle : '',
      headline: typeof parsed.headline === 'string' ? parsed.headline.trim() : '',
      essence,
    };
  } catch {
    // 파싱 실패 → 보수적으로 etc/저점 처리(운영자가 재분석 가능)
    return { bucket: 'etc', score: 0, reason: '자동 채점 실패(재분석 필요)', suggestedAngle: '', headline: '', essence: {} };
  }
}
