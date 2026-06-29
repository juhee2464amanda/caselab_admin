import Anthropic from '@anthropic-ai/sdk';
import { ContentBodySchema, type ContentBody } from '@/types/content';
import { runClaudeSubscription, extractJson } from '@/lib/claude-cli';

// 본문(블록 배열) 작성 규칙 — D70 스키마의 BlockSchema는 "type" 판별자가 필수다.
// 초안 단계에선 가장 안전한 두 블록만 쓰게 강제(운영자가 폼에서 다른 블록 추가).
const BLOCK_RULE = `[중요] "블록 배열" 필드는 각 원소가 아래 두 종류 중 하나여야 합니다(반드시 "type" 포함):
- {"type":"text","markdown":"문단 텍스트(마크다운 허용, 여러 문장 가능)"}
- {"type":"heading","level":2,"text":"소제목"}   // level은 2 또는 3만`;

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
- body: 자유 형식 객체. 가능하면 { "highlights": ["핵심 기능 3~5개"], "useCases": ["활용 예시"], "verdict": "한 줄 총평" } 형태로.

광고/제휴 링크 금지. 한국어, 1인칭 톤.

응답은 다음 JSON 객체만 반환:
{
  "name": "...",
  "description": "...",
  "category": "tool",
  "pricing_tier": "free",
  "url": "...",
  "body": { "highlights": ["..."], "useCases": ["..."], "verdict": "..." }
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

/** 시스템+유저 프롬프트로 모델을 호출해 응답 텍스트를 반환. 프로바이더에 따라 구독 CLI / API키 분기. */
async function callModel(system: string, userPrompt: string): Promise<string> {
  if (provider() === 'subscription') {
    return runClaudeSubscription({ system, prompt: userPrompt });
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
  /** 운영자가 triage에서 적은 기획 각도(content_seeds.note). 있으면 이 각도를 중심으로 서사 구성. */
  angle?: string;
}

/** 케이스/트렌드 초안 생성. ContentBodySchema 검증 + 실패 시 1회 repair 패스. */
export async function generateDraft(input: DraftInput): Promise<ContentBody> {
  const systemPrompt = input.track === 'case' ? CASE_SYSTEM : TREND_SYSTEM;
  const angleLine = input.angle?.trim()
    ? `\n[기획 각도] ${input.angle.trim()}\n→ 위 각도를 중심으로 서사를 구성하세요(대상·문제·핵심 메시지).`
    : '';
  const userPrompt = `제목: ${input.title}\n요약: ${input.summary ?? ''}${angleLine}\n\n위 주제로 초안 JSON만 반환하세요.`;

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

/** AI 도구 초안 생성. tools 테이블 body는 엄격 스키마가 없어 느슨하게 처리 + 파싱 실패 시 폴백. */
export async function generateToolDraft(input: { title: string; summary?: string }): Promise<ToolDraft> {
  const userPrompt = `도구명/주제: ${input.title}\n참고(브리핑 원문): ${input.summary ?? ''}\n\n위 도구를 리서치해 카드 초안 JSON만 반환하세요.`;
  const raw = await callModel(TOOL_SYSTEM, userPrompt);

  try {
    const parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
    const pricing = typeof parsed.pricing_tier === 'string' && PRICING_TIERS.includes(parsed.pricing_tier)
      ? (parsed.pricing_tier as ToolDraft['pricing_tier'])
      : 'free';
    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : input.title,
      category: 'tool',
      pricing_tier: pricing,
      url: typeof parsed.url === 'string' ? parsed.url : undefined,
      body: (parsed.body && typeof parsed.body === 'object' ? parsed.body : {}) as Record<string, unknown>,
    };
  } catch {
    // 파싱 실패 → 원문을 description/body에 담아 폴백 (운영자가 ToolForm에서 보정)
    return {
      description: raw.slice(0, 2000),
      category: 'tool',
      pricing_tier: 'free',
      body: { raw },
    };
  }
}

/** 프롬프트 카드 초안 생성. tools(category='prompt')로 적재. 파싱 실패 시 폴백. */
export async function generatePromptDraft(input: { title: string; summary?: string }): Promise<ToolDraft> {
  const userPrompt = `주제/제목: ${input.title}\n참고(브리핑 원문): ${input.summary ?? ''}\n\n위 주제로 바로 쓸 수 있는 프롬프트 카드 초안 JSON만 반환하세요.`;
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
export async function generateGuideDraft(input: { title: string; summary?: string }): Promise<GuideDraft> {
  const userPrompt = `주제/제목: ${input.title}\n참고(브리핑 원문): ${input.summary ?? ''}\n\n위 주제의 외부 가이드 링크 카드 초안 JSON만 반환하세요.`;
  const raw = await callModel(GUIDE_SYSTEM, userPrompt);

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
