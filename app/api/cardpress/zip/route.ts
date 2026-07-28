import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renderEnabledSlides } from '@/lib/cardpress/publish';
import type { CardAccent, CardSlide } from '@/types/cardpress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// zip 일괄 다운로드 — 수동 업로드 백업 옵션 (spec §3-③)
// GET ?cardId=
export async function GET(req: NextRequest) {
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

  const cardId = req.nextUrl.searchParams.get('cardId');
  if (!cardId) return NextResponse.json({ error: 'cardId 필요' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: card, error } = await admin
    .from('content_cards')
    .select('id, accent, slides, ig_caption, threads_text')
    .eq('id', cardId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!card) return NextResponse.json({ error: '카드 없음' }, { status: 404 });

  try {
    const rendered = await renderEnabledSlides(
      card.id,
      card.accent as CardAccent,
      card.slides as CardSlide[]
    );
    const zip = new JSZip();
    for (const [i, r] of rendered.entries())
      zip.file(`${String(i + 1).padStart(2, '0')}_${r.template}.png`, r.buffer);
    if (card.ig_caption) zip.file('caption.txt', card.ig_caption);
    if (card.threads_text) zip.file('threads.txt', card.threads_text);
    const buf = await zip.generateAsync({ type: 'nodebuffer' });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="cardpress-${card.id.slice(0, 8)}.zip"`,
      },
    });
  } catch (e) {
    console.error('[cardpress/zip]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'zip failed' },
      { status: 500 }
    );
  }
}
