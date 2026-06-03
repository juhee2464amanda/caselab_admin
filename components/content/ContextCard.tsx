import { FileText } from 'lucide-react';

interface Props {
  title: string;
  fields: { label: string; value: string }[];
}

export function ContextCard({ title, fields }: Props) {
  return (
    <div className="my-4 rounded-md border border-border bg-white p-5 shadow-card">
      <header className="flex items-center gap-2 mb-3 pb-3 border-b border-border/60">
        <FileText className="h-4 w-4 text-accent" />
        <h4 className="font-semibold text-ink">{title}</h4>
        <span className="badge ml-auto">맥락 카드</span>
      </header>
      <dl className="grid gap-2 sm:grid-cols-[120px_1fr] text-sm">
        {fields.map((f, i) => (
          <div key={i} className="contents">
            <dt className="text-ink/50 font-medium">{f.label}</dt>
            <dd className="text-ink/85 whitespace-pre-wrap">{f.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
