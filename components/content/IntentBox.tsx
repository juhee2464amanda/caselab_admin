import { Target } from 'lucide-react';

interface Props {
  step: number;
  text: string;
}

export function IntentBox({ step, text }: Props) {
  return (
    <div className="my-4 rounded-md border border-accent/20 bg-accent/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white text-xs font-bold">
          {step}
        </div>
        <div>
          <div className="inline-flex items-center gap-1 text-xs font-semibold text-accent uppercase tracking-wider">
            <Target className="h-3 w-3" />
            이 단계의 의도
          </div>
          <p className="mt-1 text-sm text-ink/80 leading-relaxed">{text}</p>
        </div>
      </div>
    </div>
  );
}
