import type { Block, ContentBody, ContentRow } from '@/types/content';

export interface LintResult {
  passed: boolean;
  checks: { id: string; label: string; passed: boolean; detail?: string }[];
}

// 콘텐츠 본문에 허용되는 외부 도메인.
// 커스텀 도메인 도입 시 여기에 추가.
const ALLOWED_HOSTS = [
  'vercel.app',
  'github.com',
  'docs.anthropic.com',
  'openai.com',
  'platform.openai.com',
  'developers.google.com',
  'wikipedia.org',
  'namu.wiki',
];

function extractText(b: Block): string {
  switch (b.type) {
    case 'text': return b.markdown;
    case 'heading': return b.text;
    case 'prompt': return `${b.label} ${b.prompt}`;
    case 'result-compare': return `${b.good} ${b.bad}`;
    case 'role-card': return `${b.human} ${b.ai}`;
    case 'intent': return b.text;
    case 'evaluation': return `${b.good} ${b.bad}`;
    case 'rebuttal': return `${b.hypothesis} ${b.counter}`;
    case 'framework-ref': return b.name;
    case 'context-card': return `${b.title} ${b.fields.map((f) => f.label + ' ' + f.value).join(' ')}`;
    case 'checklist': return `${b.title} ${b.items.join(' ')}`;
    case 'failure': return `${b.title} ${b.blocks.map(extractText).join(' ')}`;
  }
}

function urls(text: string): string[] {
  const m = text.match(/https?:\/\/[^\s)]+/g);
  return m ?? [];
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function lintContent(
  row: Pick<ContentRow, 'read_min' | 'apply_min' | 'job_tags' | 'persona_coverage' | 'body'>
): LintResult {
  const checks: LintResult['checks'] = [];
  const body = row.body as ContentBody;

  // 1. 시간 라벨
  checks.push({
    id: 'time-labels',
    label: '시간 라벨 (읽기·적용 ≥ 1분)',
    passed: row.read_min >= 1 && row.apply_min >= 1,
  });

  // 2. 직무 태그
  checks.push({
    id: 'job-tags',
    label: '직무 태그 ≥ 1개',
    passed: (row.job_tags?.length ?? 0) >= 1,
  });

  // 3. 페르소나 커버리지
  checks.push({
    id: 'persona-coverage',
    label: '페르소나 커버리지 ≥ 1명',
    passed: (row.persona_coverage?.length ?? 0) >= 1,
  });

  // 4. 본문 내용 ≥ 1섹션 (트랙 공통) — D70 우선, legacy 폴백.
  //    구조 보장이 사라진 D70에서 "빈 본문 발행"을 막는 최소 게이트.
  const caseHasContent =
    body.kind === 'case' &&
    [
      body.caseIntro,
      body.painPoints,
      body.stepCards,
      body.takingPoints,
      body.forWho,
      body.essence,
      body.framework,
    ].some((s) => (s?.length ?? 0) > 0);
  const trendHasContent =
    body.kind === 'trend' &&
    [body.what, body.why, body.forWho, body.keyPoints, body.deepDive, body.soWhat, body.whats_new].some(
      (s) => (s?.length ?? 0) > 0
    );
  checks.push({
    id: 'has-content',
    label: '본문 내용 ≥ 1섹션',
    passed: body.kind === 'case' ? caseHasContent : trendHasContent,
  });

  // 5. 의도 라벨 — legacy framework가 있을 때만 적용 (D70 stepCards는 해당 없음)
  if (body.kind === 'case' && body.framework && body.framework.length > 0) {
    const stepCount = body.framework.length;
    const intentCount = body.framework.reduce(
      (acc, s) => acc + s.blocks.filter((b) => b.type === 'intent').length,
      0
    );
    checks.push({
      id: 'intent-labels',
      label: `Step별 IntentBox 수 = Step 수 (${intentCount}/${stepCount})`,
      passed: stepCount === intentCount,
    });
  } else {
    checks.push({ id: 'intent-labels', label: 'Step별 IntentBox (D70/트렌드 N/A)', passed: true });
  }

  // (별로 사례 ≥30% 분량 강제 게이트는 제거됨 — 솔직한 실패는 ai-draft 가이드로만 권장, 비율 강제 없음)

  // 6. customization 4단계 — legacy customization이 있을 때만 정확히 4개 검사
  if (body.kind === 'case' && body.customization && body.customization.length > 0) {
    checks.push({
      id: 'customization-4',
      label: '본인 것으로 만드는 4단계 (정확히 4개)',
      passed: body.customization.length === 4,
    });
  } else {
    checks.push({ id: 'customization-4', label: 'Customization (D70/트렌드 N/A)', passed: true });
  }

  // 7. 광고/외부 링크 화이트리스트
  const allBlocks: Block[] = body.kind === 'case'
    ? [
        // D70 본문 섹션
        ...(body.caseIntro ?? []),
        // legacy 4섹션 (있으면)
        ...(body.essence ?? []),
        ...(body.framework ?? []).flatMap((s) => s.blocks),
        ...(body.failures ?? []),
        ...(body.review ?? []),
      ]
    : [
        // D70 트렌드 본문 (정본)
        ...(body.what ?? []),
        ...(body.why ?? []),
        ...(body.deepDive ?? []),
        ...(body.soWhat ?? []),
        // legacy 트렌드 (있으면)
        ...(body.whats_new ?? []),
        ...(body.experiment ?? []),
        ...(body.verdict?.useful ?? []),
        ...(body.verdict?.notUseful ?? []),
      ];
  const allText = allBlocks.map(extractText).join(' ');
  const found = urls(allText);
  const violations = found.filter((u) => {
    const h = host(u);
    return !ALLOWED_HOSTS.some((ok) => h === ok || h.endsWith('.' + ok));
  });
  checks.push({
    id: 'no-ads',
    label: violations.length === 0 ? '외부 광고 링크 0' : `외부 광고 링크 발견 (${violations.length})`,
    passed: violations.length === 0,
    detail: violations.length > 0 ? violations.join(', ') : undefined,
  });

  return { passed: checks.every((c) => c.passed), checks };
}
