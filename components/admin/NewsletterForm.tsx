'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  JOB_TAGS, JOB_LABELS, PERSONAS, PERSONA_LABELS,
  INTERESTS, INTEREST_LABELS, AI_TOOLS, AI_TOOL_LABELS,
} from '@/types/content';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://caselab.vercel.app';

type Pick = { title: string; href: string };
type TabKey = 'content' | 'tool' | 'ebook';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'content', label: '케이스·트렌드' },
  { key: 'tool', label: '도구·프롬프트·가이드' },
  { key: 'ebook', label: 'ebook' },
];

// 칩 멀티셀렉트 토글 (ToolForm 패턴)
function Chips<T extends string>({ label, options, labels, value, onToggle }: {
  label: string; options: readonly T[]; labels: Record<T, string>; value: T[]; onToggle: (v: T) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button type="button" key={o} onClick={() => onToggle(o)}
            className={cn('chip cursor-pointer', value.includes(o) && 'chip-active')}>
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NewsletterForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [job, setJob] = useState<string[]>([]);
  const [persona, setPersona] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [aiTools, setAiTools] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 콘텐츠 삽입 패널
  const [tab, setTab] = useState<TabKey>('content');
  const [q, setQ] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);

  function toggle<T extends string>(set: React.Dispatch<React.SetStateAction<T[]>>) {
    return (v: T) => set((arr) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]));
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      if (tab === 'content') {
        const { data } = await supabase.from('contents')
          .select('slug, title, track').eq('status', 'published').order('created_at', { ascending: false }).limit(20);
        if (alive) setPicks((data ?? []).map((r) => ({ title: r.title as string, href: `${SITE_URL}/${r.track === 'case' ? 'cases' : 'trends'}/${r.slug}` })));
      } else if (tab === 'tool') {
        const { data } = await supabase.from('tools')
          .select('slug, name').eq('status', 'published').order('created_at', { ascending: false }).limit(20);
        if (alive) setPicks((data ?? []).map((r) => ({ title: r.name as string, href: `${SITE_URL}/tools/${r.slug}` })));
      } else {
        const { data } = await supabase.from('products')
          .select('slug, title').eq('status', 'active').order('created_at', { ascending: false }).limit(20);
        if (alive) setPicks((data ?? []).map((r) => ({ title: r.title as string, href: `${SITE_URL}/ebooks/${r.slug}` })));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function insert(p: Pick) {
    const md = `- [${p.title}](${p.href})\n`;
    const el = bodyRef.current;
    if (!el) { setBody((b) => b + md); return; }
    const start = el.selectionStart ?? body.length;
    const next = body.slice(0, start) + md + body.slice(el.selectionEnd ?? start);
    setBody(next);
    // 커서를 삽입 뒤로
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + md.length; });
  }

  async function onSave() {
    setError(null);
    if (!subject.trim()) { setError('제목은 필수예요.'); return; }
    setPending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('newsletter_campaigns').insert({
      subject: subject.trim(),
      body_markdown: body || '',
      segment_filter: { job, persona, interests, ai_tools: aiTools },
      status: 'draft',
      created_by: user?.id ?? null,
    });
    if (err) { setPending(false); setError(err.message); return; }
    setPending(false);
    router.push('/admin/newsletters');
    router.refresh();
  }

  const filtered = q.trim() ? picks.filter((p) => p.title.includes(q.trim())) : picks;

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-xl sm:text-2xl font-semibold">새 뉴스레터</h1>
          <p className="text-sm text-ink/60 mt-1">초안을 저장합니다. 실제 발송(Brevo)은 추후 레이어.</p>
        </div>
        <Button variant="accent" onClick={onSave} disabled={pending}>
          <Save className="h-4 w-4" /> {pending ? '저장 중…' : '초안 저장'}
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card p-5 space-y-3">
            <div>
              <Label className="text-xs">제목 *</Label>
              <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="이번 호 한 줄 훅" />
            </div>
            <div>
              <Label className="text-xs">본문 (마크다운)</Label>
              <Textarea ref={bodyRef} className="mt-1 font-mono text-xs min-h-[320px]" value={body} onChange={(e) => setBody(e.target.value)}
                placeholder={'이번 호 핵심 1~2문장…\n\n## 이번 주 추천\n- 우측 패널에서 콘텐츠를 골라 삽입하세요'} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </section>

          <section className="card p-5 space-y-4">
            <div>
              <h2 className="font-semibold">세그먼트 (발송 대상 필터)</h2>
              <p className="text-xs text-ink/50 mt-0.5">미선택 = 전체. 추후 발송 레이어가 이 조건으로 수신자를 좁힙니다.</p>
            </div>
            <Chips label="직무" options={JOB_TAGS} labels={JOB_LABELS} value={job as never} onToggle={toggle(setJob) as never} />
            <Chips label="페르소나" options={PERSONAS} labels={PERSONA_LABELS} value={persona as never} onToggle={toggle(setPersona) as never} />
            <Chips label="관심 주제" options={INTERESTS} labels={INTEREST_LABELS} value={interests as never} onToggle={toggle(setInterests) as never} />
            <Chips label="사용 AI 도구" options={AI_TOOLS} labels={AI_TOOL_LABELS} value={aiTools as never} onToggle={toggle(setAiTools) as never} />
          </section>
        </div>

        <aside className="space-y-3">
          <section className="card p-4">
            <h3 className="font-semibold text-sm mb-2">콘텐츠 삽입</h3>
            <div className="flex flex-wrap gap-1 mb-2">
              {TABS.map((t) => (
                <button type="button" key={t.key} onClick={() => setTab(t.key)}
                  className={cn('chip cursor-pointer text-xs', tab === t.key && 'chip-active')}>{t.label}</button>
              ))}
            </div>
            <Input className="mb-2 h-8 text-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목 검색" />
            <div className="max-h-[360px] overflow-y-auto space-y-1">
              {filtered.length === 0 && <p className="text-xs text-ink/40 py-3 text-center">항목 없음</p>}
              {filtered.map((p) => (
                <button type="button" key={p.href} onClick={() => insert(p)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted truncate" title={p.title}>
                  {p.title}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink/40">클릭 → 본문에 마크다운 링크 삽입.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
