import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RenderSlideSchema } from '@/types/cardpress';
import type { ReactElement } from 'react';
import { renderSlide, CARD_W, CARD_H } from '@/lib/cardpress/templates';
import { loadCardFonts } from '@/lib/cardpress/fonts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 슬라이드 1장 → 1080×1350 PNG. 검수 프리뷰·발행 업로드 공용 렌더러.
// body: { template: 'C1'|'B2'|'P1'|..., accent: 'cat-case'|..., props: {...} }
export async function POST(req: NextRequest) {
  // admin 인증 (app/api/studio/refine/route.ts 패턴) — 로컬 렌더 검증용 dev 우회 헤더만 예외
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

  const parsed = RenderSlideSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid slide payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    return new ImageResponse(renderSlide(parsed.data) as ReactElement, {
      width: CARD_W,
      height: CARD_H,
      fonts: await loadCardFonts(),
      emoji: 'twemoji',
    });
  } catch (e) {
    console.error('[cardpress/render]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'render failed' },
      { status: 500 }
    );
  }
}
