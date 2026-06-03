import { CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  good: string;
  bad: string;
}

export function EvaluationBox({ good, bad }: Props) {
  return (
    <div className="my-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border border-green-200 bg-green-50 p-4">
        <div className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 uppercase tracking-wider">
          <CheckCircle2 className="h-3 w-3" />
          이렇게 나오면 잘됨
        </div>
        <p className="mt-2 text-sm text-ink/80 leading-relaxed">{good}</p>
      </div>
      <div className="rounded-md border border-red-200 bg-red-50 p-4">
        <div className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 uppercase tracking-wider">
          <XCircle className="h-3 w-3" />
          이러면 별로
        </div>
        <p className="mt-2 text-sm text-ink/80 leading-relaxed">{bad}</p>
      </div>
    </div>
  );
}
