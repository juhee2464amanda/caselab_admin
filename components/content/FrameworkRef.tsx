import { BookOpen, ExternalLink } from 'lucide-react';

interface Props {
  name: string;
  url?: string;
}

export function FrameworkRef({ name, url }: Props) {
  const content = (
    <>
      <BookOpen className="h-4 w-4 text-accent" />
      <div className="flex-1">
        <div className="text-[11px] font-semibold uppercase text-ink/40 tracking-wider">
          이 글이 쓰는 프레임워크
        </div>
        <div className="text-sm font-medium text-ink mt-0.5">{name}</div>
      </div>
      {url && <ExternalLink className="h-3.5 w-3.5 text-ink/40" />}
    </>
  );

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="my-4 flex items-center gap-3 rounded-md border border-border bg-white p-3 hover:bg-muted/50 transition-colors"
      >
        {content}
      </a>
    );
  }
  return (
    <div className="my-4 flex items-center gap-3 rounded-md border border-border bg-white p-3">
      {content}
    </div>
  );
}
