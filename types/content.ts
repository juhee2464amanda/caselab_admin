import { z } from 'zod';

export const JOB_TAGS = ['planning', 'marketing', 'sales', 'solo', 'strategy', 'analysis'] as const;
export const PERSONAS = ['A', 'B', 'C', 'D', 'E'] as const;

export const JobTagSchema = z.enum(JOB_TAGS);
export const PersonaSchema = z.enum(PERSONAS);

export const TimeMetaSchema = z.object({
  readMin: z.number().int().min(1),
  applyMin: z.number().int().min(1),
});
export const JobTagsSchema = z.array(JobTagSchema).min(1);
export const PersonaCoverageSchema = z.array(PersonaSchema).min(1);

// ───────────────────────────────────────────────────────────
// Block 정의 (discriminated union)
// ───────────────────────────────────────────────────────────
export const TextBlockSchema = z.object({
  type: z.literal('text'),
  markdown: z.string().min(1),
});

export const HeadingBlockSchema = z.object({
  type: z.literal('heading'),
  level: z.union([z.literal(2), z.literal(3)]),
  text: z.string().min(1),
});

export const PromptBlockSchema = z.object({
  type: z.literal('prompt'),
  label: z.string(),
  prompt: z.string().min(1),
});

export const ResultCompareBlockSchema = z.object({
  type: z.literal('result-compare'),
  good: z.string().min(1),
  bad: z.string().min(1),
});

export const RoleCardBlockSchema = z.object({
  type: z.literal('role-card'),
  human: z.string().min(1),
  ai: z.string().min(1),
});

export const IntentBoxBlockSchema = z.object({
  type: z.literal('intent'),
  step: z.number().int().min(1),
  text: z.string().min(1),
});

export const EvaluationBoxBlockSchema = z.object({
  type: z.literal('evaluation'),
  good: z.string().min(1),
  bad: z.string().min(1),
});

export const RebuttalBoxBlockSchema = z.object({
  type: z.literal('rebuttal'),
  hypothesis: z.string().min(1),
  counter: z.string().min(1),
});

export const FrameworkRefBlockSchema = z.object({
  type: z.literal('framework-ref'),
  name: z.string().min(1),
  url: z.string().url().optional(),
});

export const ContextCardBlockSchema = z.object({
  type: z.literal('context-card'),
  title: z.string().min(1),
  fields: z.array(
    z.object({
      label: z.string().min(1),
      value: z.string().min(1),
    })
  ).min(1),
});

export const ChecklistBlockSchema = z.object({
  type: z.literal('checklist'),
  title: z.string().min(1),
  items: z.array(z.string().min(1)).min(1),
});

// FailureSection는 내부에 BlockSchema를 가짐 → lazy 사용
export type Block =
  | z.infer<typeof TextBlockSchema>
  | z.infer<typeof HeadingBlockSchema>
  | z.infer<typeof PromptBlockSchema>
  | z.infer<typeof ResultCompareBlockSchema>
  | z.infer<typeof RoleCardBlockSchema>
  | z.infer<typeof IntentBoxBlockSchema>
  | z.infer<typeof EvaluationBoxBlockSchema>
  | z.infer<typeof RebuttalBoxBlockSchema>
  | z.infer<typeof FrameworkRefBlockSchema>
  | z.infer<typeof ContextCardBlockSchema>
  | z.infer<typeof ChecklistBlockSchema>
  | { type: 'failure'; title: string; blocks: Block[] };

export const BlockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion('type', [
    TextBlockSchema,
    HeadingBlockSchema,
    PromptBlockSchema,
    ResultCompareBlockSchema,
    RoleCardBlockSchema,
    IntentBoxBlockSchema,
    EvaluationBoxBlockSchema,
    RebuttalBoxBlockSchema,
    FrameworkRefBlockSchema,
    ContextCardBlockSchema,
    ChecklistBlockSchema,
    z.object({
      type: z.literal('failure'),
      title: z.string().min(1),
      blocks: z.array(BlockSchema).min(1),
    }),
  ])
);

