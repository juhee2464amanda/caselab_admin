'use client';

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { CardSlide, CardTemplateId, CardAccent } from '@/types/cardpress';

// 카드프레스 검수 스튜디오 (spec §3-③)
// 좌: 슬라이드 리스트(on/off·순서·템플릿 교체·인라인 편집) / 우: 실비율 프리뷰 + 캡션·스레드 편집.
// 이미지 트레이: 본문 추출 이미지 + 메타포 검색어 → Unsplash 인라인 검색 → 클릭 배치.

export type CardRow = {
  id: string;
  source_type: 'content' | 'tool';
  source_id: string;
  slides: CardSlide[];
  accent: CardAccent;
  extracted_images: string[];
  ig_caption: string | null;
  threads_text: string | null;
  threads_cover: string | null;
  metaphor_queries?: string[];
  edge?: string | null;
  cta_type?: 'info_save' | 'comment_dm';
  cta_keyword?: string | null;
  cover_candidates?: Array<{ thumb: string; full: string; credit: string; creditLink: string }>;
  status: 'auto_draft' | 'reviewed' | 'published';
  published_to: Array<{ channel: string; post_id: string; at: string }>;
  created_at?: string;
  updated_at: string;
};

export type SourceRow = {
  id: string;
  title: string;
  track: 'case' | 'trend';
  slug: string;
  status: string;
  view_count?: number | null;
  published_at?: string | null;
};

const STATUS_LABEL: Record<CardRow['status'], { text: string; cls: string }> = {
  auto_draft: { text: '검수 대기', cls: 'bg-yellow-100 text-yellow-700' },
  reviewed: { text: '검수 완료', cls: 'bg-blue-100 text-blue-700' },
  published: { text: '발행됨', cls: 'bg-green-100 text-green-700' },
};

const TEMPLATE_LABEL: Record<CardTemplateId, string> = {
  C1: 'C1 사진커버', C2: 'C2 다크커버', C3: 'C3 툴커버', C4: 'C4 VS커버',
  B1: 'B1 타임라인', B2: 'B2 불릿', B3: 'B3 용어', B4: 'B4 선언',
  B5: 'B5 솔직후기', B6: 'B6 스텝', B7: 'B7 숫자', B8: 'B8 프롬프트',
  B9: 'B9 스크린샷', O1: 'O1 마무리',
};

// 템플릿 교체 대안 (재료가 같은 섹션에서 서로 넘나들 수 있는 쌍)
const ALT_MAP: Partial<Record<CardTemplateId, CardTemplateId[]>> = {
  B2: ['B7', 'B6'], B7: ['B2'], B6: ['B2'], C1: ['C2'], C2: ['C1'], B4: ['B2'],
};

// 슬라이드별 이미지가 들어가는 props 키
const IMAGE_KEY: Partial<Record<CardTemplateId, string>> = {
  C1: 'coverImage', C2: 'coverImage', B4: 'coverImage', B2: 'media', B9: 'shot',
};

// ── 템플릿별 인라인 편집 필드 정의 ──────────────────────────
type FieldKind = 'input' | 'textarea' | 'lines' | 'pairs' | 'pair-single';
type FieldDef = { key: string; label: string; kind: FieldKind; hint?: string; pairKeys?: [string, string] };

