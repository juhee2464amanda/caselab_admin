import type { Block, ContentBody, ContentRow } from '@/types/content';

export interface LintResult {
  passed: boolean;
  // blocking !== false 인 체크만 발행을 막는다. blocking:false 는 경고(정보)로만 노출.
  checks: { id: string; label: string; passed: boolean; detail?: string; blocking?: boolean }[];
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
    case 'image': return `${b.caption ?? ''} ${b.alt ?? ''}`; // url은 스캔 제외(광고 링크 오탐 방지)
    case 'gallery': return b.images.map((im) => im.caption ?? '').join(' '); // 이미지 url 스캔 제외
    case 'bookmark': return `${b.title ?? ''} ${b.description ?? ''}`; // 링크 url은 카드 성격이라 스캔 제외
    case 'callout': return b.markdown;
    case 'spacer': return ''; // 텍스트 없음
    case 'divider': return ''; // 텍스트 없음
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

// 본문 전체에서 산문 텍스트를 수집해 글자 수 → 읽기 시간(분)을 추정한다.
// 섹션 shape에 의존하지 않도록 body 트리를 재귀 순회하며 산문 키만 모은다(URL·enum 값 제외).
const PROSE_KEYS = new Set([
  'markdown', 'text', 'prompt', 'good', 'bad', 'human', 'ai',
  'hypothesis', 'counter', 'title', 'value', 'desc', 'description',
  'caption', 'summary', 'heading', 'name', 'label',
]);
// 한국어 묵독 속도 근사(자/분). 짧은 글도 최소 1분으로 올린다.
const CHARS_PER_MIN = 500;

function harvestProse(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      if (typeof item === 'string') out.push(item); // checklist.items 등 문자열 배열
      else harvestProse(item, out);
    }
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string') {
        if (PROSE_KEYS.has(k)) out.push(v);
      } else {
        harvestProse(v, out);
      }
    }
  }
}

/** 본문 분량 기반 읽기 시간(분) 추정. 수동 입력의 눈대중을 대체한다. */
export function estimateReadMin(body: ContentBody): number {
  const out: string[] = [];
  harvestProse(body, out);
  const text = out.join(' ').replace(/https?:\/\/\S+/g, ''); // 링크 URL 제외
  const chars = text.replace(/\s/g, '').length;
  return Math.max(1, Math.round(chars / CHARS_PER_MIN));
}

