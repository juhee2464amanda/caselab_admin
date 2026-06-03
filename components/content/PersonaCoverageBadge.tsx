import { PERSONA_LABELS, type Persona } from '@/types/content';
import { cn } from '@/lib/utils';

interface Props {
  personas: Persona[];
  className?: string;
}

export function PersonaCoverageBadge({ personas, className }: Props) {
  if (!personas?.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {personas.map((p) => (
        <span
          key={p}
          className="inline-flex items-center gap-1 rounded-full bg-accent/10 text-accent px-2.5 py-0.5 text-xs font-medium"
          title={PERSONA_LABELS[p]}
        >
          <span className="font-bold">{p}</span>
          <span className="hidden sm:inline">{PERSONA_LABELS[p]}</span>
        </span>
      ))}
    </div>
  );
}
