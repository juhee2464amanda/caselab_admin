import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renderEnabledSlides, renderEndingSlide, uploadSlides } from '@/lib/cardpress/publish';
import { signCard, lanOrigin } from '@/lib/cardpress/handoff';
import { coverImageOf, endingFor } from '@/lib/cardpress/endings';
import type { CardCtaType } from '@/lib/cardpress/cta-endings';
import type { CardAccent, CardSlide, EndingProps } from '@/types/cardpress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 렌더 10여 장 (Hobby 상한 300 — 넘기면 배포가 조용히 실패한다)

// 폰으로 넘기기 — 발행과 같은 파이프라인으로 렌더·업로드한 뒤, 그 카드를 모아 보여주는
// 서명된 링크를 돌려준다. 실제 화면은 app/m/[cardId]/page.tsx.
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
    .select('id, accent, slides, cta_type, cta_keyword, ending_props')
    .eq('id', body.cardId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!card) return NextResponse.json({ error: '카드 없음' }, { status: 404 });

  try {
    const rendered = await renderEnabledSlides(
      card.id,
      card.accent as CardAccent,
      card.slides as CardSlide[]
    );
    const urls = await uploadSlides(admin, rendered);
    const keep = new Set(rendered.map((r) => r.path.split('/').pop() as string));

    // 엔딩 카드 — 발행·zip과 같은 규칙으로 맨 뒤. 영상 엔딩은 버킷의 고정 자산이라 그대로 쓴다.
    const ending = endingFor((card.cta_type as CardCtaType) ?? 'channel_intro', {
      ctaKeyword: card.cta_keyword as string | null,
      accent: card.accent as CardAccent | null,
      coverImage: coverImageOf(card.slides as CardSlide[]),
      overrides: card.ending_props as EndingProps | null,
    });
    if (ending.kind === 'slide') {
      const endSlide = await renderEndingSlide(
        card.id,
        card.accent as CardAccent,
        ending.template,
        ending.props,
        rendered.length + 1
      );
      await uploadSlides(admin, [endSlide]);
      keep.add(endSlide.path.split('/').pop() as string);
    }

    // 이전 렌더의 잔재를 지운다. 파일명이 `03_B2.png`처럼 **템플릿까지** 들어가서, 슬라이드를 바꾸면
    // 같은 자리에 옛 파일이 그대로 남는다 → 폰 화면이 이 폴더를 그대로 읽으므로 옛 카드가 섞여 보인다.
    // 발행된 게시물은 Meta가 자체 복사본을 갖고 있어서 여기서 지워도 영향이 없다.
    const { data: existing } = await admin.storage.from('cardpress').list(card.id, { limit: 200 });
    const stale = (existing ?? []).filter((f) => !keep.has(f.name)).map((f) => `${card.id}/${f.name}`);
    if (stale.length) {
      const { error: rmError } = await admin.storage.from('cardpress').remove(stale);
      if (rmError) console.warn('[cardpress/handoff] 잔재 정리 실패', rmError.message);
      else console.log(`[cardpress/handoff] 이전 렌더 ${stale.length}개 정리`, stale.map((s) => s.split('/').pop()).join(', '));
    }

    return NextResponse.json({
      path: `/m/${card.id}?t=${signCard(card.id)}`,
      // 로컬에서는 localhost 링크가 폰에서 안 열린다 → 같은 와이파이용 주소도 같이 준다.
      lanOrigin: process.env.NODE_ENV === 'production' ? null : lanOrigin(),
      count: urls.length + 1,
    });
  } catch (e) {
    console.error('[cardpress/handoff]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'handoff failed' },
      { status: 500 }
    );
  }
}
