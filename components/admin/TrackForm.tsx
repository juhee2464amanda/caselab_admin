'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Save, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { JOB_LABELS, JOB_TAGS, PERSONAS, PERSONA_LABELS } from '@/types/content';
import type { ContentBody, ContentRow, JobTag, Persona } from '@/types/content';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { lintContent } from '@/lib/content-lint';
import { slugify, cn } from '@/lib/utils';

interface Props {
  initial?: Partial<ContentRow> & { id?: string };
}

const EMPTY_CASE: ContentBody = {
  kind: 'case',
  essence: [{ type: 'text', markdown: '여기에 본질을 적어보세요.' }],
  framework: [
    {
      name: 'Step 1',
      description: '',
      intent: '이 단계의 의도를 한 줄로.',
      blocks: [{ type: 'text', markdown: '내용을 적어보세요.' }],
    },
  ],
  failures: [{ type: 'text', markdown: '별로였던 사례 (≥30% 분량).' }],
  review: [{ type: 'text', markdown: '솔직한 후기.' }],
  customization: ['', '', '', ''],
};

const EMPTY_TREND: ContentBody = {
  kind: 'trend',
  whats_new: [{ type: 'text', markdown: '뭐가 새로 나왔나.' }],
  experiment: [{ type: 'text', markdown: '직접 실험.' }],
  verdict: {
    useful: [{ type: 'text', markdown: '쓸만한 케이스.' }],
    notUseful: [{ type: 'text', markdown: '별로인 케이스.' }],
  },
};

