import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateDraft, generateToolDraft, generatePromptDraft, generateGuideDraft } from '@/lib/ai-draft';
import { isSeedTrack, type SeedTrack } from '@/lib/seed-tracks';
import { trackEdge } from '@/lib/track-edges';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 리서치 포함 생성은 오래 걸릴 수 있음(로컬 실행 전제, 플랫폼 타임아웃 없음).
export const maxDuration = 300;

// MD 직행 레인 — 텔레그램(HERMES 봇)에서 기획 논의·리서치를 마친 완성 MD 문서를
// 씨앗 인박스를 거치지 않고 바로 초안으로 변환한다. 기획방향·개요는 문서에 이미
// 녹아 있으므로 별도 단계 없이 "문서 보존 모드" direction으로 생성한다.
const DOC_DIRECTION =
  '첨부 문서는 텔레그램에서 기획 논의와 추가 리서치를 마친 확정 초안입니다. ' +
  '문서의 각도·구성·논지·출처를 그대로 중심축으로 유지하고, 스키마에 맞게 재구성·정제만 하세요. ' +
  '문서에 없는 주장·수치·출처를 새로 만들지 말고, 문서에 명시된 출처 URL만 사용하세요.';

export async function POST(req: NextRequest) {
  // 1) admin 인증 (app/api/seeds/generate/route.ts 패턴)
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

  // 2) 입력 — 완성 MD 문서 + 트랙(콘텐츠 타입). direction은 보강 지시(선택).
  const parsed = (await req.json()) as {
    title?: string;
    markdown?: string;
    track?: SeedTrack;
    direction?: string;
    /** 엣지 제안(사람이 확인·수정) — 각도 한 줄 */
    angle?: string;
    /** 엣지 제안 — 섹션별 배치 계획(줄 단위). 생성 시 확정 개요(outline)로 주입 */
    edgePlan?: string[];
    /** 엣지 제안 — 형식이 요구하지만 문서에 없는 것(지어내기 방지 경고로 주입) */
    missing?: string[];
  };
  const title = parsed.title?.trim();
  const markdown = parsed.markdown?.trim();
  const track = parsed.track;
  if (!title || !markdown) {
    return NextResponse.json({ error: 'title·markdown 필수' }, { status: 400 });
  }
  if (!isSeedTrack(track)) {
    return NextResponse.json({ error: 'invalid track' }, { status: 400 });
  }
  const extra = parsed.direction?.trim();
  const angle = parsed.angle?.trim();
  const edgePlan = Array.isArray(parsed.edgePlan)
    ? parsed.edgePlan.map((s) => String(s).trim()).filter(Boolean)
    : undefined;
  const missing = Array.isArray(parsed.missing)
    ? parsed.missing.map((s) => String(s).trim()).filter(Boolean)
    : [];

  // direction 조립: 문서 보존 모드 + 트랙 형식 지침(목업 스터디 정본) + 확정 각도 + 결핍 경고 + 보강 지시
  const edge = trackEdge(track);
  const parts = [DOC_DIRECTION, `[트랙 형식 지침] ${edge.edge} ${edge.guide}`];
  if (angle) parts.push(`[확정 각도] ${angle}`);
  if (missing.length) {
    parts.push(`[문서에 없는 것 — 지어내지 말 것] ${missing.join(' / ')} → 근거 없이 채우지 말고 생략하거나 문서 범위에서만 다루세요.`);
  }
  if (extra) parts.push(`[보강 지시] ${extra}`);
  const direction = parts.join('\n');

  const admin = createSupabaseAdminClient();

  // 3) 계보용 씨앗 기록 — MD 원문을 raw_text로 보관해 아카이브·역추적(content_id/tool_id) 일관성 유지.
  //    status='generating'이라 스튜디오 인박스(raw/adopted)에는 노출되지 않는다.
  const { data: seed, error: seedErr } = await admin
    .from('content_seeds')
    .insert({
      title: title.slice(0, 300),
      raw_text: markdown,
      source_type: 'manual',
      origin: 'manual',
      status: 'generating',
      note: 'MD 직행 반입(텔레그램 논의 초안)',
    })
    .select('id')
    .single();
  if (seedErr || !seed) {
    return NextResponse.json({ error: seedErr?.message ?? 'seed insert 실패' }, { status: 500 });
  }

  try {
    const slugBase = `${slugify(title)}-${seed.id.slice(0, 8)}`;

    // 자료실 트랙(tool/prompt/guide) → tools 테이블 (generate/route.ts와 동일 분기)
    if (track === 'tool' || track === 'prompt') {
      const libInput = { title, summary: markdown, direction, outline: edgePlan, sourceType: 'manual' };
      const draft = track === 'tool' ? await generateToolDraft(libInput) : await generatePromptDraft(libInput);
      const { data: tool, error } = await admin
        .from('tools')
        .insert({
          slug: slugBase,
          name: draft.name || title,
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

      await admin.from('content_seeds').update({ tool_id: tool.id }).eq('id', seed.id);

      return NextResponse.json({ redirect: `/admin/tools/${tool.id}`, id: tool.id, kind: 'tool' });
    }

    if (track === 'guide') {
      const draft = await generateGuideDraft({ title, summary: markdown, direction, outline: edgePlan, sourceType: 'manual' });
      const { data: tool, error } = await admin
        .from('tools')
        .insert({
          slug: slugBase,
          name: draft.name || title,
          category: 'guide',
          description: draft.description || null,
          url: draft.url || null,
          job_tags: draft.jobTag ? [draft.jobTag] : [],
          status: 'draft',
        })
        .select('id')
        .single();
      if (error || !tool) throw new Error(error?.message ?? 'tools insert 실패');

      await admin.from('content_seeds').update({ tool_id: tool.id }).eq('id', seed.id);

      return NextResponse.json({ redirect: `/admin/tools/${tool.id}`, id: tool.id, kind: 'tool' });
    }

    // case | trend → contents
    const body = await generateDraft({ track, title, summary: markdown, direction, outline: edgePlan, sourceType: 'manual' });
    const { data: content, error } = await admin
      .from('contents')
      .insert({
        slug: slugBase,
        track,
        title,
        body,
        status: 'draft',
      })
      .select('id')
      .single();
    if (error || !content) throw new Error(error?.message ?? 'contents insert 실패');

    await admin.from('content_seeds').update({ content_id: content.id }).eq('id', seed.id);

    return NextResponse.json({ redirect: `/admin/contents/${content.id}`, id: content.id, kind: 'content' });
  } catch (e) {
    // 실패 → 이 요청이 만든 계보 씨앗 제거(인박스 씨앗과 달리 재시도 시 다시 만들면 됨)
    await admin.from('content_seeds').delete().eq('id', seed.id);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