const FIELDS: Record<CardTemplateId, FieldDef[]> = {
  C1: [
    { key: 'title', label: '제목', kind: 'textarea', hint: '줄바꿈 그대로 반영 · 줄당 ≤12자' },
    { key: 'hl', label: '형광펜 단어', kind: 'input', hint: '제목 속 부분 문자열' },
    { key: 'sub', label: '부제', kind: 'input' },
    { key: 'coverImage', label: '배경 이미지 URL', kind: 'input' },
  ],
  C2: [
    { key: 'eyebrow', label: '도입', kind: 'input' },
    { key: 'title', label: '제목', kind: 'textarea', hint: '줄당 ≤12자' },
    { key: 'hl', label: '형광펜 단어', kind: 'input' },
    { key: 'sub', label: '하단 부연', kind: 'input' },
  ],
  C3: [
    { key: 'logoText', label: '로고 글자', kind: 'input' },
    { key: 'title', label: '제목', kind: 'textarea' },
    { key: 'hl', label: '형광펜 단어', kind: 'input' },
    { key: 'sub', label: '하단 부연', kind: 'input' },
  ],
  C4: [
    { key: 'eyebrow', label: '도입', kind: 'input' },
    { key: 'vsA', label: 'A (이름 | 제작사)', kind: 'pair-single', pairKeys: ['name', 'by'] },
    { key: 'vsB', label: 'B (이름 | 제작사)', kind: 'pair-single', pairKeys: ['name', 'by'] },
    { key: 'sub', label: '하단 부연', kind: 'input' },
  ],
  B1: [
    { key: 'lead', label: '도입', kind: 'input', hint: '**강조** 1개 가능' },
    { key: 'heading', label: '제목', kind: 'input' },
    { key: 'hl', label: '형광펜 구', kind: 'input' },
    { key: 'rows', label: '항목 (이름 | 설명)', kind: 'pairs', pairKeys: ['term', 'desc'] },
  ],
  B2: [
    { key: 'banner', label: '배너', kind: 'input' },
    { key: 'bullets', label: '불릿 (줄마다 1개)', kind: 'lines', hint: '**강조** 마커, ≤30자' },
    { key: 'media', label: '이미지 URL', kind: 'input' },
  ],
  B3: [
    { key: 'badge', label: '배지', kind: 'input', hint: '비우면 "30초 개념"' },
    { key: 'term', label: '용어', kind: 'input' },
    { key: 'termEn', label: '영문', kind: 'input' },
    { key: 'lead', label: '한 줄 정의', kind: 'input' },
    { key: 'body', label: '부연', kind: 'textarea' },
  ],
  B4: [
    { key: 'title', label: '선언 문장', kind: 'textarea', hint: '줄당 ≤13자' },
    { key: 'hl', label: '형광펜 단어', kind: 'input' },
    { key: 'attribution', label: '출처 표기', kind: 'input' },
    { key: 'coverImage', label: '배경 이미지 URL', kind: 'input' },
  ],
  B5: [
    { key: 'heading', label: '제목', kind: 'input', hint: '비우면 "솔직 후기"' },
    { key: 'good', label: '잘된 것 (줄마다 1개)', kind: 'lines' },
    { key: 'bad', label: '별로였던 것 (줄마다 1개)', kind: 'lines' },
  ],
  B6: [
    { key: 'heading', label: '제목', kind: 'input' },
    { key: 'hl', label: '형광펜 구', kind: 'input' },
    { key: 'steps', label: '스텝 (제목 | 설명)', kind: 'pairs', pairKeys: ['title', 'desc'] },
  ],
  B7: [
    { key: 'big', label: '큰 숫자', kind: 'input' },
    { key: 'unit', label: '단위', kind: 'input' },
    { key: 'cap', label: '캡션', kind: 'textarea', hint: '**강조** 1개' },
    { key: 'sub', label: '부연', kind: 'input' },
  ],
  B8: [
    { key: 'badge', label: '배지', kind: 'input', hint: '예: 패턴 03 · 비우면 "프롬프트 패턴"' },
    { key: 'patternName', label: '패턴명', kind: 'input', hint: '≤12자' },
    { key: 'when', label: '어떤 상황에서', kind: 'input', hint: '≤22자' },
    { key: 'lines', label: '맛보기 (줄마다 1줄, 3~4줄)', kind: 'lines', hint: '[변수]는 초록, # 시작 줄은 주석' },
    { key: 'effect', label: '기대 효과', kind: 'input', hint: '≤20자' },
    { key: 'ctaLine', label: 'CTA 문구', kind: 'input', hint: '재생성 시 CTA 유형에 맞게 자동 주입' },
  ],
  B9: [
    { key: 'lead', label: '도입', kind: 'input' },
    { key: 'shot', label: '스크린샷 URL', kind: 'input' },
    { key: 'callouts', label: '말풍선 (문구 | tl·tr·bl·br)', kind: 'pairs', pairKeys: ['text', 'pos'] },
  ],
  O1: [
    { key: 'eyebrow', label: '도입', kind: 'input', hint: '비우면 "오늘의 정리"' },
    { key: 'title', label: '핵심 요약', kind: 'textarea', hint: '2줄, 줄당 ≤11자' },
    { key: 'hl', label: '형광펜 단어', kind: 'input' },
    { key: 'body', label: '부연', kind: 'textarea' },
  ],
};

function fieldToText(value: unknown, def: FieldDef): string {
  if (value == null) return '';
  switch (def.kind) {
    case 'lines':
      return Array.isArray(value) ? (value as string[]).join('\n') : String(value);
    case 'pairs': {
      const [a, b] = def.pairKeys!;
      return Array.isArray(value)
        ? (value as Record<string, string>[]).map((r) => [r[a], r[b]].filter(Boolean).join(' | ')).join('\n')
        : '';
    }
    case 'pair-single': {
      const [a, b] = def.pairKeys!;
      const v = value as Record<string, string>;
      return [v?.[a], v?.[b]].filter(Boolean).join(' | ');
    }
    default:
      return String(value);
  }
}

function textToField(text: string, def: FieldDef): unknown {
  const t = text.trim();
  if (!t) return undefined;
  switch (def.kind) {
    case 'lines':
      return t.split('\n').map((l) => l.trim()).filter(Boolean);
    case 'pairs': {
      const [a, b] = def.pairKeys!;
      return t
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [x, y] = l.split('|').map((s) => s.trim());
          return y ? { [a]: x, [b]: y } : { [a]: x };
        });
    }
    case 'pair-single': {
      const [a, b] = def.pairKeys!;
      const [x, y] = t.split('|').map((s) => s.trim());
      return y ? { [a]: x, [b]: y } : { [a]: x };
    }
    case 'textarea':
      return text.replace(/\s+$/, '');
    default:
      return t;
  }
}

