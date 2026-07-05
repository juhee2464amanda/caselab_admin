import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { scoreSeed } from '@/lib/ai-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 로컬 작업장 전제(Claude CLI). 씨앗 하나당 수십 초 → 한 번에 소량만.
export const maxDuration = 300;

const BATCH_LIMIT = 12;

// POST /api/seeds/score — 미채점(raw) 씨앗을 배치로 분류·채점.
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

  const body = (await req.json().catch(() => ({}))) as { seedIds?: string[] };
  const admin = createSupabaseAdminClient();

  // 대상: 명시된 seedIds, 아니면 미채점(scored_at is null) raw 씨앗 최신순 일부
  let query = admin
    .from('content_seeds')
    .select('id, title, raw_text, source_type')
    .order('created_at', { ascending: false })
    .limit(BATCH_LIMIT);
  if (body.seedIds?.length) {
    query = admin.from('content_seeds').select('id, title, raw_text, source_type').in('id', body.seedIds);
  } else {
    // 미채점 + 채점됐지만 essence 없는(구버전) 씨앗까지 = 헤드라인 backfill.
    query = query.in('status', ['raw', 'adopted']).or('scored_at.is.null,essence.is.null');
  }

  const { data: seeds, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!seeds?.length) return NextResponse.json({ scored: 0, remaining: 0 });

  let scored = 0;
  // CLI 동시 실행 방지 위해 순차 처리.
  for (const seed of seeds) {
    try {
      const s = await scoreSeed({ title: seed.title, rawText: seed.raw_text, sourceType: seed.source_type });
      await admin
        .from('content_seeds')
        .update({
          bucket: s.bucket,
          score: s.score,
          score_reason: s.reason,
          suggested_angle: s.suggestedAngle,
          // 카드 표시용 핵심: headline(한 줄) + 버킷별 essence 상세를 jsonb 한 컬럼에.
          essence: { headline: s.headline, ...s.essence },
          scored_at: new Date().toISOString(),
        })
        .eq('id', seed.id);
      scored += 1;
    } catch {
      // 개별 실패는 건너뛰고 계속(다음 배치에서 재시도 가능)
    }
  }

  const { count } = await admin
    .from('content_seeds')
    .select('id', { count: 'exact', head: true })
    .is('scored_at', null)
    .eq('status', 'raw');

  return NextResponse.json({ scored, remaining: count ?? 0 });
}
