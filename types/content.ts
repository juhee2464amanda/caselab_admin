import { z } from 'zod';

export const JOB_TAGS = ['planning', 'marketing', 'sales', 'solo', 'strategy', 'analysis', 'revenue_kpi', 'customer_research'] as const;
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

// 이미지 블록 — 운영자가 본문에 직접 삽입(업로드/URL). 본가 types/content.ts와 동일.
export const ImageBlockSchema = z.object({
  type: z.literal('image'),
  url: z.string().min(1),
  alt: z.string().optional(),
  caption: z.string().optional(),
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
  | z.infer<typeof ImageBlockSchema>
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
    ImageBlockSchema,
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

// ───────────────────────────────────────────────────────────
// D70 (2026-06-06) — 본가 content.html 7섹션 정합 sub-schemas.
// 본가(라이브 렌더러)가 정본. admin 폼은 이 필드들을 생산한다.
// ───────────────────────────────────────────────────────────
export const PainPointSchema = z.object({
  num: z.string(),
  title: z.string(),
  symptom: z.string(),
  rootCause: z.string(),
});

export const FrameworkReferenceSchema = z.object({
  name: z.string(),
  description: z.string(),
  sourceLabel: z.string().optional(),
  sourceTitle: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  sourceThumbnail: z.string().url().optional(),
});

export const StepCardSchema = z.object({
  num: z.number().int().min(1),
  label: z.string(),
  description: z.string().optional(),
  human: z.string(),
  ai: z.string(),
  prompt: z.string(),
  goodResult: z.string().optional(),
  badResult: z.string().optional(),
});

export const TakingPointSchema = z.object({
  title: z.string(),
  description: z.string(),
  action: z.string().optional(),
});

/** 트렌드 "누구한테 중요해요" — 직무별 관련도 */
export const TrendForWhoSchema = z.object({
  role: z.string(),
  why: z.string(),
});

export const SourceLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});

export const CaseBodySchema = z.object({
  kind: z.literal('case'),

  // D70 신규 — 모두 optional. 채워지면 7섹션 렌더, 비면 legacy 4섹션 폴백.
  forWho: z.array(z.string()).optional(),
  caseIntro: z.array(BlockSchema).optional(),
  painPoints: z.array(PainPointSchema).optional(),
  frameworkReference: FrameworkReferenceSchema.optional(),
  stepCards: z.array(StepCardSchema).optional(),
  pros: z.array(z.string()).optional(),
  cons: z.array(z.string()).optional(),
  takingPoints: z.array(TakingPointSchema).optional(),

  // legacy (4섹션) — D70 폼은 이 필드를 안 만든다. 단, 기존 콘텐츠 보존을 위해
  //   optional로 두어 폼이 read/preserve 가능. (본가는 required지만 런타임 검증 안 함 → 안전)
  essence: z.array(BlockSchema).optional(),
  framework: z.array(FrameworkStepSchema).optional(),
  failures: z.array(BlockSchema).optional(),
  review: z.array(BlockSchema).optional(),
  customization: z.array(z.string()).optional(),
});

export const TrendBodySchema = z.object({
  kind: z.literal('trend'),

  // D70 신규 — 본가 트렌드 페이지가 렌더하는 정본 7섹션 (모두 optional, 있는 것만 렌더).
  what: z.array(BlockSchema).optional(),
  why: z.array(BlockSchema).optional(),
  forWho: z.array(TrendForWhoSchema).optional(),
  keyPoints: z.array(z.string()).optional(),
  deepDive: z.array(BlockSchema).optional(),
  soWhat: z.array(BlockSchema).optional(),
  sources: z.array(SourceLinkSchema).optional(),

  // legacy — 본가는 제거했으나 admin lint/기존 default 호환 위해 optional 보존. (Phase 3에서 제거)
  whats_new: z.array(BlockSchema).optional(),
  experiment: z.array(BlockSchema).optional(),
  verdict: z
    .object({
      useful: z.array(BlockSchema).min(1),
      notUseful: z.array(BlockSchema).min(1),
    })
    .optional(),
});

export const ContentBodySchema = z.discriminatedUnion('kind', [
  CaseBodySchema,
  TrendBodySchema,
]);

export type ContentBody = z.infer<typeof ContentBodySchema>;
export type CaseBody = z.infer<typeof CaseBodySchema>;
export type TrendBody = z.infer<typeof TrendBodySchema>;
export type FrameworkStep = z.infer<typeof FrameworkStepSchema>;
export type PainPoint = z.infer<typeof PainPointSchema>;
export type FrameworkReference = z.infer<typeof FrameworkReferenceSchema>;
export type StepCard = z.infer<typeof StepCardSchema>;
export type TakingPoint = z.infer<typeof TakingPointSchema>;
export type TrendForWho = z.infer<typeof TrendForWhoSchema>;
export type SourceLink = z.infer<typeof SourceLinkSchema>;
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
  revenue_kpi: '매출/KPI 관리',
  customer_research: '고객조사',
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
