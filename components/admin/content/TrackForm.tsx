'use client';

import { useState, useTransition, useEffect, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Save, Send, AlertCircle, CheckCircle2, Eye, EyeOff, PenLine, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { JOB_LABELS, JOB_TAGS, PERSONAS, PERSONA_LABELS } from '@/types/content';
import type { ContentBody, ContentRow, JobTag, Persona } from '@/types/content';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { lintContent, estimateReadMin } from '@/lib/content/content-lint';
import { slugify, cn } from '@/lib/utils';
import { CaseBodyEditor } from '@/components/admin/content/section-editors/CaseBodyEditor';
import { TrendBodyEditor } from '@/components/admin/content/section-editors/TrendBodyEditor';
import { ContentPreview } from '@/components/admin/content/ContentPreview';
import { ThumbnailField, ThumbnailDropzone } from '@/components/admin/content/ThumbnailField';
import { ThumbnailSuggest } from '@/components/admin/content/ThumbnailSuggest';
import { AiImageFill } from '@/components/admin/content/AiImageFill';
import {
  imageTargets,
  captureUrlCandidates,
  bodyExcerptForThumbnail,
  applyImagesToBody,
} from '@/lib/content/content-image-targets';
import { RefineProvider, RefinePanel } from '@/components/admin/content/RefinePanel';

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

// 발행 준비 레일의 필수 입력 한 줄 — 충족 시 초록 체크, 미충족 시 빨간 경고 아이콘.
function RailField({ ok, label, children }: { ok: boolean; label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="flex items-center gap-1.5 text-xs">
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
        )}
        {label}
      </Label>
      {children}
    </div>
  );
}

