'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RichTextarea } from '@/components/admin/RichTextarea';
import { GalleryField } from '@/components/admin/BlockListEditor';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type GuideImage = { url: string; caption?: string };

// 공식 가이드 관리 — tools(category='guide').
// 본가 /guides가 읽는 계약: name, description, url, body{guideCategory, source, sourceType, …}.
// (본가 lib/data/guides.ts · types/guide.ts 정합, 2026-07-07 — 구 job_tags[0] 분류에서 이행,
//  job_tags[0]에는 출처 라벨을 계속 함께 써서 기존 데이터·화면과 호환 유지)

export const GUIDE_CATEGORIES = ['prompt', 'cases', 'education', 'skills', 'agents'] as const;
export type GuideCategory = (typeof GUIDE_CATEGORIES)[number];
export const GUIDE_CATEGORY_LABELS: Record<GuideCategory, string> = {
  prompt: '프롬프트 작성법',
  cases: '활용 사례',
  education: '교육 · 튜토리얼',
  skills: 'Skills · Cookbook',
  agents: '에이전트 · 자동화',
};

const SOURCE_TYPES = ['default', 'github', 'course'] as const;
type SourceType = (typeof SOURCE_TYPES)[number];
const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  default: '공식 문서',
  github: 'GitHub',
  course: '강의 · 코스',
};

export type Guide = {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
  status: string;
  job_tags: string[] | null;
  body: {
    guideCategory?: string;
    source?: string;
    sourceType?: string;
    thumbLabel?: string;
    thumbBg?: string;
    thumbColor?: string;
    linkLabel?: string;
    bodyRich?: string; // 본가 내부 상세페이지 본문(마커 리치 텍스트) — 있으면 카드가 상세로 링크
    images?: GuideImage[];
  } | null;
};

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'guide';
}

function asCategory(v: unknown): GuideCategory {
  return typeof v === 'string' && (GUIDE_CATEGORIES as readonly string[]).includes(v) ? (v as GuideCategory) : 'prompt';
}

const EMPTY = { name: '', url: '', description: '', source: '', guideCategory: 'prompt' as GuideCategory, sourceType: 'default' as SourceType, bodyRich: '', images: [] as GuideImage[] };

