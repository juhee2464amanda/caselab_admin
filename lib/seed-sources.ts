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
  /**
   * 이 출처에서 '양질 씨앗'의 필수 신호 — 원문에 이게 있어야 콘텐츠화 가치가 있다.
   * scoreSeed에 주입돼 신호가 없으면 감점, 수동 적재 컴포저에 안내로 노출.
   * null = 특별 신호 없음(자유분류/재량).
   */
  qualitySignal: string | null;
}

// 소스 카탈로그(= seed-source-spec.md의 표와 동일 정의).
export const SOURCES: SourceProfile[] = [
  {
    key: 'ai-briefing',
    label: 'AI 브리핑',
    badge: '📰 AI브리핑',
    bucketHint: 'trend',
    criteria: 'AI 업계 새 발표·모델·정책·화제. 직무인에게 시사점 있는 것.',
    qualitySignal: '공식 발표·모델·정책의 원문 + 구체적 수치·날짜·출처 URL. 단순 추측·소문 아님.',
  },
  {
    key: 'service-scout',
    label: '서비스 스카우트',
    badge: '🛠 서비스',
    bucketHint: 'service',
    criteria: '새로 나와 입소문 나는 AI 서비스/도구. 실무 적용 가능한 것.',
    qualitySignal: '실재하는 서비스 + 실사용 신호(런칭·사용자 반응·트래픽·후기 중 1개+) + 공식 URL. 단순 홍보문구 아님.',
  },
  {
    key: 'youtube',
    label: '유튜브 댓글',
    badge: '🎬 유튜브',
    bucketHint: 'painpoint',
    criteria: '직무·AI 관련 영상 댓글에서 반복되는 막힘·불만·needs.',
    qualitySignal: '실제 사용자 댓글 원문 2개 이상 + 반복되는 막힘/불만 + 영상 링크. 요약만 있고 원문 없으면 약함.',
  },
  {
    key: 'community',
    label: '커뮤니티',
    badge: '💬 커뮤니티',
    bucketHint: 'painpoint',
    criteria: '커리어리·아웃스탠딩·Reddit·오픈카톡 등 실무 고충 스레드.',
    qualitySignal: '실제 고충 원문 인용 + 여러 사람 공감/반복 정황 + 스레드 링크.',
  },
  {
    key: 'blog',
    label: '블로그',
    badge: '✍️ 블로그',
    bucketHint: 'painpoint',
    criteria: '실무 후기·문제 서술형 포스트(RSS 기반, 가장 안정적).',
    qualitySignal: '구체적 상황·맥락이 담긴 실무 후기/문제 서술 본문 + 원문 URL(RSS).',
  },
  {
    key: 'instagram',
    label: '인스타 댓글',
    badge: '📷 인스타',
    bucketHint: 'painpoint',
    criteria: '릴스·게시물 댓글의 needs. 공식 API 부재 → 수동 보조.',
    qualitySignal: '릴스/게시물 댓글의 실제 needs 원문 + 게시물 링크(수동 발췌).',
  },
  {
    key: 'slack-brief',
    label: 'Slack 브리핑',
    badge: '💬 브리핑',
    bucketHint: null,
    criteria: '기존 범용 브리핑(하위호환). AI가 내용으로 자유분류.',
    qualitySignal: null,
  },
  {
    key: 'manual',
    label: '수동 적재',
    badge: '✋ 수동',
    bucketHint: null,
    criteria: '운영자가 admin에서 직접 적재.',
    qualitySignal: null,
  },
];

// Slack lane(채널) → source_type 매핑.
// 신규 소스 추가 = 이 맵에 한 줄 + Slack 채널 + SLACK_HERMES_CHANNELS env 한 항목.
export const LANE_SOURCE: Record<string, SeedSource> = {
  // 신규 소스별 전용 lane
  'ai-briefing': 'ai-briefing',
  'service-scout': 'service-scout',
  'painpoint-youtube': 'youtube',
  'painpoint-community': 'community',
  'painpoint-blog': 'blog',
  'painpoint-instagram': 'instagram',
  // 레거시 lane(현재 HERMES가 실제로 쓰는 이름) → 신규 소스로 흡수.
  //   briefing = 매일 AI 브리핑 → ai-briefing(trend)
  //   scout/analyst = 도구 스카우팅·비교 → service-scout(service)
  briefing: 'ai-briefing',
  scout: 'service-scout',
  analyst: 'service-scout',
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
