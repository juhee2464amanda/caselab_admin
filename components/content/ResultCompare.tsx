interface Props {
  good: string;
  bad: string;
}

export function ResultCompare({ good, bad }: Props) {
  return (
    <div className="my-4 grid gap-3 sm:grid-cols-2">
      <article className="rounded-md border-2 border-green-200 bg-white p-4">
        <div className="text-[11px] font-semibold uppercase text-green-700 tracking-wider mb-2">
          잘된 결과
        </div>
        <p className="text-sm text-ink/85 leading-relaxed whitespace-pre-wrap">{good}</p>
      </article>
      <article className="rounded-md border-2 border-red-200 bg-white p-4">
        <div className="text-[11px] font-semibold uppercase text-red-700 tracking-wider mb-2">
          별로인 결과
        </div>
        <p className="text-sm text-ink/85 leading-relaxed whitespace-pre-wrap">{bad}</p>
      </article>
    </div>
  );
}