// ───────────────────────────────────────────────────────────
// 트랙별 본문 스키마
// ───────────────────────────────────────────────────────────
export const FrameworkStepSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  intent: z.string().min(1),
  blocks: z.array(BlockSchema).min(1),
});

export const CaseBodySchema = z.object({
  kind: z.literal('case'),
  essence: z.array(BlockSchema).min(1),
  framework: z.array(FrameworkStepSchema).min(1),
  failures: z.array(BlockSchema).min(1),
  review: z.array(BlockSchema).min(1),
  customization: z.array(z.string().min(1)).length(4),
});

export const TrendBodySchema = z.object({
  kind: z.literal('trend'),
  whats_new: z.array(BlockSchema).min(1),
  experiment: z.array(BlockSchema).min(1),
  verdict: z.object({
    useful: z.array(BlockSchema).min(1),
    notUseful: z.array(BlockSchema).min(1),
  }),
});

export const ContentBodySchema = z.discriminatedUnion('kind', [
  CaseBodySchema,
  TrendBodySchema,
]);

export type ContentBody = z.infer<typeof ContentBodySchema>;
export type CaseBody = z.infer<typeof CaseBodySchema>;
export type TrendBody = z.infer<typeof TrendBodySchema>;
export type FrameworkStep = z.infer<typeof FrameworkStepSchema>;
export type JobTag = z.infer<typeof JobTagSchema>;
export type Persona = z.infer<typeof PersonaSchema>;

// ───────────────────────────────────────────────────────────
// Content row (Supabase 매핑)
// ───────────────────────────────────────────────────────────
export interface ContentRow {
  id: string;
  slug: string;
  track: 'case' | 'trend';
  title: string;
  summary: string | null;
  body: ContentBody;
  job_tags: JobTag[];
  persona_coverage: Persona[];
  read_min: number;
  apply_min: number;
  status: 'draft' | 'published' | 'archived';
  curated: boolean;
  thumbnail_url: string | null;
  author_quote: string | null;
  view_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

// ───────────────────────────────────────────────────────────
// 직무 한글 라벨
// ───────────────────────────────────────────────────────────
export const JOB_LABELS: Record<JobTag, string> = {
  planning: '기획',
  marketing: '마케팅',
  sales: '영업',
  solo: '1인 사업',
  strategy: '전략',
  analysis: '데이터/분석',
};

// ─── §5-4 온보딩 4종 추가 (D38) ───
// profiles.interests[], profiles.ai_tools[]에 저장. 영문 슬러그.

export const INTERESTS = [
  'prompt_engineering',
  'data_analysis',
  'workflow_automation',
  'customer_insight',
  'ai_trends',
  'content_strategy',
  'product_planning',
  'ai_ethics',
] as const;
export type Interest = (typeof INTERESTS)[number];

export const INTEREST_LABELS: Record<Interest, string> = {
  prompt_engineering: '프롬프트 엔지니어링',
  data_analysis: '데이터 분석',
  workflow_automation: '워크플로우 자동화',
  customer_insight: '고객 인사이트',
  ai_trends: 'AI 트렌드',
  content_strategy: '콘텐츠 전략',
  product_planning: '제품 기획',
  ai_ethics: 'AI 윤리·보안',
};

export const AI_TOOLS = [
  'chatgpt',
  'claude',
  'gemini',
  'perplexity',
  'notion_ai',
  'cursor',
  'github_copilot',
  'midjourney',
  'other',
] as const;
export type AiTool = (typeof AI_TOOLS)[number];

export const AI_TOOL_LABELS: Record<AiTool, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  notion_ai: 'Notion AI',
  cursor: 'Cursor',
  github_copilot: 'GitHub Copilot',
  midjourney: 'Midjourney',
  other: '기타',
};

export const PERSONA_LABELS: Record<Persona, string> = {
  A: '기획자',
  B: '전략팀',
  C: '1인 사업',
  D: '영업팀장',
  E: '스타트업 마케터',
};
