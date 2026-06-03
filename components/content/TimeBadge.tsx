import { Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  readMin: number;
  applyMin: number;
  className?: string;
}

export function TimeBadge({ readMin, applyMin, className }: Props) {
  return (
    <div className={cn('inline-flex items-center gap-3 text-sm', className)}>
      <span className="inline-flex items-center gap-1 text-ink/70">
        <Clock className="h-3.5 w-3.5" />
        읽기 {readMin}분
      </span>
      <span className="inline-flex items-center gap-1 text-ink/70">
        <Zap className="h-3.5 w-3.5" />
        적용 {applyMin}분
      </span>
    </div>
  );
}
