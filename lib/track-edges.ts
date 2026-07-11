// 트랙별 "엣지 프로파일" — 본가 상세 목업 스터디(2026-07-11)의 응축 정본.
// 같은 소재라도 트랙마다 상세 페이지가 요구하는 각도(edge)가 다르다:
// 케이스=실행 재연, 트렌드=왜 지금·시사점, 도구=팩트카드, 프롬프트=복사 실물, 가이드=링크 카드.
// 출처: caselab/docs/design_mockup/user/{content,trends,tool-proby,prompts,guides}.html
//       + docs/08_content_format_spec.md + types/content.ts(D70)·lib/tool-body.ts
// UI(엣지 카드)·서버(생성 프롬프트 주입) 양쪽에서 import하므로 순수 모듈로 유지.

import type { SeedTrack } from '@/lib/seed-tracks';

export interface TrackEdge {
  track: SeedTrack;
  /** 이 형식의 편집 정체성 한 줄 */
  edge: string;
  /** 상세 페이지에 렌더되는 섹션(목업 라벨 기준)과 각 섹션이 요구하는 것 */
  sections: { name: string; need: string }[];
  /** 이 트랙에 맞는 소재 */
  fits: string;
  /** 재구성할 때 덜어낼 것(다른 트랙 소관 포함) */
  cuts: string;
  /** 생성 프롬프트에 주입하는 형식 준수 지침(목업 스터디에서 추출한 품질 규칙) */
  guide: string;
}

