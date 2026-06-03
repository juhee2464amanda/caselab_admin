import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Resend Webhook 수신 (스켈레톤 — Phase 2)
 * 발송 결과(delivered, bounced, complained)를 받아 purchases.status 업데이트.
 */
export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: false }, { status: 400 });
  // TODO Phase 2: signature 검증 + purchases.status 업데이트
  return NextResponse.json({ ok: true, received: payload.type ?? null });
}
