'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Save, Send, AlertCircle, CheckCircle2, Eye, PenLine } from 'lucide-react';
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
import { CaseBodyEditor } from '@/components/admin/section-editors/CaseBodyEditor';
import { TrendBodyEditor } from '@/components/admin/section-editors/TrendBodyEditor';
import { ContentPreview } from '@/components/admin/ContentPreview';

interface Props {
  initial?: Partial<ContentRow> & { id?: string };
  /** 스튜디오 임베드용. 있으면 저장 후 /admin으로 이동하지 않고 콜백만 호출. */
  onSaved?: (status: 'draft' | 'published', id?: string) => void;
  /** true면 미리보기(실제 페이지 모습 + 더블클릭 인라인 편집)로 시작 — 스튜디오 생성 직후 검수 흐름 */
  startInPreview?: boolean;
}

// D70 정본 shape — 라이브 cases/[slug]·trends/[slug] 렌더 필드와 정합.
const EMPTY_CASE: ContentBody = {
  kind: 'case',
  forWho: [],
  caseIntro: [{ type: 'text', markdown: '' }],
  painPoints: [],
  stepCards: [],
  pros: [],
  cons: [],
  takingPoints: [],
};

const EMPTY_TREND: ContentBody = {
  kind: 'trend',
  what: [{ type: 'text', markdown: '' }],
  why: [],
  forWho: [],
  keyPoints: [],
  deepDive: [],
  soWhat: [],
  sources: [],
};

export function TrackForm({ initial, onSaved, startInPreview }: Props) {
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
  // 라이브 미리보기 — 현재 폼 상태(body 포함)를 본가 상세 마크업으로 렌더.
  // 더블클릭 인라인 편집이 폼 상태로 커밋되므로 미리보기 자체가 편집 표면이다.
  const [previewOpen, setPreviewOpen] = useState(startInPreview ?? false);

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

  // body 정본 = body 상태. GUI 편집 시 호출 → JSON도 동기화.
  function updateBody(next: ContentBody) {
    setBody(next);
    setBodyJson(JSON.stringify(next, null, 2));
    setBodyError(null);
  }

  // 고급 JSON 직접 편집 → body 동기화.
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
    updateBody(t === 'case' ? EMPTY_CASE : EMPTY_TREND);
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
        updateBody(json.body);
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

  // 발행 게이트 = 자동 lint(차단 항목)만. 수동 확인 체크는 폐지(솔로 운영 마찰 제거).
  const canPublish = lint.passed;

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
        // HERMES 씨앗에서 생성된 콘텐츠면 씨앗도 발행됨으로 닫기(연결 없으면 no-op)
        await supabase.from('content_seeds').update({ status: 'published' }).eq('content_id', id);
      }
      // 스튜디오 임베드: 페이지 이동 없이 콜백으로 다음 단계(홈배치) 진행.
      if (onSaved) {
        onSaved(status, id);
        router.refresh();
        return;
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
          <Button variant="outline" onClick={() => setPreviewOpen((v) => !v)}>
            {previewOpen ? <PenLine className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {previewOpen ? '편집으로' : '미리보기'}
          </Button>
          <Button variant="outline" onClick={() => save('draft')} disabled={pending}>
            <Save className="h-4 w-4" /> 초안 저장
          </Button>
          <Button variant="accent" onClick={() => save('published')} disabled={pending || !canPublish}>
            <Send className="h-4 w-4" /> 발행
          </Button>
        </div>
      </header>

      {previewOpen && (
        <div className="mb-6">
          <ContentPreview
            track={track}
            title={title}
            summary={summary}
            jobTags={jobTags}
            readMin={readMin}
            applyMin={applyMin}
            authorQuote={authorQuote}
            body={body}
            onPatch={(p) => {
              if (p.title !== undefined) setTitle(p.title);
              if (p.summary !== undefined) setSummary(p.summary);
              if (p.authorQuote !== undefined) setAuthorQuote(p.authorQuote);
            }}
            onBody={updateBody}
          />
        </div>
      )}

      <div className={previewOpen ? 'hidden' : undefined}>
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
              <h2 className="font-semibold">본문</h2>
              {process.env.NEXT_PUBLIC_AI_DRAFT_ENABLED === 'true' && (
                <Button variant="outline" size="sm" onClick={runAIDraft} disabled={aiBusy}>
                  <Sparkles className="h-4 w-4" /> {aiBusy ? '생성 중…' : 'AI 초안'}
                </Button>
              )}
            </header>

            {/* GUI 본문 에디터 (D70 정본) */}
            {body.kind === 'case' ? (
              <CaseBodyEditor value={body} onChange={updateBody} />
            ) : (
              <TrendBodyEditor value={body} onChange={updateBody} />
            )}

            {/* 고급 — JSON 직접 편집 (AI 초안 붙여넣기·고급 블록·디버깅용) */}
            <details className="mt-5 rounded-lg border border-border">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-ink/60">
                JSON 직접 편집 (고급)
              </summary>
              <div className="border-t border-border p-3">
                <p className="mb-2 text-[11px] text-ink/50 break-keep">
                  claude.ai 초안 붙여넣기·GUI 미지원 블록(role-card 등)·디버깅용. 저장하면 위 GUI에 반영됩니다.
                </p>
                <Textarea
                  value={bodyJson}
                  onChange={(e) => syncBody(e.target.value)}
                  className="font-mono text-xs min-h-[360px]"
                />
                {bodyError && (
                  <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {bodyError}
                  </p>
                )}
              </div>
            </details>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-5">
            <h3 className="font-semibold text-sm mb-3">발행 게이트 (자동)</h3>
            <ul className="space-y-1.5">
              {lint.checks.map((c) => {
                const warn = c.blocking === false; // 실패해도 발행 안 막는 경고
                return (
                  <li key={c.id} className="flex items-start gap-2 text-xs">
                    {c.passed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle
                        className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', warn ? 'text-amber-500' : 'text-red-500')}
                      />
                    )}
                    <span className={c.passed ? 'text-ink/60' : warn ? 'text-amber-600' : 'text-red-600 font-medium'}>
                      {c.label}
                      {c.detail && <span className="block text-[10px] mt-0.5">{c.detail}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
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
                <li>본문은 위 GUI 섹션 에디터로 직접 작성 (D70 7섹션)</li>
                <li>또는 claude.ai에서 톤 가이드+스키마로 받은 JSON을 “JSON 직접 편집(고급)”에 붙여넣기 → GUI에서 미세조정</li>
                <li>직무 태그·페르소나·시간 라벨 채우기</li>
                <li>발행 게이트 자동 통과 확인 → 발행</li>
              </ol>
              <p className="mt-2 text-[10px] text-ink/40">
                AI 초안 자동화는 출시 후 도입 예정.
              </p>
            </section>
          )}
        </aside>
      </div>
      </div>
    </div>
  );
}