/** 활성 슬라이드 기준 page("n / total") 재계산 — 커버·B4는 페이지 없음 */
function renumber(slides: CardSlide[]): CardSlide[] {
  const PAGED: CardTemplateId[] = ['B1', 'B2', 'B3', 'B5', 'B6', 'B7', 'B8', 'B9', 'O1'];
  const enabled = slides.filter((s) => s.enabled);
  const total = enabled.length;
  let n = 0;
  return slides.map((s, i) => {
    if (!s.enabled) return { ...s, order: i + 1 };
    n += 1;
    const props = { ...s.props };
    if (PAGED.includes(s.template)) props.page = `${n} / ${total}`;
    return { ...s, order: i + 1, props };
  });
}

// ── 본체 ──────────────────────────────────────────────────
export function CardPressManager({ initial, sources }: { initial: CardRow[]; sources: SourceRow[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const sourceMap = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [statusFilter, setStatusFilter] = useState<'all' | CardRow['status']>('all');
  const card = initial.find((c) => c.id === selectedId) ?? null;
  const filtered = statusFilter === 'all' ? initial : initial.filter((c) => c.status === statusFilter);

  // 카드 없는 발행 콘텐츠 → 수동 생성 후보 (검색·트랙 필터·조회수 정렬)
  const withoutCard = sources.filter((s) => !initial.some((c) => c.source_id === s.id));
  const [generating, setGenerating] = useState<string | null>(null);
  const [srcQuery, setSrcQuery] = useState('');
  const [srcTrack, setSrcTrack] = useState<'all' | 'case' | 'trend'>('all');
  const [srcSort, setSrcSort] = useState<'recent' | 'views'>('views');
  const candidates = withoutCard
    .filter((s) => (srcTrack === 'all' ? true : s.track === srcTrack))
    .filter((s) => (srcQuery.trim() ? s.title.toLowerCase().includes(srcQuery.trim().toLowerCase()) : true))
    .sort((a, b) =>
      srcSort === 'views'
        ? (b.view_count ?? 0) - (a.view_count ?? 0)
        : (b.published_at ?? '').localeCompare(a.published_at ?? '')
    );

  async function generateFor(sourceId: string) {
    setGenerating(sourceId);
    try {
      const res = await fetch('/api/cardpress/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceType: 'content', sourceId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      alert(`생성 실패: ${(e as Error).message}`);
    } finally {
      setGenerating(null);
    }
  }

  const FILTERS: Array<{ key: 'all' | CardRow['status']; label: string }> = [
    { key: 'all', label: `전체 ${initial.length}` },
    { key: 'auto_draft', label: `검수 대기 ${initial.filter((c) => c.status === 'auto_draft').length}` },
    { key: 'reviewed', label: `검수 완료 ${initial.filter((c) => c.status === 'reviewed').length}` },
    { key: 'published', label: `발행됨 ${initial.filter((c) => c.status === 'published').length}` },
  ];

  return (
    <div className="space-y-6">
      {/* 1. 새 카드뉴스 만들기 — "무엇을 만들 것인가"가 이 탭의 진입점 */}
      <div className="card p-4 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm font-semibold">새 카드뉴스 만들기 <span className="text-xs text-ink/40 font-normal">발행 콘텐츠에서 소재 선택 — 반응 좋았던 것부터</span></div>
          {withoutCard.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              {(['all', 'case', 'trend'] as const).map((t) => (
                <button key={t} onClick={() => setSrcTrack(t)} className={`rounded-full px-2 py-0.5 ${srcTrack === t ? 'bg-accent text-white' : 'bg-ink/5 text-ink/60'}`}>
                  {t === 'all' ? '전체' : t === 'case' ? '케이스' : '트렌드'}
                </button>
              ))}
              <button onClick={() => setSrcSort(srcSort === 'views' ? 'recent' : 'views')} className="rounded-full px-2 py-0.5 bg-ink/5 text-ink/60 hover:bg-ink/10">
                {srcSort === 'views' ? '조회수순 ▾' : '최신순 ▾'}
              </button>
            </div>
          )}
        </div>
        {withoutCard.length > 0 ? (
          <>
            <Input value={srcQuery} onChange={(e) => setSrcQuery(e.target.value)} placeholder="제목 검색" />
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {candidates.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">
                    {s.title}
                    <span className="text-[11px] text-ink/40 ml-1.5">조회 {s.view_count ?? 0}</span>
                  </span>
                  <Button size="sm" variant="outline" disabled={generating !== null} onClick={() => generateFor(s.id)}>
                    {generating === s.id ? '생성 중… (수 분 소요)' : '카드 생성'}
                  </Button>
                </div>
              ))}
              {candidates.length === 0 && <p className="text-xs text-ink/40">조건에 맞는 콘텐츠가 없어요.</p>}
            </div>
          </>
        ) : (
          <p className="text-xs text-ink/40">모든 발행 콘텐츠에 카드가 있어요. 새 콘텐츠를 발행하면 자동으로 여기에 대기합니다.</p>
        )}
      </div>

      {/* 2. 상태 필터 + 카드 세트 목록 */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`text-xs rounded-full px-2.5 py-1 transition-colors ${statusFilter === f.key ? 'bg-accent text-white' : 'bg-ink/5 text-ink/60 hover:bg-ink/10'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="card divide-y divide-border">
          {filtered.map((c) => {
            const src = sourceMap.get(c.source_id);
            const st = STATUS_LABEL[c.status];
            const cover =
              (c.slides[0]?.props as Record<string, unknown> | undefined)?.coverImage as string | undefined;
            const thumb = cover ?? c.extracted_images[0];
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors ${selectedId === c.id ? 'bg-accent/5' : 'hover:bg-ink/[0.02]'}`}
              >
                <div className="min-w-0 flex items-center gap-3">
                  {thumb ? (
                    <img src={thumb} alt="" className="h-12 w-[38px] rounded object-cover border border-border shrink-0" />
                  ) : (
                    <div className="h-12 w-[38px] rounded bg-ink/10 border border-border shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{src?.title ?? c.source_id}</span>
                      <span className="badge bg-ink/5 text-ink/60">{src?.track === 'case' ? '실전 케이스' : 'AI 트렌드'}</span>
                      <span className="text-xs text-ink/40">{c.slides.filter((s) => s.enabled).length}장</span>
                    </div>
                    <div className="text-[11px] text-ink/40 mt-0.5">
                      생성 {(c.created_at ?? c.updated_at).slice(0, 10)} · 수정 {c.updated_at.slice(0, 10)}
                      {c.published_to.length > 0 && ` · 발행: ${c.published_to.map((p) => p.channel).join(', ')}`}
                    </div>
                  </div>
                </div>
                <span className={`badge shrink-0 ${st.cls}`}>{st.text}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-sm text-ink/40">
              {initial.length === 0
                ? '아직 생성된 카드가 없어요. 콘텐츠를 발행하면 자동 생성되고, 아래에서 수동으로도 만들 수 있어요.'
                : '이 상태의 카드가 없어요.'}
            </p>
          )}
        </div>
      </div>

      {card && <CardEditor key={card.id} card={card} source={sourceMap.get(card.source_id)} />}
    </div>
  );
}