export function TrackForm({ initial }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [pending, startTransition] = useTransition();

  const [track, setTrack] = useState<'case' | 'trend'>(initial?.track ?? 'case');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [readMin, setReadMin] = useState(initial?.read_min ?? 5);
  const [applyMin, setApplyMin] = useState(initial?.apply_min ?? 10);
  const [authorQuote, setAuthorQuote] = useState(initial?.author_quote ?? '');
  const [thumbnailUrl, setThumbnailUrl] = useState(initial?.thumbnail_url ?? '');
  const [jobTags, setJobTags] = useState<JobTag[]>((initial?.job_tags as JobTag[]) ?? []);
  const [personas, setPersonas] = useState<Persona[]>((initial?.persona_coverage as Persona[]) ?? []);
  const [body, setBody] = useState<ContentBody>(
    initial?.body ?? (track === 'case' ? EMPTY_CASE : EMPTY_TREND)
  );
  const [bodyJson, setBodyJson] = useState(JSON.stringify(body, null, 2));
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [manualConfirms, setManualConfirms] = useState({ tone: false, related: false, mobile: false });

  // 자동 슬러그
  useEffect(() => {
    if (!slug && title) setSlug(slugify(title));
  }, [title, slug]);

  // 자동 저장 (localStorage)
  useEffect(() => {
    const draftKey = `draft-${initial?.id ?? 'new'}`;
    const t = setTimeout(() => {
      localStorage.setItem(draftKey, JSON.stringify({ track, title, slug, summary, readMin, applyMin, authorQuote, thumbnailUrl, jobTags, personas, body }));
    }, 1000);
    return () => clearTimeout(t);
  }, [initial?.id, track, title, slug, summary, readMin, applyMin, authorQuote, thumbnailUrl, jobTags, personas, body]);

  function syncBody(newJson: string) {
    setBodyJson(newJson);
    try {
      const parsed = JSON.parse(newJson);
      setBody(parsed);
      setBodyError(null);
    } catch (e) {
      setBodyError((e as Error).message);
    }
  }

  function switchTrack(t: 'case' | 'trend') {
    if (!confirm('트랙을 바꾸면 본문이 초기화돼요. 계속할까요?')) return;
    setTrack(t);
    const empty = t === 'case' ? EMPTY_CASE : EMPTY_TREND;
    setBody(empty);
    setBodyJson(JSON.stringify(empty, null, 2));
  }

  async function runAIDraft() {
    setAiBusy(true);
    try {
      const res = await fetch('/api/ai-draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ track, title, summary }),
      });
      const json = await res.json();
      if (json.body) {
        setBody(json.body);
        setBodyJson(JSON.stringify(json.body, null, 2));
      } else {
        alert(json.error ?? 'AI 초안 생성 실패');
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  const lint = lintContent({
    read_min: readMin,
    apply_min: applyMin,
    job_tags: jobTags,
    persona_coverage: personas,
    body,
  });

  const canPublish = lint.passed && Object.values(manualConfirms).every(Boolean);

  function save(status: 'draft' | 'published') {
    if (bodyError) return alert('본문 JSON 오류: ' + bodyError);
    if (status === 'published' && !canPublish) return alert('발행 게이트 통과 필요');
    startTransition(async () => {
      const payload = {
        slug: slug || slugify(title),
        track,
        title,
        summary,
        body,
        job_tags: jobTags,
        persona_coverage: personas,
        read_min: readMin,
        apply_min: applyMin,
        author_quote: authorQuote || null,
        thumbnail_url: thumbnailUrl || null,
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
      };
      let id = initial?.id;
      if (id) {
        await supabase.from('contents').update(payload).eq('id', id);
      } else {
        const { data } = await supabase.from('contents').insert(payload).select('id').single();
        id = data?.id;
      }
      if (id && status === 'published') {
        await fetch('/api/revalidate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, track }),
        });
      }
      router.push('/admin');
      router.refresh();
    });
  }

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">
          {initial?.id ? '콘텐츠 편집' : '새 콘텐츠'}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => save('draft')} disabled={pending}>
            <Save className="h-4 w-4" /> 초안 저장
          </Button>
          <Button variant="accent" onClick={() => save('published')} disabled={pending || !canPublish}>
            <Send className="h-4 w-4" /> 발행
          </Button>
        </div>
      </header>

      <Tabs value={track} onValueChange={(v) => switchTrack(v as 'case' | 'trend')}>
        <TabsList>
          <TabsTrigger value="case">실전 케이스 (4단)</TabsTrigger>
          <TabsTrigger value="trend">AI 트렌드 (3단)</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="card p-5 space-y-3">
            <h2 className="font-semibold">메타</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="title">제목</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="slug">슬러그</Label>
                <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="summary">요약</Label>
              <Textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="quote">운영자 1인칭 인용 (Author Quote)</Label>
              <Textarea
                id="quote"
                value={authorQuote}
                onChange={(e) => setAuthorQuote(e.target.value)}
                placeholder="저도 처음엔..."
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="read">읽기 시간 (분)</Label>
                <Input id="read" type="number" min={1} value={readMin} onChange={(e) => setReadMin(+e.target.value)} />
              </div>
              <div>
                <Label htmlFor="apply">적용 시간 (분)</Label>
                <Input id="apply" type="number" min={1} value={applyMin} onChange={(e) => setApplyMin(+e.target.value)} />
              </div>
              <div>
                <Label htmlFor="thumb">썸네일 URL</Label>
                <Input id="thumb" value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>직무 태그</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {JOB_TAGS.map((j) => (
                  <button
                    type="button"
                    key={j}
                    onClick={() => setJobTags((arr) => arr.includes(j) ? arr.filter((x) => x !== j) : [...arr, j])}
                    className={cn('chip cursor-pointer', jobTags.includes(j) && 'chip-active')}
                  >
                    {JOB_LABELS[j]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>페르소나 커버리지</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PERSONAS.map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setPersonas((arr) => arr.includes(p) ? arr.filter((x) => x !== p) : [...arr, p])}
                    className={cn('chip cursor-pointer', personas.includes(p) && 'chip-active')}
                  >
                    {p}. {PERSONA_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="card p-5">
            <header className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">본문 (JSON blocks)</h2>
              {process.env.NEXT_PUBLIC_AI_DRAFT_ENABLED === 'true' && (
                <Button variant="outline" size="sm" onClick={runAIDraft} disabled={aiBusy}>
                  <Sparkles className="h-4 w-4" /> {aiBusy ? '생성 중…' : 'AI 초안'}
                </Button>
              )}
            </header>
            <Textarea
              value={bodyJson}
              onChange={(e) => syncBody(e.target.value)}
              className="font-mono text-xs min-h-[500px]"
            />
            {bodyError && (
              <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {bodyError}
              </p>
            )}
            <p className="mt-2 text-xs text-ink/50">
              ※ Phase 1 시점 — 본문은 jsonb 직접 편집. Phase 3에서 step별 GUI 에디터로 교체.
            </p>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-5">
            <h3 className="font-semibold text-sm mb-3">발행 게이트 (자동 6)</h3>
            <ul className="space-y-1.5">
              {lint.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-xs">
                  {c.passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                  )}
                  <span className={c.passed ? 'text-ink/60' : 'text-red-600 font-medium'}>
                    {c.label}
                    {c.detail && <span className="block text-[10px] mt-0.5">{c.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h3 className="font-semibold text-sm mb-3">수동 확인 (3)</h3>
            <div className="space-y-2">
              {([
                ['tone', '1인칭 톤 (저도 어려웠어요 류)'],
                ['related', '추천 사이드바·캐러셀 시각 확인'],
                ['mobile', '모바일 1회 직접 확인'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={manualConfirms[key]}
                    onChange={(e) => setManualConfirms((c) => ({ ...c, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h3 className="font-semibold text-sm mb-2">톤 가이드</h3>
            <p className="text-xs text-ink/60 leading-relaxed">
              “저도 처음엔…” / “이게 진짜 별로였던 게…” / “결과가 ‘그럴듯’해서 더 위험했어요.” 같은 1인칭 자기 인용으로 시작해보세요.
            </p>
          </section>

          {process.env.NEXT_PUBLIC_AI_DRAFT_ENABLED !== 'true' && (
            <section className="card p-5">
              <h3 className="font-semibold text-sm mb-2">초안 작성 워크플로우</h3>
              <ol className="text-xs text-ink/60 leading-relaxed space-y-1 list-decimal pl-4">
                <li>Claude Max(claude.ai)에서 톤 가이드 + jsonb 스키마와 함께 주제 입력</li>
                <li>본문 JSON 받기 → 좌측 “본문 (JSON blocks)”에 붙여넣기</li>
                <li>직무 태그·페르소나·시간 라벨 채우기</li>
                <li>발행 게이트 자동 6 통과 확인 → 발행</li>
              </ol>
              <p className="mt-2 text-[10px] text-ink/40">
                AI 초안 자동화는 출시 후 도입 예정.
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
