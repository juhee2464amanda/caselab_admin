import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { enrichSeedFromSource } from '@/lib/ai/ai-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 원문 fetch + AI 재작성. 로컬 작업장 전제(Claude CLI) — Hobby 상한 300 준수.
export const maxDuration = 300;

/** source_url HTML → 본문 텍스트. 정밀 파서 없이 태그 제거만 — 판단·재가공 입력으론 충분. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// POST /api/seeds/enrich — 씨앗 raw_text를 source_url 원문과 비교해
// mode='check': 재가공 권장 여부만 판단 / mode='apply': 재가공해 raw_text 갱신.
export async function POST(req: NextRequest) {
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

  const body = (await req.json().catch(() => ({}))) as { seedId?: string; mode?: 'check' | 'apply' };
  const mode = body.mode === 'apply' ? 'apply' : 'check';
  if (!body.seedId) return NextResponse.json({ error: 'seedId 필요' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: seed, error } = await admin
    .from('content_seeds')
    .select('id, title, raw_text, note, source_url')
    .eq('id', body.seedId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!seed) return NextResponse.json({ error: '씨앗 없음' }, { status: 404 });
  if (!seed.source_url) return NextResponse.json({ error: '이 씨앗에는 출처 URL이 없어요' }, { status: 400 });

  let sourceText = '';
  try {
    const res = await fetch(seed.source_url, {
      headers: { 'user-agent': 'Mozilla/5.0 (caselab-admin seed-enrich)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    sourceText = htmlToText(await res.text());
  } catch (e) {
    return NextResponse.json({ error: `원문을 못 가져왔어요: ${(e as Error).message}` }, { status: 502 });
  }
  if (sourceText.length < 300)
    return NextResponse.json({ error: '원문 본문이 너무 짧아요(JS 렌더 페이지일 수 있음)' }, { status: 422 });

  try {
    const result = await enrichSeedFromSource({
      title: seed.title,
      rawText: seed.raw_text ?? '',
      sourceText,
      mode,
    });

    if (mode === 'apply' && result.recommend && result.enrichedRawText) {
      const stamp = `${new Date().toISOString().slice(0, 10)} 원문 재가공(AI): ${result.reason}`;
      await admin
        .from('content_seeds')
        .update({
          raw_text: result.enrichedRawText,
          note: seed.note ? `${seed.note}\n${stamp}` : stamp,
        })
        .eq('id', seed.id);
    }

    return NextResponse.json({
      recommend: result.recommend,
      reason: result.reason,
      applied: mode === 'apply' && result.recommend && !!result.enrichedRawText,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
