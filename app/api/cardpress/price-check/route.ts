import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyCardPrices } from '@/lib/cardpress/price-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 발행 직전 가격 재검증 — 카드 속 가격 vs 소스 공식 사이트 현재가 (경고용, 차단 아님)
// body: { cardId }
export async function POST(req: NextRequest) {
  const devBypass =
    process.env.NODE_ENV !== 'production' && req.headers.get('x-cardpress-dev') === '1';
  if (!devBypass) {
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
  }

  const body = (await req.json()) as { cardId?: string };
  if (!body.cardId) return NextResponse.json({ error: 'cardId 필요' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: card, error } = await admin
    .from('content_cards')
    .select('source_type, source_id, slides, ig_caption, threads_text')
    .eq('id', body.cardId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!card) return NextResponse.json({ error: '카드 없음' }, { status: 404 });

  return NextResponse.json(await verifyCardPrices(admin, card));
}
