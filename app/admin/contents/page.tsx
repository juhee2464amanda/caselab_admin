import Link from 'next/link';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

// ─────────────── 타입 정의 ───────────────
// /admin/contents = 전체 콘텐츠 타입 통합 목록 (2026-06-07)
//   contents 테이블(case/trend) + tools 테이블(tool/prompt/guide/context-card)을
//   한 목록에서 타입·상태로 필터링. 자료실 전용 관리는 /admin/tools 유지.

type ContentType = 'case' | 'trend' | 'guide' | 'prompt' | 'tool' | 'context-card';

type Row = {
  id: string;
  type: ContentType;
  typeLabel: string;
  title: string;
  slug: string;
  status: string;
  curated: boolean;
  updated_at: string;
  editHref: string;
};

const TYPE_META: { key: ContentType; label: string }[] = [
  { key: 'case', label: '케이스' },
  { key: 'trend', label: '트렌드' },
  { key: 'guide', label: '가이드' },
  { key: 'prompt', label: '프롬프트' },
  { key: 'tool', label: '도구' },
  { key: 'context-card', label: '맥락 카드' },
];
const TYPE_LABEL: Record<ContentType, string> = Object.fromEntries(
  TYPE_META.map((t) => [t.key, t.label]),
) as Record<ContentType, string>;

const STATUS_TABS: { key: string; label: string }[] = [
  { key: '', label: '전체' },
  { key: 'published', label: '발행' },
  { key: 'draft', label: '초안' },
];

// 다른 파라미터를 보존하며 querystring 합성
function buildHref(params: { type?: string; status?: string }): string {
  const qs = new URLSearchParams();
  if (params.type) qs.set('type', params.type);
  if (params.status) qs.set('status', params.status);
  const s = qs.toString();
  return s ? `/admin/contents?${s}` : '/admin/contents';
}

export default async function AdminContents({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const activeType = (sp.type ?? '') as ContentType | '';
  const activeStatus = sp.status ?? '';

  if (!isSupabaseConfigured()) {
    return <div className="p-4 sm:p-8 text-sm text-ink/60">Supabase 연결 후 사용할 수 있어요.</div>;
  }
  const supabase = await createSupabaseServerClient();

  // contents + tools 병렬 쿼리 (status 필터는 쿼리 단계에서 적용)
  let contentsQ = supabase
    .from('contents')
    .select('id, slug, title, track, status, curated, updated_at')
    .order('updated_at', { ascending: false });
  let toolsQ = supabase
    .from('tools')
    .select('id, slug, name, category, status, updated_at')
    .order('updated_at', { ascending: false });
  if (activeStatus === 'published' || activeStatus === 'draft') {
    contentsQ = contentsQ.eq('status', activeStatus);
    toolsQ = toolsQ.eq('status', activeStatus);
  }
  const [contentsRes, toolsRes] = await Promise.all([contentsQ, toolsQ]);

  const rows: Row[] = [
    ...(contentsRes.data ?? []).map((c): Row => ({
      id: c.id,
      type: c.track as ContentType,
      typeLabel: TYPE_LABEL[c.track as ContentType] ?? c.track,
      title: c.title,
      slug: c.slug,
      status: c.status,
      curated: !!c.curated,
      updated_at: c.updated_at,
      editHref: `/admin/contents/${c.id}`,
    })),
    ...(toolsRes.data ?? []).map((t): Row => ({
      id: t.id,
      type: t.category as ContentType,
      typeLabel: TYPE_LABEL[t.category as ContentType] ?? t.category,
      title: t.name,
      slug: t.slug,
      status: t.status,
      curated: false,
      updated_at: t.updated_at,
      editHref: `/admin/tools/${t.id}`,
    })),
  ].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));

  // 타입별 건수 (현재 status 필터 기준). 타입 필터는 표시 단계에서 적용
  const countByType = new Map<ContentType, number>();
  for (const r of rows) countByType.set(r.type, (countByType.get(r.type) ?? 0) + 1);

  const visible = activeType ? rows.filter((r) => r.type === activeType) : rows;

  return (
    <div className="p-4 sm:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="font-serif text-xl sm:text-2xl font-semibold">콘텐츠</h1>
          <p className="text-xs text-ink/50 mt-1">케이스·트렌드 + 자료실(도구·가이드·프롬프트·맥락 카드) 통합</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Link href="/admin/tools/new"><Button variant="outline">새 자료</Button></Link>
          <Link href="/admin/contents/new"><Button variant="accent">새 콘텐츠</Button></Link>
        </div>
      </header>

      {/* 타입 필터 */}
      <div className="mb-2 flex flex-wrap gap-2 text-sm">
        <Link
          href={buildHref({ status: activeStatus })}
          className={`chip ${!activeType ? 'chip-active' : ''}`}
        >
          전체 <span className="ml-1 text-ink/40">{rows.length}</span>
        </Link>
        {TYPE_META.map((t) => {
          const n = countByType.get(t.key) ?? 0;
          return (
            <Link
              key={t.key}
              href={buildHref({ type: t.key, status: activeStatus })}
              className={`chip ${activeType === t.key ? 'chip-active' : ''}`}
            >
              {t.label} <span className="ml-1 text-ink/40">{n}</span>
            </Link>
          );
        })}
      </div>

      {/* 상태 필터 */}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {STATUS_TABS.map((s) => (
          <Link
            key={s.key || 'all'}
            href={buildHref({ type: activeType || undefined, status: s.key || undefined })}
            className={`chip ${activeStatus === s.key ? 'chip-active' : ''}`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3 w-24">타입</th>
              <th className="px-4 py-3">제목</th>
              <th className="px-4 py-3 w-24">상태</th>
              <th className="px-4 py-3 w-16">큐레이션</th>
              <th className="px-4 py-3 w-32">수정일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink/40">콘텐츠가 없어요.</td></tr>
            )}
            {visible.map((it) => (
              <tr key={`${it.type}-${it.id}`} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <span className="badge">{it.typeLabel}</span>
                </td>
                <td className="px-4 py-3">
                  <Link href={it.editHref} className="font-medium hover:underline">
                    {it.title}
                  </Link>
                  <div className="text-xs text-ink/40 mt-0.5">/{it.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${it.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {it.status === 'published' ? '발행' : it.status === 'draft' ? '초안' : it.status}
                  </span>
                </td>
                <td className="px-4 py-3">{it.curated ? '⭐' : ''}</td>
                <td className="px-4 py-3 text-xs text-ink/50">{formatDate(it.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
