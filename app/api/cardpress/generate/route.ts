import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateCardSet } from '@/lib/cardpress/generate';
import type { ContentRowLite } from '@/lib/cardpress/mapping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // AI 재작성 + 재압축 루프 포함 — 구독 CLI 호출이라 넉넉히

// 발행 콘텐츠 → 카드 3종 세트(auto_draft) 생성.
// body: { sourceType: 'content', sourceId: uuid, dryRun?: boolean }
// dryRun: DB에 안 쓰고 생성 결과만 반환 (1020 마이그레이션 적용 전 검증·미리보기용).
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
    sourceType?: 'content' | 'tool';
    sourceId?: string;
    dryRun?: boolean;
    /** 운영자 지정 엣지 — 재생성 시 이 방향을 최우선 축으로 */
    edge?: string;
    /** CTA 유형 (기본 comment_dm) + 댓글 키워드 */
    ctaType?: 'info_save' | 'comment_dm';
    ctaKeyword?: string;
  };
  if (body.sourceType === 'tool')
    return NextResponse.json({ error: 'tool 소스는 다음 단계에서 지원' }, { status: 501 });
  if (body.sourceType !== 'content' || !body.sourceId)
    return NextResponse.json({ error: 'sourceType=content + sourceId 필요' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: content, error } = await admin
    .from('contents')
    .select('id, track, title, summary, slug, thumbnail_url, read_min, apply_min, body, status')
    .eq('id', body.sourceId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!content) return NextResponse.json({ error: '콘텐츠 없음' }, { status: 404 });
  if (content.status !== 'published')
    return NextResponse.json({ error: '발행(published) 콘텐츠만 카드로 만들 수 있어요' }, { status: 409 });

  try {
    const draft = await generateCardSet(content as unknown as ContentRowLite, {
      edge: body.edge?.trim() || undefined,
      ctaType: body.ctaType,
      ctaKeyword: body.ctaKeyword?.trim() || undefined,
    });

    if (body.dryRun) return NextResponse.json({ dryRun: true, draft });

    const row: Record<string, unknown> = {
      source_type: 'content',
      source_id: content.id,
      slides: draft.slides,
      accent: draft.accent,
      extracted_images: draft.extractedImages,
      ig_caption: draft.igCaption,
      threads_text: draft.threadsText,
      metaphor_queries: draft.metaphorQueries,
      edge: draft.edge,
      cta_type: draft.ctaType,
      cta_keyword: draft.ctaKeyword,
      cover_candidates: draft.coverCandidates,
      status: 'auto_draft',
    };
    let { data: card, error: upsertError } = await admin
      .from('content_cards')
      .upsert(row, { onConflict: 'source_type,source_id' })
      .select()
      .single();
    // 1021~1023 미적용 DB 호환 — 없는 컬럼만 빼고 재시도
    for (const col of ['metaphor_queries', 'edge', 'cta_type', 'cta_keyword', 'cover_candidates']) {
      if (upsertError?.message.includes(col)) {
        delete row[col];
        ({ data: card, error: upsertError } = await admin
          .from('content_cards')
          .upsert(row, { onConflict: 'source_type,source_id' })
          .select()
          .single());
      }
    }
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

    return NextResponse.json({ card, metaphorQueries: draft.metaphorQueries });
  } catch (e) {
    console.error('[cardpress/generate]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'generate failed' },
      { status: 500 }
    );
  }
}
