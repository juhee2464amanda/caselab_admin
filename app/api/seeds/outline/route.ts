import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateOutline } from '@/lib/ai-draft';
import { isSeedTrack, type SeedTrack } from '@/lib/seed-tracks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 단계적 구체화 1단계 — 소스+기획방향으로 개요(목차)만 생성. 비파괴(씨앗 상태 안 바꿈).
// 사람이 개요를 확인·수정한 뒤 /api/seeds/generate에 outline으로 넘겨 본문 생성.
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = (await req.json()) as { seedIds?: string[]; seedId?: string; track?: SeedTrack; direction?: string };
  const ids = parsed.seedIds?.length ? parsed.seedIds : parsed.seedId ? [parsed.seedId] : [];
  const track = parsed.track;
  const direction = parsed.direction?.trim();
  if (!ids.length) return NextResponse.json({ error: 'seedId(s) required' }, { status: 400 });
  if (!isSeedTrack(track)) return NextResponse.json({ error: 'invalid track' }, { status: 400 });
  if (!direction) return NextResponse.json({ error: '기획방향(direction)을 입력하세요' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: seeds, error } = await admin
    .from('content_seeds')
    .select('id, title, raw_text, source_type, bucket')
    .in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!seeds?.length) return NextResponse.json({ error: 'seed not found' }, { status: 404 });

  const primary = seeds[0];
  const mergedTitle = seeds.length === 1 ? primary.title : `${primary.title} 외 ${seeds.length - 1}건`;
  const mergedSummary = seeds.map((s) => `# ${s.title}\n${s.raw_text ?? ''}`).join('\n\n---\n\n');

  try {
    const result = await generateOutline({
      track,
      title: mergedTitle,
      summary: mergedSummary,
      direction,
      sourceType: primary.source_type ?? undefined,
      bucket: primary.bucket ?? undefined,
    });
    return NextResponse.json(result); // { title, outline: string[] }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