export const TRACK_EDGES: TrackEdge[] = [
  {
    track: 'case',
    edge: '문제 → 프레임워크 → 단계별 실행 → 솔직 후기. "직접 해본 재연"으로 풀어야 하는 형식.',
    sections: [
      { name: '이런 분들을 위한 글이에요', need: '공감되는 구체 상황 3~4개(체크 목록)' },
      { name: '어떤 케이스를 다루나요', need: '케이스의 본질 소개 2~3문단, 1인칭' },
      { name: '막히는 이유', need: '페인포인트 3개 — 문제명·증상·근본 원인' },
      { name: '적용한 Framework', need: '프레임워크 1개 + 설명(출처 링크 선택)' },
      { name: '단계별 AI 활용', need: '스텝 2~5개 — 사람/AI 역할, 복사 가능한 프롬프트 실물, 좋은·별로인 결과' },
      { name: '좋았던 점 · 아쉬웠던 점', need: '각 3~4개, 구체적 경험담(What+Why)' },
      { name: '핵심 Taking point', need: '3개 — 제목·이유·바로 할 행동' },
    ],
    fits: '단계 실행과 결과 비교가 있는 워크플로우·실험 경험담, 프레임워크 적용기',
    cuts: '뉴스성 팩트 나열·산업 동향 해설(→트렌드), 링크 모음(→가이드)',
    guide:
      'stepCards의 prompt는 복사해 바로 쓸 수 있는 실물 프롬프트로. goodResult/badResult는 응답 원문이 아니라 "응답의 특성"(예: 질문 형태 vs 다음 단계를 미리 답함)을 설명. painPoints는 rootCause까지 파고들 것. cons(아쉬웠던 점)를 솔직하게 채워야 신뢰가 생김 — 장점만 나열 금지. takingPoints는 명령형 action으로 마무리.',
  },
  {
    track: 'trend',
    edge: '무슨 소식 → 왜 화두 → 직접 확인한 시사점. 기능 소개가 아니라 "내 일에서 뭐가 달라지나" 검증.',
    sections: [
      { name: '무슨 소식', need: '변화의 요점 2~3문단(스펙 나열 금지, 팩트 기반)' },
      { name: '왜 화두인가', need: '실무와 연결해 왜 지금 주목받는지' },
      { name: '이런 분들에게 중요해요', need: '직무별 role+why 2~4개' },
      { name: '핵심 3가지', need: '짧고 임팩트 있는 요점 3~5개' },
      { name: '좀 더 들어가면', need: '1인칭 심층 — 수치·구체 근거 중심' },
      { name: '내 일엔?', need: '직무별로 다른 적용 액션(일반론 금지)' },
      { name: '참고 자료', need: '실제 확인된 출처 URL 3~5개' },
    ],
    fits: '새 모델·기능 출시, AI 이슈·산업 동향, 도구 비교',
    cuts: '단계별 실행 재연(→케이스), 복사용 프롬프트 모음(→프롬프트)',
    guide:
      'what은 스펙 설명이 아니라 "무엇이 달라졌나"의 요점 — why와 겹치지 않게. deepDive는 수치·구체 근거 중심으로(정성적 감상만 나열 금지). soWhat은 forWho의 직무와 연결해 직무별로 다르게. sources에는 문서에 명시된 실제 URL만(최소한 원출처 1개는 유지).',
  },
  {
    track: 'tool',
    edge: '3분 안에 "언제 쓰나 · 기능 · 가격"을 스캔하고 도구를 고르게 하는 팩트 카드.',
    sections: [
      { name: '어떤 서비스인가요', need: '무엇을 하는 도구인지 2~3문단' },
      { name: '언제 쓰면 좋은가요', need: '사용 시점 2~4개(제목+설명 칩)' },
      { name: '주요 기능', need: '핵심 기능 3~5개(번호 리스트)' },
      { name: '가격', need: '확인된 플랜만 + 하단 주석(불확실하면 생략)' },
    ],
    fits: '특정 도구·서비스의 소개, 기능, 요금, 사용 판단 기준',
    cuts: '개인 사용 후기 서사(→케이스), 방법론·작성법(→가이드/프롬프트)',
    guide:
      '의견·서사는 걷어내고 팩트만: 무엇을 하는지(about) → 언제 쓰는지(whenToUse) → 무엇이 되는지(features) → 얼마인지(pricing). pricing은 문서·리서치로 확인된 것만, 불확실하면 필드 생략. audience는 직무 한 구절.',
  },
  {
    track: 'prompt',
    edge: '복사 한 번이면 끝나는 실물 프롬프트 1개. 설명문이 아니라 명령문 그 자체가 본체.',
    sections: [
      { name: '제목', need: '무엇을 해주는 프롬프트인지 한 줄' },
      { name: '프롬프트 본문', need: '바로 실행되는 실물(변수 최소화)' },
      { name: '사용법', need: '어떻게 쓰는지 1~2문장' },
      { name: '예시', need: '기대 결과·활용 예' },
    ],
    fits: '문서 속 프롬프트 예시·명령문(여럿이면 가장 강한 1개를 선별)',
    cuts: '배경 이론·긴 맥락 설명(description 한 문단으로 압축), 프롬프트 쓰는 법 일반론(→가이드)',
    guide:
      '문서에 프롬프트가 여러 개면 가장 실전적인 1개를 골라 본체로. prompt 본문은 바로 붙여넣어 실행되는 완결형으로(문서의 원문을 살리되 다듬기). howToUse는 짧게, example은 기대 결과의 특성을.',
  },
  {
    track: 'guide',
    edge: '원문 링크 큐레이션 카드 — "이 링크가 뭐고 왜 볼 만한가"를 한눈에. 본문 없음(메타만).',
    sections: [
      { name: '제목', need: '원문(가이드)의 제목' },
      { name: '설명', need: '무엇을 다루고 왜 볼 만한지 1~2문장' },
      { name: 'URL', need: '원출처 링크(확실할 때만)' },
      { name: '분류 태그', need: '제공처(OpenAI/Anthropic 등) 또는 주제 한 단어' },
    ],
    fits: '공식 문서·평판 있는 원문으로 가는 링크(문서의 출처 메모가 재료)',
    cuts: '본문 요약 전체 — 카드는 메타만 담는다',
    guide:
      '문서의 출처 목록에서 가장 원출처에 가까운 링크 1개를 고를 것. description은 독자가 클릭할 이유 1~2문장. url은 문서에 명시된 것만(불확실하면 빈 문자열).',
  },
];

const BY_TRACK = new Map<SeedTrack, TrackEdge>(TRACK_EDGES.map((e) => [e.track, e]));

export function trackEdge(track: SeedTrack): TrackEdge {
  return BY_TRACK.get(track)!;
}
