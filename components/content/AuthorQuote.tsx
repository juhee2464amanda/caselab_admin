import { Quote } from 'lucide-react';

interface Props {
  quote: string;
}

export function AuthorQuote({ quote }: Props) {
  if (!quote) return null;
  return (
    <blockquote className="relative border-l-4 border-accent bg-accent/5 px-5 py-4 my-6 rounded-r-md">
      <Quote className="absolute -top-2 -left-2 h-5 w-5 text-accent/40" />
      <p className="font-serif text-[17px] leading-relaxed text-ink/85">{quote}</p>
      <footer className="mt-2 text-xs text-ink/50">— 운영자 메모</footer>
    </blockquote>
  );
}
