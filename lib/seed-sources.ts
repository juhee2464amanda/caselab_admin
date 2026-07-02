// HERMES 씨앗 출처(provenance) 정의 — "어디서 왔나".
// lib/seed-curation.ts(버킷=용도, "무엇에 쓸까")와 짝이 되는 순수 모듈. 서버/클라 양쪽 import.
// source_type은 채점기(scoreSeed)에 prior 힌트만 주고, 실제 버킷은 내용으로 판단(강제 아님).

import type { SeedBucket } from '@/lib/seed-curation';

export type SeedSource =
  | 'ai-briefing'
  | 'service-scout'
  | 'youtube'
  | 'community'
  | 'blog'
  | 'instagram'
  | 'slack-brief'
  | 'manual';

export interface SourceProfile {
  key: SeedSource;
  /** 화면·문서용 이름 */
  label: string;
  /** 카드/헤더에 붙는 짧은 배지(이모지+한글) */
  badge: string;
  /** 이 출처가 보통 흘러드는 버킷(채점 힌트용). null = 자유분류 */
  bucketHint: SeedBucket | null;
  /** 수집 기준(HERMES가 무엇을 이 lane에 올려야 하나) */
  criteria: string;
}

// 소스 카탈로그(= seed-source-spec.md의 표와 동일 정의).
export const SOURCES: SourceProfile[] = [
  {
    key: 'ai-briefing',
    label: 'AI 브리핑',
    badge: '📰 AI브리핑',
    bucketHint: 'trend',
    criteria: 'AI 업계 새 발표·모델·정책·화제. 직무인에게 시사점 있는 것.',
  },
  {
    key: 'service-scout',
    label: '서비스 스카우트',
    badge: '🛠 서비스',
    bucketHint: 'service',
    criteria: '새로 나와 입소문 나는 AI 서비스/도구. 실무 적용 가능한 것.',
  },
  {
    key: 'youtube',
    label: '유튜브 댓글',
    badge: '🎬 유튜브',
    bucketHint: 'painpoint',
    criteria: '직무·AI 관련 영상 댓글에서 반복되는 막힘·불만·needs.',
  },
  {
    key: 'community',
    label: '커뮤니티',
    badge: '💬 커뮤니티',
    bucketHint: 'painpoint',
    criteria: '커리어리·아웃스탠딩·Reddit·오픈카톡 등 실무 고충 스레드.',
  },
  {
    key: 'blog',
    label: '블로그',
    badge: '✍️ 블로그',
    bucketHint: 'painpoint',
    criteria: '실무 후기·문제 서술형 포스트(RSS 기반, 가장 안정적).',
  },
  {
    key: 'instagram',
    label: '인스타 댓글',
    badge: '📷 인스타',
    bucketHint: 'painpoint',
    criteria: '릴스·게시물 댓글의 needs. 공식 API 부재 → 수동 보조.',
  },
  {
    key: 'slack-brief',
    label: 'Slack 브리핑',
    badge: '💬 브리핑',
    bucketHint: null,
    criteria: '기존 범용 브리핑(하위호환). AI가 내용으로 자유분류.',
  },
  {
    key: 'manual',
    label: '수동 적재',
    badge: '✋ 수동',
    bucketHint: null,
    criteria: '운영자가 admin에서 직접 적재.',
  },
];

// Slack lane(채널) → source_type 매핑.
// 신규 소스 추가 = 이 맵에 한 줄 + Slack 채널 + SLACK_HERMES_CHANNELS env 한 항목.
export const LANE_SOURCE: Record<string, SeedSource> = {
  'ai-briefing': 'ai-briefing',
  'service-scout': 'service-scout',
  'painpoint-youtube': 'youtube',
  'painpoint-community': 'community',
  'painpoint-blog': 'blog',
  'painpoint-instagram': 'instagram',
};

/** lane 라벨을 source_type으로 변환. 미지정 lane은 'slack-brief'로 폴백(하위호환). */
export function sourceFromLane(lane: string | null | undefined): SeedSource {
  return (lane && LANE_SOURCE[lane]) || 'slack-brief';
}

export function sourceProfile(key: string | null | undefined): SourceProfile | undefined {
  return SOURCES.find((s) => s.key === key);
}

export function isSeedSource(v: unknown): v is SeedSource {
  return typeof v === 'string' && SOURCES.some((s) => s.key === v);
}
