// 케이스랩 독자 페르소나 A~E 정본 + '기획방향 제안'의 데이터 계약.
//
// 페르소나 키·짧은 라벨은 본가 types/content.ts(PERSONAS·PERSONA_LABELS)가 단일 출처다.
// 여기엔 그 위에 "이 사람이 어디서 막히고 무엇을 원하고 무엇을 즉시 거절하는가"만 얹는다 —
// AI가 기획방향을 제안할 때 "누가 이걸 궁금해할까"를 감으로 찍지 않게 하는 기준.
// 출처: planning/user-interview/personas_v2.md · personas_v3.md
//       (v3 = 공개 인용 1568건 보강본. 워딩은 실제 사용자 1인칭에서 가져옴)
//
// 서버(생성 프롬프트)·클라이언트(제안 카드 배지) 양쪽에서 import → 순수 모듈로 유지.
// 프롬프트를 부르는 쪽(lib/ai-draft.ts)이 서버 전용이라, 화면이 쓰는 타입도 여기 함께 둔다.

import { PERSONAS, PERSONA_LABELS, type Persona } from '@/types/content';

export type { Persona };
export { PERSONAS, PERSONA_LABELS };

export interface PersonaProfile {
  key: Persona;
  /** 페르소나 이름(인터뷰 정본의 가명) */
  name: string;
  /** 직업·연차 — 상황을 구체화하는 최소 정보 */
  role: string;
  /** 이 사람을 한 줄로 부르는 별명(핵심 막힘의 이름) */
  tagline: string;
  /** 막히는 순간 — 언제, 무엇을 하다가 멈추는가 */
  stuck: string;
  /** 이 사람이 콘텐츠에서 원하는 것(있으면 클릭한다) */
  wants: string;
  /** 즉시 거절하는 것(있으면 신뢰를 잃는다) */
  rejects: string;
}

export const PERSONA_PROFILES: PersonaProfile[] = [
  {
    key: 'A',
    name: '박지현',
    role: '중견기업 마케팅 기획자 5년차',
    tagline: '자기의심형 기획자 — "다들 쓰는데 나만 못 쓰는 것 같다"',
    stuck:
      'AI 자료를 200개 넘게 저장해두지만, 막상 기획서를 써야 하는 월요일 오전엔 빈 입력칸 앞에서 뭘 칠지 막막하다. 찾아봐도 "내 상황엔 안 맞는데"로 끝난다. 프롬프트 한 줄 차이로 결과가 달라지는 건 아는데 그 미세한 차이를 모른다.',
    wants: '왜 그렇게 쓰는지 미세한 차이까지 보여주는 설명, 내 상황에 맞게 바꿔 쓰는 법, 처음 한 줄을 떼주는 출발점',
    rejects: '과정 생략하고 결과만 보여주는 "30분 만에 완성" 톤 — 자기의심이 더 깊어진다',
  },
  {
    key: 'B',
    name: '이민준',
    role: '대기업 전략팀 과장',
    tagline: '정당화당하는 전략팀 — "검증이 아니라 정당화만 해준다"',
    stuck:
      '전략 보고서 초안을 맡기면 "세련된 포장지 속 기성품"이 나온다. 내 가설을 검증해주길 기대했는데 AI는 정당화만 하고, 반박하면 또 말을 바꿔 거기에 맞춰준다 — 그래서 뭐가 정확한 정보인지 확신할 수 없다. 편집이 직접 쓰는 것보다 오래 걸려 사용 빈도가 줄고 있다.',
    wants: 'AI가 모르는 영역을 식별하고 우회하는 구조, 결과를 검증·반증하는 방법, "모르면 모른다"고 말하게 만드는 법, 확인 가능한 출처',
    rejects: '출처 없는 단정, 누구에게나 맞는 일반론, 실패 사례가 하나도 없는 성공담',
  },
  {
    key: 'C',
    name: '김소연',
    role: '퍼스널 브랜딩 프리랜서(1인 사업)',
    tagline: '강의에 지친 1인 창업가 — 의심은 두꺼운데 안 보면 뒤처질 것 같다',
    stuck:
      '"AI로 N억" 광고를 매일 보고 결제해 따라 해봤지만 자기 상황에 안 맞았다. 강의에 두어 번 데인 뒤로는 어떤 콘텐츠도 광고부터 의심한다. 그러면서도 구독료는 월 8만원씩 나가고, 안 보면 또 뒤처질 것 같다.',
    wants: '직접 써본 사람의 솔직한 실패담, 돈 안 들이고 검증하는 법, 1인 규모에 실제로 맞는 범위, 후기의 근거',
    rejects: '수익 약속("이거 하면 N억"), 광고·제휴 톤, 결제 유도, 근거 없는 과장',
  },
  {
    key: 'D',
    name: '최현수',
    role: '중소기업 영업팀장 41세',
    tagline: '결과물 톤이 안 맞는 팀장 — "보고서 써줘" 한 번 던지고 실망',
    stuck:
      '제안서·영업 보고서를 매주 쓴다. AI에 한 번에 던졌더니 결과가 평범해 윗사람 보고용 톤에 안 맞고, 고치며 협상하다 5분 작업이 1시간이 됐다. 결국 안 쓴다. 게다가 윗세대는 "그거 날로 먹는 거 아니냐"고 한다.',
    wants: '5~10분 안에 끝나는 업무 단위, 윗사람이 통과시키는 결과물 톤을 맞추는 법, 결과를 자기 것으로 책임지고 쓰는 방법',
    rejects: '학습 시간이 긴 것, 도구 이름만 나열하는 글, 실무 문서에 그대로 못 쓰는 예시',
  },
  {
    key: 'E',
    name: '정다은',
    role: '스타트업 마케터 2년차',
    tagline: '단순/복잡 갭 — 카피는 매일 쓰는데 분석·기획에서 막힌다',
    stuck:
      'SNS 문구·카피 같은 단순 작업은 매일 잘 쓴다. 경쟁사 분석·캠페인 기획·보고서로 들어가면 결과가 "표면적이고 핵심을 다 놓친" 상태로 나와 결국 직접 쓴다. 내가 프롬프트를 못 짜는 건지 AI의 한계인지 구분을 못 한다.',
    wants: '업무를 단계로 쪼개고 단계마다 어떤 의도를 전달할지("소원"이 아니라 "의도"), 톤을 맞추는 법, 복잡한 작업에서의 한계선 구분',
    rejects: '초보용 기초 설명 반복, 단순 작업 예시만 드는 글',
  },
];

