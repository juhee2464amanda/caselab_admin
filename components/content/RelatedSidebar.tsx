import Link from 'next/link';
import type { ContentRow } from '@/types/content';

interface Props {
  items: Pick<ContentRow, 'slug' | 'title' | 'track' | 'thumbnail_url' | 'read_min'>[];
}

export function RelatedSidebar({ items }: Props) {
  if (!items?.length) return null;
  return (
    <aside className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/50">
        이어서 읽기
      </h3>
      <ul className="space-y-3">
        {items.slice(0, 5).map((it) => (
          <li key={it.slug}>
            <Link
              href={`/${it.track === 'case' ? 'cases' : 'trends'}/${it.slug}`}
              className="flex gap-3 group"
            >
              {it.thumbnail_url ? (
                <img
                  src={it.thumbnail_url}
                  alt=""
                  className="h-14 w-14 rounded-md object-cover shrink-0"
                />
              ) : (
                <div className="h-14 w-14 rounded-md bg-muted shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                  {it.track === 'case' ? '실전 케이스' : 'AI 트렌드'}
                </div>
                <p className="text-sm font-medium text-ink leading-snug line-clamp-2 group-hover:underline">
                  {it.title}
                </p>
                <p className="text-xs text-ink/50 mt-0.5">읽기 {it.read_min}분</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
