import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renderEnabledSlides, renderEndingSlide } from '@/lib/cardpress/publish';
import { endingFor } from '@/lib/cardpress/endings';
import type { CardCtaType } from '@/lib/cardpress/cta-endings';
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
    .select('id, accent, slides, ig_caption, threads_text, cta_type, cta_keyword')
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

    // 엔딩 카드 — 발행 경로와 같은 규칙으로 마지막 칸에 넣는다(수동 업로드해도 순서가 같게).
    // 영상 엔딩은 버킷의 고정 자산을 그대로 담는다.
    const n = rendered.length + 1;
    const ending = endingFor((card.cta_type as CardCtaType) ?? 'channel_intro', {
      ctaKeyword: card.cta_keyword as string | null,
    });
    if (ending.kind === 'video' || ending.kind === 'image') {
      const url = ending.kind === 'video' ? ending.videoUrl : ending.imageUrl;
      const ext = ending.kind === 'video' ? 'mp4' : 'png';
      const res = await fetch(url);
      if (res.ok)
        zip.file(`${String(n).padStart(2, '0')}_ending.${ext}`, Buffer.from(await res.arrayBuffer()));
      else zip.file('ending_ERROR.txt', `엔딩 자산을 받지 못했습니다: ${url} (${res.status})`);
    } else {
      const endSlide = await renderEndingSlide(
        card.id,
        card.accent as CardAccent,
        ending.template,
        ending.props,
        n
      );
      zip.file(`${String(n).padStart(2, '0')}_ending_${ending.template}.png`, endSlide.buffer);
    }

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
