// essence(핵심 요약) 표시용 라벨·행 추출 — 작업실 카드(SeedCuration)와 씨앗 아카이브 상세가 공유.
// essence는 채점(lib/ai-draft::scoreSeed) 때 content_seeds.essence(jsonb)에 적재된다.

// essence 상세 키 라벨(버킷별). headline은 카드 제목으로 이미 노출되므로 제외.
export const ESSENCE_LABELS: Record<string, string> = {
  // service
  what: '무엇',
  feature: '기능',
  category: '카테고리',
  useCase: '누가·효율',
  // trend
  whyNow: '왜 지금',
  implication: 'AI 흐름·시사',
  // painpoint
  who: '대상',
  pain: '페인',
  suggest: '제안 콘텐츠',
};

export function essenceRows(essence: Record<string, string> | null): [string, string][] {
  if (!essence) return [];
  return Object.entries(essence).filter(([k, v]) => k !== 'headline' && v && ESSENCE_LABELS[k]);
}
