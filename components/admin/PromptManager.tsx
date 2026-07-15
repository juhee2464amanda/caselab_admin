'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ThumbnailField } from '@/components/admin/ThumbnailField';
import { RichTextarea } from '@/components/admin/RichTextarea';
import { GalleryField } from '@/components/admin/BlockListEditor';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type PromptImage = { url: string; caption?: string };

// 바로쓰는 프롬프트 관리 — tools(category='prompt').
// 본가 /prompts가 읽는 계약: name, pick_order, body{prompt, promptCategory, source, sourceUrl}.
// (본가 lib/data/prompts.ts · types/prompt.ts 정합, 2026-07-07)

export const PROMPT_CATEGORIES = ['think', 'make', 'verify', 'refine'] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];
export const PROMPT_CATEGORY_LABELS: Record<PromptCategory, string> = {
  think: '사고하기',
  make: '만들기',
  verify: '검증하기',
  refine: '다듬기',
};

export type PromptRow = {
  id: string;
  name: string;
  description: string | null; // 복사 박스 밖 설명 (본가 카드에서 박스 위에 노출)
  thumbnail_url: string | null; // 본가 리스트 카드·히어로 썸네일 (없으면 브랜드 폴백)
  status: string;
  pick_order: number | null;
  job_tags: string[] | null; // admin 분류·검색용 태그 (본가 /prompts는 아직 미노출)
  body: {
    prompt?: string;
    promptCategory?: string;
    source?: string;
    sourceUrl?: string;
    images?: PromptImage[]; // 본가 상세에서 프롬프트 아래 참고 이미지로 노출
  } | null;
};

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'prompt';
}

const EMPTY = { name: '', description: '', thumbnailUrl: '', prompt: '', category: 'think' as PromptCategory, source: '', sourceUrl: '', pickOrder: '', tags: '', images: [] as PromptImage[] };

