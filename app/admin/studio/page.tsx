import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { Studio } from '@/components/admin/Studio';
import type { CurSeed } from '@/components/admin/SeedCuration';
import { WINDOW_HOURS } from '@/lib/seed-curation';

// /admin/studio — 콘텐츠 스튜디오(작업실). 씨앗 인박스 + 기획방향→개요→본문→편집→발행→홈배치를 한 화면에서.
export const dynamic = 'force-dynamic';

export default async function StudioPage() {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();

  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();

  const cols =
    'id, title, raw_text, source_url, lane, source_type, status, note, created_at, bucket, score, score_reason, suggested_angle, essence';

  const [curRes, adoptedRes, pendingRes] = await Promise.all([
    supabase
      .from('content_seeds')
      .select(cols)
      .gte('created_at', since)
      .not('scored_at', 'is', null)
      .in('status', ['raw', 'adopted'])
      .order('score', { ascending: false, nullsFirst: false })
      .limit(120),
    // 채택한 씨앗은 손으로 고른 작업 대상 → 기간·점수·채점 여부와 무관하게 항상 노출.
    supabase
      .from('content_seeds')
      .select(cols)
      .eq('status', 'adopted')
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('content_seeds')
      .select('id', { count: 'exact', head: true })
      .in('status', ['raw', 'adopted'])
      .or('scored_at.is.null,essence.is.null'),
  ]);

  // 두 쿼리 합집합(채택 씨앗이 최근 창에도 걸릴 수 있어 id로 중복 제거).
  const byId = new Map<string, CurSeed>();
  for (const s of [...(curRes.data ?? []), ...(adoptedRes.data ?? [])] as CurSeed[]) byId.set(s.id, s);
  const seeds = [...byId.values()];
  const pending = pendingRes.count ?? 0;

  return <Studio seeds={seeds} pending={pending} />;
}
