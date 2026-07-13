import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 수집 요청 큐 — admin '지금 수집 요청' 버튼용(브라우저 세션 인증).
// 클라이언트가 pending 1건을 남기면, 로컬 HERMES 폴러가 /api/collect-requests/claim으로 집어간다.
// 로컬 트리거 모델이라 서버는 큐만 관리(수집 지능은 로컬 caselab-scout).

// 관리자 세션 검증 — seeds/create·generate와 동일 패턴.
async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin')
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { user };
}

// POST — 수집 요청 생성. 이미 미완료(pending/claimed) 요청이 있으면 그걸 반환(중복 큐 방지).
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let lanes: string[] = [];
  try {
    const body = (await req.json()) as { lanes?: unknown };
    if (Array.isArray(body?.lanes)) lanes = body.lanes.filter((l): l is string => typeof l === 'string');
  } catch {
    // 바디 없음 = 전체 레인 요청. lanes=[]
  }

  const admin = createSupabaseAdminClient();

  // 미완료 요청이 있으면 새로 만들지 않고 그대로 반환(버튼 연타·다중 탭 대비).
  const { data: open } = await admin
    .from('seed_collect_requests')
    .select('*')
    .in('status', ['pending', 'claimed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) return NextResponse.json({ request: open, existing: true });

  const { data, error } = await admin
    .from('seed_collect_requests')
    .insert({ created_by: auth.user!.id, lanes })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ request: data, existing: false });
}

// GET — 최신 요청 1건(버튼 상태 폴링용).
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('seed_collect_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ request: data ?? null });
}
