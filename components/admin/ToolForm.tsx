'use client';

import { useMemo, useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Send, Archive, AlertCircle, CheckCircle2, Eye, PenLine, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { lintToolBody } from '@/lib/tool-body';
import {
  lintPromptBody,
  isPromptCategory,
  PROMPT_CATEGORIES,
  PROMPT_CATEGORY_LABELS,
  PROMPT_CATEGORY_CRITERIA,
} from '@/lib/prompt-body';
import { JOB_LABELS, JOB_TAGS } from '@/types/content';
import type { JobTag } from '@/types/content';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { slugify, cn } from '@/lib/utils';
import { ToolPreview } from '@/components/admin/ToolPreview';
import { RichSectionsEditor } from '@/components/admin/section-editors/RichSectionsEditor';
import type { RichSection } from '@/types/content';
import { RefineProvider, RefinePanel } from '@/components/admin/RefinePanel';
import { AiImageFill } from '@/components/admin/AiImageFill';
import { ThumbnailField } from '@/components/admin/ThumbnailField';
import { ThumbnailSuggest } from '@/components/admin/ThumbnailSuggest';

const CATEGORIES = ['tool', 'prompt', 'guide', 'context-card'] as const;
const CATEGORY_LABELS: Record<typeof CATEGORIES[number], string> = {
  tool: '도구',
  prompt: '프롬프트',
  guide: '가이드',
  'context-card': '맥락 카드',
};

const PRICING_TIERS = ['free', 'freemium', 'paid', 'custom'] as const;
const PRICING_LABELS: Record<typeof PRICING_TIERS[number], string> = {
  free: '무료',
  freemium: '프리미엄',
  paid: '유료',
  custom: '커스텀',
};

export interface ToolRow {
  id?: string;
  slug?: string;
  name?: string;
  category?: typeof CATEGORIES[number];
  description?: string | null;
  body?: Record<string, unknown> | null;
  url?: string | null;
  pricing_tier?: typeof PRICING_TIERS[number];
  job_tags?: JobTag[];
  thumbnail_url?: string | null;
  /** thumbnail_url 없을 때 카드에 표시할 placeholder emoji (예: 🔍 💬 📊) */
  thumbnail_emoji?: string | null;
  /** 카드 노출 라벨 (예: "무료 플랜", "유료", "Pro $20/월") */
  pricing_label?: string | null;
  /** 유료 여부 — true면 회색 태그, false면 녹색 무료 태그 */
  is_paid?: boolean | null;
  /** 추가 가격 라벨 (예: "Pro $20/월") */
  pro_pricing?: string | null;
  /** 사용기 콘텐츠 있음 → "사용기 1편" 배지 표시 */
  has_review?: boolean | null;
  /** 도구 기능분류 FK (categories.id, type='tool_subcategory'). category==='tool'일 때만 사용 */
  subcategory_id?: string | null;
  status?: 'draft' | 'published' | 'archived';
}

interface Props {
  initial?: ToolRow;
  /** 스튜디오 임베드용. 있으면 저장 후 /admin/tools로 이동하지 않고 콜백만 호출. */
  onSaved?: (status: 'draft' | 'published' | 'archived', id?: string) => void;
  /** true면 미리보기(실제 페이지 모습 + 더블클릭 인라인 편집)로 시작 — 스튜디오 생성 직후 검수 흐름 */
  startInPreview?: boolean;
}

export function ToolForm({ initial, onSaved, startInPreview }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [pending, startTransition] = useTransition();
  // 초안 저장은 화면을 떠나지 않으므로, 저장됐다는 표시를 여기서 준다.
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [category, setCategory] = useState<typeof CATEGORIES[number]>(initial?.category ?? 'tool');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [pricingTier, setPricingTier] = useState<typeof PRICING_TIERS[number]>(initial?.pricing_tier ?? 'free');
  const [jobTags, setJobTags] = useState<JobTag[]>(initial?.job_tags ?? []);
  const [thumbnailUrl, setThumbnailUrl] = useState(initial?.thumbnail_url ?? '');
  const [thumbnailEmoji, setThumbnailEmoji] = useState(initial?.thumbnail_emoji ?? '');
  const [pricingLabel, setPricingLabel] = useState(initial?.pricing_label ?? '');
  const [isPaid, setIsPaid] = useState(initial?.is_paid ?? false);
  const [proPricing, setProPricing] = useState(initial?.pro_pricing ?? '');
  const [hasReview, setHasReview] = useState(initial?.has_review ?? false);
  const [subcategoryId, setSubcategoryId] = useState(initial?.subcategory_id ?? '');
  const [subcats, setSubcats] = useState<{ id: string; slug: string; label: string; sort_order: number }[]>([]);
  const [bodyJson, setBodyJson] = useState(JSON.stringify(initial?.body ?? {}, null, 2));
  const [bodyError, setBodyError] = useState<string | null>(null);
  // 라이브 미리보기 — 현재 폼 상태를 본가 상세/카드 모습으로 렌더.
  // 더블클릭 인라인 편집이 폼 상태로 커밋되므로 미리보기 자체가 편집 표면이다.
  // 기존 자료 편집(=id 있음)은 "실제 초안 + 바로 수정"을 메인 화면으로 열고,
  // 새 자료는 메타부터 채워야 하므로 폼으로 시작한다. (startInPreview가 있으면 그 값 우선)
  const [previewOpen, setPreviewOpen] = useState(startInPreview ?? !!initial?.id);
  // 설정·발행은 상단 접이 바로 이동 — 우측은 AI 제안 패널 전용. 새 자료(메타 미입력)는 열고 시작.
  const [settingsOpen, setSettingsOpen] = useState(!initial?.id);

  // 원하는 분류가 없을 때 셀렉트에서 바로 새 분류 추가.
  // 공유 마스터(categories, type='tool_subcategory')에 insert → 본가 /tools 탭에도 새 탭으로 반영됨.
  const [newSubcatOpen, setNewSubcatOpen] = useState(false);
  const [newSubcatLabel, setNewSubcatLabel] = useState('');
  const [newSubcatBusy, setNewSubcatBusy] = useState(false);
  const [newSubcatErr, setNewSubcatErr] = useState<string | null>(null);

  const addSubcategory = async () => {
    const label = newSubcatLabel.trim();
    if (!label) return;
    setNewSubcatBusy(true);
    setNewSubcatErr(null);
    // CategoryManager와 동일 insert 계약. 새 분류는 기존 탭들 뒤에(max sort_order + 1).
    const nextSort = subcats.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0) + 1;
    const { data, error } = await supabase
      .from('categories')
      .insert({
        type: 'tool_subcategory',
        parent_track: 'tool',
        slug: slugify(label),
        label,
        sort_order: nextSort,
      })
      .select('id, slug, label, sort_order')
      .single();
    setNewSubcatBusy(false);
    if (error || !data) {
      setNewSubcatErr(
        /duplicate|unique/i.test(error?.message ?? '') ? '이미 있는 분류(slug 중복)예요.' : error?.message ?? '추가 실패',
      );
      return;
    }
    setSubcats((prev) => [...prev, data]);
    setSubcategoryId(data.id);
    setNewSubcatOpen(false);
    setNewSubcatLabel('');
  };

  useEffect(() => {
    if (!slug && name) setSlug(slugify(name));
  }, [name, slug]);

  // 공개 /tools 탭과 동일한 기능분류(categories.type='tool_subcategory') 로드
  useEffect(() => {
    supabase
      .from('categories')
      .select('id, slug, label, sort_order')
      .eq('type', 'tool_subcategory')
      .eq('parent_track', 'tool')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setSubcats(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const draftKey = `tool-draft-${initial?.id ?? 'new'}`;
    const t = setTimeout(() => {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ name, slug, category, description, url, pricingTier, jobTags, thumbnailUrl, thumbnailEmoji, pricingLabel, isPaid, proPricing, hasReview, subcategoryId, bodyJson }),
      );
    }, 1000);
    return () => clearTimeout(t);
  }, [initial?.id, name, slug, category, description, url, pricingTier, jobTags, thumbnailUrl, thumbnailEmoji, pricingLabel, isPaid, proPricing, hasReview, subcategoryId, bodyJson]);

  // 도구 body는 본가 ToolDetail이 렌더하는 ToolBody 계약과 일치해야 발행 가능
  // (계약 밖 키/구조는 상세가 비거나 useCases href undefined로 크래시)
  const toolBodyError = useMemo(() => {
    if (category !== 'tool' || bodyError) return null;
    try {
      return lintToolBody(JSON.parse(bodyJson || '{}'));
    } catch {
      return null; // JSON 자체 오류는 bodyError 게이트가 담당
    }
  }, [category, bodyError, bodyJson]);

  // 프롬프트 body는 본가 /prompts가 읽는 계약(prompt·promptCategory·source·sourceUrl)과 일치해야 발행 가능
  // (복사 박스가 카드의 전부라 prompt가 비면 빈 카드가 나가고, 계약 밖 키는 화면에서 사라진다)
  const promptBodyError = useMemo(() => {
    if (category !== 'prompt' || bodyError) return null;
    try {
      return lintPromptBody(JSON.parse(bodyJson || '{}'));
    } catch {
      return null; // JSON 자체 오류는 bodyError 게이트가 담당
    }
  }, [category, bodyError, bodyJson]);

  const checks = [
    { id: 'name', label: '이름 입력', passed: name.trim().length > 0 },
    { id: 'slug', label: '슬러그 입력', passed: slug.trim().length > 0 },
    { id: 'category', label: '카테고리 선택', passed: !!category },
    { id: 'subcategory', label: '도구 분류 선택 (도구만)', passed: category !== 'tool' || !!subcategoryId },
    { id: 'body', label: '본문 JSON 파싱 가능', passed: !bodyError },
    { id: 'toolbody', label: '본문이 상세페이지 스키마와 일치 (도구만)', passed: !toolBodyError },
    { id: 'promptbody', label: '프롬프트 전문·분류 입력 (프롬프트만)', passed: !promptBodyError },
  ];
  const canPublish = checks.every((c) => c.passed);
  // 우측 발행 준비 레일용 — 남은(미충족) 필수 항목 수. 모든 check가 차단 항목이다.
  const failingCount = checks.filter((c) => !c.passed).length;

  function syncBody(newJson: string) {
    setBodyJson(newJson);
    try {
      JSON.parse(newJson);
      setBodyError(null);
    } catch (e) {
      setBodyError((e as Error).message);
    }
  }

  // 파싱 가능한 body(자유 섹션 GUI 편집용). JSON 오류면 null.
  const parsedBody = useMemo(() => {
    try {
      return JSON.parse(bodyJson || '{}') as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [bodyJson]);
  /** body의 특정 키만 갱신(빈 값은 키 자체를 제거 — 계약이 optional인 필드를 빈 문자열로 남기지 않는다). */
  function patchBody(patch: Record<string, unknown>) {
    const merged: Record<string, unknown> = { ...(parsedBody ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v == null) delete merged[k];
      else merged[k] = v;
    }
    syncBody(JSON.stringify(merged, null, 2));
  }

  // 프롬프트 카드 전용 body 필드 — 도구의 '도구 분류'처럼 폼에서 직접 다룬다(raw JSON 손편집 방지).
  const promptCategory = isPromptCategory(parsedBody?.promptCategory) ? parsedBody.promptCategory : '';
  const promptSource = typeof parsedBody?.source === 'string' ? parsedBody.source : '';
  const promptSourceUrl = typeof parsedBody?.sourceUrl === 'string' ? parsedBody.sourceUrl : '';

  const sections = (parsedBody?.sections as RichSection[] | undefined) ?? [];
  function setSections(next: RichSection[]) {
    const merged: Record<string, unknown> = { ...(parsedBody ?? {}) };
    if (next.length) merged.sections = next;
    else delete merged.sections;
    syncBody(JSON.stringify(merged, null, 2));
  }

  function save(status: 'draft' | 'published' | 'archived') {
    if (bodyError) return alert('본문 JSON 오류: ' + bodyError);
    if (status === 'published' && !canPublish) return alert('필수 항목 누락');

    startTransition(async () => {
      const payload = {
        slug: slug || slugify(name),
        name,
        category,
        description: description || null,
        body: JSON.parse(bodyJson || '{}'),
        url: url || null,
        pricing_tier: pricingTier,
        job_tags: jobTags,
        thumbnail_url: thumbnailUrl || null,
        thumbnail_emoji: thumbnailEmoji || null,
        pricing_label: pricingLabel || null,
        is_paid: isPaid,
        pro_pricing: proPricing || null,
        has_review: hasReview,
        subcategory_id: category === 'tool' ? (subcategoryId || null) : null,
        status,
      };

      let id = initial?.id;
      if (id) {
        const { error } = await supabase.from('tools').update(payload).eq('id', id);
        if (error) return alert('저장 실패: ' + error.message);
      } else {
        const { data, error } = await supabase.from('tools').insert(payload).select('id').single();
        if (error) return alert('저장 실패: ' + error.message);
        id = data?.id;
      }

      if (id && (status === 'published' || initial?.status === 'published')) {
        await fetch('/api/revalidate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'tool', slug: payload.slug }),
        });
      }
      if (id && status === 'published') {
        // HERMES 씨앗에서 생성된 도구/프롬프트/가이드면 씨앗도 발행됨으로 닫기(연결 없으면 no-op)
        await supabase.from('content_seeds').update({ status: 'published' }).eq('tool_id', id);
      }

      // 스튜디오 임베드: 페이지 이동 없이 콜백으로.
      if (onSaved) {
        onSaved(status, id);
        router.refresh();
        return;
      }
      // 초안 저장은 편집 화면 유지 — /admin/tools는 '프롬프트 순위'로 바뀌어 목록이 아니다.
      // 새 자료 첫 저장만 편집 URL로 교체해 재저장이 중복 insert가 되지 않게 한다.
      if (status === 'draft') {
        setSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
        if (!initial?.id && id) router.replace(`/admin/tools/${id}`);
        router.refresh();
        return;
      }
      // 발행·보관: 들어온 목록(통합 콘텐츠 목록)으로.
      router.push('/admin/contents');
      router.refresh();
    });
  }

  return (
    <RefineProvider>
    <div className="p-4 sm:p-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">
          {initial?.id ? '자료 편집' : '새 자료'}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {savedAt && (
            <span className="flex items-center gap-1 text-xs text-ink/50">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> 초안 저장됨 {savedAt}
            </span>
          )}
          <Button variant="outline" onClick={() => setPreviewOpen((v) => !v)}>
            {previewOpen ? <PenLine className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {previewOpen ? '상세 필드' : '초안으로'}
          </Button>
          {initial?.id && initial.status !== 'archived' && (
            <Button variant="outline" onClick={() => save('archived')} disabled={pending}>
              <Archive className="h-4 w-4" /> 보관
            </Button>
          )}
          <Button variant="outline" onClick={() => save('draft')} disabled={pending}>
            <Save className="h-4 w-4" /> 초안 저장
          </Button>
          <Button variant="accent" onClick={() => save('published')} disabled={pending || !canPublish}>
            <Send className="h-4 w-4" /> 발행
          </Button>
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
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3 items-start">
            <section className="card p-5 space-y-3">
              <h2 className="font-semibold text-sm">메타</h2>
              <div>
                <Label htmlFor="name" className="text-xs">이름 *</Label>
                <Input id="name" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="slug" className="text-xs">슬러그 *</Label>
                <Input id="slug" className="mt-1" value={slug} onChange={(e) => setSlug(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="category" className="text-xs">카테고리 *</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as typeof CATEGORIES[number])}>
                  <SelectTrigger id="category" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pricing" className="text-xs">가격</Label>
                <Select value={pricingTier} onValueChange={(v) => setPricingTier(v as typeof PRICING_TIERS[number])}>
                  <SelectTrigger id="pricing" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICING_TIERS.map((p) => (
                      <SelectItem key={p} value={p}>{PRICING_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {category === 'tool' && (
                <div>
                  <Label htmlFor="subcategory" className="text-xs">도구 분류 (공개 /tools 탭) *</Label>
                  <Select
                    value={subcategoryId}
                    onValueChange={(v) => {
                      if (v === '__new__') {
                        setNewSubcatOpen(true);
                        return; // 선택값은 유지한 채 입력 UI만 연다
                      }
                      setSubcategoryId(v);
                    }}
                  >
                    <SelectTrigger id="subcategory" className="mt-1">
                      <SelectValue placeholder="기능 분류 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {subcats.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                      ))}
                      <SelectItem value="__new__">+ 직접 입력 (새 분류 추가)</SelectItem>
                    </SelectContent>
                  </Select>
                  {newSubcatOpen && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Input
                          value={newSubcatLabel}
                          onChange={(e) => setNewSubcatLabel(e.target.value)}
                          placeholder="새 분류 이름 (예: 영상 편집)"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addSubcategory();
                            }
                          }}
                        />
                        <Button size="sm" variant="accent" disabled={newSubcatBusy || !newSubcatLabel.trim()} onClick={addSubcategory}>
                          {newSubcatBusy ? '추가 중…' : '추가'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setNewSubcatOpen(false);
                            setNewSubcatLabel('');
                            setNewSubcatErr(null);
                          }}
                        >
                          취소
                        </Button>
                      </div>
                      {newSubcatErr && <p className="text-xs text-red-600">{newSubcatErr}</p>}
                      <p className="text-xs text-amber-700">새 분류는 공유 마스터에 추가돼 본가 /tools 탭에도 생깁니다.</p>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-ink/50">
                    공개 /tools 목록의 카테고리 탭. 미선택 시 목록에 안 보임.
                  </p>
                </div>
              )}
              {category === 'prompt' && (
                <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div>
                    <Label htmlFor="promptCategory" className="text-xs">프롬프트 분류 (공개 /prompts 탭) *</Label>
                    <Select value={promptCategory} onValueChange={(v) => patchBody({ promptCategory: v })}>
                      <SelectTrigger id="promptCategory" className="mt-1">
                        <SelectValue placeholder="분류 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROMPT_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{PROMPT_CATEGORY_LABELS[c]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-ink/50">
                      {promptCategory
                        ? PROMPT_CATEGORY_CRITERIA[promptCategory]
                        : '미선택이면 본가에서 사고하기로 잘못 묶입니다.'}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="promptSource" className="text-xs">출처 라벨</Label>
                    <Input
                      id="promptSource"
                      className="mt-1"
                      value={promptSource}
                      onChange={(e) => patchBody({ source: e.target.value })}
                      placeholder="Anthropic 공식 / Caselab 제작"
                    />
                  </div>
                  <div>
                    <Label htmlFor="promptSourceUrl" className="text-xs">출처 링크</Label>
                    <Input
                      id="promptSourceUrl"
                      className="mt-1"
                      value={promptSourceUrl}
                      onChange={(e) => patchBody({ sourceUrl: e.target.value })}
                      placeholder="https://"
                    />
                    <p className="mt-1 text-xs text-ink/50">
                      본가 프롬프트 상세의 출처 칩은 위 <code>외부 링크</code>가 아니라 이 값을 씁니다.
                    </p>
                  </div>
                  <p className="text-xs text-ink/50">
                    복사할 프롬프트 전문은 아래 미리보기의 복사 박스에서 바로 편집합니다.
                  </p>
                </div>
              )}
              <div>
                <Label htmlFor="description" className="text-xs">설명 (공개 디테일 페이지 본문)</Label>
                <Textarea
                  id="description"
                  className="mt-1"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="이 자료가 어떤 상황에 유용한지, 어떻게 쓰는지 한두 문단."
                />
              </div>
              <div>
                <Label htmlFor="url" className="text-xs">외부 링크</Label>
                <Input id="url" className="mt-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
              </div>
              {/* URL 직접 입력만 두면 붙여넣을 주소가 없는 프롬프트·가이드는 썸네일을 아예 못 넣는다 —
                  콘텐츠(TrackForm)와 같은 업로드·끌어놓기·붙여넣기 입력으로 통일. */}
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
            </section>

            <section className="card p-5 space-y-3">
              <div>
                <h2 className="font-semibold text-sm">카드 표시</h2>
                <p className="text-xs text-ink/50 mt-0.5">공개 /tools 목록 카드에 노출되는 항목 (mockup tools.html 정합)</p>
              </div>
              <div>
                <Label htmlFor="thumbEmoji" className="text-xs">썸네일 이모지</Label>
                <Input
                  id="thumbEmoji"
                  className="mt-1"
                  value={thumbnailEmoji}
                  onChange={(e) => setThumbnailEmoji(e.target.value)}
                  placeholder="🔍 (썸네일 URL 없을 때 카드에 표시)"
                />
              </div>
              <div>
                <Label htmlFor="pricingLabel" className="text-xs">가격 라벨</Label>
                <Input
                  id="pricingLabel"
                  className="mt-1"
                  value={pricingLabel}
                  onChange={(e) => setPricingLabel(e.target.value)}
                  placeholder="예: 무료 플랜 / 유료"
                />
              </div>
              <div>
                <Label htmlFor="proPricing" className="text-xs">Pro 가격 라벨 (선택)</Label>
                <Input
                  id="proPricing"
                  className="mt-1"
                  value={proPricing}
                  onChange={(e) => setProPricing(e.target.value)}
                  placeholder='예: Pro $20/월 (무료 + Pro 둘 다 표시할 때)'
                />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    checked={isPaid}
                    onChange={(e) => setIsPaid(e.target.checked)}
                  />
                  유료 도구 <span className="text-xs text-ink/50">(체크 시 회색 태그)</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    checked={hasReview}
                    onChange={(e) => setHasReview(e.target.checked)}
                  />
                  사용기 있음 <span className="text-xs text-ink/50">(&ldquo;사용기 1편&rdquo; 배지)</span>
                </label>
              </div>
            </section>

          </div>
        )}
      </div>

      {/* 메인(초안 인라인 편집 ↔ 본문 구조/JSON) + AI 제안 패널 */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {previewOpen ? (
            bodyError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                본문 JSON 오류로 초안을 렌더할 수 없어요: {bodyError} — 오른쪽 &lsquo;구조 편집&rsquo;에서 고쳐 주세요.
              </p>
            ) : (
              // 초안 = 본가 노출 모습. 텍스트 더블클릭 → 인라인 수정 → 폼 상태 커밋.
              <ToolPreview
                category={category}
                name={name}
                description={description}
                url={url}
                body={(() => {
                  try {
                    return JSON.parse(bodyJson || '{}') as Record<string, unknown>;
                  } catch {
                    return {};
                  }
                })()}
                pricingLabel={pricingLabel}
                isPaid={isPaid}
                proPricing={proPricing}
                thumbnailUrl={thumbnailUrl}
                thumbnailEmoji={thumbnailEmoji}
                jobTags={jobTags}
                onPatch={(p) => {
                  if (p.name !== undefined) setName(p.name);
                  if (p.description !== undefined) setDescription(p.description);
                  if (p.thumbnailUrl !== undefined) setThumbnailUrl(p.thumbnailUrl);
                }}
                onBody={(next) => syncBody(JSON.stringify(next, null, 2))}
              />
            )
          ) : (
            <div className="space-y-6">
            {/* 자유 리치 섹션 — 트렌드처럼 이미지·링크·갤러리·문단을 각 섹션에 자유 배치 */}
            <section className="card p-5">
              <header className="mb-3">
                <h2 className="font-semibold">추가 섹션 <span className="text-xs font-normal text-ink/50">(이미지·링크·갤러리 등)</span></h2>
                <p className="mt-0.5 text-xs text-ink/50 break-keep">
                  소개·기능·가격 같은 고정 섹션 외에, 트렌드처럼 이미지·북마크(링크 카드)·갤러리·문단을 자유롭게 넣을 수 있어요. 여기서 만든 섹션은 상세페이지 맨 아래에 순서대로 노출됩니다.
                </p>
              </header>
              {parsedBody ? (
                <RichSectionsEditor value={sections} onChange={setSections} />
              ) : (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  본문 JSON 오류로 섹션 편집을 열 수 없어요 — 아래 JSON을 먼저 고쳐 주세요.
                </p>
              )}
            </section>

            {/* 본문 JSON 직접 편집 (인라인으로 안 되는 블록 구조·디버깅용) */}
            <section className="card p-5">
              <header className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">본문 (JSON, 선택)</h2>
              </header>
              <Textarea
                value={bodyJson}
                onChange={(e) => syncBody(e.target.value)}
                className="font-mono text-xs min-h-[420px]"
              />
              {bodyError && (
                <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {bodyError}
                </p>
              )}
              {toolBodyError && (
                <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> 상세페이지 스키마 위반 — {toolBodyError}
                </p>
              )}
              <p className="mt-2 text-xs text-ink/50">
                ※ 카테고리별 구조화된 블록(프롬프트 본문, 가이드 단계 등) — MVP는 자유 jsonb로 두고 추후 GUI 분기.
                텍스트는 &lsquo;초안 편집&rsquo;에서 더블클릭으로 바로 고칠 수 있어요.
              </p>
            </section>
            </div>
          )}
        </div>

        {/* 우측 레일: 발행 준비 신호등(필수 항목 인라인 수정) + AI 제안 패널 */}
        <aside className="space-y-6">
          {/* 썸네일 후보 — 사이트 캡처(AiImageFill)가 통하지 않는 프롬프트·가이드까지 커버한다.
              고른 후보는 여기서 바로 thumbnail_url로 들어가고, 미리보기의 썸네일 슬롯에도 즉시 반영된다. */}
          <ThumbnailSuggest
            name={name}
            description={description}
            category={category}
            promptCategory={promptCategory || undefined}
            promptText={typeof parsedBody?.prompt === 'string' ? parsedBody.prompt.slice(0, 800) : undefined}
            value={thumbnailUrl}
            onPick={setThumbnailUrl}
          />

          {/* 이미지 채우기 — 초안 편집·상세 필드 어느 모드에서든 보이도록 레일에 둔다 */}
          <AiImageFill
            toolUrl={url}
            name={name}
            parsedBody={parsedBody}
            thumbnailUrl={thumbnailUrl}
            onApply={(patch) => {
              if (patch.thumbnailUrl) setThumbnailUrl(patch.thumbnailUrl);
              // features 이미지 슬롯 채움 + 추가 섹션을 한 번의 body 갱신으로 처리
              const merged: Record<string, unknown> = { ...(parsedBody ?? {}) };
              const leftovers: RichSection[] = [];
              if (patch.featureImages.length) {
                const remaining = [...patch.featureImages];
                if (Array.isArray(merged.features)) {
                  merged.features = (merged.features as Record<string, unknown>[]).map((f) => {
                    const hit = remaining.findIndex((m) => m.title === String(f?.title ?? '').trim());
                    if (hit === -1) return f;
                    const [m] = remaining.splice(hit, 1);
                    // feature.image 계약은 {url, caption?}만 허용 (strict 스키마 — alt 넣으면 발행 차단)
                    return { ...f, image: { url: m.url, ...(m.caption ? { caption: m.caption } : {}) } };
                  });
                }
                // 반영 시점에 기능이 사라졌으면 버리지 말고 추가 섹션으로 보존
                for (const m of remaining) {
                  leftovers.push({
                    heading: m.title,
                    blocks: [{ type: 'image', url: m.url, alt: m.alt, caption: m.caption }],
                  });
                }
              }
              const nextSections = [...sections, ...patch.addSections, ...leftovers];
              if (nextSections.length) merged.sections = nextSections;
              else delete merged.sections;
              syncBody(JSON.stringify(merged, null, 2));
            }}
          />

          {/* 필수값을 여기서 바로 채우면 신호등이 초록으로 바뀌고 발행이 활성화된다 */}
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
              {initial?.status && <span className="badge ml-auto">{initial.status}</span>}
            </div>

            <div className="space-y-3">
              {checks.map((c) => {
                const isBodyGate = c.id === 'body' || c.id === 'toolbody';
                return (
                  <div key={c.id}>
                    <div className="flex items-center gap-1.5 text-xs">
                      {c.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                      )}
                      <span className={c.passed ? 'text-ink/60' : 'font-medium text-red-600'}>{c.label}</span>
                      {!c.passed && isBodyGate && (
                        <button
                          type="button"
                          onClick={() => setPreviewOpen(false)}
                          className="ml-auto text-[11px] text-ink/50 underline"
                        >
                          본문 편집 →
                        </button>
                      )}
                    </div>

                    {/* 인라인 수정 — 미충족 항목만 즉시 채운다 */}
                    {!c.passed && c.id === 'name' && (
                      <Input
                        className="mt-1 h-8"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="자료 이름"
                      />
                    )}
                    {!c.passed && c.id === 'slug' && (
                      <Input
                        className="mt-1 h-8"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="slug (비우면 이름에서 자동)"
                      />
                    )}
                    {!c.passed && c.id === 'category' && (
                      <Select value={category} onValueChange={(v) => setCategory(v as typeof CATEGORIES[number])}>
                        <SelectTrigger className="mt-1 h-8">
                          <SelectValue placeholder="카테고리 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {!c.passed && c.id === 'subcategory' &&
                      (subcats.length ? (
                        <Select value={subcategoryId} onValueChange={setSubcategoryId}>
                          <SelectTrigger className="mt-1 h-8">
                            <SelectValue placeholder="기능 분류 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {subcats.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSettingsOpen(true)}
                          className="mt-1 text-[11px] text-ink/50 underline"
                        >
                          설정에서 새 분류 추가 →
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 space-y-2">
              <Button
                variant="accent"
                className="w-full"
                onClick={() => save('published')}
                disabled={pending || !canPublish}
              >
                <Send className="h-4 w-4" /> {canPublish ? '발행' : '입력 후 발행'}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => save('draft')} disabled={pending}>
                <Save className="h-4 w-4" /> 초안 저장
              </Button>
              {savedAt && (
                <p className="flex items-center justify-center gap-1 text-xs text-ink/50">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> 초안 저장됨 {savedAt}
                </p>
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
