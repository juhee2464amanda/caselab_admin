import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renderEnabledSlides, renderEndingSlide, uploadSlides } from '@/lib/cardpress/publish';
import { sendSelfDm, type DmItem } from '@/lib/cardpress/dm';
import { endingFor } from '@/lib/cardpress/endings';
import type { CardCtaType } from '@/lib/cardpress/cta-endings';
import type { CardAccent, CardSlide } from '@/types/cardpress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 렌더 10여 장 + DM 한 통씩 전송 (Hobby 상한이 300이라 넘기면 배포가 조용히 실패한다)

// 내 인스타 DM으로 카드 이미지 + 캡션 보내기 — 폰에서 직접 올려야 할 때의 zip 대체 경로.
// body: { cardId }
// 발행과 같은 렌더·업로드 파이프라인을 타서 DM으로 받은 그림과 실제 발행물이 어긋나지 않는다.
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
    .select('id, accent, slides, ig_caption, cta_type, cta_keyword')
    .eq('id', body.cardId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!card) return NextResponse.json({ error: '카드 없음' }, { status: 404 });

  try {
    // 1. 활성 슬라이드 렌더 → 공개 버킷 업로드 (DM 첨부도 공개 URL을 요구한다)
    const rendered = await renderEnabledSlides(
      card.id,
      card.accent as CardAccent,
      card.slides as CardSlide[]
    );
    const urls = await uploadSlides(admin, rendered);
    const items: DmItem[] = urls.map((url) => ({ kind: 'image' as const, url }));

    // 2. 엔딩 카드 — 발행·zip과 같은 규칙으로 맨 뒤에 붙인다(폰에서 순서대로 올리면 그대로 맞게).
    const ending = endingFor((card.cta_type as CardCtaType) ?? 'channel_intro', {
      ctaKeyword: card.cta_keyword as string | null,
    });
    if (ending.kind === 'video') items.push({ kind: 'video', url: ending.videoUrl });
    else if (ending.kind === 'image') items.push({ kind: 'image', url: ending.imageUrl });
    else {
      const endSlide = await renderEndingSlide(
        card.id,
        card.accent as CardAccent,
        ending.template,
        ending.props,
        rendered.length + 1
      );
      const [endingUrl] = await uploadSlides(admin, [endSlide]);
      items.push({ kind: 'image', url: endingUrl });
    }

    // 3. 이미지 → 캡션 순서로 내 DM에 전송
    const result = await sendSelfDm(items, (card.ig_caption as string | null) ?? '');

    return NextResponse.json({
      images: result.images,
      captionParts: result.captionParts,
      // 매번 대화 목록을 뒤지지 않도록 .env.local(INSTAGRAM_SELF_IGSID)에 박아둘 수 있게 돌려준다
      igsid: result.igsid,
    });
  } catch (e) {
    console.error('[cardpress/dm]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'dm failed' }, { status: 500 });
  }
}
