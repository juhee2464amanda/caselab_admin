import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/seeds/adopt — 아카이브에서 손으로 고른 씨앗을 작업실 대상으로 채택.
// raw/rejected → adopted. target='raw'면 채택 해제(작업실 고정 그룹에서 뺌).
// 생성중/발행된 씨앗은 상태를 건드리지 않는다(전환 대상: raw·rejected·adopted).
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { seedIds?: string[]; target?: 'adopted' | 'raw' };
  const ids = (body.seedIds ?? []).filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: 'seedIds required' }, { status: 400 });
  const target = body.target === 'raw' ? 'raw' : 'adopted';

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('content_seeds')
    .update({ status: target })
    .in('id', ids)
    .in('status', ['raw', 'rejected', 'adopted'])
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: data?.length ?? 0 });
}
