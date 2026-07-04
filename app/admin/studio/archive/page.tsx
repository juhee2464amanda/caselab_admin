import Link from 'next/link';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { sourceProfile } from '@/lib/seed-sources';
import { bucketProfile, isSeedBucket } from '@/lib/seed-curation';
import { formatDate, cn } from '@/lib/utils';

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

type SeedRow = {
  id: string;
  title: string;
  source_url: string | null;
  source_type: string | null;
  origin: string | null;
  status: string;
  created_at: string;
  bucket: string | null;
  score: number | null;
};

export default async function SeedArchive({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!isSupabaseConfigured()) return <div className="p-4 sm:p-8 text-sm">Supabase 연결 필요</div>;
  const { status } = await searchParams;
  const active = status && STATUSES.some((s) => s.key === status) ? status : 'all';

  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from('content_seeds')
    .select('id, title, source_url, source_type, origin, status, created_at, bucket, score')
    .order('created_at', { ascending: false })
    .limit(300);
  if (active !== 'all') q = q.eq('status', active);
  const { data } = await q;
  const rows = (data ?? []) as SeedRow[];

  return (
    <div className="p-4 sm:p-8 space-y-5">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">씨앗 아카이브</h1>
        <p className="text-sm text-ink/60 mt-1">유입된 모든 씨앗의 상태·출처·이력. 콘텐츠 생성은 작업실에서.</p>
      </header>

      {/* 상태 필터 */}
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <Link
            key={s.key}
            href={s.key === 'all' ? '/admin/studio/archive' : `/admin/studio/archive?status=${s.key}`}
            className={cn(
              'rounded-full border px-3 py-1 text-xs',
              active === s.key ? 'border-accent bg-accent text-white' : 'border-border bg-white text-ink/60 hover:bg-muted',
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink/40">씨앗이 없어요.</p>
      ) : (
        <div className="card divide-y divide-border">
          {rows.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium shrink-0', STATUS_CLS[s.status] ?? 'bg-muted text-ink/50')}>
                {STATUSES.find((x) => x.key === s.status)?.label ?? s.status}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.title}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink/40">
                  {sourceProfile(s.source_type) && <span>{sourceProfile(s.source_type)!.badge}</span>}
                  {s.bucket && isSeedBucket(s.bucket) && bucketProfile(s.bucket) && (
                    <span>{bucketProfile(s.bucket)!.emoji} {bucketProfile(s.bucket)!.label}</span>
                  )}
                  {s.score != null && <span>· {s.score}점</span>}
                  {s.origin && <span>· {s.origin}</span>}
                  <span>· {formatDate(s.created_at)}</span>
                </div>
              </div>
              {s.source_url && (
                <a href={s.source_url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-accent hover:underline">
                  원문
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