export function GuideManager({ initial }: { initial: Guide[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() { setEditId(null); setF(EMPTY); setError(null); }
  function startEdit(g: Guide) {
    const b = g.body ?? {};
    setEditId(g.id);
    setF({
      name: g.name,
      url: g.url ?? '',
      description: g.description ?? '',
      source: b.source ?? g.job_tags?.[0] ?? '',
      guideCategory: asCategory(b.guideCategory),
      sourceType: (SOURCE_TYPES as readonly string[]).includes(b.sourceType ?? '') ? (b.sourceType as SourceType) : 'default',
      bodyRich: b.bodyRich ?? '',
      images: b.images ?? [],
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.name.trim() || !f.url.trim()) { setError('이름과 링크는 필수예요.'); return; }
    setPending(true);
    const source = f.source.trim();
    // body는 기존 값(썸네일 커스텀 등)을 보존하고 계약 3필드만 갱신
    const prevBody = (editId ? initial.find((g) => g.id === editId)?.body : null) ?? {};
    const payload = {
      name: f.name.trim(),
      url: f.url.trim(),
      description: f.description.trim() || null,
      job_tags: source ? [source] : [],
      body: {
        ...prevBody,
        guideCategory: f.guideCategory,
        source: source || undefined,
        sourceType: f.sourceType,
        bodyRich: f.bodyRich.trim() || undefined,
        images: f.images.length ? f.images : undefined,
      },
    };
    let err;
    if (editId) {
      ({ error: err } = await supabase.from('tools').update(payload).eq('id', editId));
    } else {
      const slug = `${slugify(f.name)}-${(globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`).slice(0, 4)}`;
      ({ error: err } = await supabase.from('tools').insert({ ...payload, slug, category: 'guide', status: 'published' }));
    }
    setPending(false);
    if (err) { setError(err.message); return; }
    reset();
    router.refresh();
  }

  async function togglePublish(g: Guide) {
    await supabase.from('tools').update({ status: g.status === 'published' ? 'draft' : 'published' }).eq('id', g.id);
    router.refresh();
  }
  async function remove(g: Guide) {
    if (!confirm(`"${g.name}" 삭제할까요?`)) return;
    await supabase.from('tools').delete().eq('id', g.id);
    if (editId === g.id) reset();
    router.refresh();
  }

  // 본가 /guides 탭과 같은 축으로 그룹 (guideCategory 미지정 구데이터는 '프롬프트 작성법'으로 노출됨)
  const groups = new Map<GuideCategory, Guide[]>();
  for (const g of initial) {
    const cat = asCategory(g.body?.guideCategory);
    groups.set(cat, [...(groups.get(cat) ?? []), g]);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="card p-5 space-y-3">
        <div className="text-sm font-semibold">{editId ? '가이드 수정' : '공식 가이드 추가'}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">이름 *</Label><Input className="mt-1" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} placeholder="OpenAI Prompt Engineering Guide" /></div>
          <div><Label className="text-xs">출처 라벨</Label><Input className="mt-1" value={f.source} onChange={(e) => setF((p) => ({ ...p, source: e.target.value }))} placeholder="OpenAI 공식 / Anthropic 공식 …" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">분류 * <span className="text-ink/40">(본가 /guides 탭)</span></Label>
            <Select value={f.guideCategory} onValueChange={(v) => setF((p) => ({ ...p, guideCategory: v as GuideCategory }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GUIDE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{GUIDE_CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">자료 유형</Label>
            <Select value={f.sourceType} onValueChange={(v) => setF((p) => ({ ...p, sourceType: v as SourceType }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label className="text-xs">링크 (URL) *</Label><Input className="mt-1" value={f.url} onChange={(e) => setF((p) => ({ ...p, url: e.target.value }))} placeholder="https://platform.openai.com/docs/..." /></div>
        <div><Label className="text-xs">설명 <span className="text-ink/40">(목록 카드 요약 · 짧게. 서식 없이 표시돼요)</span></Label><Textarea className="mt-1" rows={2} value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} /></div>
        <div>
          <Label className="text-xs">상세 본문 <span className="text-ink/40">(선택 · 채우면 본가에 내부 상세페이지가 생기고 카드가 그리로 연결돼요. 비우면 카드가 원문 링크로 직행 · 텍스트 선택 후 서식)</span></Label>
          <RichTextarea className="mt-1" rows={6} value={f.bodyRich} onChange={(v) => setF((p) => ({ ...p, bodyRich: v }))} placeholder={'이 가이드를 왜/어떻게 보면 좋은지, 핵심 요약, 우리 맥락에서의 포인트 등.\n비워두면 예전처럼 카드가 바로 원문으로 연결돼요.'} />
        </div>
        <div>
          <Label className="text-xs">참고 이미지 <span className="text-ink/40">(선택 · 상세페이지 본문 아래 노출 · 2장 이상이면 카드뉴스)</span></Label>
          <div className="mt-1">
            <GalleryField block={{ type: 'gallery', images: f.images }} onChange={(b) => setF((p) => ({ ...p, images: b.type === 'gallery' ? b.images : p.images }))} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          {editId && <Button type="button" variant="outline" onClick={reset}>취소</Button>}
          <Button type="submit" variant="accent" disabled={pending}>{pending ? '저장 중…' : editId ? '수정 저장' : '추가'}</Button>
        </div>
      </form>

      {GUIDE_CATEGORIES.filter((c) => groups.has(c)).map((cat) => (
        <section key={cat}>
          <h2 className="font-serif text-base font-semibold mb-3">{GUIDE_CATEGORY_LABELS[cat]} <span className="text-xs text-ink/40 font-normal">{groups.get(cat)!.length}</span></h2>
          <div className="card divide-y divide-border">
            {groups.get(cat)!.map((g) => (
              <div key={g.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a href={g.url ?? '#'} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">{g.name}</a>
                    {(g.body?.source ?? g.job_tags?.[0]) && <span className="text-xs text-ink/40">{g.body?.source ?? g.job_tags?.[0]}</span>}
                    {g.body?.sourceType && g.body.sourceType !== 'default' && (
                      <span className="badge bg-ink/5 text-ink/60">{SOURCE_TYPE_LABELS[(SOURCE_TYPES as readonly string[]).includes(g.body.sourceType) ? (g.body.sourceType as SourceType) : 'default']}</span>
                    )}
                    {(g.body?.bodyRich?.trim() || (g.body?.images?.length ?? 0) > 0) && <span className="badge bg-accent/10 text-accent">상세</span>}
                  </div>
                  {g.description && <p className="text-sm text-ink/60 mt-0.5">{g.description}</p>}
                  <p className="text-xs text-ink/40 mt-0.5 break-all">{g.url}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  <span className={`badge ${g.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{g.status === 'published' ? '발행' : '비공개'}</span>
                  <button onClick={() => startEdit(g)} className="text-accent hover:underline">수정</button>
                  <button onClick={() => togglePublish(g)} className="text-ink/60 hover:underline">{g.status === 'published' ? '비공개' : '발행'}</button>
                  <button onClick={() => remove(g)} className="text-red-600 hover:underline">삭제</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {initial.length === 0 && <p className="text-sm text-ink/40">등록된 가이드가 없어요.</p>}
    </div>
  );
}
