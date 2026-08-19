import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RenderSlideSchema } from '@/types/cardpress';
import type { ReactElement } from 'react';
import { renderSlide, renderThumb16x9, CARD_W, CARD_H, THUMB_W, THUMB_H } from '@/lib/cardpress/templates';
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

  // size: '4x5'(기본, 카드뉴스) | '16x9'(콘텐츠 썸네일 — 본가 카드가 16:9로 크롭한다)
  const body = (await req.json()) as Record<string, unknown>;
  const wide = body.size === '16x9';
  const parsed = RenderSlideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid slide payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  if (wide && parsed.data.template !== 'C1') {
    return NextResponse.json({ error: '16:9는 C1 커버만 지원합니다' }, { status: 400 });
  }

  try {
    const node = wide ? renderThumb16x9(parsed.data) : renderSlide(parsed.data);
    return new ImageResponse(node as ReactElement, {
      width: wide ? THUMB_W : CARD_W,
      height: wide ? THUMB_H : CARD_H,
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
