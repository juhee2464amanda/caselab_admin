import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// admin '테스트 발송' — 특정 ebook을 호출 admin 본인 이메일로 즉시 발송.
// 설계(Option A): purchases에 status='pending' 임시행 insert → 본사이트 DB 트리거
// (send_ebook_after_purchase, 0015)가 send-ebook Edge Function을 자동 호출 → 메일 발송.
// 함수/배포 변경 0. metadata.test=true 로 격리(매출·고객 집계에서 제외).
export async function POST(req: NextRequest) {
  try {
    // 1. 호출자 admin 검증 (upload-ebook과 동일 패턴)
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (!user.email) return NextResponse.json({ error: '발송할 admin 이메일이 없어요.' }, { status: 400 });

    // 2. 입력 + 발송 가능 검증
    const { product_id } = await req.json();
    if (!product_id) return NextResponse.json({ error: 'product_id가 필요해요.' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data: prod } = await admin
      .from('products')
      .select('id, pdf_path, title')
      .eq('id', product_id)
      .maybeSingle();
    if (!prod) return NextResponse.json({ error: '해당 ebook을 찾을 수 없어요.' }, { status: 404 });
    if (!prod.pdf_path) return NextResponse.json({ error: 'PDF가 연결돼 있지 않아요 — 먼저 PDF를 첨부하세요.' }, { status: 400 });

    // 3. 임시 purchase insert → 트리거가 자동 발송
    const { data: row, error: insErr } = await admin
      .from('purchases')
      .insert({
        product_id,
        email: user.email,
        name: '[테스트]',
        amount: 0,
        status: 'pending',
        metadata: { test: true, by: user.id },
      })
      .select('id')
      .single();
    if (insErr || !row) return NextResponse.json({ error: `발송 요청 실패: ${insErr?.message}` }, { status: 500 });

    return NextResponse.json({ ok: true, purchase_id: row.id, email: user.email });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
