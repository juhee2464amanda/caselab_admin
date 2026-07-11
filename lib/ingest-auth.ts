import crypto from 'crypto';
import type { NextRequest } from 'next/server';

// 외부 적재 API 공유 토큰 검증 — seeds/ingest·assets/ingest 공용.
// 로컬(HERMES 크론·Claude Code 스킬) → admin 방향의 단일 신뢰 도메인이라 토큰 1개를 공유한다.
export function verifyIngestToken(req: NextRequest): boolean {
  const expected = (process.env.HERMES_INGEST_TOKEN ?? '').trim();
  if (!expected) throw new Error('HERMES_INGEST_TOKEN missing');
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!got) return false;
  // sha256으로 길이를 맞춰 timingSafeEqual (길이 불일치 예외·타이밍 누출 방지)
  const a = crypto.createHash('sha256').update(got).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
