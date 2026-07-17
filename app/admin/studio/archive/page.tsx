import Link from 'next/link';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { BUCKETS, isSeedBucket, bucketFromSource, RETENTION_DAYS, MAX_UNUSED_SEEDS } from '@/lib/seed-curation';
import { cn } from '@/lib/utils';
import { SeedPurgeButton } from '@/components/admin/SeedPurgeButton';
import { SeedArchiveRow, type ArchiveSeed } from '@/components/admin/SeedArchiveRow';

// /admin/studio/archive — 씨앗 아카이브. 유입된 모든 씨앗의 상태·출처·이력 관리 뷰.
export const dynamic = 'force-dynamic';

const STATUSES = [
  { key: 'all', label: '전체' },
  { key: 'raw', label: '대기' },
  { key: 'adopted', label: '채택' },
  { key: 'generating', label: '생성중' },
  { key: 'published', label: '발행됨' },
  { key: 'rejected', label: '숨김' },
];

const STATUS_CLS: Record<string, string> = {
  raw: 'bg-blue-100 text-blue-700',
  adopted: 'bg-amber-100 text-amber-700',
  generating: 'bg-purple-100 text-purple-700',
  published: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-gray-100 text-gray-500',
};

export default async function SeedArchive({ searchParams }: { searchParams: Promise<{ status?: string; bucket?: string }> }) {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const { status, bucket } = await searchParams;
  const active = status && STATUSES.some((s) => s.key === status) ? status : 'all';
  const activeBucket = bucket && isSeedBucket(bucket) ? bucket : 'all';

  // 상태·버킷 필터를 함께 유지하는 링크 헬퍼(둘 중 하나만 바꿔도 나머지는 보존).
  const hrefWith = (next: { status?: string; bucket?: string }) => {
    const s = next.status ?? active;
    const b = next.bucket ?? activeBucket;
    const params = new URLSearchParams();
    if (s !== 'all') params.set('status', s);
    if (b !== 'all') params.set('bucket', b);
    const qs = params.toString();
    return qs ? `/admin/studio/archive?${qs}` : '/admin/studio/archive';
  };

  // 유효 버킷 — 채점된 bucket 우선, 없으면 출처(source_type)로 추정. 미채점 씨앗도 출처대로 분류.
  const effBucket = (r: { bucket: string | null; source_type: string | null }) =>
    (r.bucket && isSeedBucket(r.bucket) ? r.bucket : bucketFromSource(r.source_type)) ?? null;

  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from('content_seeds')
    .select('id, title, source_url, source_type, origin, status, created_at, bucket, score, raw_text, score_reason, suggested_angle, essence, note')
    .order('created_at', { ascending: false })
    .limit(300);
  if (active !== 'all') q = q.eq('status', active);
  const { data } = await q;
  let rows = (data ?? []) as ArchiveSeed[];
  if (activeBucket !== 'all') rows = rows.filter((r) => effBucket(r) === activeBucket);

  return (
    <div className="p-4 sm:p-8 space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-serif text-xl sm:text-2xl font-semibold">씨앗 아카이브</h1>
          <p className="text-sm text-ink/60 mt-1">유입된 모든 씨앗의 상태·출처·이력. 콘텐츠 생성은 작업실에서.</p>
          <p className="text-[11px] text-ink/40 mt-1">
            자동 정리: 미사용 씨앗은 {RETENTION_DAYS}일 경과 또는 {MAX_UNUSED_SEEDS}건 초과 시 오래된 것부터 삭제(매일). 콘텐츠가 된 씨앗은 보존.
          </p>
        </div>
        <SeedPurgeButton />
      </header>

      {/* 상태 필터 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-ink/40 mr-1">상태</span>
        {STATUSES.map((s) => (
          <Link
            key={s.key}
            href={hrefWith({ status: s.key })}
            className={cn(
              'rounded-full border px-3 py-1 text-xs',
              active === s.key ? 'border-accent bg-accent text-white' : 'border-border bg-white text-ink/60 hover:bg-muted',
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {/* 카테고리(버킷) 필터 — painpoint 등 콘텐츠 특징별로 분리해서 보기 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-ink/40 mr-1">분류</span>
        <Link
          href={hrefWith({ bucket: 'all' })}
          className={cn(
            'rounded-full border px-3 py-1 text-xs',
            activeBucket === 'all' ? 'border-accent bg-accent text-white' : 'border-border bg-white text-ink/60 hover:bg-muted',
          )}
        >
          전체
        </Link>
        {BUCKETS.map((b) => (
          <Link
            key={b.key}
            href={hrefWith({ bucket: b.key })}
            className={cn(
              'rounded-full border px-3 py-1 text-xs',
              activeBucket === b.key ? 'border-accent bg-accent text-white' : 'border-border bg-white text-ink/60 hover:bg-muted',
            )}
          >
            {b.emoji} {b.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink/40">씨앗이 없어요.</p>
      ) : (
        <div className="card divide-y divide-border">
          {rows.map((s) => (
            <SeedArchiveRow
              key={s.id}
              seed={s}
              statusLabel={STATUSES.find((x) => x.key === s.status)?.label ?? s.status}
              statusCls={STATUS_CLS[s.status] ?? 'bg-muted text-ink/50'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
