import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  buildSeedSlidePlan,
  buildSlidePlan,
  buildToolSlidePlan,
  type ContentRowLite,
  type SeedRowLite,
  type ToolRowLite,
} from '@/lib/cardpress/mapping';
import { TOOL_SOURCE_SELECT } from '@/lib/cardpress/tool-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 검수 UI [슬라이드 추가] 피커용 — 소스 콘텐츠의 매핑 계획(섹션·템플릿 후보) 목록.
// GET ?sourceId= → { slides: [{template, sourceSection, alternatives, optional, materialPreview}] }
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

  const sourceId = req.nextUrl.searchParams.get('sourceId');
  const sourceType = req.nextUrl.searchParams.get('sourceType') ?? 'content';
  if (!sourceId) return NextResponse.json({ error: 'sourceId 필요' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  let plan;
  if (sourceType === 'tool') {
    const { data: tool, error } = await admin
      .from('tools')
      .select(TOOL_SOURCE_SELECT)
      .eq('id', sourceId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!tool) return NextResponse.json({ error: '자료 없음' }, { status: 404 });
    plan = buildToolSlidePlan(tool as unknown as ToolRowLite);
  } else if (sourceType === 'seed') {
    const { data: seed, error } = await admin
      .from('content_seeds')
      .select('id, title, raw_text, lane, suggested_angle, note, essence, source_url')
      .eq('id', sourceId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!seed) return NextResponse.json({ error: '씨앗 없음' }, { status: 404 });
    plan = buildSeedSlidePlan(seed as unknown as SeedRowLite);
  } else {
    const { data: content, error } = await admin
      .from('contents')
      .select('id, track, title, summary, slug, thumbnail_url, read_min, apply_min, body')
      .eq('id', sourceId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!content) return NextResponse.json({ error: '콘텐츠 없음' }, { status: 404 });
    plan = buildSlidePlan(content as unknown as ContentRowLite);
  }
  return NextResponse.json({
    slides: plan.slides.map((s) => ({
      template: s.template,
      sourceSection: s.sourceSection,
      alternatives: s.alternatives ?? [],
      optional: !!s.optional,
      materialPreview: s.material.slice(0, 90),
    })),
  });
}
