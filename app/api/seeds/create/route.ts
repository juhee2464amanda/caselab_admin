import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSeedSource } from '@/lib/seed-sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 수동 씨앗 적재 — HERMES lane 없이 운영자가 admin에서 직접 씨앗 투입.
// 웹훅(app/api/slack/hermes-brief)과 동일하게 서버에서 service-role로 insert(RLS 우회).
// slack_ts는 null(unique이나 nullable → NULL 다중 허용, 수동끼리 충돌 없음).
export async function POST(req: NextRequest) {
  // 1) admin 인증 (generate/route.ts 패턴)
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

  // 2) 입력 검증
  const body = (await req.json()) as {
    title?: string;
    raw_text?: string;
    source_url?: string;
    source_type?: string;
    note?: string;
  };
  const title = body.title?.trim();
  const rawText = body.raw_text?.trim();
  if (!title || !rawText) {
    return NextResponse.json({ error: 'title·raw_text 필수' }, { status: 400 });
  }
  const sourceType = isSeedSource(body.source_type) ? body.source_type : 'manual';

  // 3) insert (origin=manual, status=raw, 미채점)
  const admin = createSupabaseAdminClient();
  const { data: seed, error } = await admin
    .from('content_seeds')
    .insert({
      title: title.slice(0, 300),
      raw_text: rawText,
      source_url: body.source_url?.trim() || null,
      source_type: sourceType,
      origin: 'manual',
      status: 'raw',
      note: body.note?.trim() || null,
    })
    .select('id')
    .single();
  if (error || !seed) return NextResponse.json({ error: error?.message ?? 'insert 실패' }, { status: 500 });

  return NextResponse.json({ id: seed.id });
}
