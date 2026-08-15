import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateCardSet, type CardSource } from '@/lib/cardpress/generate';
import type { ContentRowLite, SeedRowLite, ToolRowLite } from '@/lib/cardpress/mapping';
import {
  TOOL_SOURCE_SELECT,
  toolMaterialIssue,
  toolVisibilityIssue,
  type ToolSourceRow,
} from '@/lib/cardpress/tool-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // AI 재작성 + 재압축 루프 포함 — 구독 CLI 호출이라 넉넉히

// 본가 발행물(콘텐츠·자료실) 또는 씨앗 아카이브 원석 → 카드 3종 세트(auto_draft) 생성.
// body: { sourceType: 'content' | 'tool' | 'seed', sourceId: uuid, dryRun?: boolean }
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
    sourceType?: 'content' | 'tool' | 'seed';
    sourceId?: string;
    dryRun?: boolean;
    /** 운영자 지정 엣지 — 재생성 시 이 방향을 최우선 축으로 */
    edge?: string;
    /** CTA 유형 (기본 comment_dm) + 댓글 키워드 */
    ctaType?: 'info_save' | 'comment_dm';
    ctaKeyword?: string;
  };
  if (!body.sourceType || !['content', 'tool', 'seed'].includes(body.sourceType) || !body.sourceId)
    return NextResponse.json({ error: 'sourceType=content|tool|seed + sourceId 필요' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  let source: CardSource;
  if (body.sourceType === 'tool') {
    const { data: tool, error } = await admin
      .from('tools')
      .select(TOOL_SOURCE_SELECT)
      .eq('id', body.sourceId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!tool) return NextResponse.json({ error: '자료 없음' }, { status: 404 });
    const row = tool as unknown as ToolSourceRow;
    // 본가 실노출 기준과 동일하게 검증 — published여도 /tools는 기능분류(subcategory_id)가
    // 있어야 보인다. 안 보이는 자료로 카드를 만들면 스레드 링크가 404가 된다.
    const invisible = toolVisibilityIssue(row);
    if (invisible) return NextResponse.json({ error: invisible }, { status: 409 });
    const thin = toolMaterialIssue(row);
    if (thin)
      return NextResponse.json(
        { error: `${thin} 본가에서 본문·리치 섹션을 채운 뒤 다시 시도하세요.` },
        { status: 422 }
      );
    source = { kind: 'tool', tool: row as ToolRowLite };
  } else if (body.sourceType === 'seed') {
    const { data: seed, error } = await admin
      .from('content_seeds')
      .select('id, title, raw_text, lane, suggested_angle, note, essence, source_url, status')
      .eq('id', body.sourceId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!seed) return NextResponse.json({ error: '씨앗 없음' }, { status: 404 });
    if (seed.status === 'rejected')
      return NextResponse.json({ error: '숨김(rejected) 씨앗은 카드로 만들 수 없어요' }, { status: 409 });
    source = { kind: 'seed', seed: seed as unknown as SeedRowLite };
  } else {
    const { data: content, error } = await admin
      .from('contents')
      .select('id, track, title, summary, slug, thumbnail_url, read_min, apply_min, body, status')
      .eq('id', body.sourceId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!content) return NextResponse.json({ error: '콘텐츠 없음' }, { status: 404 });
    if (content.status !== 'published')
      return NextResponse.json({ error: '발행(published) 콘텐츠만 카드로 만들 수 있어요' }, { status: 409 });
    source = { kind: 'content', row: content as unknown as ContentRowLite };
  }

  try {
    const draft = await generateCardSet(source, {
      edge: body.edge?.trim() || undefined,
      ctaType: body.ctaType,
      ctaKeyword: body.ctaKeyword?.trim() || undefined,
    });

    if (body.dryRun) return NextResponse.json({ dryRun: true, draft });

    const row: Record<string, unknown> = {
      source_type: body.sourceType,
      source_id: body.sourceId,
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
      // Unsplash API Guidelines상 발행 시 표기 필수 — 지금까지 계산만 하고 버려지던 값(1027 컬럼)
      photo_credits: draft.photoCredits.map((p) => ({ ...p, source: 'unsplash' as const })),
      status: 'auto_draft',
    };
    let { data: card, error: upsertError } = await admin
      .from('content_cards')
      .upsert(row, { onConflict: 'source_type,source_id' })
      .select()
      .single();
    // 1021~1027 미적용 DB 호환 — 없는 컬럼만 빼고 재시도
    for (const col of ['metaphor_queries', 'edge', 'cta_type', 'cta_keyword', 'cover_candidates', 'photo_credits']) {
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