const BY_KEY = new Map<Persona, PersonaProfile>(PERSONA_PROFILES.map((p) => [p.key, p]));

export function isPersona(v: unknown): v is Persona {
  return typeof v === 'string' && BY_KEY.has(v as Persona);
}

export function personaProfile(key: Persona): PersonaProfile {
  return BY_KEY.get(key)!;
}

/** 짧은 배지용 라벨 — "B 전략팀" */
export function personaBadge(key: Persona): string {
  return `${key} ${PERSONA_LABELS[key]}`;
}

/** 독자 전체가 공유하는 패턴(v3에서 발견) — 어떤 페르소나를 고르든 유효한 후크. */
export const SHARED_PAIN_PATTERNS = [
  '한국어·한국 비즈니스 맥락에서 결과가 표면적이다 — 국내 시장/톤/규정을 어떻게 전달하는가',
  'AI가 시간을 더 잡아먹는다 — 학습 곡선과 재작업 비용. "이 방법은 몇 분짜리인가"를 약속해야 한다',
];

/** 생성 프롬프트에 주입하는 페르소나 브리핑(단일 출처 → 프롬프트 중복 정의 방지). */
export const PERSONA_PROMPT_BLOCK = `[케이스랩 독자 페르소나 — 실제 사용자 인터뷰 정본]
${PERSONA_PROFILES.map(
  (p) =>
    `- ${p.key} ${p.name}(${p.role}) · ${p.tagline}
  · 막히는 순간: ${p.stuck}
  · 원하는 것: ${p.wants}
  · 즉시 거절: ${p.rejects}`,
).join('\n')}

[모든 페르소나 공통 패턴]
${SHARED_PAIN_PATTERNS.map((s) => `- ${s}`).join('\n')}`;

// ─────────────── 기획방향 제안(AI) 계약 ───────────────
// 서버가 만들고(lib/ai-draft.ts::proposeDirections) 화면이 카드로 그린다(SeedCuration).

export interface DirectionProposal {
  /** 이 각도의 이름 — 12자 내외. 카드 제목 */
  headline: string;
  /** 이 방향이 겨냥하는 페르소나(1~2, 첫 번째가 주 대상) */
  personas: Persona[];
  /** 이 페르소나가 왜 궁금해하는지 한 줄 — 그들의 막힘과 연결 */
  why: string;
  /** 그대로 기획방향 입력칸에 들어갈 완성 문장(2~3문장) */
  direction: string;
}

export interface DirectionProposals {
  /** 이 소스의 핵심 한 줄 — 무엇이 새롭고 왜 중요한지 */
  coreInsight: string;
  proposals: DirectionProposal[];
}
