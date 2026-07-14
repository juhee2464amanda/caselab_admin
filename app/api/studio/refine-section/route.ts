import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { refineSection } from '@/lib/ai-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// 섹션 통째 수정 제안 — 섹션(카드/항목 배열)을 '수정 각도'대로 자유 재구성한 후보를 반환(비파괴).
// content(track 지정)면 후보를 전체 ContentBodySchema로 검증해 유효한 것만 돌려준다.
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
    sectionKey?: string;
    sectionLabel?: string;
    instruction?: string;
    reference?: string;
    count?: number;
  };
  const instruction = b.instruction?.trim();
  if (!b.body || !b.sectionKey || !instruction) {
    return NextResponse.json({ error: 'body·sectionKey·instruction 필수' }, { status: 400 });
  }

  try {
    const result = await refineSection({
      track: b.track,
      body: b.body,
      sectionKey: b.sectionKey,
      sectionLabel: b.sectionLabel ?? b.sectionKey,
      instruction,
      reference: b.reference,
      count: b.count,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
