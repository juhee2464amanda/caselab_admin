import { JOB_LABELS, type JobTag } from '@/types/content';
import { cn } from '@/lib/utils';

interface Props {
  tags: JobTag[];
  className?: string;
}

export function JobTags({ tags, className }: Props) {
  if (!tags?.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {tags.map((t) => (
        <span key={t} className="badge">
          #{JOB_LABELS[t] ?? t}
        </span>
      ))}
    </div>
  );
}
