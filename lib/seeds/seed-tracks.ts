// HERMES 씨앗 → 콘텐츠 생성 트랙 프로파일.
// 종류별 분기(생성 API·triage UI·발행 흐름)가 흩어지지 않도록 정의를 한 곳에 모은다.
// 서버(app/api/seeds/generate)·클라이언트(SeedTriage) 양쪽에서 import하므로 순수 모듈로 유지.

export type SeedTrack = 'case' | 'trend' | 'tool' | 'prompt' | 'guide';

export interface SeedTrackProfile {
  track: SeedTrack;
  /** triage 생성 버튼 라벨 */
  label: string;
  /** 버튼 묶음: 콘텐츠(case/trend) vs 자료실(tool/prompt/guide) */
  group: 'content' | 'library';
  /** 적재 테이블 */
  target: 'contents' | 'tools';
  /**
   * 기획주도 여부. true면 생성 전에 운영자가 기획 각도(content_seeds.note)를 적도록 유도하고
   * 그 각도를 AI 생성 프롬프트에 주입한다(케이스).
   */
  planningFirst: boolean;
}

export const SEED_TRACKS: SeedTrackProfile[] = [
  { track: 'trend', label: '트렌드로 생성', group: 'content', target: 'contents', planningFirst: false },
  { track: 'case', label: '케이스로 생성', group: 'content', target: 'contents', planningFirst: true },
  { track: 'tool', label: 'AI 도구로 생성', group: 'library', target: 'tools', planningFirst: false },
  { track: 'prompt', label: '프롬프트로 생성', group: 'library', target: 'tools', planningFirst: false },
  { track: 'guide', label: '가이드로 생성', group: 'library', target: 'tools', planningFirst: false },
];

const BY_TRACK = new Map<SeedTrack, SeedTrackProfile>(SEED_TRACKS.map((p) => [p.track, p]));

export function isSeedTrack(v: unknown): v is SeedTrack {
  return typeof v === 'string' && BY_TRACK.has(v as SeedTrack);
}

export function seedTrackProfile(track: SeedTrack): SeedTrackProfile {
  return BY_TRACK.get(track)!;
}
