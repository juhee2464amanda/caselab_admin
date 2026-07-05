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

  const [curRes, pendingRes] = await Promise.all([
    supabase
      .from('content_seeds')
      .select('id, title, raw_text, source_url, lane, source_type, status, note, created_at, bucket, score, score_reason, suggested_angle, essence')
      .gte('created_at', since)
      .not('scored_at', 'is', null)
      .in('status', ['raw', 'adopted'])
      .order('score', { ascending: false, nullsFirst: false })
      .limit(120),
    supabase
      .from('content_seeds')
      .select('id', { count: 'exact', head: true })
      .in('status', ['raw', 'adopted'])
      .or('scored_at.is.null,essence.is.null'),
  ]);

  const seeds = (curRes.data ?? []) as CurSeed[];
  const pending = pendingRes.count ?? 0;

  return <Studio seeds={seeds} pending={pending} />;
}