export function TrackForm({ initial, onSaved, startInPreview }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [pending, startTransition] = useTransition();

  const [track, setTrack] = useState<'case' | 'trend'>(initial?.track ?? 'case');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [readMin, setReadMin] = useState(initial?.read_min ?? 5);
  // 읽기 시간 자동 모드 — 저장된 값이 없으면(신규·미설정) 본문 길이로 자동 산출.
  // 값이 이미 있으면 운영자가 손댄 것으로 보고 수동 유지.
  const [readMinAuto, setReadMinAuto] = useState((initial?.read_min ?? 0) < 1);
  const [applyMin, setApplyMin] = useState(initial?.apply_min ?? 10);
  const [authorQuote, setAuthorQuote] = useState(initial?.author_quote ?? '');
  const [thumbnailUrl, setThumbnailUrl] = useState(initial?.thumbnail_url ?? '');
  const [jobTags, setJobTags] = useState<JobTag[]>((initial?.job_tags as JobTag[]) ?? []);
  const [personas, setPersonas] = useState<Persona[]>((initial?.persona_coverage as Persona[]) ?? []);
  // 케이스 성격 분류 — 워크플로/자동화/제작기 (categories.type='content_subcategory'). 트렌드는 미사용.
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [caseCats, setCaseCats] = useState<{ id: string; slug: string; label: string }[]>([]);
  const [body, setBody] = useState<ContentBody>(
    initial?.body ?? (track === 'case' ? EMPTY_CASE : EMPTY_TREND)
  );
  const [bodyJson, setBodyJson] = useState(JSON.stringify(body, null, 2));
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  // 라이브 미리보기 — 현재 폼 상태(body 포함)를 본가 상세 마크업으로 렌더.
  // 더블클릭 인라인 편집이 폼 상태로 커밋되므로 미리보기 자체가 편집 표면이다.
  // 기존 콘텐츠 편집(=id 있음)은 실제 초안을 메인으로 열고, 새 콘텐츠는 구조 편집으로 시작.
  // (설정 레일은 두 모드 공통으로 항상 노출되므로 어느 쪽에서든 메타·발행을 바로 편집)
  const [previewOpen, setPreviewOpen] = useState(startInPreview ?? !!initial?.id);
  // 설정·발행은 상단 접이 바로 이동 — 우측은 AI 제안 패널 전용. 새 콘텐츠(메타 미입력)는 열고 시작.
  const [settingsOpen, setSettingsOpen] = useState(!initial?.id);

  // 본가 노출 상태 — 저장 후에도 prop(initial)은 안 바뀌므로 별도 상태로 추적한다.
  // published_at은 "최초 발행 시각" 의미. 한 번 찍히면 재발행·초안 회귀에도 보존한다
  //  → 본가 최신 발행순 정렬이 편집할 때마다 흔들리지 않는다.
  const [live, setLive] = useState({
    published: initial?.status === 'published',
    publishedAt: initial?.published_at ?? null,
  });

  // 자동 슬러그
  useEffect(() => {
    if (!slug && title) setSlug(slugify(title));
  }, [title, slug]);

  // 자동 저장 (localStorage)
  useEffect(() => {
    const draftKey = `draft-${initial?.id ?? 'new'}`;
    const t = setTimeout(() => {
      localStorage.setItem(draftKey, JSON.stringify({ track, title, slug, summary, readMin, applyMin, authorQuote, thumbnailUrl, jobTags, personas, categoryId, body }));
    }, 1000);
    return () => clearTimeout(t);
  }, [initial?.id, track, title, slug, summary, readMin, applyMin, authorQuote, thumbnailUrl, jobTags, personas, categoryId, body]);

  // 재로그인 복구 — 세션 만료로 /login에 다녀온 뒤 돌아오면 임시 저장분을 복구.
  // (Google OAuth는 페이지를 완전히 떠나므로 폼 상태가 사라진다)
  useEffect(() => {
    const key = `recover-${initial?.id ?? 'new'}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    localStorage.removeItem(key);
    try {
      const d = JSON.parse(raw);
      if (!confirm('로그인 전에 작성하던 내용이 있어요. 복구할까요?')) return;
      setTrack(d.track); setTitle(d.title); setSlug(d.slug); setSummary(d.summary);
      setReadMin(d.readMin); setApplyMin(d.applyMin); setAuthorQuote(d.authorQuote);
      setThumbnailUrl(d.thumbnailUrl); setJobTags(d.jobTags); setPersonas(d.personas);
      setCategoryId(d.categoryId ?? '');
      updateBody(d.body);
    } catch { /* 손상된 스냅샷은 무시 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 케이스 성격 분류 로드 — /admin/contents CategoryQuickEdit와 같은 마스터(content_subcategory/case)
  useEffect(() => {
    supabase
      .from('categories')
      .select('id, slug, label')
      .eq('type', 'content_subcategory')
      .eq('parent_track', 'case')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setCaseCats(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 이미지 채우기·썸네일 후보 (우측 레일) 재료
  // 콘텐츠에는 도구의 URL 같은 필드가 없다 — 훑을 주소는 본문 출처·북마크에서 뽑아 후보로 주고
  // 패널 안에서 고르거나 직접 넣는다. 편집 화면을 열 때 첫 후보를 기본값으로 채운다.
  const [fillUrl, setFillUrl] = useState(
    () => captureUrlCandidates((initial?.body ?? EMPTY_TREND) as ContentBody)[0]?.url ?? ''
  );
  const fillTargets = useMemo(() => imageTargets(body), [body]);
  const fillUrlCandidates = useMemo(() => captureUrlCandidates(body), [body]);
  const thumbExcerpt = useMemo(() => bodyExcerptForThumbnail(body), [body]);

  // 본문 길이 기반 읽기 시간 추정 — 자동 모드면 본문이 바뀔 때마다 반영.
  const estReadMin = useMemo(() => estimateReadMin(body), [body]);
  useEffect(() => {
    if (readMinAuto) setReadMin(estReadMin);
  }, [readMinAuto, estReadMin]);

  // 읽기 시간 수동 입력 → 자동 해제. '자동' 버튼으로 되돌리면 다시 본문 기준.
  function onReadMinInput(v: number) {
    setReadMinAuto(false);
    setReadMin(Number.isFinite(v) ? v : 0);
  }

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
    thumbnail_url: thumbnailUrl,
    body,
  });

  // 케이스 분류 — 케이스만 필수 (분류 없는 케이스가 본가 필터에서 빠지는 걸 발행 시점에 차단)
  const isTrend = track === 'trend';
  const catOk = isTrend || !!categoryId;

  // 발행 게이트 = 자동 lint(차단 항목) + 케이스 분류. 수동 확인 체크는 폐지(솔로 운영 마찰 제거).
  const canPublish = lint.passed && catOk;

  // 우측 발행 준비 레일용 파생값 — 신호등·남은 항목 수·본문/경고 상태.
  const contentOk = lint.checks.find((c) => c.id === 'has-content')?.passed ?? false;
  const thumbOk = lint.checks.find((c) => c.id === 'thumbnail')?.passed ?? false;
  const failingCount = lint.checks.filter((c) => c.blocking !== false && !c.passed).length + (catOk ? 0 : 1);
  const warnings = lint.checks.filter((c) => c.blocking === false && !c.passed);

  // 저장/발행 write 실패 처리 — 세션 만료면 재로그인 유도, 아니면 원인 노출.
  // 반환값 true = 처리 종료(호출부에서 return), 이후 페이지 이동을 막는다.
  async function handleWriteError(error: { message: string }, verb: string): Promise<boolean> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      // 유효한 세션 없음 = 만료/로그아웃. 작성분 임시 저장 후 재로그인.
      const key = `recover-${initial?.id ?? 'new'}`;
      localStorage.setItem(
        key,
        JSON.stringify({ track, title, slug, summary, readMin, applyMin, authorQuote, thumbnailUrl, jobTags, personas, categoryId, body })
      );
      const goLogin = confirm(
        `${verb} 실패: 로그인 세션이 만료된 것 같아요.\n작성 중인 내용을 임시 저장했어요. 다시 로그인할까요?`
      );
      if (goLogin) {
        const next = window.location.pathname + window.location.search;
        window.location.href = `/login?next=${encodeURIComponent(next)}`;
      }
      return true;
    }
    // 세션은 유효한데 거부됨 = 권한/데이터 문제. 원인 그대로 노출.
    alert(`${verb} 실패: ${error.message}`);
    return true;
  }

  // 저장 의도 3종 — 상태 전이를 버튼이 아니라 여기서 결정한다.
  //  'draft'     초안으로 저장(미발행 글에만 노출). 발행 글은 이 경로로 못 온다.
  //  'publish'   초안 → 발행. 게이트 통과 필수. 카드프레스·씨앗 마감이 여기서만 돈다.
  //  'update'    이미 발행된 글의 내용 수정. status/published_at 그대로 두고 본가만 갱신.
  //  'unpublish' 본가에서 내리기. 명시적 확인을 거친 경우에만.
  type SaveIntent = 'draft' | 'publish' | 'update' | 'unpublish';

  function save(intent: SaveIntent) {
    if (bodyError) return alert('본문 JSON 오류: ' + bodyError);
    if (intent === 'publish' && !canPublish) return alert('발행 게이트 통과 필요');
    // 이미 본가에 나가 있는 글은 게이트 미충족이어도 저장을 막지 않는다(고치러 들어온 건데
    // 저장을 막으면 편집이 갇힌다). 대신 지금 상태가 그대로 나간다는 걸 알린다.
    if (intent === 'update' && !canPublish) {
      const miss = lint.checks.filter((c) => c.blocking !== false && !c.passed).map((c) => c.label);
      if (!catOk) miss.push('케이스 분류');
      if (!confirm(`발행 게이트 미충족 ${miss.length}건(${miss.join(', ')})이 있어요.\n이 글은 이미 본가에 나가 있어서, 저장하면 이 상태 그대로 반영됩니다. 계속할까요?`)) return;
    }
    if (intent === 'unpublish') {
      if (!confirm('본가에서 내립니다.\n\n· /cases · /trends 목록과 상세 페이지에서 즉시 사라져요.\n· 카드뉴스에 이미 만든 카드가 있으면 캡션·스레드의 본가 링크가 404가 됩니다.\n\n계속할까요?')) return;
    }

    const status: 'draft' | 'published' = intent === 'publish' || intent === 'update' ? 'published' : 'draft';
    startTransition(async () => {
      const payload = {
        slug: slug || slugify(title),
        track,
        title,
        summary,
        body,
        job_tags: jobTags,
        persona_coverage: personas,
        category_id: track === 'case' && categoryId ? categoryId : null,
        read_min: readMin,
        apply_min: applyMin,
        author_quote: authorQuote || null,
        thumbnail_url: thumbnailUrl || null,
        status,
        // 최초 발행 때만 찍고 이후엔 보존 — 초안 저장이 발행 이력을 지우지 않는다.
        published_at: live.publishedAt ?? (status === 'published' ? new Date().toISOString() : null),
      };
      const verb =
        intent === 'publish' ? '발행' : intent === 'update' ? '변경사항 저장' : intent === 'unpublish' ? '발행 취소' : '초안 저장';
      let id = initial?.id;
      if (id) {
        const { error } = await supabase.from('contents').update(payload).eq('id', id);
        if (error) return void (await handleWriteError(error, verb));
      } else {
        const { data, error } = await supabase.from('contents').insert(payload).select('id').single();
        if (error) return void (await handleWriteError(error, verb));
        id = data?.id;
        if (!id) return alert(`${verb} 실패: 저장된 콘텐츠 ID를 받지 못했습니다.`);
      }
      setLive({ published: status === 'published', publishedAt: payload.published_at });

      // 본가 캐시 갱신은 노출 상태가 바뀌거나 내용이 바뀐 모든 경우에 필요하다(내릴 때 포함).
      if (id && (status === 'published' || intent === 'unpublish')) {
        try {
          const res = await fetch('/api/revalidate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id, track }),
          });
          if (!res.ok) throw new Error(`revalidate ${res.status}`);
        } catch (e) {
          // 저장은 성공했으나 캐시 갱신 실패 — 상태 변경 자체는 유효하므로 경고만.
          alert(`${verb}은 저장됐지만 본가 캐시 갱신에 실패했습니다. 잠시 후 반영될 수 있습니다.\n(${(e as Error).message})`);
        }
      }
      // 씨앗 마감·카드프레스 생성은 '최초 발행' 1회만. 'update'에서 다시 돌면
      // content_cards가 upsert로 덮여 검수·편집해 둔 슬라이드가 날아간다.
      if (id && intent === 'publish') {
        // HERMES 씨앗에서 생성된 콘텐츠면 씨앗도 발행됨으로 닫기(연결 없으면 no-op)
        const { error: seedError } = await supabase
          .from('content_seeds')
          .update({ status: 'published' })
          .eq('content_id', id);
        if (seedError) alert(`씨앗 상태 갱신 실패(발행은 완료됨): ${seedError.message}`);
        // 카드프레스: 발행 즉시 인스타 캐러셀·캡션·스레드 3종 세트 생성 시작 (auto_draft).
        // AI 재작성이 수 분 걸리므로 기다리지 않는다 — 결과는 스튜디오 '카드뉴스' 탭에서 검수.
        fetch('/api/cardpress/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sourceType: 'content', sourceId: id }),
        }).catch(() => {});
      }
      // 스튜디오 임베드: 페이지 이동 없이 콜백으로 다음 단계(홈배치) 진행.
      if (onSaved) {
        onSaved(status, id);
        router.refresh();
        return;
      }
      // 단독 편집(/admin/contents/[id]·/new): 저장·발행 후 admin 홈이 아니라 콘텐츠 목록으로.
      router.push('/admin/contents');
      router.refresh();
    });
  }

  return (
    <RefineProvider>
    <div className="p-4 sm:p-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">
          {initial?.id ? '콘텐츠 편집' : '새 콘텐츠'}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen((v) => !v)}>
            {previewOpen ? <PenLine className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {previewOpen ? '구조 편집' : '초안 편집'}
          </Button>
          {/* 본가에 나가 있는 글은 '초안 저장'이 곧 발행 취소였다 → 수정 저장과 내리기를 분리. */}
          {live.published ? (
            <>
              <Button variant="outline" onClick={() => save('unpublish')} disabled={pending}>
                <EyeOff className="h-4 w-4" /> 발행 취소
              </Button>
              <Button variant="accent" onClick={() => save('update')} disabled={pending}>
                <Save className="h-4 w-4" /> 변경사항 저장
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => save('draft')} disabled={pending}>
                <Save className="h-4 w-4" /> 초안 저장
              </Button>
              <Button variant="accent" onClick={() => save('publish')} disabled={pending || !canPublish}>
                <Send className="h-4 w-4" /> 발행
              </Button>
            </>
          )}
        </div>
      </header>

      {/* 설정·발행 — 상단 접이 바 (우측은 AI 제안 패널 전용) */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:bg-muted"
        >
          <SlidersHorizontal className="h-4 w-4" /> 설정 · 발행
          <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform', settingsOpen && 'rotate-180')} />
        </button>
        {settingsOpen && (
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <section className="card p-5 space-y-3">
              <h2 className="font-semibold text-sm">설정</h2>
              <div>
                <Label htmlFor="track" className="text-xs">트랙</Label>
                <Select value={track} onValueChange={(v) => switchTrack(v as 'case' | 'trend')}>
                  <SelectTrigger id="track" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="case">실전 케이스 (4단)</SelectItem>
                    <SelectItem value="trend">AI 트렌드 (3단)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* 케이스 성격 분류 — 단일 선택. 마스터 편집은 콘텐츠 목록의 CategoryQuickEdit */}
              {track === 'case' && (
                <div>
                  <Label className="text-xs">케이스 분류</Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {caseCats.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setCategoryId((cur) => (cur === c.id ? '' : c.id))}
                        className={cn('chip cursor-pointer', categoryId === c.id && 'chip-active')}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label htmlFor="title" className="text-xs">제목</Label>
                <Input id="title" className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="slug" className="text-xs">슬러그</Label>
                <Input id="slug" className="mt-1" value={slug} onChange={(e) => setSlug(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="summary" className="text-xs">요약</Label>
                <Textarea id="summary" className="mt-1" value={summary} onChange={(e) => setSummary(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="quote" className="text-xs">운영자 1인칭 인용 (Author Quote)</Label>
                <Textarea
                  id="quote"
                  className="mt-1"
                  value={authorQuote}
                  onChange={(e) => setAuthorQuote(e.target.value)}
                  placeholder="저도 처음엔..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="read" className="text-xs">
                    읽기 시간 (분){readMinAuto && <span className="ml-1 text-[10px] text-ink/40">· 본문 기준 자동</span>}
                  </Label>
                  <Input id="read" className="mt-1" type="number" min={1} value={readMin} onChange={(e) => onReadMinInput(+e.target.value)} />
                </div>
                {/* 트렌드는 '적용' 개념이 없어 발행 게이트에서 제외 → 입력도 숨김 */}
                {track !== 'trend' && (
                  <div>
                    <Label htmlFor="apply" className="text-xs">적용 시간 (분)</Label>
                    <Input id="apply" className="mt-1" type="number" min={1} value={applyMin} onChange={(e) => setApplyMin(+e.target.value)} />
                  </div>
                )}
              </div>
              <ThumbnailField value={thumbnailUrl} onChange={setThumbnailUrl} />
              <div>
                <Label className="text-xs">직무 태그</Label>
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
                <Label className="text-xs">페르소나 커버리지</Label>
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
              <h3 className="font-semibold text-sm mb-2">톤 가이드</h3>
              <p className="text-xs text-ink/60 leading-relaxed">
                “저도 처음엔…” / “이게 진짜 별로였던 게…” / “결과가 ‘그럴듯’해서 더 위험했어요.” 같은 1인칭 자기 인용으로 시작해보세요.
              </p>
            </section>
          </div>
        )}
      </div>

      {/* 메인(초안 인라인 편집 ↔ 구조 편집) + AI 제안 패널 */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {previewOpen ? (
            // 초안 = 본가 상세와 동일 마크업. 텍스트 더블클릭 → 인라인 수정 → 폼 상태 커밋.
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
          ) : (
            // 구조 편집 = 블록 추가/삭제 등 인라인으로 안 되는 편집.
            <section className="card p-5">
              <header className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">본문 구조</h2>
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
          )}
        </div>

        {/* 우측 레일: 이미지 패널 + 발행 준비 신호등(필수 입력 인라인) + AI 제안 패널.
            순서·구성은 자료실 편집(ToolForm)과 맞춘다 — 두 편집 화면의 레일이 같아야 손이 헷갈리지 않는다. */}
        <aside className="space-y-6">
          {/* 썸네일 후보 — 제목·본문에서 검색어를 만들어 Unsplash 사진을 고른다(훑을 사이트가 없어도 됨) */}
          <ThumbnailSuggest
            name={title}
            description={summary}
            category={track}
            excerpt={thumbExcerpt}
            thumbnailUrl={thumbnailUrl}
            onPick={(u) => setThumbnailUrl(u)}
          />

          {/* 이미지 채우기 — 출처 사이트를 훑어 본문 섹션별 실제 화면을 찾는다(로컬 전용) */}
          <AiImageFill
            kind="content"
            url={fillUrl}
            onUrlChange={setFillUrl}
            urlCandidates={fillUrlCandidates}
            name={title}
            targets={fillTargets}
            thumbnailUrl={thumbnailUrl}
            blockedReason={
              !fillUrl.trim()
                ? '훑을 사이트 주소를 넣어주세요'
                : bodyError
                  ? '본문 JSON 오류를 먼저 고쳐주세요'
                  : null
            }
            applyHint="체크한 이미지는 제목이 같은 본문 섹션 맨 아래로 들어가고, 맞는 섹션이 없으면 ‘추가 섹션’으로 들어가요. 반영 뒤에도 본문에서 수정·삭제할 수 있어요."
            onApply={(patch) => {
              if (patch.thumbnailUrl) setThumbnailUrl(patch.thumbnailUrl);
              if (patch.images.length) updateBody(applyImagesToBody(body, patch.images));
            }}
          />

          {/* 발행 준비 — 필수값을 여기서 바로 채우면 신호등이 초록으로 바뀌고 발행이 활성화된다 */}
          <section className="card p-5 xl:sticky xl:top-4">
            <div className="mb-4 flex items-center gap-2.5">
              <span
                className={cn(
                  'h-3.5 w-3.5 shrink-0 rounded-full ring-4',
                  canPublish ? 'bg-green-500 ring-green-500/20' : 'bg-red-500 ring-red-500/20',
                )}
              />
              <h2 className="text-sm font-semibold">
                {canPublish ? '발행 준비 완료' : `발행 전 입력 ${failingCount}개`}
              </h2>
            </div>

            {/* 썸네일 — 설정 패널의 칸과 같은 값을 공유하는 지름길. 발행 게이트 항목이라 신호등 바로 밑에 둔다. */}
            <ThumbnailDropzone value={thumbnailUrl} onChange={setThumbnailUrl} ok={thumbOk} />

            <div className="space-y-3">
              {/* 읽기 시간 — 본문 길이로 자동 산출(수동 입력 시 자동 해제) */}
              <RailField ok={readMin >= 1} label="읽기 시간 (분)">
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    className="h-8 w-20"
                    type="number"
                    min={1}
                    value={readMin}
                    onChange={(e) => onReadMinInput(+e.target.value)}
                  />
                  {readMinAuto ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-700">
                      <Sparkles className="h-3 w-3" /> 본문 기준 자동
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReadMinAuto(true)}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-ink/60 hover:bg-muted"
                    >
                      <Sparkles className="h-3 w-3" /> 자동 ({estReadMin}분)
                    </button>
                  )}
                </div>
              </RailField>

              {/* 적용 시간·직무 태그 — 사례만 필수(트렌드는 게이트에서 제외) */}
              {!isTrend && (
                <RailField ok={applyMin >= 1} label="적용 시간 (분)">
                  <Input
                    className="mt-1 h-8"
                    type="number"
                    min={1}
                    value={applyMin}
                    onChange={(e) => setApplyMin(+e.target.value)}
                  />
                </RailField>
              )}
              {!isTrend && (
                <RailField ok={catOk} label="케이스 분류">
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {caseCats.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setCategoryId((cur) => (cur === c.id ? '' : c.id))}
                        className={cn('chip cursor-pointer text-[11px]', categoryId === c.id && 'chip-active')}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </RailField>
              )}
              {!isTrend && (
                <RailField ok={jobTags.length >= 1} label="직무 태그 ≥ 1개">
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {JOB_TAGS.map((j) => (
                      <button
                        type="button"
                        key={j}
                        onClick={() =>
                          setJobTags((arr) => (arr.includes(j) ? arr.filter((x) => x !== j) : [...arr, j]))
                        }
                        className={cn('chip cursor-pointer text-[11px]', jobTags.includes(j) && 'chip-active')}
                      >
                        {JOB_LABELS[j]}
                      </button>
                    ))}
                  </div>
                </RailField>
              )}

              {/* 본문 내용 — 인라인 입력 불가, 미충족 시 본문 편집으로 점프 */}
              <div className="flex items-center gap-1.5 text-xs">
                {contentOk ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                )}
                <span className={contentOk ? 'text-ink/60' : 'font-medium text-red-600'}>본문 내용 ≥ 1섹션</span>
                {!contentOk && (
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(false)}
                    className="ml-auto text-[11px] text-ink/50 underline"
                  >
                    본문 편집 →
                  </button>
                )}
              </div>

              {/* 비차단 경고(화이트리스트 밖 외부 링크 등) — 발행은 막지 않음 */}
              {warnings.map((w) => (
                <p key={w.id} className="flex items-start gap-1.5 text-[11px] text-amber-600">
                  <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>
                    {w.label}
                    {w.detail && <span className="block text-[10px]">{w.detail}</span>}
                  </span>
                </p>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              {live.published ? (
                <>
                  <p className="text-[11px] text-green-700">
                    본가에 나가 있는 글이에요{live.publishedAt ? ` · ${live.publishedAt.slice(0, 10)} 발행` : ''}
                  </p>
                  <Button variant="accent" className="w-full" onClick={() => save('update')} disabled={pending}>
                    <Save className="h-4 w-4" /> 변경사항 저장
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => save('unpublish')} disabled={pending}>
                    <EyeOff className="h-4 w-4" /> 발행 취소
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="accent"
                    className="w-full"
                    onClick={() => save('publish')}
                    disabled={pending || !canPublish}
                  >
                    <Send className="h-4 w-4" /> {canPublish ? '발행' : '입력 후 발행'}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => save('draft')} disabled={pending}>
                    <Save className="h-4 w-4" /> 초안 저장
                  </Button>
                </>
              )}
            </div>
          </section>

          {/* AI 제안 패널 — 지정 부분(선택/필드)에 수정 각도 → 후보 택1 */}
          <RefinePanel />
        </aside>
      </div>
    </div>
    </RefineProvider>
  );
}
