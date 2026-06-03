import { CheckSquare } from 'lucide-react';

interface Props {
  items: string[];
}

export function CustomizationChecklist({ items }: Props) {
  if (!items?.length) return null;
  return (
    <section className="my-10 rounded-lg border border-accent/20 bg-accent/5 p-6">
      <header className="flex items-center gap-2 mb-4">
        <CheckSquare className="h-5 w-5 text-accent" />
        <h3 className="font-serif text-xl font-semibold text-ink">본인 것으로 만드는 4단계</h3>
      </header>
      <ol className="space-y-3">
        {items.map((it, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white text-xs font-bold">
              {i + 1}
            </span>
            <p className="text-sm text-ink/85 leading-relaxed pt-0.5">{it}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
