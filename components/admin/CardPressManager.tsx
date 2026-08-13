'use client';

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { renderSlide } from '@/lib/cardpress/templates';
import { RenderSlideSchema } from '@/types/cardpress';
import type { CardSlide, CardTemplateId, CardAccent } from '@/types/cardpress';

const ACCENT_HEX: Record<CardAccent, string> = {
  'cat-case': '#2F6BFF',
  'cat-trend': '#7C3AED',
  'cat-tool': '#0E9F6E',
};

// 카드프레스 검수 스튜디오 (spec §3-③)
// 좌: 슬라이드 리스트(on/off·순서·템플릿 교체·인라인 편집) / 우: 실비율 프리뷰 + 캡션·스레드 편집.
// 이미지 트레이: 본문 추출 이미지 + 메타포 검색어 → Unsplash 인라인 검색 → 클릭 배치.

export type CardRow = {
  id: string;
  source_type: 'content' | 'tool' | 'seed';
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

/**
 * 카드뉴스 소스 ③ — 본가 자료실(tools) 발행물.
 * usable/reason은 서버(lib/cardpress/tool-source)가 본가 실노출 규칙 + 재료량으로 판정해 넘긴다.
 * 못 쓰는 자료도 목록에서 지우지 않고 사유와 함께 보여준다("있는데 안 보임"을 없애려는 것).
 */
export type ToolSourceItem = {
  id: string;
  name: string;
  slug: string;
  category: string;
  /** 가이드 · 프롬프트 · 도구 · 맥락 카드 */
  kind: string;
  usable: boolean;
  reason: string | null;
};

/** 씨앗 아카이브 후보 — 카드뉴스 소스 ① (미발행 원석) */
export type SeedSourceRow = {
  id: string;
  title: string;
  lane: string | null;
  status: string;
  suggested_angle: string | null;
  essence: Record<string, string> | null;
  created_at: string;
};

/** 씨앗 표시 제목 — 채점 헤드라인 우선, 없으면 "[lane]" 태그 벗긴 원제목 */
function seedDisplayTitle(s: Pick<SeedSourceRow, 'title' | 'essence'>): string {
  return s.essence?.headline?.trim() || s.title.replace(/^\s*\[[^\]]*\]\s*/, '');
}

const STATUS_LABEL: Record<CardRow['status'], { text: string; cls: string }> = {
  auto_draft: { text: '검수 대기', cls: 'bg-yellow-100 text-yellow-700' },
  reviewed: { text: '검수 완료', cls: 'bg-blue-100 text-blue-700' },
  published: { text: '발행됨', cls: 'bg-green-100 text-green-700' },
};

const TEMPLATE_LABEL: Record<CardTemplateId, string> = {
  C1: 'C1 사진커버', C2: 'C2 다크커버', C3: 'C3 툴커버', C4: 'C4 VS커버', C5: 'C5 빅넘버커버',
  B1: 'B1 타임라인', B2: 'B2 불릿', B3: 'B3 용어', B4: 'B4 선언',
  B5: 'B5 솔직후기', B6: 'B6 스텝', B7: 'B7 숫자', B8: 'B8 프롬프트',
  B9: 'B9 스크린샷', O1: 'O1 마무리',
  P1: 'P1 사진+목록', P2: 'P2 사진+문단', P3: 'P3 풀사진', P4: 'P4 사진인용',
  P5: 'P5 블랙목록', P6: 'P6 블랙빅넘버',
};

// 템플릿 교체 대안 (재료가 같은 섹션에서 서로 넘나들 수 있는 쌍)
// P 계열은 사진 유무·정보량에 따라 서로 갈아끼운다: 사진 실패 → P5/P6로 폴백.
const ALT_MAP: Partial<Record<CardTemplateId, CardTemplateId[]>> = {
  B2: ['P1', 'P5', 'B7', 'B6'], B7: ['P6', 'B2'], B6: ['B2'], C1: ['C2', 'C5'], C2: ['C1', 'C5'],
  C5: ['C1', 'C2'], B4: ['P4', 'P3', 'B2'],
  P1: ['P5', 'P2', 'B2'], P2: ['P1', 'P3'], P3: ['P4', 'P2'], P4: ['P3', 'B4'],
  P5: ['P1', 'P6'], P6: ['P5', 'B7'],
};

// 형광펜 색 팔레트 — 캐러셀 가이드 시스템(카테고리 3색+Bad 레드) + 벤치마크 골드
const HL_PALETTE: Array<{ hex: string; name: string }> = [
  { hex: '#2F6BFF', name: '블루' },
  { hex: '#7C3AED', name: '바이올렛' },
  { hex: '#0E9F6E', name: '에메랄드' },
  { hex: '#E11D48', name: '레드' },
  { hex: '#D9A414', name: '골드' },
];

// 형광펜(hl = 배경 포인트색 필)이 가리키는 대상 필드 — 드래그 선택 → 형광펜 지정에 사용
const HL_TARGET: Partial<Record<CardTemplateId, string>> = {
  C1: 'title', C2: 'title', C3: 'title', B4: 'title', O1: 'title', B1: 'heading', B6: 'heading',
};
// **강조** 마커(포인트색 볼드)를 렌더하는 필드
const EM_FIELDS = new Set(['bullets', 'body', 'cap', 'lead', 'resolve', 'items', 'heading', 'title', 'quote', 'sub']);

// 슬라이드별 이미지가 들어가는 props 키
const IMAGE_KEY: Partial<Record<CardTemplateId, string>> = {
  C1: 'coverImage', C2: 'coverImage', C5: 'coverImage', B4: 'coverImage', B2: 'media', B9: 'shot',
  P1: 'image', P2: 'image', P3: 'image', P4: 'image', P5: 'image', P6: 'image',
};

// ── 템플릿별 인라인 편집 필드 정의 ──────────────────────────
type FieldKind = 'input' | 'textarea' | 'lines' | 'pairs' | 'pair-single';
type FieldDef = { key: string; label: string; kind: FieldKind; hint?: string; pairKeys?: [string, string] };

