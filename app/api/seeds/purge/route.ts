import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { RETENTION_DAYS, MAX_UNUSED_SEEDS } from '@/lib/seed-curation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 씨앗 아카이브 자동 정리(신선도 기반).
//  ① 14일(RETENTION_DAYS) 지난 미사용 씨앗 삭제
//  ② 미사용 씨앗이 상한(MAX_UNUSED_SEEDS) 초과 시 오래된 것부터 삭제(용량 방어)
// 대상 = status in (raw, rejected) AND content_id/tool_id 미연결. 콘텐츠가 된 씨앗은 절대 삭제 안 함.
// 실행 = Vercel Cron(GET + Authorization: Bearer CRON_SECRET) 또는 admin 수동(POST, 아카이브 '정리' 버튼).

async function authorize(req: NextRequest): Promise<{ ok: true } | { ok: false; status: number }> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (cronSecret && auth === `Bearer ${cronSecret}`) return { ok: true }; // Vercel Cron

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return { ok: false, status: 403 };
  return { ok: true };
}

// 큰 배열도 안전하게 청크 삭제.
async function deleteByIds(admin: ReturnType<typeof createSupabaseAdminClient>, ids: string[]) {
  for (let i = 0; i < ids.length; i += 200) {
    await admin.from('content_seeds').delete().in('id', ids.slice(i, i + 200));
  }
}

async function purge() {
  const admin = createSupabaseAdminClient();
  // 미사용 필터를 매 쿼리에 동일 적용(콘텐츠 연결·진행중은 제외).
  const unused = () =>
    admin
      .from('content_seeds')
      .select('id')
      .in('status', ['raw', 'rejected'])
      .is('content_id', null)
      .is('tool_id', null);

  // ① 나이 기반
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  const { data: aged } = await unused().lt('created_at', cutoff);
  const agedIds = (aged ?? []).map((r) => r.id as string);
  await deleteByIds(admin, agedIds);

  // ② 용량 기반(나이 삭제 후 남은 미사용이 상한 초과면 오래된 것부터)
  const { data: rest } = await unused().order('created_at', { ascending: false });
  const overflow = (rest ?? []).map((r) => r.id as string).slice(MAX_UNUSED_SEEDS);
  await deleteByIds(admin, overflow);

  return { deletedByAge: agedIds.length, deletedByCapacity: overflow.length };
}

async function handle(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: auth.status });
  try {
    const result = await purge();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle; // Vercel Cron
export const POST = handle; // 수동(admin)
