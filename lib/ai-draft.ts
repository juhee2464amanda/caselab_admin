import Anthropic from '@anthropic-ai/sdk';
import { ContentBodySchema, type ContentBody } from '@/types/content';

const CASE_SYSTEM = `당신은 케이스랩(Caselab)의 운영자 어시스턴트입니다.

콘텐츠는 "실전 케이스" 트랙으로 항상 다음 4단 구조를 따릅니다:
1. essence (본질) — 왜 이게 문제인지, 1인칭 톤
2. framework (Framework 단계) — 각 step에 name/description/intent/blocks
3. failures (별로였던 사례) — 써보니 별로였던 점도 솔직하게. 자연스럽게 녹이되 분량 강제는 없음
4. review (솔직한 후기)
+ customization: 정확히 4개의 "본인 것으로 만드는 단계" 문자열

각 step에는 반드시 IntentBox 블록("type":"intent")을 1개 포함하세요.
사용 가능한 블록 type: text, heading, prompt, result-compare, role-card, intent, evaluation, rebuttal, framework-ref, context-card, checklist, failure
한국어로 작성. 1인칭 톤. 광고/유료 강의 링크 절대 금지.

응답은 다음 JSON 스키마와 정확히 일치하는 JSON 객체만 반환:
{
  "kind": "case",
  "essence": [{...block}],
  "framework": [{"name": "...", "description": "...", "intent": "...", "blocks": [...]}],
  "failures": [...],
  "review": [...],
  "customization": ["...", "...", "...", "..."]
}`;

const TREND_SYSTEM = `당신은 케이스랩(Caselab)의 운영자 어시스턴트입니다.

콘텐츠는 "AI 트렌드" 트랙으로 항상 다음 3단 구조를 따릅니다:
1. whats_new (뭐가 나왔나)
2. experiment (직접 실험한 결과)
3. verdict (언제 쓸만/별로) — useful, notUseful 두 배열

사용 가능한 블록 type: text, heading, prompt, result-compare, role-card, intent, evaluation, rebuttal, framework-ref, context-card, checklist, failure
한국어, 1인칭 톤, 광고 금지.

응답은 다음 JSON과 정확히 일치:
{
  "kind": "trend",
  "whats_new": [...],
  "experiment": [...],
  "verdict": {"useful": [...], "notUseful": [...]}
}`;

export interface DraftInput {
  track: 'case' | 'trend';
  title: string;
  summary?: string;
}

export async function generateDraft(input: DraftInput): Promise<ContentBody> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 미설정');
  const client = new Anthropic({ apiKey });

  const systemPrompt = input.track === 'case' ? CASE_SYSTEM : TREND_SYSTEM;
  const userPrompt = `제목: ${input.title}\n요약: ${input.summary ?? ''}\n\n위 주제로 초안 JSON만 반환하세요.`;

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('AI 응답이 비었어요');

  const raw = textBlock.text;
  const jsonMatch = raw.match(/```json\s*([\s\S]+?)```/) ?? raw.match(/(\{[\s\S]+\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : raw;

  const parsed = JSON.parse(jsonStr);
  const result = ContentBodySchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('AI 응답 검증 실패: ' + result.error.message);
  }
  return result.data;
}