export function lintContent(
  row: Pick<ContentRow, 'read_min' | 'apply_min' | 'job_tags' | 'persona_coverage' | 'body' | 'thumbnail_url'>
): LintResult {
  const checks: LintResult['checks'] = [];
  const body = row.body as ContentBody;
  const isTrend = body.kind === 'trend';

  // 1. 시간 라벨 — 트렌드는 '적용' 개념이 없어 읽기 시간만 요구, 사례는 읽기·적용 모두.
  checks.push({
    id: 'time-labels',
    label: isTrend ? '읽기 시간 (≥ 1분)' : '시간 라벨 (읽기·적용 ≥ 1분)',
    passed: isTrend ? row.read_min >= 1 : row.read_min >= 1 && row.apply_min >= 1,
  });

  // 2. 직무 태그 — 트렌드는 직무 무관 뉴스라 게이트 제외(N/A), 사례만 ≥ 1개 요구.
  checks.push({
    id: 'job-tags',
    label: isTrend ? '직무 태그 (트렌드 N/A)' : '직무 태그 ≥ 1개',
    passed: isTrend ? true : (row.job_tags?.length ?? 0) >= 1,
  });

  // (페르소나 커버리지 게이트 제거 — 본가에서 미노출·미사용인 죽은 필드라 발행을 막지 않는다)

  // 3. 썸네일 — 홈 히어로·목록 카드·관련 캐러셀이 모두 thumbnail_url을 쓴다.
  //    없이 발행하면 본가에 빈 카드가 그대로 걸려서 차단 항목으로 둔다.
  checks.push({
    id: 'thumbnail',
    label: '썸네일 이미지',
    passed: (row.thumbnail_url ?? '').trim().length > 0,
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
  // 자유 섹션(body.sections)도 본문으로 친다 — 고정 섹션 없이 자유 섹션만으로 구성한 콘텐츠가
  // "본문 없음"으로 발행이 막히지 않도록. 블록이 있는 섹션만 유효(본가 RichSections가 빈 섹션은 건너뜀).
  const freeHasContent = (body.sections ?? []).some((s) => (s.blocks?.length ?? 0) > 0);
  checks.push({
    id: 'has-content',
    label: '본문 내용 ≥ 1섹션',
    passed: (body.kind === 'case' ? caseHasContent : trendHasContent) || freeHasContent,
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

  // 트렌드 전용 — 출처 ≥1(원본 링크 확인 불가 문제의 차단 게이트)·과분량 경고.
  if (isTrend) {
    checks.push({
      id: 'has-source',
      label: '출처 링크 ≥ 1개',
      passed: (body.kind === 'trend' ? body.sources?.length ?? 0 : 0) >= 1,
    });
    const est = estimateReadMin(body);
    checks.push({
      id: 'read-length',
      label: est > 7 ? `분량 과다 (추정 ${est}분) — 압축 권장` : `분량 확인 (추정 ${est}분)`,
      passed: est <= 7,
      blocking: false, // 길 이유가 있으면 운영자가 넘긴다.
    });
  }

  // 7. 편집 마커 잔존 — "[수치 검증 필요]"류 대괄호 내부 메모가 발행본에 남으면
  //    독자 전원이 "덜 쓴 글"로 인식하고 다른 숫자까지 불신한다(페르소나 검증 12/12 지적). 차단 항목.
  const proseAll: string[] = [];
  harvestProse(body, proseAll);
  const markerRe = /\[[^\]\n]{0,24}(?:검증|확인|출처|수치|TODO|채우)[^\]\n]{0,24}(?:필요|요망|안 ?됨|미정)[^\]\n]{0,24}\]|\[TODO[^\]\n]*\]/g;
  const markers = [...new Set(proseAll.join(' ').match(markerRe) ?? [])];
  checks.push({
    id: 'no-editorial-markers',
    label: markers.length === 0 ? '편집 마커 없음' : `편집 마커 잔존 (${markers.length}) — 삭제 필요`,
    passed: markers.length === 0,
    detail: markers.length > 0 ? markers.join(', ') : undefined,
  });

  // 8. 상대 위치 참조 — "위 '원문 보기'에서" 같은 문장은 그 요소가 없으면 독자가 헤맨다.
  //    렌더 위치를 여기서 검증할 수 없어 경고만(운영자가 확인).
  const relativeRefs = proseAll.join(' ').match(/위(?:의|쪽)? ['"“”‘’]?(?:원문 보기|원문|링크)['"“”‘’]?(?:에서|를|을)/g) ?? [];
  checks.push({
    id: 'no-relative-refs',
    label: relativeRefs.length === 0 ? '상대 위치 참조 없음' : `상대 위치 참조 (${relativeRefs.length}) — 인라인 링크 권장`,
    passed: relativeRefs.length === 0,
    detail: relativeRefs.length > 0 ? [...new Set(relativeRefs)].join(', ') : undefined,
    blocking: false,
  });

  // 9. 광고/외부 링크 화이트리스트
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
    label: violations.length === 0 ? '외부 링크 확인' : `화이트리스트 밖 외부 링크 (${violations.length}) — 확인 권장`,
    passed: violations.length === 0,
    detail: violations.length > 0 ? violations.join(', ') : undefined,
    blocking: false, // 경고만. 신뢰된 운영자가 직접 큐레이션하므로 발행을 막지 않는다.
  });

  // blocking !== false 인 체크만 발행 가능 여부를 결정.
  return { passed: checks.every((c) => c.blocking === false || c.passed), checks };
}
