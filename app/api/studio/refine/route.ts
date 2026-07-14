import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { refineText } from '@/lib/ai-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// 편집 표면(ContentPreview/ToolPreview)의 "부분 수정 제안" — 지정한 텍스트(선택 구간 또는 필드 전체)를
// 운영자가 적은 '수정 각도'대로 다시 쓴 후보 2~4개를 반환한다(비파괴, DB 기록 없음). 사람이 골라 적용.
export async function POST(req: NextRequest) {
  // admin 인증 (app/api/studio/edge/route.ts 패턴)
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

  const body = (await req.json()) as {
    text?: string;
    instruction?: string;
    context?: string;
    rich?: boolean;
    count?: number;
  };
  const text = body.text?.trim();
  const instruction = body.instruction?.trim();
  if (!text || !instruction) return NextResponse.json({ error: 'text·instruction 필수' }, { status: 400 });

  try {
    const result = await refineText({
      text,
      instruction,
      context: body.context,
      rich: body.rich,
      count: body.count,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
