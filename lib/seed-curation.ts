// HERMES 씨앗 큐레이션 기준 — 목적 버킷 정의 + 채점 rubric.
// AI 채점기(lib/ai-draft.ts::scoreSeed)·채점 API·/admin/seeds 화면이 공유하는 단일 정의.
// 서버/클라이언트 양쪽 import → 순수 모듈로 유지.
//
// [주의] 버킷은 더 이상 UI 컬럼/트랙을 "라우팅"하지 않는다. /admin/seeds는 통합 인박스이고
// 버킷은 필터 facet + 추천 트랙 힌트로만 쓰인다(soft prior). defaultTrack·sources는 권고 메타.
// 운영자는 어느 소스·버킷 씨앗이든 원하는 콘텐츠 트랙으로 자유롭게 생성한다.

import type { SeedTrack } from '@/lib/seed-tracks';
import type { SeedSource } from '@/lib/seed-sources';

export type SeedBucket = 'trend' | 'service' | 'painpoint' | 'etc';

export interface BucketProfile {
  key: SeedBucket;
  emoji: string;
  label: string;
  /** 이 버킷에서 기본 제안되는 타깃 콘텐츠 트랙(운영자가 생성 시 바꿀 수 있음) */
  defaultTrack: SeedTrack;
  /** 채점 4축 가중치(합 100). AI 프롬프트와 화면 설명에 동일하게 노출. */
  weights: { timeliness: number; practical: number; fit: number; trust: number };
  /** AI가 이 버킷으로 분류하는 기준 설명(프롬프트용) */
  criteria: string;
  /** 이 버킷을 먹이는 소스(화면 헤더에 "어디서 오나" 노출). lib/seed-sources.ts */
  sources: SeedSource[];
}

// 노출 가능한 3버킷(+'etc'는 숨김). 화면 컬럼 순서이기도 함.
export const BUCKETS: BucketProfile[] = [
  {
    key: 'trend',
    emoji: '🔵',
    label: 'AI Trends',
    defaultTrack: 'trend',
    weights: { timeliness: 40, practical: 30, fit: 20, trust: 10 },
    criteria: 'AI 업계의 새 소식·발표·동향. 지금 화제이고 직무인에게 시사점이 있는 것.',
    sources: ['ai-briefing'],
  },
  {
    key: 'service',
    emoji: '🟢',
    label: 'Trending Services',
    defaultTrack: 'tool',
    weights: { timeliness: 25, practical: 35, fit: 25, trust: 15 },
    criteria: '새로 나와 입소문 나는 쓸만한 AI 서비스/도구. 실무에 바로 적용 가능한 것.',
    sources: ['service-scout'],
  },
  {
    key: 'painpoint',
    emoji: '🟠',
    label: 'User Pain Points',
    defaultTrack: 'case',
    weights: { timeliness: 15, practical: 40, fit: 30, trust: 15 },
    criteria: '직무인이 겪는 구체적 막힘/문제. 실전 케이스로 풀어낼 소재가 되는 것.',
    sources: ['youtube', 'community', 'blog', 'instagram'],
  },
];

export const HIDDEN_BUCKET: SeedBucket = 'etc'; // 광고·루머·중복·off-topic

/** 노출 규칙 */
export const SCORE_CUT = 60; // 미만은 숨김
export const WINDOW_HOURS = 72; // D-3
export const TOP_N = 5; // 버킷별 최대 노출

export const VISIBLE_BUCKETS = BUCKETS.map((b) => b.key);

export function bucketProfile(key: string | null | undefined): BucketProfile | undefined {
  return BUCKETS.find((b) => b.key === key);
}

export function isSeedBucket(v: unknown): v is SeedBucket {
  return v === 'trend' || v === 'service' || v === 'painpoint' || v === 'etc';
}
