import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateDraft, generateToolDraft, generatePromptDraft, generateGuideDraft } from '@/lib/ai-draft';
import { isSeedTrack, type SeedTrack } from '@/lib/seed-tracks';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 리서치 포함 생성은 오래 걸릴 수 있음(로컬 실행 전제, 플랫폼 타임아웃 없음).
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // 1) admin 인증 (app/api/ai-draft/route.ts 패턴)
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

  // 2) 입력 — 소스(단일 seedId 또는 다중 seedIds[]) + 트랙 + 사람이 작성한 기획방향(필수).
  //    첫 기획은 반드시 사람이 방향을 제공한다 → direction 없으면 생성 거부.
  const parsed = (await req.json()) as {
    seedId?: string;
    seedIds?: string[];
    track?: SeedTrack;
    direction?: string;
    outline?: string[];
  };
  const ids = parsed.seedIds?.length ? parsed.seedIds : parsed.seedId ? [parsed.seedId] : [];
  const track = parsed.track;
  const direction = parsed.direction?.trim();
  // 사람이 확인·수정한 개요(단계적 구체화). 빈 줄 제거.
  const outline = Array.isArray(parsed.outline)
    ? parsed.outline.map((s) => String(s).trim()).filter(Boolean)
    : undefined;
  if (!ids.length) return NextResponse.json({ error: 'seedId(s) required' }, { status: 400 });
  if (!isSeedTrack(track)) {
    return NextResponse.json({ error: 'invalid track' }, { status: 400 });
  }
  if (!direction) {
    return NextResponse.json({ error: '기획방향(direction)을 입력하세요' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // 3) seed 로드 (source_type·bucket = 생성 컨텍스트, 프롬프트에 grounding으로 주입)
  const { data: seeds, error: seedErr } = await admin
    .from('content_seeds')
    .select('id, title, raw_text, note, suggested_angle, status, source_type, bucket')
    .in('id', ids);
  if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 });
  if (!seeds?.length) return NextResponse.json({ error: 'seed not found' }, { status: 404 });

  const primary = seeds[0];
  // 여러 씨앗 → 1개 콘텐츠: 제목/원문을 병합. 대표 출처·분류는 primary 기준.
  const mergedTitle = seeds.length === 1 ? primary.title : `${primary.title} 외 ${seeds.length - 1}건`;
  const mergedSummary = seeds.map((s) => `# ${s.title}\n${s.raw_text ?? ''}`).join('\n\n---\n\n');
  const sourceType = primary.source_type ?? undefined;
  const bucket = primary.bucket ?? undefined;

  // 4) 생성 중 표시(선택된 전체)
  await admin.from('content_seeds').update({ status: 'generating' }).in('id', ids);

  try {
    const slugBase = `${slugify(primary.title)}-${primary.id.slice(0, 8)}`;

    // 자료실 트랙(tool/prompt/guide) → tools 테이블. 셋 다 content_seeds.tool_id로 역추적.
    if (track === 'tool' || track === 'prompt') {
      const libInput = { title: mergedTitle, summary: mergedSummary, direction, outline, sourceType, bucket };
      const draft = track === 'tool' ? await generateToolDraft(libInput) : await generatePromptDraft(libInput);
      const { data: tool, error } = await admin
        .from('tools')
        .insert({
          slug: slugBase,
          name: draft.name || mergedTitle,
          category: draft.category,
          description: draft.description,
          body: draft.body,
          url: draft.url ?? null,
          pricing_tier: draft.pricing_tier,
          status: 'draft',
        })
        .select('id')
        .single();
      if (error || !tool) throw new Error(error?.message ?? 'tools insert 실패');

      await admin.from('content_seeds').update({ tool_id: tool.id }).in('id', ids);

      return NextResponse.json({ redirect: `/admin/tools/${tool.id}`, id: tool.id, kind: 'tool' });
    }

    if (track === 'guide') {
      const draft = await generateGuideDraft({ title: mergedTitle, summary: mergedSummary, direction, outline, sourceType, bucket });
      const { data: tool, error } = await admin
        .from('tools')
        .insert({
          slug: slugBase,
          name: draft.name || mergedTitle,
          category: 'guide',
          description: draft.description || null,
          url: draft.url || null,
          job_tags: draft.jobTag ? [draft.jobTag] : [],
          status: 'draft',
        })
        .select('id')
        .single();
      if (error || !tool) throw new Error(error?.message ?? 'tools insert 실패');

      await admin.from('content_seeds').update({ tool_id: tool.id }).in('id', ids);

      return NextResponse.json({ redirect: `/admin/tools/${tool.id}`, id: tool.id, kind: 'tool' });
    }

    // case | trend → contents. 기획방향(사람 작성)을 모든 트랙 공통으로 생성에 주입.
    const body = await generateDraft({
      track,
      title: mergedTitle,
      summary: mergedSummary,
      direction,
      outline,
      sourceType,
      bucket,
    });
    const { data: content, error } = await admin
      .from('contents')
      .insert({
        slug: slugBase,
        track,
        title: mergedTitle,
        body,
        status: 'draft',
      })
      .select('id')
      .single();
    if (error || !content) throw new Error(error?.message ?? 'contents insert 실패');

    await admin.from('content_seeds').update({ content_id: content.id }).in('id', ids);

    return NextResponse.json({ redirect: `/admin/contents/${content.id}`, id: content.id, kind: 'content' });
  } catch (e) {
    // 실패 → 채택 상태로 롤백(선택 전체)
    await admin.from('content_seeds').update({ status: 'adopted' }).in('id', ids);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
