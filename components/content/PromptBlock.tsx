'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { track } from '@/lib/analytics/ga4';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Props {
  label?: string;
  prompt: string;
}

export function PromptBlock({ label, prompt }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      track('prompt_copy', { label });
      createSupabaseBrowserClient()
        .from('events')
        .insert({ event_type: 'copy', metadata: { label } })
        .then(() => undefined, () => undefined);
    } catch {
      /* noop */
    }
  }

  return (
    <div className="my-4 rounded-md border border-border bg-ink text-white overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
          {label ?? '프롬프트'}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? '복사됨' : '복사'}
        </button>
      </header>
      <pre className="px-4 py-3 text-sm whitespace-pre-wrap font-sans leading-relaxed">{prompt}</pre>
    </div>
  );
}
