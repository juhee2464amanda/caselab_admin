import { ThumbsDown } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
}

export function FailureSection({ title, children }: Props) {
  return (
    <section className="my-8 rounded-lg border-l-4 border-red-300 bg-red-50/50 p-6">
      <header className="flex items-center gap-2 mb-4">
        <ThumbsDown className="h-5 w-5 text-red-500" />
        <h3 className="font-serif text-xl font-semibold text-ink">{title}</h3>
      </header>
      <div className="space-y-3 text-ink/85">{children}</div>
    </section>
  );
}
