import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { rewriteSlide, rewriteSlideVariants, type CardSource } from '@/lib/cardpress/generate';
import type { ContentRowLite, SeedRowLite } from '@/lib/cardpress/mapping';
import type { CardTemplateId } from '@/types/cardpress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 검수 UI의 슬라이드 단건 재작성 — 템플릿 교체(대안 제시) 또는 "AI로 다시 쓰기".
// body: { sourceId, sourceSection, template, instruction? } → { template, props }
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
    sourceType?: 'content' | 'seed';
    sourceId?: string;
    sourceSection?: string;
    template?: CardTemplateId;
    instruction?: string;
    /** AI 수정 초안 모드 — 현재 props + 수정 방향으로 서로 다른 후보 count개 */
    currentProps?: Record<string, unknown>;
    count?: number;
  };
  if (!body.sourceId || !body.sourceSection || !body.template)
    return NextResponse.json({ error: 'sourceId·sourceSection·template 필요' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  let source: CardSource;
  if (body.sourceType === 'seed') {
    const { data: seed, error } = await admin
      .from('content_seeds')
      .select('id, title, raw_text, lane, suggested_angle, note, essence, source_url')
      .eq('id', body.sourceId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!seed) return NextResponse.json({ error: '씨앗 없음' }, { status: 404 });
    source = { kind: 'seed', seed: seed as unknown as SeedRowLite };
  } else {
    const { data: content, error } = await admin
      .from('contents')
      .select('id, track, title, summary, slug, thumbnail_url, read_min, apply_min, body, status')
      .eq('id', body.sourceId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!content) return NextResponse.json({ error: '콘텐츠 없음' }, { status: 404 });
    source = { kind: 'content', row: content as unknown as ContentRowLite };
  }

  try {
    if (body.count && body.count > 1) {
      const candidates = await rewriteSlideVariants(source, body.sourceSection, body.template, {
        instruction: body.instruction,
        currentProps: body.currentProps,
        count: body.count,
      });
      return NextResponse.json({ candidates });
    }
    const slide = await rewriteSlide(source, body.sourceSection, body.template, body.instruction);
    return NextResponse.json({ slide });
  } catch (e) {
    console.error('[cardpress/rewrite-slide]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'rewrite failed' },
      { status: 500 }
    );
  }
}
