import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { refineDocument } from '@/lib/ai-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 문서 전체를 한 번에 다시 쓰므로 섹션 수정(120초)보다 길다. Vercel Hobby 상한이 300초 —
// 넘기면 배포가 조용히 실패하므로 이 값을 올리지 말 것.
export const maxDuration = 300;

// 문서 전체 수정 제안 — body의 모든 섹션을 '수정 각도'대로 한 번에 다시 쓴 후보를 반환(비파괴).
// 후보는 전체 ContentBodySchema로 검증하고, 모델이 빠뜨린 섹션은 원본으로 되메운다(lib/ai-draft).
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const b = (await req.json()) as {
    track?: 'case' | 'trend';
    body?: Record<string, unknown>;
    title?: string;
    summary?: string;
    instruction?: string;
    reference?: string;
    count?: number;
  };
  const instruction = b.instruction?.trim();
  if (!b.body || !b.track || !instruction) {
    return NextResponse.json({ error: 'track·body·instruction 필수' }, { status: 400 });
  }

  try {
    const result = await refineDocument({
      track: b.track,
      body: b.body,
      title: b.title,
      summary: b.summary,
      instruction,
      reference: b.reference,
      count: b.count,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
