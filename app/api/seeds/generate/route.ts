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

  // 2) 입력 — 단일(seedId) 또는 다중 선택(seedIds[])을 1개 콘텐츠로 합쳐 생성
  const parsed = (await req.json()) as { seedId?: string; seedIds?: string[]; track?: SeedTrack };
  const ids = parsed.seedIds?.length ? parsed.seedIds : parsed.seedId ? [parsed.seedId] : [];
  const track = parsed.track;
  if (!ids.length) return NextResponse.json({ error: 'seedId(s) required' }, { status: 400 });
  if (!isSeedTrack(track)) {
    return NextResponse.json({ error: 'invalid track' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // 3) seed 로드 (note·suggested_angle = 기획 각도, 케이스 생성에 주입)
  const { data: seeds, error: seedErr } = await admin
    .from('content_seeds')
    .select('id, title, raw_text, note, suggested_angle, status')
    .in('id', ids);
  if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 });
  if (!seeds?.length) return NextResponse.json({ error: 'seed not found' }, { status: 404 });

  const primary = seeds[0];
  // 여러 씨앗 → 1개 콘텐츠: 제목/원문/각도를 병합
  const mergedTitle = seeds.length === 1 ? primary.title : `${primary.title} 외 ${seeds.length - 1}건`;
  const mergedSummary = seeds.map((s) => `# ${s.title}\n${s.raw_text ?? ''}`).join('\n\n---\n\n');
  const mergedAngle =
    seeds.map((s) => s.note?.trim() || s.suggested_angle?.trim()).filter(Boolean).join(' / ') || undefined;

  // 4) 생성 중 표시(선택된 전체)
  await admin.from('content_seeds').update({ status: 'generating' }).in('id', ids);

  try {
    const slugBase = `${slugify(primary.title)}-${primary.id.slice(0, 8)}`;

    // 자료실 트랙(tool/prompt/guide) → tools 테이블. 셋 다 content_seeds.tool_id로 역추적.
    if (track === 'tool' || track === 'prompt') {
      const draft =
        track === 'tool'
          ? await generateToolDraft({ title: mergedTitle, summary: mergedSummary })
          : await generatePromptDraft({ title: mergedTitle, summary: mergedSummary });
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

      return NextResponse.json({ redirect: `/admin/tools/${tool.id}` });
    }

    if (track === 'guide') {
      const draft = await generateGuideDraft({ title: mergedTitle, summary: mergedSummary });
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

      return NextResponse.json({ redirect: `/admin/tools/${tool.id}` });
    }

    // case | trend → contents. 케이스는 각도(note·suggested_angle)를 생성에 주입.
    const body = await generateDraft({
      track,
      title: mergedTitle,
      summary: mergedSummary,
      angle: track === 'case' ? mergedAngle : undefined,
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

    return NextResponse.json({ redirect: `/admin/contents/${content.id}` });
  } catch (e) {
    // 실패 → 채택 상태로 롤백(선택 전체)
    await admin.from('content_seeds').update({ status: 'adopted' }).in('id', ids);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
