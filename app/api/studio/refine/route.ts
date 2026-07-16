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
    reference?: string;
    count?: number;
    mode?: 'refine' | 'draft';
  };
  const text = body.text?.trim();
  const instruction = body.instruction?.trim();
  const mode = body.mode === 'draft' ? 'draft' : 'refine';
  // draft(빈 문단 초안)는 text 없이 방향 또는 참고자료(파일) 중 하나면 된다.
  if (mode === 'draft') {
    if (!instruction && !body.reference?.trim()) return NextResponse.json({ error: '방향(instruction) 또는 참고자료(reference) 필요' }, { status: 400 });
  } else if (!text || !instruction) {
    return NextResponse.json({ error: 'text·instruction 필수' }, { status: 400 });
  }

  try {
    const result = await refineText({
      text: text ?? '',
      instruction: instruction ?? '',
      mode,
      context: body.context,
      rich: body.rich,
      reference: body.reference,
      count: body.count,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
