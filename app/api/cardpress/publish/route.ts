import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  renderEnabledSlides,
  uploadSlides,
  publishInstagramCarousel,
  publishThreads,
} from '@/lib/cardpress/publish';
import type { CardAccent, CardSlide } from '@/types/cardpress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 렌더 10여 장 + IG 컨테이너 처리 대기 포함

// 원클릭 채널 발행 (spec §3-③)
// body: { cardId, channels: ('instagram'|'threads')[], dryRun?: boolean }
// dryRun: 렌더+버킷 업로드까지만 (발행 전 공개 URL 검수용) — Meta 토큰 없이도 동작.
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

  const body = (await req.json()) as {
    cardId?: string;
    channels?: Array<'instagram' | 'threads'>;
    dryRun?: boolean;
  };
  if (!body.cardId) return NextResponse.json({ error: 'cardId 필요' }, { status: 400 });
  const channels = body.channels ?? [];
  if (!body.dryRun && channels.length === 0)
    return NextResponse.json({ error: '발행 채널을 선택하세요' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: card, error } = await admin
    .from('content_cards')
    .select('*')
    .eq('id', body.cardId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!card) return NextResponse.json({ error: '카드 없음' }, { status: 404 });

  try {
    // 1. 활성 슬라이드 일괄 렌더 → 공개 버킷 업로드
    const rendered = await renderEnabledSlides(
      card.id,
      card.accent as CardAccent,
      card.slides as CardSlide[]
    );
    const urls = await uploadSlides(admin, rendered);

    if (body.dryRun) {
      return NextResponse.json({ dryRun: true, images: urls });
    }

    // 2. 채널 발행 (부분 실패 허용 — 성공한 채널만 이력 기록)
    const publishedTo: Array<{ channel: string; post_id: string; at: string }> = [
      ...((card.published_to as Array<{ channel: string; post_id: string; at: string }>) ?? []),
    ];
    const errors: string[] = [];

    if (channels.includes('instagram')) {
      try {
        const postId = await publishInstagramCarousel(urls, card.ig_caption ?? '');
        publishedTo.push({ channel: 'instagram', post_id: postId, at: new Date().toISOString() });
      } catch (e) {
        errors.push(`instagram: ${(e as Error).message}`);
      }
    }
    if (channels.includes('threads')) {
      try {
        const postId = await publishThreads(card.threads_text ?? '', card.threads_cover ?? urls[0]);
        publishedTo.push({ channel: 'threads', post_id: postId, at: new Date().toISOString() });
      } catch (e) {
        errors.push(`threads: ${(e as Error).message}`);
      }
    }

    const anySuccess = publishedTo.length > ((card.published_to as unknown[])?.length ?? 0);
    if (anySuccess) {
      const { error: updateError } = await admin
        .from('content_cards')
        .update({ published_to: publishedTo, status: 'published' })
        .eq('id', card.id);
      if (updateError) errors.push(`이력 기록 실패: ${updateError.message}`);
    }

    return NextResponse.json({
      images: urls,
      published_to: publishedTo,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    console.error('[cardpress/publish]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'publish failed' },
      { status: 500 }
    );
  }
}
