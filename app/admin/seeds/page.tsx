import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { SeedCuration, type CurSeed } from '@/components/admin/SeedCuration';
import { BUCKETS, VISIBLE_BUCKETS, SCORE_CUT, WINDOW_HOURS, TOP_N, type SeedBucket } from '@/lib/seed-curation';

// /admin/seeds — HERMES 씨앗 큐레이션.
// 무작위 backlog 대신: 로컬 AI가 채점·분류한 씨앗을 목적 버킷별 72h·점수순 top5로 노출.
// 운영자가 소식을 (복수)선택 → 콘텐츠 유형 선택 → 1개 콘텐츠로 합쳐 생성.
export const dynamic = 'force-dynamic';

export default async function AdminSeeds() {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const supabase = await createSupabaseServerClient();

  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();

  const [curRes, pendingRes] = await Promise.all([
    // 버킷 노출 대상: 72h 내 · 점수컷 이상 · 노출버킷 · 아직 콘텐츠화 전(raw/adopted)
    supabase
      .from('content_seeds')
      .select('id, title, raw_text, source_url, lane, source_type, status, note, created_at, bucket, score, score_reason, suggested_angle')
      .gte('created_at', since)
      .gte('score', SCORE_CUT)
      .in('bucket', VISIBLE_BUCKETS)
      .in('status', ['raw', 'adopted'])
      .order('score', { ascending: false })
      .limit(60),
    // 미채점(분석 대기) raw 씨앗 수
    supabase
      .from('content_seeds')
      .select('id', { count: 'exact', head: true })
      .is('scored_at', null)
      .eq('status', 'raw'),
  ]);

  const all = (curRes.data ?? []) as CurSeed[];
  const pending = pendingRes.count ?? 0;

  // 버킷별 그룹화 + top5
  const grouped = Object.fromEntries(BUCKETS.map((b) => [b.key, [] as CurSeed[]])) as Record<SeedBucket, CurSeed[]>;
  for (const s of all) {
    if (s.bucket && grouped[s.bucket] && grouped[s.bucket].length < TOP_N) grouped[s.bucket].push(s);
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">Contents Seed from HERMES</h1>
        <p className="text-sm text-ink/60 mt-1">
          AI가 분류·채점한 소식 중 지금 가장 쓸만한 것들. 선택해서 콘텐츠로 만드세요.
        </p>
      </header>

      <SeedCuration grouped={grouped} pending={pending} />
    </div>
  );
}
