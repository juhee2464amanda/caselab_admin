import Link from 'next/link';
import type { ContentRow } from '@/types/content';

interface Props {
  items: Pick<ContentRow, 'slug' | 'title' | 'track' | 'thumbnail_url' | 'summary'>[];
}

export function RelatedCarousel({ items }: Props) {
  if (!items?.length) return null;
  return (
    <section className="my-12">
      <h3 className="font-serif text-xl font-semibold mb-4">관련 콘텐츠 더 보기</h3>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 snap-x">
        {items.map((it) => (
          <Link
            key={it.slug}
            href={`/${it.track === 'case' ? 'cases' : 'trends'}/${it.slug}`}
            className="card w-72 shrink-0 snap-start overflow-hidden hover:shadow-elevated transition-shadow"
          >
            {it.thumbnail_url ? (
              <img src={it.thumbnail_url} alt="" className="aspect-[16/9] w-full object-cover" />
            ) : (
              <div className="aspect-[16/9] w-full bg-muted" />
            )}
            <div className="p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-accent mb-1">
                {it.track === 'case' ? '실전 케이스' : 'AI 트렌드'}
              </div>
              <h4 className="font-medium text-ink line-clamp-2 leading-snug">{it.title}</h4>
              {it.summary && (
                <p className="mt-2 text-xs text-ink/60 line-clamp-2">{it.summary}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
