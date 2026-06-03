import { AlertTriangle, ArrowRight } from 'lucide-react';

interface Props {
  hypothesis: string;
  counter: string;
}

export function RebuttalBox({ hypothesis, counter }: Props) {
  return (
    <div className="my-4 rounded-md border border-amber-200 bg-amber-50 p-4">
      <div className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 uppercase tracking-wider">
        <AlertTriangle className="h-3 w-3" />
        AI가 정당화만 한다면, 이렇게 깨뜨려라
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1 rounded-md bg-white border border-amber-200 p-3">
          <div className="text-[11px] font-semibold text-ink/40 uppercase">AI 가설</div>
          <p className="mt-1 text-sm text-ink/80">{hypothesis}</p>
        </div>
        <ArrowRight className="h-5 w-5 text-amber-600 shrink-0 self-center hidden sm:block" />
        <div className="flex-1 rounded-md bg-white border border-amber-300 p-3">
          <div className="text-[11px] font-semibold text-amber-700 uppercase">반박 지시</div>
          <p className="mt-1 text-sm text-ink/85 font-medium">{counter}</p>
        </div>
      </div>
    </div>
  );
}