// ── 편집기 ────────────────────────────────────────────────
function CardEditor({ card, source }: { card: CardRow; source?: SourceRow }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [slides, setSlides] = useState<CardSlide[]>(card.slides);
  const [igCaption, setIgCaption] = useState(card.ig_caption ?? '');
  const [threadsText, setThreadsText] = useState(card.threads_text ?? '');
  const [threadsCover, setThreadsCover] = useState(card.threads_cover ?? '');
  const [edge, setEdge] = useState(card.edge ?? '');
  const [ctaType, setCtaType] = useState<'info_save' | 'comment_dm'>(card.cta_type ?? 'comment_dm');
  const [ctaKeyword, setCtaKeyword] = useState(card.cta_keyword ?? '프롬프트');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selIdx, setSelIdx] = useState(0);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [rewriting, setRewriting] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');

  const sel = slides[selIdx] as CardSlide | undefined;

  const patch = useCallback((updater: (prev: CardSlide[]) => CardSlide[]) => {
    setSlides((prev) => renumber(updater(prev)));
    setDirty(true);
  }, []);

  // ── 프리뷰: 선택 슬라이드를 렌더 API로 PNG화 (props 해시로 캐시) ──
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewKey = sel ? JSON.stringify({ t: sel.template, p: sel.props }) : '';
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sel) return;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewErr(null);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/cardpress/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ template: sel.template, accent: card.accent, props: sel.props }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `렌더 ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(blob);
        setPreviewUrl(urlRef.current);
      } catch (e) {
        if (!cancelled) setPreviewErr((e as Error).message);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 400); // 연타 편집 디바운스
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, card.accent]);

  // ── 슬라이드 조작 ──
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    patch((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSelIdx(j);
  }

  function applyEdit(i: number, form: Record<string, string>) {
    patch((prev) =>
      prev.map((s, k) => {
        if (k !== i) return s;
        const props: Record<string, unknown> = { ...s.props };
        for (const def of FIELDS[s.template]) {
          const v = textToField(form[def.key] ?? '', def);
          if (v === undefined) delete props[def.key];
          else props[def.key] = v;
        }
        return { ...s, props };
      })
    );
    setEditIdx(null);
  }

  async function swapTemplate(i: number, target: CardTemplateId) {
    const s = slides[i];
    if (!s.sourceSection) return alert('sourceSection이 없어 재작성할 수 없어요.');
    setRewriting(i);
    try {
      const res = await fetch('/api/cardpress/rewrite-slide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceId: card.source_id, sourceSection: s.sourceSection, template: target }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const { slide } = (await res.json()) as { slide: { template: CardTemplateId; props: Record<string, unknown> } };
      patch((prev) => prev.map((x, k) => (k === i ? { ...x, template: slide.template, props: slide.props } : x)));
      setSelIdx(i);
    } catch (e) {
      alert(`템플릿 교체 실패: ${(e as Error).message}`);
    } finally {
      setRewriting(null);
    }
  }

  // ── 이미지 배치 ──
  function assignImage(url: string) {
    if (!sel) return;
    const key = IMAGE_KEY[sel.template];
    if (!key) return alert(`${TEMPLATE_LABEL[sel.template]}에는 이미지 자리가 없어요. (커버·B2·B9 선택 후 클릭)`);
    patch((prev) => prev.map((s, k) => (k === selIdx ? { ...s, props: { ...s.props, [key]: url } } : s)));
  }

  // 커버 후보 클릭 → 무조건 커버(1번)에 적용. 다크 커버(C2·C3)면 사진 커버(C1)로 자동 전환.
  function applyCover(url: string) {
    patch((prev) =>
      prev.map((s, i) => {
        if (i !== 0) return s;
        const props: Record<string, unknown> = { ...s.props, coverImage: url };
        if (s.template === 'C2' || s.template === 'C3') {
          delete props.eyebrow;
          delete props.pill;
          delete props.logoText;
          return { ...s, template: 'C1' as const, props };
        }
        return { ...s, props };
      })
    );
    setSelIdx(0);
  }

  // ── 저장/상태 ──
  async function save(nextStatus?: CardRow['status']) {
    setSaving(true);
    const { error } = await supabase
      .from('content_cards')
      .update({
        slides: renumber(slides),
        ig_caption: igCaption || null,
        threads_text: threadsText || null,
        threads_cover: threadsCover || null,
        edge: edge || null,
        cta_type: ctaType,
        cta_keyword: ctaKeyword || null,
        ...(nextStatus ? { status: nextStatus } : {}),
      })
      .eq('id', card.id);
    setSaving(false);
    if (error) return alert(`저장 실패: ${error.message}`);
    setDirty(false);
    router.refresh();
  }

  async function regenerate() {
    if (!confirm(`AI로 전체를 다시 생성할까요? 지금까지의 수정이 덮어써져요. (수 분 소요)${edge.trim() ? `\n\n엣지 방향: ${edge.trim()}` : ''}`)) return;
    setSaving(true);
    try {
      const res = await fetch('/api/cardpress/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'content',
          sourceId: card.source_id,
          edge: edge.trim() || undefined,
          ctaType,
          ctaKeyword: ctaKeyword.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      alert(`재생성 실패: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('이 카드 세트를 삭제할까요?')) return;
    const { error } = await supabase.from('content_cards').delete().eq('id', card.id);
    if (error) return alert(`삭제 실패: ${error.message}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="font-serif text-base font-semibold truncate">{source?.title ?? card.source_id}</h2>
          <span className={`badge shrink-0 ${STATUS_LABEL[card.status].cls}`}>{STATUS_LABEL[card.status].text}</span>
          {dirty && <span className="text-xs text-amber-600">저장 안 됨</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={regenerate} disabled={saving}>AI 전체 재생성</Button>
          <Button size="sm" variant="outline" onClick={remove} disabled={saving}>삭제</Button>
          <Button size="sm" variant="outline" onClick={() => save()} disabled={saving || !dirty}>{saving ? '저장 중…' : '저장'}</Button>
          <Button size="sm" variant="accent" onClick={() => save('reviewed')} disabled={saving}>검수 완료</Button>
        </div>
      </div>

      {/* 엣지 + CTA 유형 — 수정 후 [AI 전체 재생성]하면 이 방향·문법으로 다시 쓴다 */}
      <div className="card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs shrink-0">엣지</Label>
          <Input
            value={edge}
            onChange={(e) => { setEdge(e.target.value); setDirty(true); }}
            placeholder="이 콘텐츠의 차별점 한 줄 (예: 앤트로픽 현직 엔지니어가 직접 공개한 검증된 패턴)"
            className="text-sm"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-xs shrink-0">CTA</Label>
          {([
            ['comment_dm', '댓글→DM 참여형'],
            ['info_save', '정보 제공형'],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => { setCtaType(v); setDirty(true); }}
              className={`text-xs rounded-full px-2.5 py-1 ${ctaType === v ? 'bg-accent text-white' : 'bg-ink/5 text-ink/60 hover:bg-ink/10'}`}
            >
              {label}
            </button>
          ))}
          {ctaType === 'comment_dm' && (
            <>
              <span className="text-[11px] text-ink/40">댓글 키워드:</span>
              <Input
                value={ctaKeyword}
                onChange={(e) => { setCtaKeyword(e.target.value); setDirty(true); }}
                className="text-sm w-28"
              />
              <span className="text-[11px] text-ink/40">ManyChat 코멘트 자동화에 같은 키워드 세팅 필요</span>
            </>
          )}
          <span className="text-[11px] text-ink/40 ml-auto hidden lg:block">수정 후 [AI 전체 재생성] = 이 방향·문법으로 재작성</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4 items-start">
        {/* 좌: 슬라이드 리스트 */}
        <div className="space-y-3">
          <div className="card divide-y divide-border">
            {slides.map((s, i) => (
              <div key={i} className={`px-3 py-2.5 ${i === selIdx ? 'bg-accent/5' : ''}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={() => patch((prev) => prev.map((x, k) => (k === i ? { ...x, enabled: !x.enabled } : x)))}
                    title="포함/제외"
                  />
                  <button onClick={() => setSelIdx(i)} className="flex-1 min-w-0 text-left flex items-center gap-2">
                    <span className="badge bg-ink/5 text-ink/60 shrink-0">{TEMPLATE_LABEL[s.template]}</span>
                    <span className={`text-sm truncate ${s.enabled ? '' : 'line-through text-ink/30'}`}>
                      {String((s.props as Record<string, unknown>).title ?? (s.props as Record<string, unknown>).heading ?? (s.props as Record<string, unknown>).banner ?? (s.props as Record<string, unknown>).term ?? (s.props as Record<string, unknown>).cap ?? '')}
                    </span>
                    {s.required && <span className="text-[10px] text-red-500 shrink-0" title={s.required}>필수</span>}
                  </button>
                  <div className="flex items-center gap-1 shrink-0 text-xs">
                    <button onClick={() => move(i, -1)} className="px-1.5 py-0.5 rounded border border-border hover:bg-ink/5" title="위로">↑</button>
                    <button onClick={() => move(i, 1)} className="px-1.5 py-0.5 rounded border border-border hover:bg-ink/5" title="아래로">↓</button>
                    {(ALT_MAP[s.template] ?? []).map((alt) => (
                      <button
                        key={alt}
                        onClick={() => swapTemplate(i, alt)}
                        disabled={rewriting !== null}
                        className="px-1.5 py-0.5 rounded border border-border hover:bg-ink/5 text-accent"
                        title={`${TEMPLATE_LABEL[alt]}(으)로 AI 재작성`}
                      >
                        {rewriting === i ? '…' : `→${alt}`}
                      </button>
                    ))}
                    <button onClick={() => setEditIdx(editIdx === i ? null : i)} className="px-1.5 py-0.5 rounded border border-border hover:bg-ink/5 text-accent">
                      {editIdx === i ? '닫기' : '편집'}
                    </button>
                  </div>
                </div>
                {editIdx === i && <SlideForm slide={s} onApply={(form) => applyEdit(i, form)} onCancel={() => setEditIdx(null)} />}
              </div>
            ))}
            <AddSlidePanel
              sourceId={card.source_id}
              onAdd={(slide) => {
                patch((prev) => [...prev, { ...slide, order: prev.length + 1, enabled: true }]);
                setSelIdx(slides.length);
              }}
            />
          </div>

          <ImageTray card={card} onPick={assignImage} onCover={applyCover} onThreadsCover={(u) => { setThreadsCover(u); setDirty(true); }} />

          {/* 캡션·스레드 */}
          <div className="card p-4 space-y-3">
            <div>
              <Label className="text-xs">인스타 캡션</Label>
              <Textarea className="mt-1" rows={7} value={igCaption} onChange={(e) => { setIgCaption(e.target.value); setDirty(true); }} />
            </div>
            <div>
              <Label className="text-xs">스레드 글 <span className="text-ink/40">(본가 링크 포함)</span></Label>
              <Textarea className="mt-1" rows={7} value={threadsText} onChange={(e) => { setThreadsText(e.target.value); setDirty(true); }} />
            </div>
            <div>
              <Label className="text-xs">스레드 커버 이미지 URL <span className="text-ink/40">(이미지 트레이에서 &ldquo;스레드 커버로&rdquo; 클릭)</span></Label>
              <Input className="mt-1" value={threadsCover} onChange={(e) => { setThreadsCover(e.target.value); setDirty(true); }} placeholder="https://…" />
            </div>
          </div>
        </div>

        {/* 우: 실비율(4:5) 프리뷰 — 1장 / 그리드(전체 흐름 검수) 토글 */}
        <div className="card p-4 lg:sticky lg:top-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">프리뷰 {viewMode === 'single' && sel ? `${selIdx + 1} / ${slides.length}` : ''}</span>
            <div className="flex gap-1 items-center">
              <button
                onClick={() => setViewMode(viewMode === 'single' ? 'grid' : 'single')}
                className={`px-2 py-0.5 rounded border text-xs ${viewMode === 'grid' ? 'bg-accent text-white border-accent' : 'border-border hover:bg-ink/5'}`}
                title="전체 흐름을 한눈에"
              >
                그리드
              </button>
              {viewMode === 'single' && (
                <>
                  <button onClick={() => setSelIdx(Math.max(0, selIdx - 1))} className="px-2 py-0.5 rounded border border-border text-xs hover:bg-ink/5">←</button>
                  <button onClick={() => setSelIdx(Math.min(slides.length - 1, selIdx + 1))} className="px-2 py-0.5 rounded border border-border text-xs hover:bg-ink/5">→</button>
                </>
              )}
            </div>
          </div>
          {viewMode === 'single' ? (
            <>
              <div className="relative w-full rounded-lg overflow-hidden border border-border bg-ink/5" style={{ aspectRatio: '4 / 5' }}>
                {previewUrl && !previewErr && (
                  <img src={previewUrl} alt="슬라이드 프리뷰" className={`w-full h-full object-contain transition-opacity ${previewLoading ? 'opacity-40' : ''}`} />
                )}
                {previewLoading && !previewUrl && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-ink/40">렌더 중…</div>
                )}
                {previewErr && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-red-500 p-4 text-center">{previewErr}</div>
                )}
              </div>
              {sel && !sel.enabled && <p className="text-xs text-amber-600 mt-2">이 슬라이드는 제외 상태예요.</p>}
            </>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-[70vh] overflow-y-auto">
              {slides.map((s, i) =>
                s.enabled ? (
                  <SlideThumb
                    key={i}
                    slide={s}
                    accent={card.accent}
                    label={`${i + 1}`}
                    selected={i === selIdx}
                    onClick={() => { setSelIdx(i); setViewMode('single'); }}
                  />
                ) : null
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 그리드 뷰 썸네일 — 렌더 PNG를 키(템플릿+props)로 캐시 ──
const thumbCache = new Map<string, string>();

function SlideThumb({ slide, accent, label, selected, onClick }: {
  slide: CardSlide; accent: CardAccent; label: string; selected: boolean; onClick: () => void;
}) {
  const key = JSON.stringify({ t: slide.template, a: accent, p: slide.props });
  const [url, setUrl] = useState<string | null>(thumbCache.get(key) ?? null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (thumbCache.has(key)) { setUrl(thumbCache.get(key)!); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/cardpress/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ template: slide.template, accent, props: slide.props }),
        });
        if (!res.ok) throw new Error();
        const objectUrl = URL.createObjectURL(await res.blob());
        thumbCache.set(key, objectUrl);
        if (!cancelled) setUrl(objectUrl);
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <button
      onClick={onClick}
      className={`relative rounded-md overflow-hidden border ${selected ? 'border-accent ring-1 ring-accent' : 'border-border'} bg-ink/5`}
      style={{ aspectRatio: '4 / 5' }}
      title={`${label}번 슬라이드`}
    >
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-ink/40">{err ? '오류' : '…'}</span>
      )}
      <span className="absolute top-1 left-1 text-[10px] font-bold text-white bg-black/50 rounded px-1">{label}</span>
    </button>
  );
}

