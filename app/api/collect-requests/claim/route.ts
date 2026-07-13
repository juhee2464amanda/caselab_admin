import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyIngestToken } from '@/lib/ingest-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 로컬 HERMES 폴러 → 가장 오래된 pending 요청을 원자적으로 claim.
// 인증: HERMES_INGEST_TOKEN(seeds/ingest 공용 토큰). 미들웨어 PUBLIC_PATHS /api → 토큰으로만 보호.
// 반환: { request } (claim된 1건) 또는 { request: null } (대기 없음).
export async function POST(req: NextRequest) {
  try {
    if (!verifyIngestToken(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const admin = createSupabaseAdminClient();
  // claim_collect_request(): pending 1건을 claimed로 전환하며 반환(for update skip locked).
  const { data, error } = await admin.rpc('claim_collect_request');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const request = Array.isArray(data) ? data[0] ?? null : data ?? null;
  return NextResponse.json({ request });
}
