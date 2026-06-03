import { User, Bot } from 'lucide-react';

interface Props {
  human: string;
  ai: string;
}

export function RoleCard({ human, ai }: Props) {
  return (
    <div className="my-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border border-border bg-white p-4">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-ink/60">
          <User className="h-3.5 w-3.5" /> 사람이 할 일
        </div>
        <p className="text-sm text-ink/85 leading-relaxed">{human}</p>
      </div>
      <div className="rounded-md border border-border bg-muted p-4">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-ink/60">
          <Bot className="h-3.5 w-3.5" /> AI가 할 일
        </div>
        <p className="text-sm text-ink/85 leading-relaxed">{ai}</p>
      </div>
    </div>
  );
}
