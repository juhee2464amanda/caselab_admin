'use client';

import { useMemo, useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Send, Archive, AlertCircle, CheckCircle2, Eye, PenLine } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { lintToolBody } from '@/lib/tool-body';
import { JOB_LABELS, JOB_TAGS } from '@/types/content';
import type { JobTag } from '@/types/content';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { slugify, cn } from '@/lib/utils';
import { ToolPreview } from '@/components/admin/ToolPreview';

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
}

export function ToolForm({ initial, onSaved }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [pending, startTransition] = useTransition();

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
  // 라이브 미리보기 — 현재 폼 상태를 본가 상세/카드 모습으로 렌더(발행 전 검수)
  const [previewOpen, setPreviewOpen] = useState(false);

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

  const checks = [
    { id: 'name', label: '이름 입력', passed: name.trim().length > 0 },
    { id: 'slug', label: '슬러그 입력', passed: slug.trim().length > 0 },
    { id: 'category', label: '카테고리 선택', passed: !!category },
    { id: 'subcategory', label: '도구 분류 선택 (도구만)', passed: category !== 'tool' || !!subcategoryId },
    { id: 'body', label: '본문 JSON 파싱 가능', passed: !bodyError },
    { id: 'toolbody', label: '본문이 상세페이지 스키마와 일치 (도구만)', passed: !toolBodyError },
  ];
  const canPublish = checks.every((c) => c.passed);

  function syncBody(newJson: string) {
    setBodyJson(newJson);
    try {
      JSON.parse(newJson);
      setBodyError(null);
    } catch (e) {
      setBodyError((e as Error).message);
    }
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
        await supabase.from('tools').update(payload).eq('id', id);
      } else {
        const { data } = await supabase.from('tools').insert(payload).select('id').single();
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
      router.push('/admin/tools');
      router.refresh();
    });
  }

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-serif text-xl sm:text-2xl font-semibold">
          {initial?.id ? '자료 편집' : '새 자료'}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen((v) => !v)}>
            {previewOpen ? <PenLine className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {previewOpen ? '편집으로' : '미리보기'}
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

      {previewOpen && (
        <div className="mb-6">
          {bodyError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              본문 JSON 오류로 미리보기를 렌더할 수 없어요: {bodyError}
            </p>
          ) : (
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
            />
          )}
        </div>
      )}

      <div className={cn('grid gap-6 lg:grid-cols-[1fr_320px]', previewOpen && 'hidden')}>
        <div className="space-y-6">
          <section className="card p-5 space-y-3">
            <h2 className="font-semibold">메타</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="name">이름 *</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="slug">슬러그 *</Label>
                <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="category">카테고리 *</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as typeof CATEGORIES[number])}>
                  <SelectTrigger id="category">
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
                <Label htmlFor="pricing">가격</Label>
                <Select value={pricingTier} onValueChange={(v) => setPricingTier(v as typeof PRICING_TIERS[number])}>
                  <SelectTrigger id="pricing">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICING_TIERS.map((p) => (
                      <SelectItem key={p} value={p}>{PRICING_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {category === 'tool' && (
              <div>
                <Label htmlFor="subcategory">도구 분류 (공개 /tools 탭) *</Label>
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
                  <SelectTrigger id="subcategory">
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
            <div>
              <Label htmlFor="description">설명 (공개 디테일 페이지 본문)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="이 자료가 어떤 상황에 유용한지, 어떻게 쓰는지 한두 문단."
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="url">외부 링크</Label>
                <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
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
          </section>

          <section className="card p-5 space-y-3">
            <div>
              <h2 className="font-semibold">카드 표시</h2>
              <p className="text-xs text-ink/50 mt-0.5">공개 /tools 목록 카드에 노출되는 항목 (mockup tools.html 정합)</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="thumbEmoji">썸네일 이모지</Label>
                <Input
                  id="thumbEmoji"
                  value={thumbnailEmoji}
                  onChange={(e) => setThumbnailEmoji(e.target.value)}
                  placeholder="🔍 (썸네일 URL 없을 때 카드에 표시)"
                />
              </div>
              <div>
                <Label htmlFor="pricingLabel">가격 라벨</Label>
                <Input
                  id="pricingLabel"
                  value={pricingLabel}
                  onChange={(e) => setPricingLabel(e.target.value)}
                  placeholder="예: 무료 플랜 / 유료"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="proPricing">Pro 가격 라벨 (선택)</Label>
              <Input
                id="proPricing"
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
                유료 도구 <span className="text-xs text-ink/50">(체크 시 회색 태그, 해제 시 녹색 무료 태그)</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent"
                  checked={hasReview}
                  onChange={(e) => setHasReview(e.target.checked)}
                />
                사용기 있음 <span className="text-xs text-ink/50">(체크 시 "사용기 1편" 배지 표시)</span>
              </label>
            </div>
          </section>

          <section className="card p-5">
            <header className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">본문 (JSON, 선택)</h2>
            </header>
            <Textarea
              value={bodyJson}
              onChange={(e) => syncBody(e.target.value)}
              className="font-mono text-xs min-h-[280px]"
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
            </p>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-5">
            <h3 className="font-semibold text-sm mb-3">필수 항목</h3>
            <ul className="space-y-1.5">
              {checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-xs">
                  {c.passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                  )}
                  <span className={c.passed ? 'text-ink/60' : 'text-red-600 font-medium'}>
                    {c.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {initial?.status && (
            <section className="card p-5">
              <h3 className="font-semibold text-sm mb-2">현재 상태</h3>
              <span className="badge">{initial.status}</span>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
