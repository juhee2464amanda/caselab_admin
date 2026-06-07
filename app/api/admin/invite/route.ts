import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// D47 — editor 이메일 초대. 호출자 admin 검증 후 Auth Admin API로 초대 + role=editor 부여.
export async function POST(req: NextRequest) {
  try {
    // 1. 호출자 admin 검증
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { email, name } = await req.json();
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: '올바른 이메일을 입력하세요.' }, { status: 400 });
    }

    // 2. Auth Admin API 초대
    const admin = createSupabaseAdminClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email.trim(), {
      redirectTo: siteUrl ? `${siteUrl}/auth/callback?next=/admin` : undefined,
      data: { invited_as: 'editor' },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // 3. role=editor 부여 (profile은 handle_new_user 트리거로 생성됨)
    const invitedId = data.user?.id;
    if (invitedId) {
      await admin.from('profiles').update({ role: 'editor', name: name?.trim() || null }).eq('id', invitedId);
    }

    return NextResponse.json({ ok: true, email: email.trim() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
