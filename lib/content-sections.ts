// 콘텐츠(케이스/트렌드) 섹션 정의 — 순수 데이터(서버 ai-draft·클라 ContentPreview 공용, 서버 의존성 없음).
// 섹션은 본가 상세 렌더러가 정한 고정 집합. "추가"=비어있는 슬롯을 채움, "삭제"=비움.
// example은 빈 섹션을 AI로 생성할 때 넘길 "형태 힌트"(스키마 근사).

export interface SectionSpec {
  key: string;
  label: string;
  /** 빈 섹션 생성 시 AI에게 줄 형태 예시(shape hint) */
  example: unknown;
}

export const CASE_SECTIONS: SectionSpec[] = [
  { key: 'forWho', label: '이런 분들을 위한 글이에요', example: ['기획자', '마케터', '1인 사업가'] },
  { key: 'caseIntro', label: '어떤 케이스를 다루나요', example: [{ type: 'text', markdown: '이 사례가 무엇을 다루는지 2~3문단.' }] },
  {
    key: 'painPoints',
    label: '보통 이런 일에서 막히는 이유',
    example: [{ num: '01', title: '문제 제목', symptom: '겉으로 드러난 증상', rootCause: '근본 원인' }],
  },
  { key: 'frameworkReference', label: '적용한 Framework', example: { name: '프레임워크 이름', description: '한두 문장 설명' } },
  {
    key: 'stepCards',
    label: '단계별 AI 활용',
    example: [
      { num: 1, label: '단계 이름', description: '이 단계 설명', human: '사람이 하는 일', ai: 'AI가 하는 일', prompt: '실제 프롬프트', goodResult: '좋은 결과 예시', badResult: '안 좋은 결과 예시' },
    ],
  },
  { key: 'pros', label: '좋았던 점', example: ['이 방식의 장점'] },
  { key: 'cons', label: '아쉬웠던 점', example: ['한계/주의점'] },
  { key: 'takingPoints', label: '핵심 Taking point', example: [{ title: '핵심 테이크어웨이', description: '왜 중요한지', action: '바로 할 수 있는 행동' }] },
];

export const TREND_SECTIONS: SectionSpec[] = [
  { key: 'what', label: '무슨 소식이에요', example: [{ type: 'text', markdown: '이 트렌드가 무엇인지 2~3문단.' }] },
  { key: 'why', label: '왜 지금 화두예요', example: [{ type: 'text', markdown: '왜 지금 중요한지.' }] },
  { key: 'forWho', label: '누구한테 중요해요', example: [{ role: '기획자', why: '이 직무에 왜 중요한지' }] },
  { key: 'keyPoints', label: '핵심만 빠르게', example: ['핵심 요점(짧은 문장)'] },
  { key: 'deepDive', label: '좀 더 들어가면', example: [{ type: 'heading', level: 2, text: '소제목' }, { type: 'text', markdown: '더 깊은 설명.' }] },
  { key: 'soWhat', label: '그래서, 내 일엔?', example: [{ type: 'text', markdown: '실무에서 무엇을 해야 하나.' }] },
  { key: 'sources', label: '출처·더 보기', example: [{ label: '출처 이름', url: 'https://...' }] },
];

export function sectionSpecs(track: 'case' | 'trend'): SectionSpec[] {
  return track === 'case' ? CASE_SECTIONS : TREND_SECTIONS;
}

export function sectionSpec(track: 'case' | 'trend', key: string): SectionSpec | undefined {
  return sectionSpecs(track).find((s) => s.key === key);
}

/** 섹션 값이 "비어있는지"(= 미리보기에 안 나오는 상태). */
export function isEmptySection(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}