export function PromptManager({ initial }: { initial: PromptRow[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() { setEditId(null); setF(EMPTY); setError(null); }
  function startEdit(p: PromptRow) {
    const b = p.body ?? {};
    setEditId(p.id);
    setF({
      name: p.name,
      description: p.description ?? '',
      thumbnailUrl: p.thumbnail_url ?? '',
      prompt: b.prompt ?? '',
      category: (PROMPT_CATEGORIES as readonly string[]).includes(b.promptCategory ?? '') ? (b.promptCategory as PromptCategory) : 'think',
      source: b.source ?? '',
      sourceUrl: b.sourceUrl ?? '',
      pickOrder: p.pick_order == null ? '' : String(p.pick_order),
      tags: (p.job_tags ?? []).join(', '),
      images: b.images ?? [],
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.name.trim() || !f.prompt.trim()) { setError('제목과 프롬프트 본문은 필수예요.'); return; }
    const pickOrder = f.pickOrder.trim() === '' ? null : Number(f.pickOrder);
    if (pickOrder != null && !Number.isFinite(pickOrder)) { setError('PICK 순서는 숫자로 입력해 주세요.'); return; }
    setPending(true);
    // body는 통째로 재작성 — 프롬프트 계약 4필드가 body의 전부라서 병합 불필요
    const payload = {
      name: f.name.trim(),
      description: f.description.trim() || null,
      thumbnail_url: f.thumbnailUrl.trim() || null,
      pick_order: pickOrder,
      job_tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      body: {
        prompt: f.prompt,
        promptCategory: f.category,
        source: f.source.trim() || undefined,
        sourceUrl: f.sourceUrl.trim() || undefined,
        images: f.images.length ? f.images : undefined,
      },
    };
    let err;
    if (editId) {
      ({ error: err } = await supabase.from('tools').update(payload).eq('id', editId));
    } else {
      const slug = `${slugify(f.name)}-${(globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`).slice(0, 4)}`;
      ({ error: err } = await supabase.from('tools').insert({ ...payload, slug, category: 'prompt', status: 'published' }));
    }
    setPending(false);
    if (err) { setError(err.message); return; }
    reset();
    router.refresh();
  }

  async function togglePublish(p: PromptRow) {
    await supabase.from('tools').update({ status: p.status === 'published' ? 'draft' : 'published' }).eq('id', p.id);
    router.refresh();
  }
  async function remove(p: PromptRow) {
    if (!confirm(`"${p.name}" 삭제할까요?`)) return;
    await supabase.from('tools').delete().eq('id', p.id);
    if (editId === p.id) reset();
    router.refresh();
  }

  // 자주 쓰는 태그: 기존 등록분에서 빈도순 상위 10개 → 입력창 아래 원클릭 추가 칩
  const tagCounts = new Map<string, number>();
  for (const p of initial) for (const t of p.job_tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const currentTags = f.tags.split(',').map((t) => t.trim()).filter(Boolean);
  const frequentTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t]) => t);

  function addTag(t: string) {
    if (currentTags.includes(t)) return;
    setF((p) => ({ ...p, tags: [...currentTags, t].join(', ') }));
  }

  // 본가 노출 순서와 같은 감각으로: PICK(=pick_order 있음)을 먼저, 이후 분류별 그룹
  const picks = initial.filter((p) => p.pick_order != null).sort((a, b) => (a.pick_order ?? 0) - (b.pick_order ?? 0));
  const groups = new Map<PromptCategory, PromptRow[]>();
  for (const p of initial) {
    const raw = p.body?.promptCategory;
    const cat: PromptCategory = (PROMPT_CATEGORIES as readonly string[]).includes(raw ?? '') ? (raw as PromptCategory) : 'think';
    groups.set(cat, [...(groups.get(cat) ?? []), p]);
  }

  const renderRow = (p: PromptRow) => (
    <div key={p.id} className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {p.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.thumbnail_url} alt="" className="h-11 w-11 rounded-md object-cover border border-border shrink-0 mt-0.5" />
          ) : (
            <div className="h-11 w-11 rounded-md bg-ink/5 border border-border shrink-0 mt-0.5 flex items-center justify-center text-[9px] font-semibold text-ink/25">Caselab</div>
          )}
          <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{p.name}</span>
            {p.pick_order != null && <span className="badge bg-accent/10 text-accent">PICK {p.pick_order}</span>}
            <span className="badge bg-ink/5 text-ink/60">{PROMPT_CATEGORY_LABELS[((PROMPT_CATEGORIES as readonly string[]).includes(p.body?.promptCategory ?? '') ? p.body?.promptCategory : 'think') as PromptCategory]}</span>
            {p.body?.source && <span className="text-xs text-ink/40">{p.body.source}</span>}
            {(p.job_tags ?? []).map((t) => (
              <span key={t} className="text-[11px] text-ink/50 bg-ink/5 rounded px-1.5 py-0.5">#{t}</span>
            ))}
          </div>
          {p.description && <p className="text-xs text-ink/60 mt-1 line-clamp-1">{p.description}</p>}
          {p.body?.prompt && <p className="text-xs text-ink/50 mt-1 line-clamp-2 whitespace-pre-line font-mono">{p.body.prompt}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs">
          <span className={`badge ${p.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{p.status === 'published' ? '발행' : '비공개'}</span>
          <button onClick={() => startEdit(p)} className="text-accent hover:underline">수정</button>
          {p.status === 'published' ? (
            <button onClick={() => togglePublish(p)} className="rounded-md border border-border px-2.5 py-1 font-semibold text-ink/60 hover:bg-ink/5 transition-colors">비공개로</button>
          ) : (
            <button onClick={() => togglePublish(p)} className="rounded-md bg-accent px-2.5 py-1 font-semibold text-white hover:opacity-90 transition-opacity">발행</button>
          )}
          <button onClick={() => remove(p)} className="text-red-600 hover:underline">삭제</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="card p-5 space-y-3">
        <div className="text-sm font-semibold">{editId ? '프롬프트 수정' : '프롬프트 추가'}</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2"><Label className="text-xs">제목 *</Label><Input className="mt-1" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} placeholder="회의록을 액션아이템으로 바꾸기" /></div>
          <div>
            <Label className="text-xs">분류 *</Label>
            <Select value={f.category} onValueChange={(v) => setF((p) => ({ ...p, category: v as PromptCategory }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROMPT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{PROMPT_CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label className="text-xs">설명 <span className="text-ink/40">(복사 박스 밖에 노출 · 어떤 프롬프트인지 → 어떤 상황에서 쓰는지 → 누구를 위한 것인지 순서로, 줄바꿈 구분 · 텍스트 선택 후 서식)</span></Label><RichTextarea className="mt-1" rows={3} value={f.description} onChange={(v) => setF((p) => ({ ...p, description: v }))} placeholder={'회의록을 결정사항·액션아이템으로 정리하는 프롬프트입니다.\n회의 직후 공유용 요약이 필요할 때 씁니다.\n반복 회의를 운영하는 PM·팀 리드를 위한 프롬프트입니다.'} /></div>
        <div><Label className="text-xs">프롬프트 본문 * <span className="text-ink/40">(사용자가 복사해 가는 텍스트만 — 설명 섞지 않기 · 굵게/밑줄/형광펜 마커는 복사 시 함께 딸려가요)</span></Label><RichTextarea className="mt-1" rows={6} mono value={f.prompt} onChange={(v) => setF((p) => ({ ...p, prompt: v }))} /></div>
        <div>
          <Label className="text-xs">참고 이미지 <span className="text-ink/40">(선택 · 본가 프롬프트 상세에서 본문 아래에 노출 · 2장 이상이면 카드뉴스)</span></Label>
          <div className="mt-1">
            <GalleryField block={{ type: 'gallery', images: f.images }} onChange={(b) => setF((p) => ({ ...p, images: b.type === 'gallery' ? b.images : p.images }))} />
          </div>
        </div>
        <ThumbnailField value={f.thumbnailUrl} onChange={(url) => setF((p) => ({ ...p, thumbnailUrl: url }))} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><Label className="text-xs">출처 라벨</Label><Input className="mt-1" value={f.source} onChange={(e) => setF((p) => ({ ...p, source: e.target.value }))} placeholder="Anthropic 공식" /></div>
          <div><Label className="text-xs">출처 URL</Label><Input className="mt-1" value={f.sourceUrl} onChange={(e) => setF((p) => ({ ...p, sourceUrl: e.target.value }))} placeholder="https://…" /></div>
          <div><Label className="text-xs">에디터 추천(PICK) 순서 <span className="text-ink/40">(작을수록 앞)</span></Label><Input className="mt-1" inputMode="numeric" value={f.pickOrder} onChange={(e) => setF((p) => ({ ...p, pickOrder: e.target.value }))} placeholder="1" /><p className="text-[11px] text-ink/40 mt-1">숫자를 넣으면 본가 전체 탭 상단 &lsquo;에디터 추천&rsquo; 밴드에 노출되고 일반 목록에서는 빠져요. 비우면 일반·최신순.</p></div>
        </div>
        <div>
          <Label className="text-xs">태그 <span className="text-ink/40">(쉼표로 구분 · admin 분류용, 본가 미노출)</span></Label>
          <Input className="mt-1" value={f.tags} onChange={(e) => setF((p) => ({ ...p, tags: e.target.value }))} placeholder="회의록, 기획, 마케팅" />
          {frequentTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              <span className="text-[11px] text-ink/40">자주 쓰는 태그:</span>
              {frequentTags.map((t) => {
                const on = currentTags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTag(t)}
                    disabled={on}
                    className={`text-[11px] rounded px-1.5 py-0.5 transition-colors ${on ? 'bg-accent/10 text-accent cursor-default' : 'bg-ink/5 text-ink/50 hover:bg-ink/10 hover:text-ink/70'}`}
                  >
                    #{t}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          {editId && <Button type="button" variant="outline" onClick={reset}>취소</Button>}
          <Button type="submit" variant="accent" disabled={pending}>{pending ? '저장 중…' : editId ? '수정 저장' : '추가'}</Button>
        </div>
      </form>

      {picks.length > 0 && (
        <section>
          <h2 className="font-serif text-base font-semibold mb-3">에디터 PICK <span className="text-xs text-ink/40 font-normal">{picks.length}</span></h2>
          <div className="card divide-y divide-border">{picks.map(renderRow)}</div>
        </section>
      )}

      {PROMPT_CATEGORIES.filter((c) => groups.has(c)).map((cat) => (
        <section key={cat}>
          <h2 className="font-serif text-base font-semibold mb-3">{PROMPT_CATEGORY_LABELS[cat]} <span className="text-xs text-ink/40 font-normal">{groups.get(cat)!.length}</span></h2>
          <div className="card divide-y divide-border">{groups.get(cat)!.map(renderRow)}</div>
        </section>
      ))}
      {initial.length === 0 && <p className="text-sm text-ink/40">등록된 프롬프트가 없어요.</p>}
    </div>
  );
}