// ── 슬라이드 추가 — 매핑 계획(plan API)에서 섹션 선택 → AI 단건 작성 ──
function AddSlidePanel({ sourceId, onAdd }: {
  sourceId: string;
  onAdd: (slide: Pick<CardSlide, 'template' | 'props' | 'sourceSection'>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Array<{ template: CardTemplateId; sourceSection: string; alternatives: CardTemplateId[]; materialPreview: string }> | null>(null);
  const [pick, setPick] = useState('');
  const [template, setTemplate] = useState<CardTemplateId | ''>('');
  const [busy, setBusy] = useState(false);

  async function openPanel() {
    setOpen(true);
    if (plan) return;
    try {
      const res = await fetch(`/api/cardpress/plan?sourceId=${sourceId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPlan(data.slides);
    } catch (e) {
      alert(`계획 조회 실패: ${(e as Error).message}`);
      setOpen(false);
    }
  }

  const picked = plan?.find((p) => p.sourceSection === pick);

  async function create() {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await fetch('/api/cardpress/rewrite-slide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceId, sourceSection: picked.sourceSection, template: template || picked.template }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onAdd({ template: data.slide.template, props: data.slide.props, sourceSection: picked.sourceSection });
      setOpen(false);
      setPick('');
      setTemplate('');
    } catch (e) {
      alert(`슬라이드 작성 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-3 py-2.5">
      {!open ? (
        <button onClick={openPanel} className="text-xs text-accent hover:underline">+ 슬라이드 추가 (AI가 빠뜨린 항목 등)</button>
      ) : !plan ? (
        <p className="text-xs text-ink/40">계획 불러오는 중…</p>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs">본문 섹션 선택</Label>
          <select
            className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-transparent"
            value={pick}
            onChange={(e) => { setPick(e.target.value); setTemplate(''); }}
          >
            <option value="">— 섹션 —</option>
            {plan.map((p) => (
              <option key={p.sourceSection} value={p.sourceSection}>
                [{p.template}] {p.sourceSection} · {p.materialPreview.slice(0, 40)}
              </option>
            ))}
          </select>
          {picked && (
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <span className="text-ink/40">템플릿:</span>
              {[picked.template, ...picked.alternatives].map((t) => (
                <button
                  key={t}
                  onClick={() => setTemplate(t)}
                  className={`rounded px-1.5 py-0.5 ${(template || picked.template) === t ? 'bg-accent text-white' : 'bg-ink/5 text-ink/60'}`}
                >
                  {TEMPLATE_LABEL[t]}
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button size="sm" variant="accent" onClick={create} disabled={!picked || busy}>
              {busy ? 'AI 작성 중… (수 분 소요)' : 'AI로 작성해 추가'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 인라인 편집 폼 ────────────────────────────────────────
function SlideForm({ slide, onApply, onCancel }: { slide: CardSlide; onApply: (form: Record<string, string>) => void; onCancel: () => void }) {
  const defs = FIELDS[slide.template];
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(defs.map((d) => [d.key, fieldToText((slide.props as Record<string, unknown>)[d.key], d)]))
  );
  return (
    <div className="mt-2 space-y-2 border-t border-border pt-2">
      {defs.map((d) => (
        <div key={d.key}>
          <Label className="text-xs">{d.label}{d.hint && <span className="text-ink/40"> · {d.hint}</span>}</Label>
          {d.kind === 'input' || d.kind === 'pair-single' ? (
            <Input className="mt-1" value={form[d.key]} onChange={(e) => setForm((p) => ({ ...p, [d.key]: e.target.value }))} />
          ) : (
            <Textarea className="mt-1" rows={d.kind === 'textarea' ? 2 : 4} value={form[d.key]} onChange={(e) => setForm((p) => ({ ...p, [d.key]: e.target.value }))} />
          )}
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>취소</Button>
        <Button size="sm" variant="accent" onClick={() => onApply(form)}>적용</Button>
      </div>
    </div>
  );
}

// ── 이미지 트레이 + Unsplash 인라인 검색 ──────────────────
function ImageTray({ card, onPick, onCover, onThreadsCover }: { card: CardRow; onPick: (url: string) => void; onCover: (url: string) => void; onThreadsCover: (url: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; thumb: string; full: string; credit: string }>>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function search(q: string) {
    if (!q.trim()) return;
    setSearching(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/cardpress/unsplash?query=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResults(data.results ?? []);
      if (data.notice) setNotice(data.notice);
      else if (!data.results?.length) setNotice('검색 결과가 없어요.');
    } catch (e) {
      setNotice(`검색 실패: ${(e as Error).message}`);
    } finally {
      setSearching(false);
    }
  }

  const Thumb = ({ url, thumb, credit }: { url: string; thumb: string; credit?: string }) => (
    <div className="relative group shrink-0">
      <img src={thumb} alt={credit ?? ''} className="h-20 w-16 object-cover rounded-md border border-border" />
      <div className="absolute inset-0 hidden group-hover:flex flex-col items-center justify-center gap-1 bg-black/55 rounded-md">
        <button onClick={() => onPick(url)} className="text-[10px] text-white bg-accent rounded px-1.5 py-0.5">선택 슬라이드에</button>
        <button onClick={() => onThreadsCover(url)} className="text-[10px] text-white bg-white/20 rounded px-1.5 py-0.5">스레드 커버로</button>
      </div>
    </div>
  );

  return (
    <div className="card p-4 space-y-3">
      <div className="text-sm font-semibold">이미지 트레이 <span className="text-xs text-ink/40 font-normal">(호버 → 배치 · 커버/B2/B9 슬라이드 선택 후)</span></div>
      {(card.cover_candidates?.length ?? 0) > 0 && (
        <div>
          <div className="text-[11px] text-ink/40 mb-1">커버 후보 — 클릭하면 바로 커버에 적용 (다크 커버면 사진 커버로 전환)</div>
          <div className="flex gap-3">
            {card.cover_candidates!.slice(0, 2).map((c) => (
              <div key={c.full} className="relative group shrink-0">
                <button onClick={() => onCover(c.full)} title="커버에 적용" className="block">
                  <img src={c.thumb} alt={c.credit} className="h-32 w-[102px] object-cover rounded-md border border-border group-hover:ring-2 group-hover:ring-accent transition-shadow" />
                </button>
                <button
                  onClick={() => onThreadsCover(c.full)}
                  className="absolute bottom-1 left-1 right-1 hidden group-hover:block text-[10px] text-white bg-black/60 rounded px-1 py-0.5"
                >
                  스레드 커버로
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {card.extracted_images.length > 0 && (
        <div>
          <div className="text-[11px] text-ink/40 mb-1">본문 추출 이미지</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {card.extracted_images.map((u) => <Thumb key={u} url={u} thumb={u} />)}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Unsplash 검색 (영어)" onKeyDown={(e) => e.key === 'Enter' && search(query)} />
        <Button size="sm" variant="outline" onClick={() => search(query)} disabled={searching}>{searching ? '검색 중…' : '검색'}</Button>
      </div>
      {(card.metaphor_queries?.length ?? 0) > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-ink/40">메타포 제안:</span>
          {card.metaphor_queries!.map((q) => (
            <button key={q} onClick={() => { setQuery(q); search(q); }} className="text-[11px] rounded px-1.5 py-0.5 bg-ink/5 text-ink/60 hover:bg-ink/10">
              {q}
            </button>
          ))}
        </div>
      )}
      {notice && <p className="text-xs text-ink/40">{notice}</p>}
      {results.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {results.map((r) => <Thumb key={r.id} url={r.full} thumb={r.thumb} credit={r.credit} />)}
        </div>
      )}
    </div>
  );
}
