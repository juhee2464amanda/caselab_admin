import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyIngestToken } from '@/lib/ingest-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 로컬 HERMES 폴러 → claim한 요청을 done/error로 마감.
// 인증: HERMES_INGEST_TOKEN. 바디: { ok: boolean, result_count?: number, error?: string }.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    if (!verifyIngestToken(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { id } = await ctx.params;

  let body: { ok?: boolean; result_count?: number; error?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const ok = body.ok !== false; // 기본 성공
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('seed_collect_requests')
    .update({
      status: ok ? 'done' : 'error',
      completed_at: new Date().toISOString(),
      result_count: ok && typeof body.result_count === 'number' ? body.result_count : null,
      error: ok ? null : body.error ?? 'unknown',
    })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({ request: data });
}