const FIELDS: Record<CardTemplateId, FieldDef[]> = {
  C1: [
    { key: 'kicker', label: '키커', kind: 'input', hint: '헤드라인 위 프레이밍 ("~의 경제학")' },
    { key: 'title', label: '제목', kind: 'textarea', hint: '줄바꿈 그대로 반영 · 줄당 ≤12자' },
    { key: 'hl', label: '형광펜 단어', kind: 'input', hint: '제목 속 부분 문자열' },
    { key: 'sub', label: '부제', kind: 'input' },
    { key: 'footer', label: '푸터', kind: 'input', hint: '@영문개념 (예: @BLINDSPOT PASS)' },
    { key: 'coverImage', label: '배경 이미지 URL', kind: 'input' },
  ],
  C5: [
    { key: 'kicker', label: '맥락 한 줄', kind: 'input' },
    { key: 'big', label: '거대 숫자/단어', kind: 'input', hint: '≤6자 (10배, FOCUS)' },
    { key: 'resolve', label: '해소 문장', kind: 'textarea', hint: '1~2줄, **강조** 1개' },
    { key: 'footer', label: '푸터', kind: 'input', hint: '@영문개념' },
    { key: 'coverImage', label: '배경 이미지 URL (텍스처로 깔림)', kind: 'input' },
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
    {
      key: 'lead',
      label: '핵심 한 줄 (개요)',
      kind: 'textarea',
      hint: '채우면 개요 모드 — 큰 패널 + 번호 목록으로 렌더 · ≤32자 · 비우면 일반 불릿',
    },
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
    { key: 'patternEn', label: '영어 패턴명', kind: 'input', hint: '원문 그대로 (크게 표시) — 예: Blindspot Pass' },
    { key: 'patternName', label: '한글 패턴명', kind: 'input', hint: '≤12자 (영문 아래 부제)' },
    { key: 'when', label: '어떤 상황에서', kind: 'input', hint: '≤22자' },
    { key: 'lines', label: '맛보기 (줄마다 1줄, 3~4줄)', kind: 'lines', hint: '[변수]는 초록, # 시작 줄은 주석' },
    { key: 'effect', label: '기대 효과', kind: 'input', hint: '≤20자' },
    { key: 'ctaLine', label: 'CTA 문구', kind: 'input', hint: 'CTA는 캡션 전담 — 이미지에 꼭 넣고 싶을 때만' },
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
  // ── P 계열 (사진 편집형) ──
  P1: [
    { key: 'eyebrow', label: '라벨', kind: 'input', hint: '헤어라인 라벨 · 비우면 카테고리명' },
    { key: 'lead', label: '핵심 한 줄', kind: 'textarea', hint: '**강조**는 1구절만 · ≤26자' },
    { key: 'items', label: '목록 (줄마다 1개)', kind: 'lines', hint: '2~4개 · 번호+구분선으로 렌더' },
    { key: 'image', label: '사진 URL', kind: 'input', hint: '비우면 그라데이션 폴백' },
  ],
  P2: [
    { key: 'eyebrow', label: '라벨', kind: 'input' },
    { key: 'heading', label: '제목', kind: 'textarea', hint: '가장 크게 서는 줄' },
    { key: 'sub', label: '부제', kind: 'input', hint: '제목의 62% 크기' },
    { key: 'body', label: '본문', kind: 'textarea', hint: '작은 회색 문단 — 위계로 읽힌다' },
    { key: 'image', label: '사진 URL', kind: 'input' },
  ],
  P3: [
    { key: 'label', label: '라벨', kind: 'input' },
    { key: 'title', label: '헤드라인', kind: 'textarea', hint: '2~3줄 · **강조** 1구절' },
    { key: 'items', label: '뒷받침 (줄마다 1개)', kind: 'lines', hint: '0~3개 · 비워도 됨' },
    { key: 'footer', label: '푸터', kind: 'input', hint: '@개념영문 (예: @LOSS LEADER)' },
    { key: 'image', label: '사진 URL', kind: 'input' },
  ],
  P4: [
    { key: 'quote', label: '인용문', kind: 'textarea', hint: '따옴표는 자동 · ≤48자' },
    { key: 'attribution', label: '출처', kind: 'input', hint: '앞의 — 는 자동' },
    { key: 'image', label: '사진 URL', kind: 'input' },
  ],
  P5: [
    { key: 'index', label: '인덱스', kind: 'input', hint: '"02" 같은 진행 표시' },
    { key: 'eyebrow', label: '라벨', kind: 'input' },
    { key: 'lead', label: '핵심 한 줄', kind: 'textarea', hint: '사진이 없으니 타이포가 주인공' },
    { key: 'items', label: '목록 (줄마다 1개)', kind: 'lines', hint: '2~4개' },
    { key: 'footer', label: '푸터', kind: 'input' },
    { key: 'image', label: '사진 URL', kind: 'input', hint: '있으면 텍스처 수준(86% 눌림)' },
  ],
  P6: [
    { key: 'kicker', label: '맥락 한 줄', kind: 'input' },
    { key: 'big', label: '거대 숫자/단어', kind: 'input', hint: '"70%", "10배", "FOCUS" · ≤6자' },
    { key: 'resolve', label: '해소 문장', kind: 'textarea' },
    { key: 'footer', label: '푸터', kind: 'input' },
    { key: 'image', label: '사진 URL', kind: 'input', hint: '있으면 텍스처 수준(82% 눌림)' },
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

/** 편집 폼 값 → props 병합 (폼에 없는 시스템 필드(page 등)는 base에서 유지) */
function formToProps(
  template: CardTemplateId,
  base: Record<string, unknown>,
  form: Record<string, string>
): Record<string, unknown> {
  const props: Record<string, unknown> = { ...base };
  for (const def of FIELDS[template]) {
    const v = textToField(form[def.key] ?? '', def);
    if (v === undefined) delete props[def.key];
    else props[def.key] = v;
  }
  return props;
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
export function CardPressManager({
  initial,
  sources,
  seeds = [],
  toolSources = [],
}: {
  initial: CardRow[];
  sources: SourceRow[];
  seeds?: SeedSourceRow[];
  toolSources?: ToolSourceItem[];
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const sourceMap = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [statusFilter, setStatusFilter] = useState<'all' | CardRow['status']>('all');
  const card = initial.find((c) => c.id === selectedId) ?? null;
  const filtered = statusFilter === 'all' ? initial : initial.filter((c) => c.status === statusFilter);

  // 카드 없는 발행 콘텐츠 → 수동 생성 후보 (검색·트랙 필터·조회수 정렬)
  const cardBySource = useMemo(
    () => new Map(initial.filter((c) => c.source_type === 'content').map((c) => [c.source_id, c])),
    [initial]
  );
  const withoutCard = sources.filter((s) => !cardBySource.has(s.id));
  const [generating, setGenerating] = useState<string | null>(null);
  const [srcQuery, setSrcQuery] = useState('');
  const [srcTrack, setSrcTrack] = useState<'all' | 'case' | 'trend'>('all');
  const [srcSort, setSrcSort] = useState<'recent' | 'views'>('views');
  const [srcExpanded, setSrcExpanded] = useState(false);
  // 카드가 이미 있는 발행 글은 후보에서 빠진다 → 목록이 비면 "본가에 글이 없다"로 오독된다.
  // 감추지 말고 '카드 있음'으로 함께 보여주고, 눌러서 그 카드로 이동하게 한다.
  const [showCarded, setShowCarded] = useState(false);
  const alreadyCarded = sources.filter((s) => cardBySource.has(s.id));
  const candidates = withoutCard
    .filter((s) => (srcTrack === 'all' ? true : s.track === srcTrack))
    .filter((s) => (srcQuery.trim() ? s.title.toLowerCase().includes(srcQuery.trim().toLowerCase()) : true))
    .sort((a, b) =>
      srcSort === 'views'
        ? (b.view_count ?? 0) - (a.view_count ?? 0)
        : (b.published_at ?? '').localeCompare(a.published_at ?? '')
    );
  // top3만 기본 노출 — 검색 중이거나 펼치면 전체
  const visibleCandidates = srcQuery.trim() || srcExpanded ? candidates : candidates.slice(0, 3);

  // ③ 자료실 후보 — 카드 있는 것 제외 → 쓸 수 있는 것(usable)만 후보, 나머지는 사유와 함께 노출
  const [toolQuery, setToolQuery] = useState('');
  const [toolExpanded, setToolExpanded] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const toolCarded = toolSources.filter((t) =>
    initial.some((c) => c.source_type === 'tool' && c.source_id === t.id)
  );
  const toolPool = toolSources.filter(
    (t) => !initial.some((c) => c.source_type === 'tool' && c.source_id === t.id)
  );
  const toolCandidates = toolPool
    .filter((t) => t.usable)
    .filter((t) => (toolQuery.trim() ? t.name.toLowerCase().includes(toolQuery.trim().toLowerCase()) : true));
  const visibleToolCandidates = toolQuery.trim() || toolExpanded ? toolCandidates : toolCandidates.slice(0, 3);
  const blockedTools = toolPool.filter((t) => !t.usable);

  // 씨앗 아카이브 후보 — 서버에서 최신순으로 옴. 카드가 이미 있는 씨앗 제외, top3 (맨 위=main)
  const seedCandidates = seeds
    .filter((s) => !initial.some((c) => c.source_type === 'seed' && c.source_id === s.id))
    .slice(0, 3);
  const seedMap = useMemo(() => new Map(seeds.map((s) => [s.id, s])), [seeds]);
  const toolMap = useMemo(() => new Map(toolSources.map((t) => [t.id, t])), [toolSources]);

  // 만들기 씬: 소재 선택 → 기획 설정(엣지·CTA) → 생성 시작 → 완료 시 새 카드로 자동 진입
  const [composeId, setComposeId] = useState<string | null>(null);
  const [composeKind, setComposeKind] = useState<'content' | 'tool' | 'seed'>('content');
  const [composeEdge, setComposeEdge] = useState('');
  const [composeCta, setComposeCta] = useState<'comment_dm' | 'info_save'>('comment_dm');
  const [composeKeyword, setComposeKeyword] = useState('프롬프트');

  function startCompose(kind: 'content' | 'tool' | 'seed', sourceId: string) {
    setComposeKind(kind);
    setComposeId(sourceId);
    setComposeEdge('');
    setComposeCta('comment_dm');
    setComposeKeyword('프롬프트');
  }

  async function createCard() {
    if (!composeId) return;
    setGenerating(composeId);
    try {
      const res = await fetch('/api/cardpress/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceType: composeKind,
          sourceId: composeId,
          edge: composeEdge.trim() || undefined,
          ctaType: composeCta,
          ctaKeyword: composeCta === 'comment_dm' ? composeKeyword.trim() || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setComposeId(null);
      if (data.card?.id) setSelectedId(data.card.id); // 완료 즉시 검수로 진입
      router.refresh();
    } catch (e) {
      alert(`생성 실패: ${(e as Error).message}`);
    } finally {
      setGenerating(null);
    }
  }

  // 기획 설정 패널 — 두 소스 패널이 공유 (생성 전에 방향을 정하는 씬)
  function composePanel(kind: 'content' | 'tool' | 'seed', id: string) {
    if (composeKind !== kind || composeId !== id) return null;
    return (
      <div className="mt-2 mb-1 rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2.5">
        {generating === id ? (
          <div className="text-sm text-ink/70 py-2">
            <span className="font-semibold">AI가 카드를 만드는 중…</span> (3~10분 소요)
            <p className="text-xs text-ink/40 mt-1">
              {kind === 'seed' ? '씨앗 원문을' : '본문을'} 슬라이드로 매핑하고 압축 재작성합니다. 완료되면 아래 목록에 나타나고 바로 검수 화면으로 이동해요.
              이 탭을 닫지만 않으면 다른 작업을 해도 됩니다.
            </p>
          </div>
        ) : (
          <>
            <div>
              <Label className="text-xs">기획방향 / 엣지 <span className="text-ink/40">(선택 — 비우면 AI가 이 소재의 차별점을 스스로 정의)</span></Label>
              <Textarea
                className="mt-1"
                rows={2}
                value={composeEdge}
                onChange={(e) => setComposeEdge(e.target.value)}
                placeholder={'예: "앤트로픽 현직 엔지니어가 직접 검증했다"는 신뢰가 이 글의 엣지 — 커버와 도입에서 이걸 세울 것'}
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
                  onClick={() => setComposeCta(v)}
                  className={`text-xs rounded-full px-2.5 py-1 ${composeCta === v ? 'bg-accent text-white' : 'bg-ink/5 text-ink/60 hover:bg-ink/10'}`}
                >
                  {label}
                </button>
              ))}
              {composeCta === 'comment_dm' && (
                <>
                  <span className="text-[11px] text-ink/40">댓글 키워드:</span>
                  <Input value={composeKeyword} onChange={(e) => setComposeKeyword(e.target.value)} className="text-sm w-28" />
                </>
              )}
            </div>
            <p className="text-[11px] text-ink/40">
              {composeCta === 'comment_dm'
                ? `캡션·마무리가 "댓글에 '${composeKeyword || '키워드'}' 남기면 DM으로" 문법으로 생성됩니다 (ManyChat 자동화 연동 전제)`
                : '캡션에 대표 프롬프트 전문 + 프로필 링크 유도 문법으로 생성됩니다'}
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setComposeId(null)}>취소</Button>
              <Button size="sm" variant="accent" onClick={createCard} disabled={generating !== null}>
                생성 시작 (3~10분)
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  const FILTERS: Array<{ key: 'all' | CardRow['status']; label: string }> = [
    { key: 'all', label: `전체 ${initial.length}` },
    { key: 'auto_draft', label: `검수 대기 ${initial.filter((c) => c.status === 'auto_draft').length}` },
    { key: 'reviewed', label: `검수 완료 ${initial.filter((c) => c.status === 'reviewed').length}` },
    { key: 'published', label: `발행됨 ${initial.filter((c) => c.status === 'published').length}` },
  ];

  return (
    <div className="space-y-6">
      {/* 1. 새 카드뉴스 만들기 — 소스 3원화: ① 씨앗 아카이브 ② 본가 콘텐츠 ③ 본가 자료실.
          본가에 발행돼 유저에게 보이는 것은 ②+③으로 전부 덮는다(케이스·트렌드 / 가이드·프롬프트·도구). */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold">
          새 카드뉴스 만들기{' '}
          <span className="text-xs text-ink/40 font-normal">씨앗 아카이브 원석 또는 본가 발행물에서 소재 선택</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {/* ① 씨앗 아카이브 top3 — 맨 위(최신)가 메인 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-ink/70">
                ① 씨앗 아카이브 <span className="text-ink/40 font-normal">최신 원석 top3</span>
              </div>
              <a href="/admin/studio/archive" className="text-[11px] text-accent hover:underline shrink-0">아카이브 전체 →</a>
            </div>
            {seedCandidates.length === 0 ? (
              <p className="text-xs text-ink/40">카드로 만들 씨앗이 없어요. 수집되면 최신순으로 여기 올라와요.</p>
            ) : (
              seedCandidates.map((s, i) => (
                <div key={s.id} className={i === 0 ? 'rounded-lg border border-accent/40 bg-accent/5 p-2.5' : 'px-1'}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {i === 0 && <span className="badge bg-accent text-white mr-1.5">MAIN · 최신</span>}
                      <span className={i === 0 ? 'font-medium' : ''}>{seedDisplayTitle(s)}</span>
                      <span className="text-[11px] text-ink/40 ml-1.5">
                        {s.created_at.slice(5, 10).replace('-', '/')}{s.lane ? ` · ${s.lane}` : ''}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant={composeKind === 'seed' && composeId === s.id ? 'accent' : 'outline'}
                      disabled={generating !== null}
                      onClick={() =>
                        composeKind === 'seed' && composeId === s.id ? setComposeId(null) : startCompose('seed', s.id)
                      }
                    >
                      {composeKind === 'seed' && composeId === s.id ? '닫기' : '만들기'}
                    </Button>
                  </div>
                  {i === 0 && s.suggested_angle && (
                    <p className="text-[11px] text-ink/50 mt-1">추천 각도: {s.suggested_angle}</p>
                  )}
                  {composePanel('seed', s.id)}
                </div>
              ))
            )}
          </div>

          {/* ② 본가(caselab) 발행 콘텐츠 top3 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs font-semibold text-ink/70">
                ② 본가 발행 콘텐츠 <span className="text-ink/40 font-normal">{srcSort === 'views' ? '반응 좋았던 것부터' : '최신 발행부터'} top3</span>
              </div>
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
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {visibleCandidates.map((s) => (
                    <div key={s.id}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">
                          {s.title}
                          <span className="text-[11px] text-ink/40 ml-1.5">조회 {s.view_count ?? 0}</span>
                        </span>
                        <Button
                          size="sm"
                          variant={composeKind === 'content' && composeId === s.id ? 'accent' : 'outline'}
                          disabled={generating !== null}
                          onClick={() =>
                            composeKind === 'content' && composeId === s.id
                              ? setComposeId(null)
                              : startCompose('content', s.id)
                          }
                        >
                          {composeKind === 'content' && composeId === s.id ? '닫기' : '만들기'}
                        </Button>
                      </div>
                      {composePanel('content', s.id)}
                    </div>
                  ))}
                  {candidates.length === 0 && <p className="text-xs text-ink/40">조건에 맞는 콘텐츠가 없어요.</p>}
                </div>
                {!srcQuery.trim() && candidates.length > 3 && (
                  <button onClick={() => setSrcExpanded(!srcExpanded)} className="text-[11px] text-accent hover:underline">
                    {srcExpanded ? '접기 ▴' : `전체 ${candidates.length}개 보기 ▾`}
                  </button>
                )}
              </>
            ) : (
              <p className="text-xs text-ink/40">
                {sources.length === 0
                  ? '본가 /cases · /trends에 발행된 글이 아직 없어요. 콘텐츠를 발행하면 여기에 대기합니다.'
                  : `본가 발행 글 ${sources.length}건이 모두 카드로 만들어져 있어요.`}
              </p>
            )}

            {/* 카드가 이미 있는 발행 글 — 목록에서 사라진 이유를 드러낸다 */}
            {alreadyCarded.length > 0 && (
              <div className="pt-1">
                <button onClick={() => setShowCarded(!showCarded)} className="text-[11px] text-ink/50 hover:text-ink/80">
                  {showCarded ? '접기 ▴' : `카드 있는 발행 글 ${alreadyCarded.length}건 보기 ▾`}
                </button>
                {showCarded && (
                  <div className="mt-1 space-y-1">
                    {alreadyCarded.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-3 text-xs text-ink/60">
                        <span className="truncate">
                          <span className="badge bg-ink/10 text-ink/60 mr-1.5">카드 있음</span>
                          {s.title}
                        </span>
                        <button
                          onClick={() => setSelectedId(cardBySource.get(s.id)!.id)}
                          className="shrink-0 text-accent hover:underline"
                        >
                          카드 열기 →
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ③ 본가 자료실(가이드·프롬프트·도구) — /guides · /prompts · /tools 발행물 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-ink/70">
                ③ 본가 자료실 <span className="text-ink/40 font-normal">가이드 · 프롬프트 · 도구</span>
              </div>
              <a href="/admin/tools" className="text-[11px] text-accent hover:underline shrink-0">자료실 관리 →</a>
            </div>
            {toolSources.length === 0 ? (
              <p className="text-xs text-ink/40">본가 자료실에 발행된 자료가 아직 없어요.</p>
            ) : (
              <>
                <Input value={toolQuery} onChange={(e) => setToolQuery(e.target.value)} placeholder="이름 검색" />
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {visibleToolCandidates.map((t) => (
                    <div key={t.id}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="badge bg-ink/10 text-ink/60 mr-1.5">{t.kind}</span>
                          {t.name}
                        </span>
                        <Button
                          size="sm"
                          variant={composeKind === 'tool' && composeId === t.id ? 'accent' : 'outline'}
                          disabled={generating !== null}
                          onClick={() =>
                            composeKind === 'tool' && composeId === t.id ? setComposeId(null) : startCompose('tool', t.id)
                          }
                        >
                          {composeKind === 'tool' && composeId === t.id ? '닫기' : '만들기'}
                        </Button>
                      </div>
                      {composePanel('tool', t.id)}
                    </div>
                  ))}
                  {toolCandidates.length === 0 && (
                    <p className="text-xs text-ink/40">
                      {toolQuery.trim() ? '조건에 맞는 자료가 없어요.' : '카드로 만들 수 있는 자료가 없어요.'}
                    </p>
                  )}
                </div>
                {!toolQuery.trim() && toolCandidates.length > 3 && (
                  <button onClick={() => setToolExpanded(!toolExpanded)} className="text-[11px] text-accent hover:underline">
                    {toolExpanded ? '접기 ▴' : `전체 ${toolCandidates.length}개 보기 ▾`}
                  </button>
                )}
                {/* 못 쓰는 자료는 숨기지 않고 사유를 보여준다 — "본가엔 있는데 여기 없다"를 없애려는 것 */}
                {blockedTools.length > 0 && (
                  <div className="pt-1">
                    <button onClick={() => setShowBlocked(!showBlocked)} className="text-[11px] text-amber-600 hover:underline">
                      {showBlocked ? '접기 ▴' : `카드로 못 만드는 자료 ${blockedTools.length}건 ▾`}
                    </button>
                    {showBlocked && (
                      <div className="mt-1 space-y-1">
                        {blockedTools.map((t) => (
                          <div key={t.id} className="text-[11px] text-ink/50">
                            <span className="text-ink/70">{t.name}</span>
                            <span className="block text-amber-600">{t.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {toolCarded.length > 0 && (
                  <p className="text-[11px] text-ink/40">카드 있는 자료 {toolCarded.length}건은 목록에서 제외됐어요.</p>
                )}
              </>
            )}
          </div>
        </div>
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
            const src = c.source_type === 'content' ? sourceMap.get(c.source_id) : undefined;
            const seedSrc = c.source_type === 'seed' ? seedMap.get(c.source_id) : undefined;
            const toolSrc = c.source_type === 'tool' ? toolMap.get(c.source_id) : undefined;
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
                      <span className="font-medium truncate">
                        {src?.title ?? toolSrc?.name ?? (seedSrc ? seedDisplayTitle(seedSrc) : c.source_id)}
                      </span>
                      <span className="badge bg-ink/5 text-ink/60">
                        {c.source_type === 'seed'
                          ? '씨앗'
                          : c.source_type === 'tool'
                            ? (toolSrc?.kind ?? '자료실')
                            : src?.track === 'case'
                              ? '실전 케이스'
                              : 'AI 트렌드'}
                      </span>
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

      {/* updated_at 포함 key — DB가 갱신되면(외부 패치·재생성) 편집기를 새 데이터로 리마운트 (덮어쓰기 사고 방지) */}
      {card && (
        <CardEditor
          key={`${card.id}:${card.updated_at}`}
          card={card}
          sourceTitle={
            card.source_type === 'seed'
              ? (() => {
                  const s = seedMap.get(card.source_id);
                  return s ? seedDisplayTitle(s) : undefined;
                })()
              : card.source_type === 'tool'
                ? toolMap.get(card.source_id)?.name
                : sourceMap.get(card.source_id)?.title
          }
        />
      )}
    </div>
  );
}

// ── 편집기 ────────────────────────────────────────────────
function CardEditor({ card, sourceTitle }: { card: CardRow; sourceTitle?: string }) {
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
  const [quickEdit, setQuickEdit] = useState(false);
  const [previewMode, setPreviewMode] = useState<'live' | 'png'>('live');
  const [liveEdit, setLiveEdit] = useState<{
    idx: number;
    key: string;
    rect: { x: number; y: number; w: number; h: number };
    value: string;
  } | null>(null);
  const [selPopup, setSelPopup] = useState<{
    idx: number;
    text: string;
    key: string;
    rect: { x: number; y: number; w: number; h: number };
  } | null>(null);

  // 슬라이드 이동(리스트·화살표) 시 열린 오버레이 정리 — 캔버스 내 상호작용은 건드리지 않음
  function selectSlide(i: number) {
    setSelIdx(i);
    setLiveEdit(null);
    setSelPopup(null);
  }

  // 저장 안 된 수정이 있으면 새로고침/이탈 시 브라우저 경고 (수정 유실 방지)
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // 라이브 캔버스 편집 헬퍼 — 인덱스 지정 패치 (전체 편집 모드에서 모든 카드가 공유)
  function patchPropTextAt(idx: number, key: string, text: string) {
    patch((prev) =>
      prev.map((s, k) => {
        if (k !== idx) return s;
        const def = FIELDS[s.template].find((d) => d.key === key);
        if (!def) return s;
        const v = textToField(text, def);
        const p = { ...s.props };
        if (v === undefined) delete p[key];
        else p[key] = v;
        // 형광펜 대상 텍스트를 고쳐서 hl이 더 이상 안 맞으면 자동 정리 (드래그로 재지정)
        if (key === HL_TARGET[s.template] && typeof p.hl === 'string' && typeof v === 'string' && !v.includes(p.hl)) {
          delete p.hl;
          delete p.hlColor;
        }
        return { ...s, props: p };
      })
    );
  }

  /** 여러 props 동시 패치 (undefined = 삭제) — 형광펜 텍스트+색 지정 등 */
  function patchPropsAt(idx: number, partial: Record<string, unknown>) {
    patch((prev) =>
      prev.map((s, k) => {
        if (k !== idx) return s;
        const p = { ...s.props };
        for (const [key, v] of Object.entries(partial)) {
          if (v === undefined || v === '') delete p[key];
          else p[key] = v;
        }
        return { ...s, props: p };
      })
    );
  }
  function patchStyle(key: 'accentColor' | 'overlay' | 'coverPos' | 'titleAnchor', value: unknown) {
    patchPropsAt(selIdx, { [key]: value });
  }
  function assignImageAt(idx: number, url: string) {
    const s = slides[idx];
    if (!s) return;
    const key = IMAGE_KEY[s.template];
    if (!key) return alert(`${TEMPLATE_LABEL[s.template]}에는 이미지 자리가 없어요. (커버·B2·B9에 놓아주세요)`);
    patchPropsAt(idx, { [key]: url });
  }

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
    if (!sel || previewMode !== 'png') return;
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
      prev.map((s, k) => (k === i ? { ...s, props: formToProps(s.template, s.props, form) } : s))
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
        body: JSON.stringify({ sourceType: card.source_type, sourceId: card.source_id, sourceSection: s.sourceSection, template: target }),
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

  // 커버 후보 클릭 → 무조건 커버(1번)에 적용. 다크 커버(C2·C3)면 사진 커버(C1)로 자동 전환.
  function applyCover(url: string) {
    patch((prev) =>
      prev.map((s, i) => {
        if (i !== 0) return s;
        const props: Record<string, unknown> = { ...s.props, coverImage: url };
        if (s.template === 'C2' || s.template === 'C3') {
          if (props.eyebrow && !props.kicker) props.kicker = props.eyebrow; // 도입 문구는 키커로 승계
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

  // ── 편집 가능한 라이브 캔버스 (텍스트 클릭·형광펜 팔레트·팬·드롭 오버레이 포함) — 단일/전체 모드 공용 ──
  function renderEditableCanvas(i: number) {
    const s = slides[i];
    if (!s) return null;
    const popup = selPopup?.idx === i ? selPopup : null;
    const editing = liveEdit?.idx === i ? liveEdit : null;
    return (
      <div className="relative">
        <LiveSlide
          slide={s}
          accent={card.accent}
          onEditProp={(key, rect) => {
            const def = FIELDS[s.template].find((d) => d.key === key);
            if (!def) return;
            setSelIdx(i);
            setSelPopup(null);
            setLiveEdit({ idx: i, key, rect, value: fieldToText((s.props as Record<string, unknown>)[key], def) });
          }}
          onSelectText={(info) => {
            setSelIdx(i);
            setLiveEdit(null);
            setSelPopup({ idx: i, ...info });
          }}
          onDropImage={(url) => { setSelIdx(i); assignImageAt(i, url); }}
          onPan={(pos) => { setSelIdx(i); patchPropsAt(i, { coverPos: pos }); }}
        />
        {/* 드래그 선택 → 형광펜/포인트색 미니 툴바 */}
        {popup && (() => {
          const def = FIELDS[s.template].find((d) => d.key === popup.key);
          const raw = def ? fieldToText((s.props as Record<string, unknown>)[popup.key], def) : '';
          const canHl = HL_TARGET[s.template] === popup.key && raw.includes(popup.text);
          const canEm = EM_FIELDS.has(popup.key) && raw.includes(popup.text);
          const isHl = s.props.hl === popup.text;
          const emApplied = raw.includes(`**${popup.text}**`);
          if (!canHl && !canEm) return null;
          const btn = 'text-[11px] rounded px-2 py-1 whitespace-nowrap';
          return (
            <div
              className="absolute z-20 flex items-center gap-1 rounded-md border border-border bg-white shadow-lg p-1"
              style={{ left: Math.max(0, popup.rect.x), top: Math.max(0, popup.rect.y - 38) }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {canHl && (
                <>
                  <span className="text-[10px] text-ink/40 pl-1">형광펜</span>
                  {HL_PALETTE.map((c) => (
                    <button
                      key={c.hex}
                      title={`형광펜 · ${c.name}`}
                      onClick={() => {
                        // 카테고리 기본색과 같으면 hlColor 저장 생략(기본색 추종)
                        const isDefault = c.hex === ((s.props.accentColor as string) ?? ACCENT_HEX[card.accent]);
                        patchPropsAt(i, { hl: popup.text, hlColor: isDefault ? undefined : c.hex });
                        setSelPopup(null);
                      }}
                      className={`h-5 w-5 rounded border ${isHl && ((s.props.hlColor ?? ACCENT_HEX[card.accent]) === c.hex) ? 'ring-2 ring-offset-1 ring-ink/60 border-transparent' : 'border-black/10'}`}
                      style={{ background: c.hex }}
                    />
                  ))}
                  {isHl && (
                    <button className={`${btn} bg-ink/10`} onClick={() => { patchPropsAt(i, { hl: undefined, hlColor: undefined }); setSelPopup(null); }}>
                      해제
                    </button>
                  )}
                </>
              )}
              {canEm && !emApplied && (
                <button
                  className={`${btn} bg-accent/10 text-accent font-bold`}
                  onClick={() => { patchPropTextAt(i, popup.key, raw.replace(popup.text, `**${popup.text}**`)); setSelPopup(null); }}
                >
                  A 포인트색
                </button>
              )}
              {canEm && emApplied && (
                <button
                  className={`${btn} bg-ink/10`}
                  onClick={() => { patchPropTextAt(i, popup.key, raw.replace(`**${popup.text}**`, popup.text)); setSelPopup(null); }}
                >
                  강조 해제
                </button>
              )}
              <button className={`${btn} text-ink/40`} onClick={() => setSelPopup(null)}>✕</button>
            </div>
          );
        })()}
        {editing && (
          <textarea
            autoFocus
            className="absolute z-10 rounded-md border-2 border-accent bg-white text-ink shadow-lg p-2 text-sm leading-snug"
            style={{
              left: Math.max(0, editing.rect.x),
              top: editing.rect.y,
              width: Math.max(220, editing.rect.w + 24),
              minHeight: Math.max(52, editing.rect.h + 16),
            }}
            defaultValue={editing.value}
            onBlur={(e) => { patchPropTextAt(i, editing.key, e.target.value); setLiveEdit(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setLiveEdit(null);
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur();
            }}
          />
        )}
      </div>
    );
  }

  // 스타일 툴바 — 선택 슬라이드(selIdx)의 색·효과·텍스트 위치 (단일/전체 모드 공용)
  function renderStyleToolbar(s: CardSlide) {
    return (
      <div className="flex items-center gap-3 mb-2 text-[11px] flex-wrap text-ink/60">
        <span className="font-semibold text-ink/70">{selIdx + 1}번 스타일</span>
        <label className="flex items-center gap-1">
          포인트색
          <input
            type="color"
            value={(s.props.accentColor as string) ?? ACCENT_HEX[card.accent]}
            onChange={(e) => patchStyle('accentColor', e.target.value)}
            className="h-5 w-7 cursor-pointer rounded border border-border p-0"
          />
        </label>
        {typeof s.props.accentColor === 'string' && (
          <button onClick={() => patchStyle('accentColor', undefined)} className="rounded px-1.5 py-0.5 bg-ink/5 hover:bg-ink/10">
            기본색
          </button>
        )}
        {['C1', 'B4', 'C5'].includes(s.template) && typeof s.props.coverImage === 'string' && (
          <label className="flex items-center gap-1">
            어둡기
            <input
              type="range"
              min={0}
              max={0.85}
              step={0.05}
              value={(s.props.overlay as number) ?? (s.template === 'C5' ? 0.68 : s.template === 'B4' ? 0.45 : 0.28)}
              onChange={(e) => patchStyle('overlay', parseFloat(e.target.value))}
              className="w-20"
            />
          </label>
        )}
        {s.template === 'C1' && (
          <label className="flex items-center gap-1">
            텍스트 위치
            <select
              value={(s.props.titleAnchor as string) ?? 'bottom'}
              onChange={(e) => patchStyle('titleAnchor', e.target.value)}
              className="border border-border rounded px-1 py-0.5 bg-transparent"
            >
              <option value="bottom">하단</option>
              <option value="center">중앙</option>
              <option value="top">상단</option>
            </select>
          </label>
        )}
        <span className="text-ink/35">텍스트 클릭=수정 · 드래그/더블클릭=형광펜 팔레트 · 사진 드래그=이동 · 트레이 끌어오기=배치</span>
      </div>
    );
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
          sourceType: card.source_type,
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
          <h2 className="font-serif text-base font-semibold truncate">{sourceTitle ?? card.source_id}</h2>
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
                  <button onClick={() => selectSlide(i)} className="flex-1 min-w-0 text-left flex items-center gap-2">
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
                {editIdx === i && (
                  <SlideForm slide={s} accent={card.accent} sourceType={card.source_type} sourceId={card.source_id} onApply={(form) => applyEdit(i, form)} onCancel={() => setEditIdx(null)} />
                )}
              </div>
            ))}
            <AddSlidePanel
              sourceType={card.source_type}
              sourceId={card.source_id}
              onAdd={(slide) => {
                patch((prev) => [...prev, { ...slide, order: prev.length + 1, enabled: true }]);
                setSelIdx(slides.length);
              }}
            />
          </div>

          <ImageTray card={card} onPick={(url) => assignImageAt(selIdx, url)} onCover={applyCover} onThreadsCover={(u) => { setThreadsCover(u); setDirty(true); }} />

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

          <PublishPanel card={card} dirty={dirty} />
        </div>

        {/* 우: 실비율(4:5) 프리뷰 — 1장 / 그리드(전체 흐름 검수) 토글 */}
        <div className="card p-4 lg:sticky lg:top-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold flex items-center gap-2">
              프리뷰 {viewMode === 'single' && sel ? `${selIdx + 1} / ${slides.length}` : ''}
              {dirty && (
                <button
                  onClick={() => save()}
                  disabled={saving}
                  className="text-[11px] rounded-full px-2.5 py-1 bg-amber-500 text-white hover:bg-amber-600 animate-pulse"
                  title="수정 사항이 아직 DB에 저장되지 않았어요"
                >
                  {saving ? '저장 중…' : '● 저장 안 됨 — 저장하기'}
                </button>
              )}
            </span>
            <div className="flex gap-1 items-center">
              <button
                onClick={() => setViewMode(viewMode === 'single' ? 'grid' : 'single')}
                className={`px-2 py-0.5 rounded border text-xs ${viewMode === 'grid' ? 'bg-accent text-white border-accent' : 'border-border hover:bg-ink/5'}`}
                title="전체 흐름을 한눈에"
              >
                전체 편집
              </button>
              {viewMode === 'single' && (
                <>
                  <button
                    onClick={() => { setPreviewMode(previewMode === 'live' ? 'png' : 'live'); setLiveEdit(null); }}
                    className="px-2 py-0.5 rounded border border-border text-xs hover:bg-ink/5"
                    title="라이브=바로 편집(근사) · PNG=발행 실물 확인"
                  >
                    {previewMode === 'live' ? 'PNG 확인' : '라이브 편집'}
                  </button>
                  <button
                    onClick={() => setQuickEdit(!quickEdit)}
                    className={`px-2 py-0.5 rounded border text-xs ${quickEdit ? 'bg-accent text-white border-accent' : 'border-border hover:bg-ink/5 text-accent'}`}
                    title="폼으로 수정 (AI 초안 3개 포함)"
                  >
                    폼
                  </button>
                  <button onClick={() => selectSlide(Math.max(0, selIdx - 1))} className="px-2 py-0.5 rounded border border-border text-xs hover:bg-ink/5">←</button>
                  <button onClick={() => selectSlide(Math.min(slides.length - 1, selIdx + 1))} className="px-2 py-0.5 rounded border border-border text-xs hover:bg-ink/5">→</button>
                </>
              )}
            </div>
          </div>
          {sel && (viewMode === 'grid' || previewMode === 'live') && renderStyleToolbar(sel)}
          {viewMode === 'single' ? (
            <>
              {previewMode === 'live' && sel ? (
                renderEditableCanvas(selIdx)
              ) : (
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
              )}
              {sel && !sel.enabled && <p className="text-xs text-amber-600 mt-2">이 슬라이드는 제외 상태예요.</p>}
              {/* 프리뷰 빠른 수정 — 적용하면 위 프리뷰가 바로 재렌더 */}
              {quickEdit && sel && (
                <SlideForm
                  key={`${selIdx}-${sel.template}`}
                  slide={sel}
                  accent={card.accent}
                  sourceType={card.source_type}
                  sourceId={card.source_id}
                  onApply={(form) => { applyEdit(selIdx, form); setQuickEdit(false); }}
                  onCancel={() => setQuickEdit(false)}
                />
              )}
            </>
          ) : (
            /* 전체 편집 — 모든 카드가 라이브 캔버스, 각 카드 위에서 동일하게 편집 */
            <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              {slides.map((s, i) => (
                <div key={i} className={s.enabled ? '' : 'opacity-40'}>
                  <div className="flex items-center justify-between text-[11px] text-ink/40 mb-1">
                    <span>
                      {i + 1}. {TEMPLATE_LABEL[s.template]}
                      {!s.enabled && ' · 제외됨'}
                      {i === selIdx && <span className="text-accent ml-1">◂ 스타일 툴바 대상</span>}
                    </span>
                    <button onClick={() => { selectSlide(i); setViewMode('single'); }} className="text-accent hover:underline">
                      단일 보기
                    </button>
                  </div>
                  {renderEditableCanvas(i)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 발행 패널 — 렌더→버킷 업로드 검수 → 채널 선택 → 원클릭 발행 / zip 백업 ──
function PublishPanel({ card, dirty }: { card: CardRow; dirty: boolean }) {
  const router = useRouter();
  const [channels, setChannels] = useState<{ instagram: boolean; threads: boolean }>({
    instagram: true,
    threads: true,
  });
  const [busy, setBusy] = useState<'prepare' | 'publish' | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  async function call(dryRun: boolean) {
    if (dirty) return alert('저장 안 된 수정이 있어요. 먼저 [저장]을 눌러주세요.');
    if (!dryRun) {
      const picked = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
      if (picked.length === 0) return alert('발행 채널을 선택하세요.');
      if (!confirm(`선택한 채널(${picked.join(', ')})에 즉시 게시됩니다. 발행할까요?`)) return;
    }
    setBusy(dryRun ? 'prepare' : 'publish');
    setErrors([]);
    try {
      const res = await fetch('/api/cardpress/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          dryRun,
          channels: Object.entries(channels).filter(([, v]) => v).map(([k]) => k),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setImages(data.images ?? []);
      if (data.errors) setErrors(data.errors);
      if (!dryRun && !data.errors) router.refresh();
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="text-sm font-semibold">발행</div>
      <div className="flex items-center gap-4 text-sm">
        {(['instagram', 'threads'] as const).map((ch) => (
          <label key={ch} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={channels[ch]}
              onChange={() => setChannels((p) => ({ ...p, [ch]: !p[ch] }))}
            />
            {ch === 'instagram' ? 'Instagram 캐러셀+캡션' : 'Threads 글+링크+커버'}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => call(true)} disabled={busy !== null}>
          {busy === 'prepare' ? '렌더·업로드 중…' : '1) PNG 업로드 검수'}
        </Button>
        <Button size="sm" variant="accent" onClick={() => call(false)} disabled={busy !== null}>
          {busy === 'publish' ? '발행 중…' : '2) 발행'}
        </Button>
        <a
          href={`/api/cardpress/zip?cardId=${card.id}`}
          className="text-xs text-accent hover:underline"
          download
        >
          zip 다운로드 (수동 업로드 백업)
        </a>
      </div>
      {images.length > 0 && (
        <p className="text-xs text-ink/60">
          업로드된 슬라이드 {images.length}장 —{' '}
          {images.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="text-accent hover:underline mr-1">
              {i + 1}
            </a>
          ))}
          (클릭해서 실물 확인)
        </p>
      )}
      {errors.map((e, i) => (
        <p key={i} className="text-xs text-red-600">{e}</p>
      ))}
      {card.published_to.length > 0 && (
        <p className="text-xs text-ink/40">
          발행 이력: {card.published_to.map((p) => `${p.channel} (${p.at.slice(0, 16).replace('T', ' ')})`).join(' · ')}
        </p>
      )}
    </div>
  );
}

// ── 라이브 캔버스 — 템플릿을 브라우저에서 직접 렌더(근사), 그 위에서 편집 ──
// 클릭한 텍스트 조각 → 그 텍스트가 들어있는 prop 필드를 역추적(가장 긴 값 우선).
// 사진(data-bg) 드래그 = 배경 위치 팬, 트레이 드롭 = 이미지 배치. 최종 실물은 PNG 토글로 확인.
function LiveSlide({
  slide,
  accent,
  onEditProp,
  onSelectText,
  onDropImage,
  onPan,
}: {
  slide: CardSlide;
  accent: CardAccent;
  onEditProp: (key: string, rect: { x: number; y: number; w: number; h: number }) => void;
  /** 텍스트 드래그 선택 → 형광펜/강조 미니 툴바 */
  onSelectText: (info: { text: string; key: string; rect: { x: number; y: number; w: number; h: number } }) => void;
  onDropImage: (url: string) => void;
  onPan: (pos: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = w > 0 ? w / 1080 : 0;
  const pan = useRef<{ x0: number; y0: number; px: number; py: number; moved: boolean } | null>(null);
  const justPanned = useRef(false); // 팬 종료 직후의 click을 텍스트 편집으로 오인하지 않게

  const parsed = RenderSlideSchema.safeParse({ template: slide.template, accent, props: slide.props });

  function posOf(): [number, number] {
    const m = typeof slide.props.coverPos === 'string' ? slide.props.coverPos.match(/([\d.]+)%\s+([\d.]+)%/) : null;
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : [50, 50];
  }

  function onMouseDown(e: React.MouseEvent) {
    downPos.current = { x: e.clientX, y: e.clientY };
    const t = e.target as HTMLElement;
    if (!t.closest('[data-bg]')) return;
    const [px, py] = posOf();
    pan.current = { x0: e.clientX, y0: e.clientY, px, py, moved: false };
    e.preventDefault();
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!pan.current || w === 0) return;
    const dx = ((e.clientX - pan.current.x0) / w) * 100;
    const dy = ((e.clientY - pan.current.y0) / (w * 1.25)) * 100;
    if (Math.abs(dx) + Math.abs(dy) > 1) {
      pan.current.moved = true;
      justPanned.current = true;
    }
    const nx = Math.min(100, Math.max(0, pan.current.px - dx));
    const ny = Math.min(100, Math.max(0, pan.current.py - dy));
    if (pan.current.moved) onPan(`${nx.toFixed(1)}% ${ny.toFixed(1)}%`);
  }
  // 텍스트 조각 → 소유 prop 필드 역추적 (가장 긴 값 = 상위 필드 우선)
  function findOwnerField(text: string): FieldDef | null {
    const defs = FIELDS[slide.template];
    let best: FieldDef | null = null;
    let bestLen = -1;
    for (const d of defs) {
      const v = fieldToText((slide.props as Record<string, unknown>)[d.key], d)
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ');
      if (v && v.includes(text) && v.length > bestLen) {
        best = d;
        bestLen = v.length;
      }
    }
    return best;
  }

  const justSelected = useRef(false);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const pendingEdit = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (pendingEdit.current) clearTimeout(pendingEdit.current); }, []);

  // 선택 읽기는 이벤트 한 틱 뒤에 (Safari는 mouseup 시점에 selection이 아직 확정 전일 수 있음)
  function readSelection() {
    setTimeout(() => {
      const selObj = window.getSelection();
      if (!selObj || selObj.isCollapsed || !ref.current?.contains(selObj.anchorNode)) return;
      const text = selObj.toString().trim().replace(/\s+/g, ' ');
      if (!text) return;
      const owner = findOwnerField(text);
      if (!owner) return;
      // 선택이 확정됐으면 예약된 클릭 편집은 취소 — 선택 UX가 우선
      if (pendingEdit.current) {
        clearTimeout(pendingEdit.current);
        pendingEdit.current = null;
      }
      const rr = selObj.getRangeAt(0).getBoundingClientRect();
      const cr = ref.current.getBoundingClientRect();
      justSelected.current = true;
      onSelectText({
        text,
        key: owner.key,
        rect: { x: rr.left - cr.left, y: rr.top - cr.top, w: rr.width, h: rr.height },
      });
    }, 0);
  }

  function onMouseUp() {
    pan.current = null;
    readSelection();
  }

  function onClick(e: React.MouseEvent) {
    if (justPanned.current) {
      justPanned.current = false;
      return;
    }
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    // 드래그(선택 시도)였으면 클릭 편집을 열지 않는다
    if (downPos.current && Math.hypot(e.clientX - downPos.current.x, e.clientY - downPos.current.y) > 4) return;
    const selObj = window.getSelection();
    if (selObj && !selObj.isCollapsed) return;
    const t = e.target as HTMLElement;
    if (t.closest('[data-bg]') && !(t.textContent ?? '').trim()) return;
    const text = (t.textContent ?? '').trim().replace(/\s+/g, ' ');
    if (!text) return;
    const best = findOwnerField(text);
    if (!best) return;
    const cr = ref.current!.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const rect = { x: tr.left - cr.left, y: tr.top - cr.top, w: tr.width, h: tr.height };
    // 클릭 편집은 200ms 유예 — 그 사이 더블클릭 선택이 감지되면 취소되고 팔레트가 뜬다
    if (pendingEdit.current) clearTimeout(pendingEdit.current);
    pendingEdit.current = setTimeout(() => {
      pendingEdit.current = null;
      onEditProp(best.key, rect);
    }, 200);
  }

  return (
    <div
      ref={ref}
      className="relative w-full rounded-lg overflow-hidden border border-border bg-ink/5 cursor-text"
      style={{ aspectRatio: '4 / 5', userSelect: 'text', WebkitUserSelect: 'text' }}
      onClick={onClick}
      onDoubleClick={readSelection}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { pan.current = null; }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const url = e.dataTransfer.getData('text/plain');
        if (url.startsWith('http')) onDropImage(url);
      }}
      title="텍스트 클릭=수정 · 사진 드래그=위치 · 트레이에서 끌어다 놓기=배치"
    >
      {scale > 0 && parsed.success ? (
        <div style={{ width: 1080, height: 1350, transform: `scale(${scale})`, transformOrigin: 'top left', fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", userSelect: 'text', WebkitUserSelect: 'text' }}>
          {renderSlide(parsed.data)}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-red-500 p-4 text-center">
          {parsed.success ? '' : '슬라이드 데이터 오류 — 편집 폼에서 수정하세요'}
        </div>
      )}
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
function AddSlidePanel({ sourceType, sourceId, onAdd }: {
  sourceType: CardRow['source_type'];
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
      const res = await fetch(`/api/cardpress/plan?sourceId=${sourceId}&sourceType=${sourceType}`);
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
        body: JSON.stringify({ sourceType, sourceId, sourceSection: picked.sourceSection, template: template || picked.template }),
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

// ── 인라인 편집 폼 (+ AI 수정: 방향 입력 → 초안 3개 비교 → 폼에 반영) ──────────
function SlideForm({
  slide,
  accent,
  sourceType,
  sourceId,
  onApply,
  onCancel,
}: {
  slide: CardSlide;
  accent: CardAccent;
  sourceType: CardRow['source_type'];
  sourceId: string;
  onApply: (form: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const defs = FIELDS[slide.template];
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(defs.map((d) => [d.key, fieldToText((slide.props as Record<string, unknown>)[d.key], d)]))
  );
  const [instruction, setInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [candidates, setCandidates] = useState<Array<Record<string, unknown>> | null>(null);
  const [pickedCand, setPickedCand] = useState<number | null>(null);

  async function fetchCandidates() {
    if (!slide.sourceSection) return alert('sourceSection이 없어 AI 수정을 쓸 수 없어요.');
    if (!instruction.trim()) return alert('수정 방향을 먼저 적어주세요. (예: "숫자를 앞세워 더 도발적으로")');
    setAiBusy(true);
    setCandidates(null);
    setPickedCand(null);
    try {
      const res = await fetch('/api/cardpress/rewrite-slide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceType,
          sourceId,
          sourceSection: slide.sourceSection,
          template: slide.template,
          instruction: instruction.trim(),
          currentProps: formToProps(slide.template, slide.props, form),
          count: 3,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCandidates(data.candidates ?? []);
    } catch (e) {
      alert(`AI 초안 실패: ${(e as Error).message}`);
    } finally {
      setAiBusy(false);
    }
  }

  function pickCandidate(i: number) {
    if (!candidates) return;
    const props = candidates[i];
    setForm(Object.fromEntries(defs.map((d) => [d.key, fieldToText(props[d.key], d)])));
    setPickedCand(i);
  }

  return (
    <div className="mt-2 space-y-2 border-t border-border pt-2">
      {/* AI 수정 — 방향 제시 → 서로 다른 초안 3개 → 골라서 폼에 반영 → 다듬어 적용 */}
      <div className="rounded-md bg-accent/5 border border-accent/20 p-2 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='AI 수정 방향 (예: "숫자를 앞세워 더 도발적으로", "더 담백하게")'
            className="text-sm"
            onKeyDown={(e) => e.key === 'Enter' && !aiBusy && fetchCandidates()}
          />
          <Button size="sm" variant="outline" onClick={fetchCandidates} disabled={aiBusy}>
            {aiBusy ? '초안 생성 중… (1~3분)' : '초안 3개'}
          </Button>
        </div>
        {candidates && candidates.length > 0 && (
          <div className="flex gap-2">
            {candidates.map((c, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <SlideThumb
                  slide={{ ...slide, props: c }}
                  accent={accent}
                  label={`${i + 1}안`}
                  selected={pickedCand === i}
                  onClick={() => pickCandidate(i)}
                />
                <span className="text-[10px] text-ink/40">{pickedCand === i ? '반영됨 ↓' : '클릭=폼에 반영'}</span>
              </div>
            ))}
          </div>
        )}
        {candidates && candidates.length === 0 && <p className="text-xs text-ink/40">후보가 없어요 — 방향을 바꿔 다시 시도해 보세요.</p>}
      </div>

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
      <img
        src={thumb}
        alt={credit ?? ''}
        className="h-20 w-16 object-cover rounded-md border border-border cursor-grab"
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/plain', url)}
      />
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
                  <img
                    src={c.thumb}
                    alt={c.credit}
                    className="h-32 w-[102px] object-cover rounded-md border border-border group-hover:ring-2 group-hover:ring-accent transition-shadow cursor-grab"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', c.full)}
                  />
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
