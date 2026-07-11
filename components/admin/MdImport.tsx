'use client';

import { useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { SEED_TRACKS, type SeedTrack } from '@/lib/seed-tracks';
import { TrackForm } from '@/components/admin/TrackForm';
import { ToolForm } from '@/components/admin/ToolForm';
import { FeaturedPlacer } from '@/components/admin/Studio';

type Kind = 'content' | 'tool';

// MD 직행 레인 — 텔레그램(HERMES 봇)과 논의해 만든 완성 MD를 받아
// 타입 선택 → 초안 생성 → 편집 → 발행 → 홈배치를 한 화면에서 끝낸다.
// (기획방향·개요·리서치는 MD에 이미 담겨 있으므로 스튜디오의 개요 단계를 생략)
type Phase =
  | { step: 'compose' }
  | { step: 'loading'; id: string; kind: Kind }
  | { step: 'edit'; id: string; kind: Kind; row: Record<string, unknown> }
  | { step: 'published'; id: string; kind: Kind; title: string };

// 생성은 로컬 작업장(Claude CLI)에서만. Vercel에선 안내만.
const LOCAL_AI = process.env.NEXT_PUBLIC_LOCAL_AI === 'true';

export function MdImport() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [phase, setPhase] = useState<Phase>({ step: 'compose' });
  const [error, setError] = useState<string | null>(null);

  // compose 입력
  const [markdown, setMarkdown] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [track, setTrack] = useState<SeedTrack | null>(null);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const applyMarkdown = (text: string, name?: string) => {
    setMarkdown(text);
    setFileName(name ?? null);
    if (!titleTouched) {
      // 첫 H1을 제목으로 자동 추출(직접 수정 가능)
      const h1 = text.match(/^#\s+(.+)$/m);
      if (h1) setTitle(h1[1].trim());
    }
  };

  const readFile = (file: File) => {
    file
      .text()
      .then((t) => applyMarkdown(t, file.name))
      .catch(() => setError('파일을 읽지 못했어요.'));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const clearFile = () => {
    setMarkdown('');
    setFileName(null);
    if (!titleTouched) setTitle('');
    if (fileInput.current) fileInput.current.value = '';
  };

  const generate = async () => {
    if (!markdown.trim() || !title.trim() || !track) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), markdown, track, direction: extra.trim() || undefined }),
      });
      const json = (await res.json()) as { id?: string; kind?: Kind; error?: string };
      if (!res.ok || !json.id || !json.kind) throw new Error(json.error ?? '생성 실패');
      await openEditor(json.id, json.kind);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // 생성 완료 → 방금 만든 초안 row를 불러와 에디터 임베드 (Studio와 동일 패턴)
  const openEditor = async (id: string, kind: Kind) => {
    setPhase({ step: 'loading', id, kind });
    const table = kind === 'content' ? 'contents' : 'tools';
    const { data, error: err } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    if (err || !data) {
      setError(err?.message ?? '초안을 불러오지 못했어요.');
      setPhase({ step: 'compose' });
      return;
    }
    setPhase({ step: 'edit', id, kind, row: data as Record<string, unknown> });
  };

  const backToCompose = () => {
    setPhase({ step: 'compose' });
    router.refresh();
  };

  const onSaved = (status: string, savedId?: string, kind?: Kind, savedTitle?: string) => {
    if (status === 'published' && savedId) {
      setPhase({ step: 'published', id: savedId, kind: kind ?? 'content', title: savedTitle ?? '' });
    }
  };

  if (phase.step === 'loading') {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-ink/60">
        <Loader2 className="h-4 w-4 animate-spin" /> 초안 여는 중…
      </div>
    );
  }

  if (phase.step === 'edit') {
    const editTitle = (phase.row.title as string) || (phase.row.name as string) || '';
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 px-4 pt-4 sm:px-8">
          <Button size="sm" variant="ghost" onClick={backToCompose}>
            <ArrowLeft className="h-3.5 w-3.5" /> MD 반입으로
          </Button>
          <span className="text-xs text-ink/40">생성된 초안을 다듬고 발행하세요 · 발행하면 홈 배치로 이어집니다</span>
        </div>
        {error && <p className="px-4 sm:px-8 text-xs text-red-600">{error}</p>}
        {phase.kind === 'content' ? (
          <TrackForm
            initial={phase.row as never}
            onSaved={(status, id) => onSaved(status, id, 'content', editTitle)}
          />
        ) : (
          <ToolForm
            initial={phase.row as never}
            onSaved={(status, id) => onSaved(status, id, 'tool', editTitle)}
          />
        )}
      </div>
    );
  }

  if (phase.step === 'published') {
    return (
      <div className="p-4 sm:p-8">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            <h1 className="font-serif text-lg font-semibold">발행 완료</h1>
          </div>
          <p className="text-sm text-ink/60">
            {phase.title && <b>{phase.title}</b>} 콘텐츠가 발행됐어요.
            {phase.kind === 'content'
              ? ' 아래에서 홈 대표 영역에 바로 배치하세요.'
              : ' 자료실에 노출됩니다(자료류는 홈 대표 슬롯이 없어요).'}
          </p>

          {phase.kind === 'content' ? (
            <FeaturedPlacer contentId={phase.id} title={phase.title} />
          ) : (
            <Link href="/admin/tools" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> 자료실에서 보기
            </Link>
          )}

          <div className="flex items-center gap-2 border-t border-border pt-4">
            <Button size="sm" variant="accent" onClick={backToCompose}>
              <Sparkles className="h-3.5 w-3.5" /> 새 MD로 만들기
            </Button>
            <Link href="/admin/contents/curation" className="text-xs text-ink/50 hover:underline">
              큐레이션 전체 관리 →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // compose — MD 반입 → 타입 선택 → 생성
  const contentTracks = SEED_TRACKS.filter((t) => t.group === 'content');
  const libraryTracks = SEED_TRACKS.filter((t) => t.group === 'library');
  const ready = !!markdown.trim() && !!title.trim() && !!track;

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header>
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">MD로 시작</h1>
        <p className="text-sm text-ink/60 mt-1">
          텔레그램 봇과 각도를 잡고 리서치까지 마친 MD 문서를 넣으면, 씨앗 단계 없이 바로 초안으로 만들어요.
        </p>
      </header>

      {!LOCAL_AI && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          초안 생성은 로컬 작업장(Claude CLI)에서만 동작해요. 여기서는 미리보기만 가능합니다.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="mx-auto w-full max-w-3xl space-y-5">
        {/* 1. MD 문서 */}
        <section className="rounded-xl border border-border bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold">1. MD 문서</h2>
          {markdown ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
                <span className="inline-flex items-center gap-2 text-sm text-ink/70 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-ink/40" />
                  <span className="truncate">{fileName ?? '붙여넣은 문서'}</span>
                  <span className="shrink-0 text-xs text-ink/40">{markdown.length.toLocaleString()}자</span>
                </span>
                <Button size="sm" variant="ghost" onClick={clearFile}>
                  <X className="h-3.5 w-3.5" /> 비우기
                </Button>
              </div>
              <textarea
                value={markdown}
                onChange={(e) => applyMarkdown(e.target.value, fileName ?? undefined)}
                rows={10}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInput.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center transition-colors',
                dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-ink/30'
              )}
            >
              <Upload className="h-5 w-5 text-ink/40" />
              <p className="text-sm text-ink/60">.md 파일을 끌어다 놓거나 클릭해서 선택</p>
              <p className="text-xs text-ink/40">아래에 직접 붙여넣어도 돼요</p>
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFile(file);
            }}
          />
          {!markdown && (
            <textarea
              placeholder="또는 MD 내용을 여기에 붙여넣기…"
              rows={5}
              onChange={(e) => applyMarkdown(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-accent"
            />
          )}
        </section>

        {/* 2. 제목 + 타입 */}
        <section className="rounded-xl border border-border bg-white p-4 space-y-4">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">2. 제목</h2>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              placeholder="문서의 첫 제목(#)을 자동으로 가져와요"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">3. 콘텐츠 타입</h2>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-ink/40 w-12">콘텐츠</span>
                {contentTracks.map((t) => (
                  <TrackChip key={t.track} label={t.label} active={track === t.track} onClick={() => setTrack(t.track)} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-ink/40 w-12">자료실</span>
                {libraryTracks.map((t) => (
                  <TrackChip key={t.track} label={t.label} active={track === t.track} onClick={() => setTrack(t.track)} />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">
              4. 보강 지시 <span className="font-normal text-ink/40">(선택)</span>
            </h2>
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={2}
              placeholder="문서 각도는 그대로 유지돼요. 덧붙일 지시만 짧게 (예: 프롬프트 예시는 한국어 버전만)"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </section>

        <div className="flex items-center gap-3">
          <Button variant="accent" disabled={!ready || busy || !LOCAL_AI} onClick={generate}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? '초안 생성 중… (몇 분 걸릴 수 있어요)' : '초안 생성'}
          </Button>
          {!ready && <span className="text-xs text-ink/40">MD 문서·제목·타입을 채우면 생성할 수 있어요</span>}
        </div>
      </div>
    </div>
  );
}

function TrackChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        active ? 'border-accent bg-accent text-white' : 'border-border bg-white text-ink/60 hover:border-ink/30'
      )}
    >
      {label}
    </button>
  );
}
