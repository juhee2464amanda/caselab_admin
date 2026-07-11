import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { proposeEdge } from '@/lib/ai-draft';
import { isSeedTrack, type SeedTrack } from '@/lib/seed-tracks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// MD 직행 레인의 "엣지 제안" — 문서를 트랙 상세 형식(track-edges 프로파일)에 대고
// 각도·섹션별 배치·부족한 부분을 제안한다(비파괴, DB 기록 없음). 사람이 수정 후 생성에 주입.
export async function POST(req: NextRequest) {
  // admin 인증 (app/api/seeds/outline/route.ts 패턴)
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

  const parsed = (await req.json()) as { title?: string; markdown?: string; track?: SeedTrack };
  const title = parsed.title?.trim();
  const markdown = parsed.markdown?.trim();
  if (!title || !markdown) return NextResponse.json({ error: 'title·markdown 필수' }, { status: 400 });
  if (!isSeedTrack(parsed.track)) return NextResponse.json({ error: 'invalid track' }, { status: 400 });

  try {
    const proposal = await proposeEdge({ track: parsed.track, title, markdown });
    return NextResponse.json(proposal);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
