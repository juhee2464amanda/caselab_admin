import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 구독자 수동 해지 — 운영자가 수신거부 문의를 처리하는 경로.
// newsletter_subscribers는 RLS에 update 정책이 없어 service-role로 처리(웹훅·seeds 패턴).
// DB 트리거(본가 0014/0019)가 Brevo 해지까지 전파하므로 상태만 바꾸면 된다.
export async function POST(req: NextRequest) {
  // admin 인증 (seeds/create 패턴)
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

  const body = (await req.json()) as { kind?: string; id?: string };
  if (!body.id || (body.kind !== 'member' && body.kind !== 'guest')) {
    return NextResponse.json({ error: 'kind(member|guest)·id 필수' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } =
    body.kind === 'guest'
      ? await admin.from('newsletter_subscribers').update({ status: 'unsubscribed' }).eq('id', body.id)
      : await admin.from('profiles').update({ newsletter: false }).eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
