import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateDraft, generateToolDraft } from '@/lib/ai-draft';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 리서치 포함 생성은 오래 걸릴 수 있음(로컬 실행 전제, 플랫폼 타임아웃 없음).
export const maxDuration = 300;

type Track = 'case' | 'trend' | 'tool';

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

  // 2) 입력
  const { seedId, track } = (await req.json()) as { seedId?: string; track?: Track };
  if (!seedId) return NextResponse.json({ error: 'seedId required' }, { status: 400 });
  if (track !== 'case' && track !== 'trend' && track !== 'tool') {
    return NextResponse.json({ error: 'invalid track' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // 3) seed 로드
  const { data: seed, error: seedErr } = await admin
    .from('content_seeds')
    .select('id, title, raw_text, status')
    .eq('id', seedId)
    .maybeSingle();
  if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 });
  if (!seed) return NextResponse.json({ error: 'seed not found' }, { status: 404 });

  // 4) 생성 중 표시
  await admin.from('content_seeds').update({ status: 'generating' }).eq('id', seedId);

  try {
    const slugBase = `${slugify(seed.title)}-${seedId.slice(0, 8)}`;

    if (track === 'tool') {
      const draft = await generateToolDraft({ title: seed.title, summary: seed.raw_text });
      const { data: tool, error } = await admin
        .from('tools')
        .insert({
          slug: slugBase,
          name: draft.name || seed.title,
          category: 'tool',
          description: draft.description,
          body: draft.body,
          url: draft.url ?? null,
          pricing_tier: draft.pricing_tier,
          status: 'draft',
        })
        .select('id')
        .single();
      if (error || !tool) throw new Error(error?.message ?? 'tools insert 실패');

      await admin
        .from('content_seeds')
        .update({ tool_id: tool.id })
        .eq('id', seedId);

      return NextResponse.json({ redirect: `/admin/tools/${tool.id}` });
    }

    // case | trend → contents
    const body = await generateDraft({ track, title: seed.title, summary: seed.raw_text });
    const { data: content, error } = await admin
      .from('contents')
      .insert({
        slug: slugBase,
        track,
        title: seed.title,
        body,
        status: 'draft',
      })
      .select('id')
      .single();
    if (error || !content) throw new Error(error?.message ?? 'contents insert 실패');

    await admin
      .from('content_seeds')
      .update({ content_id: content.id })
      .eq('id', seedId);

    return NextResponse.json({ redirect: `/admin/contents/${content.id}` });
  } catch (e) {
    // 실패 → 채택 상태로 롤백
    await admin.from('content_seeds').update({ status: 'adopted' }).eq('id', seedId);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
