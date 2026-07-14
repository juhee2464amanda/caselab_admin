'use client';

import { useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, Loader2, Sparkles, Upload, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { SEED_TRACKS, type SeedTrack } from '@/lib/seed-tracks';
import { trackEdge } from '@/lib/track-edges';
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
  | { step: 'published'; id: string; kind: Kind; title: string; liveUrl?: string };

// 생성은 로컬 작업장(Claude CLI)에서만. Vercel에선 안내만.
const LOCAL_AI = process.env.NEXT_PUBLIC_LOCAL_AI === 'true';
// 본가(라이브 사이트) URL — 발행 후 "본가에서 보기" 링크용. prod=본가 도메인, 로컬=localhost.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://caselab.vercel.app';

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

  // 엣지 제안 — 트랙 형식(목업 스터디 프로파일)에 대고 각도·섹션 배치를 제안받아 수정 후 생성에 주입
  const [edgeBusy, setEdgeBusy] = useState(false);
  const [angle, setAngle] = useState('');
  const [planText, setPlanText] = useState(''); // 줄 단위 "섹션 — 배치 계획"
  const [missing, setMissing] = useState<string[]>([]);
  const [proposed, setProposed] = useState(false);
  // 재생성 — 값이 있으면 이 초안 id를 덮어쓴다(엣지 조정 후 다시 생성). 없으면 새 초안.
  const [replaceId, setReplaceId] = useState<string | null>(null);

  // 트랙이 바뀌면 형식도 바뀌므로 제안 초기화
  const selectTrack = (t: SeedTrack) => {
    setTrack(t);
    setAngle('');
    setPlanText('');
    setMissing([]);
    setProposed(false);
  };

  const propose = async () => {
    if (!markdown.trim() || !title.trim() || !track) return;
    setEdgeBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), markdown, track }),
      });
      const json = (await res.json()) as {
        angle?: string;
        plan?: { section: string; note: string }[];
        missing?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? '엣지 제안 실패');
      setAngle(json.angle ?? '');
      setPlanText((json.plan ?? []).map((p) => `${p.section} — ${p.note}`).join('\n'));
      setMissing(json.missing ?? []);
      setProposed(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEdgeBusy(false);
    }
  };

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
        body: JSON.stringify({
          title: title.trim(),
          markdown,
          track,
          direction: extra.trim() || undefined,
          angle: angle.trim() || undefined,
          edgePlan: planText
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          missing,
          replaceId: replaceId || undefined,
        }),
      });
      const json = (await res.json()) as { id?: string; kind?: Kind; error?: string };
      if (!res.ok || !json.id || !json.kind) throw new Error(json.error ?? '생성 실패');
      setReplaceId(null);
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

  const onSaved = async (status: string, savedId?: string, kind?: Kind, savedTitle?: string) => {
    if (status === 'published' && savedId) {
      // 발행 후 본가(라이브)에서 바로 확인할 수 있게 해당 콘텐츠 URL을 계산.
      let liveUrl: string | undefined;
      if ((kind ?? 'content') === 'content') {
        const { data } = await supabase.from('contents').select('slug, track').eq('id', savedId).maybeSingle();
        const row = data as { slug?: string; track?: string } | null;
        if (row?.slug) liveUrl = `${SITE_URL}/${row.track === 'case' ? 'cases' : 'trends'}/${row.slug}`;
      }
      setPhase({ step: 'published', id: savedId, kind: kind ?? 'content', title: savedTitle ?? '', liveUrl });
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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={backToCompose}>
              <ArrowLeft className="h-3.5 w-3.5" /> MD 반입으로
            </Button>
            {/* 엣지 조정 후 재생성 — 각도·섹션 배치를 고쳐 이 초안을 덮어쓴다(새 초안 안 쌓임). */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setReplaceId(phase.id);
                setPhase({ step: 'compose' });
              }}
            >
              <Wand2 className="h-3.5 w-3.5" /> 엣지 조정·재생성
            </Button>
          </div>
          <span className="text-xs text-ink/40">생성된 초안을 다듬고 발행하세요 · 발행하면 홈 배치로 이어집니다</span>
        </div>
        {error && <p className="px-4 sm:px-8 text-xs text-red-600">{error}</p>}
        {phase.kind === 'content' ? (
          <TrackForm
            initial={phase.row as never}
            startInPreview
            onSaved={(status, id) => onSaved(status, id, 'content', editTitle)}
          />
        ) : (
          <ToolForm
            initial={phase.row as never}
            startInPreview
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

          {/* 본가(라이브)에서 방금 발행한 콘텐츠 바로 확인 */}
          {phase.kind === 'content' && phase.liveUrl && (
            <a
              href={phase.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> 본가에서 보기
            </a>
          )}

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
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          <p className="font-semibold flex items-center gap-1.5">
            <span aria-hidden>🖥️</span> 초안 생성은 내 컴퓨터에서 열어야 동작해요
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-amber-700">
            무료(구독 Claude)로 돌리기 위해 초안 생성은 로컬에서만 작동합니다. 아래 버튼을 누르면
            내 컴퓨터에서 스튜디오가 켜지고 잠시 뒤 이 화면이 로컬로 다시 열려요. 그때 <b>초안 생성</b>{' '}
            버튼이 활성화됩니다.
          </p>
          <a
            href="caselab-studio://open"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            ▶ 내 컴퓨터에서 스튜디오 열기
          </a>
          <p className="mt-2 text-[12px] text-amber-600">
            처음 누르면 “CaselabStudio 열기를 허용하시겠습니까?”가 뜨는데 <b>허용</b>을 누르세요.
            버튼이 안 되면 터미널에서 <code className="rounded bg-amber-100 px-1">npm run studio</code>.
          </p>
        </div>
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
                  <TrackChip key={t.track} label={t.label} active={track === t.track} onClick={() => selectTrack(t.track)} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-ink/40 w-12">자료실</span>
                {libraryTracks.map((t) => (
                  <TrackChip key={t.track} label={t.label} active={track === t.track} onClick={() => selectTrack(t.track)} />
                ))}
              </div>
            </div>

            {/* 타입별 엣지 카드 — 같은 소재라도 형식마다 살릴 각도가 다르다(목업 스터디 프로파일) */}
            {track && (
              <div className="mt-2 space-y-3 rounded-lg border border-border bg-muted/40 p-3">
                {(() => {
                  const e = trackEdge(track);
                  return (
                    <>
                      <p className="text-xs font-medium text-ink/80">{e.edge}</p>
                      <ul className="space-y-1">
                        {e.sections.map((s) => (
                          <li key={s.name} className="text-xs text-ink/60">
                            <span className="font-medium text-ink/75">{s.name}</span> · {s.need}
                          </li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-ink/45">
                        맞는 소재: {e.fits} <br /> 덜어낼 것: {e.cuts}
                      </p>
                    </>
                  );
                })()}

                {/* 엣지 제안 — MD를 이 형식에 대고 각도·섹션 배치를 제안받아 수정 후 생성에 주입 */}
                {!proposed ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={edgeBusy || !markdown.trim() || !title.trim() || !LOCAL_AI}
                    onClick={propose}
                  >
                    {edgeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                    {edgeBusy ? '문서를 형식에 대보는 중…' : '이 타입으로 엣지 제안'}
                  </Button>
                ) : (
                  <div className="space-y-2 border-t border-border pt-3">
                    <label className="block text-xs font-medium text-ink/70">
                      각도 <span className="font-normal text-ink/40">(수정 가능)</span>
                    </label>
                    <input
                      value={angle}
                      onChange={(e) => setAngle(e.target.value)}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <label className="block text-xs font-medium text-ink/70">
                      섹션 배치 계획 <span className="font-normal text-ink/40">(한 줄 = 한 섹션, 수정 가능)</span>
                    </label>
                    <textarea
                      value={planText}
                      onChange={(e) => setPlanText(e.target.value)}
                      rows={Math.min(10, Math.max(4, planText.split('\n').length + 1))}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    {missing.length > 0 && (
                      <p className="text-[11px] text-amber-700">
                        문서에 없는 것(지어내지 않고 생략·문서 범위로 제한): {missing.join(' · ')}
                      </p>
                    )}
                    <Button size="sm" variant="ghost" disabled={edgeBusy} onClick={propose}>
                      {edgeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} 다시
                      제안
                    </Button>
                  </div>
                )}
              </div>
            )}
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

        {/* 재생성 모드 — 편집 화면의 "엣지 조정·재생성"으로 진입. 엣지를 고쳐 기존 초안을 덮어쓴다. */}
        {replaceId && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent">
            <span>재생성 모드 — 엣지(각도·배치)를 조정하고 “다시 생성”하면 기존 초안을 덮어써요.</span>
            <button type="button" onClick={() => setReplaceId(null)} className="shrink-0 underline">
              새 초안으로
            </button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button variant="accent" disabled={!ready || busy || !LOCAL_AI} onClick={generate}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy
              ? replaceId
                ? '다시 생성 중… (몇 분 걸릴 수 있어요)'
                : '초안 생성 중… (몇 분 걸릴 수 있어요)'
              : replaceId
                ? '다시 생성 (덮어쓰기)'
                : '초안 생성'}
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
