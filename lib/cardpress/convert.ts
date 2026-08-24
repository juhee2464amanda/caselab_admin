import type { CardTemplateId } from '@/types/cardpress';

// 카드뉴스 템플릿 로컬 변환 — AI 없이 props를 다른 템플릿 모양으로 옮긴다.
//
// 왜: 사진 자리가 없는 템플릿(B3·B7·B8·B1·B6·C3·C4)에서 이미지를 넣으려 하면 alert로 막혔고,
// 템플릿 교체는 sourceSection이 있는 슬라이드의 AI 재작성뿐이라 "이미지가 더 중요한 장"을
// 사진형으로 갈아탈 방법이 없었다. 여기서는 글을 잃지 않고 즉시 옮기는 경로를 만든다.
// (문장을 다시 쓰고 싶으면 기존 AI 재작성 경로를 그대로 쓰면 된다)

// v3 커버의 아트 11종 — 운영자가 고르는 유일한 축이다(레이아웃은 안 흔든다).
// 이 중 사진 한 종만 스톡 검색이 필요하고, 7종은 렌더 때 코드로 그려져서 이미지 수급이 아예 없다.
export const COVER_ART_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'photo', label: '① 사진' },
  { value: 'term', label: '② 터미널' },
  { value: 'studio', label: '③ 오브젝트(밝음)' },
  { value: 'macro', label: '④ 매크로' },
  { value: 'quote', label: '⑤ 인용·밈' },
  { value: 'iri', label: '⑥ 3D 블롭' },
  { value: 'data', label: '⑦ 데이터(밝음)' },
  { value: 'logos', label: '⑧ 로고 나란히' },
  { value: 'mask', label: '⑨ 아이콘 가리기' },
  { value: 'object', label: '⑩ 3D 오브젝트' },
  { value: 'numbers', label: '⑪ 정밀 숫자' },
];

// 드롭다운에 기본 노출하는 5종 — 자동 배정 풀 + 재료(글·아이콘) 없이도 안전한 조합.
// 나머지 6종은 템플릿·렌더는 그대로 살아 있고(기존 카드 호환), 이미 그 값을 쓰는
// 슬라이드에서만 옵션에 함께 나온다.
export const COVER_ART_PRIMARY = ['photo', 'macro', 'iri', 'studio', 'mask'];

/** 노출용 옵션: 기본 5종 + (현재 값이 그 밖이면) 그 값 하나를 덧붙여 select가 깨지지 않게 한다 */
export function coverArtChoices(current?: string): Array<{ value: string; label: string }> {
  return COVER_ART_OPTIONS.filter(
    (o) => COVER_ART_PRIMARY.includes(o.value) || o.value === current
  );
}

/** artText를 쓰는 아트 — 나머지는 입력칸을 아예 안 띄운다 */
export const ART_TEXT_ARTS = ['term', 'quote', 'data', 'numbers'];

export const ART_TEXT_HINT: Record<string, string> = {
  term: '> claude\\n# 허용할까요?\\n! 47번째 요청',
  quote: '밤새\\n돌려놨는데\\n멈춰있음',
  data: '세션 유지 시간',
  numbers: '8시간 21분|무중단 세션\\n6.7MB|앱 용량',
};

export const TEMPLATE_LABEL: Record<CardTemplateId, string> = {
  C1: 'C1 사진커버', C2: 'C2 다크커버', C3: 'C3 툴커버', C4: 'C4 VS커버', C5: 'C5 빅넘버커버',
  B1: 'B1 타임라인', B2: 'B2 불릿', B3: 'B3 용어', B4: 'B4 선언',
  B5: 'B5 솔직후기', B6: 'B6 스텝', B7: 'B7 숫자', B8: 'B8 프롬프트',
  B9: 'B9 스크린샷', B10: 'B10 미니텍스트', B11: 'B11 그리드',
  P1: 'P1 사진+목록', P2: 'P2 사진+문단', P3: 'P3 풀사진', P4: 'P4 사진인용',
  P5: 'P5 블랙목록', P6: 'P6 블랙빅넘버', P7: 'P7 사진그리드',
};

/** 한 줄 설명 — 시각 피커에서 이름 밑에 깔린다 */
export const TEMPLATE_DESC: Record<CardTemplateId, string> = {
  C1: '사진 배경 커버 · 제목이 주인공',
  C2: '다크 배경 커버 · 사진 없이 타이포로',
  C3: '로고 배지가 있는 도구 소개 커버',
  C4: 'A vs B 비교 커버',
  C5: '큰 숫자·단어로 여는 커버 (사진 선택)',
  B1: '용어·단계를 이름+설명 줄로 나열',
  B2: '배너 + 불릿 3~5개 (사진 슬롯 있음)',
  B3: '용어 하나를 크게 정의',
  B4: '사진 위 선언 한 문장',
  B5: '잘된 것 / 별로였던 것 대비',
  B6: '번호 스텝 2~4개',
  B7: '큰 숫자 + 캡션',
  B8: '프롬프트 패턴 맛보기 줄',
  B9: '스크린샷 + 말풍선 (사진 필수)',
  B10: '작은 활자 2단 칼럼 · 긴 설명을 안 자르고',
  B11: '항목 3~4개를 2×2 카드 타일로',
  P1: '사진 밴드 + 번호 목록 · 본문 기본값',
  P2: '사진 밴드 + 제목/부제/문단',
  P3: '풀사진 + 하단 헤드라인',
  P4: '풀사진 + 인용문',
  P5: '사진을 텍스처로 눌러 깐 목록',
  P6: '사진을 텍스처로 눌러 깐 빅넘버',
  P7: '사진 2장 나란히 + 아래 리드 (1장이면 풀폭)',
};

/** 계열 그룹 — 피커 섹션 구분 */
export const TEMPLATE_GROUPS: Array<{ label: string; hint: string; items: CardTemplateId[] }> = [
  { label: '커버', hint: '1번 슬라이드', items: ['C1', 'C2', 'C3', 'C4', 'C5'] },
  { label: '사진 본문', hint: '사진이 주인공인 본문', items: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'] },
  { label: '텍스트 본문', hint: '정보량이 많은 본문', items: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11'] },
];

/**
 * 슬라이드별 이미지가 들어가는 props 키 (없으면 사진 자리가 없는 템플릿).
 * C2·C3는 스키마상 coverImage를 받지만 렌더러가 배경을 안 그린다 — 넣어도 안 보이므로
 * "사진 자리 없음"으로 취급하고 PHOTO_ALT로 C1 전환을 태운다(조용한 무반응 제거).
 */
export const IMAGE_KEY: Partial<Record<CardTemplateId, string>> = {
  C1: 'coverImage', C5: 'coverImage', B4: 'coverImage', B2: 'media', B9: 'shot',
  P1: 'image', P2: 'image', P3: 'image', P4: 'image', P5: 'image', P6: 'image', P7: 'image', B5: 'image',
};

/** 사진을 넣고 싶을 때 갈아탈 기본 후보 — 재료 손실이 가장 적은 짝 */
export const PHOTO_ALT: Partial<Record<CardTemplateId, CardTemplateId>> = {
  B1: 'P1', B3: 'P2', B6: 'P1', B7: 'P6', B8: 'P5', B10: 'P2', B11: 'P1', C2: 'C1', C3: 'C1', C4: 'C1',
};

export function hasImageSlot(t: CardTemplateId): boolean {
  return !!IMAGE_KEY[t];
}

// ── 재료 수확(harvest) ────────────────────────────────────────
// 어떤 템플릿이든 "제목 / 라벨 / 부연 / 문단 / 목록 / 큰수 / 푸터 / 사진"의 공통 자루로 환원한 뒤,
// 목표 템플릿의 필수 필드를 그 자루에서 다시 채운다.

type Pair = { t: string; d?: string };

export type Bag = {
  title?: string;
  kicker?: string;
  sub?: string;
  body?: string;
  items: string[];
  pairs: Pair[];
  big?: string;
  unit?: string;
  footer?: string;
  hl?: string;
  image?: string;
  style: Record<string, unknown>;
};

// coverLayout·coverArt 등 커버 전용 키도 함께 나른다 — C1이 아닌 템플릿에선 렌더 스키마가
// 무시하지만 props에 남아 있어서, 다른 템플릿을 거쳐 C1으로 돌아와도 v3·아트 설정이 살아남는다.
const STYLE_KEYS = [
  'accentColor', 'overlay', 'coverPos', 'hlColor', 'titleAnchor', 'hlStyle',
  'coverLayout', 'coverArt', 'artText', 'artIcons', 'tone',
] as const;

const str = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || undefined;
};
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : [];
const pairArr = (v: unknown, a: string, b: string): Pair[] =>
  Array.isArray(v)
    ? v
        .map((r) => {
          const o = r as Record<string, unknown>;
          return { t: str(o?.[a]) ?? '', d: str(o?.[b]) };
        })
        .filter((p) => p.t)
    : [];

/** **강조** 마커를 지원하지 않는 필드(용어·배너·빅넘버 등)로 옮길 때 사용 */
const plain = (s?: string) => s?.replace(/\*\*/g, '');
const firstLine = (s?: string) => s?.split('\n')[0]?.trim() || undefined;

/** 문단을 목록 후보로 쪼갠다 — 줄바꿈 → 문장 → 중점(·) 순 */
function splitToItems(text?: string): string[] {
  if (!text) return [];
  const byLine = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;
  const bySentence = text
    .split(/(?<=[.!?])\s+|(?<=[다요])\.\s+/)
    .map((l) => l.trim().replace(/\s*[.]$/, ''))
    .filter(Boolean);
  if (bySentence.length > 1) return bySentence;
  const byDot = text.split(/\s*·\s*/).map((l) => l.trim()).filter(Boolean);
  return byDot.length > 1 ? byDot : byLine;
}

/** AI 재작성 결과에 기존 스타일(포인트색·커버 유형·아트 등)을 이어붙인다 — 글은 새로, 모양은 유지 */
export function carryStyle(
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...newProps };
  for (const k of STYLE_KEYS) if (oldProps[k] !== undefined && out[k] === undefined) out[k] = oldProps[k];
  return out;
}

export function harvest(template: CardTemplateId, raw: Record<string, unknown>): Bag {
  const p = raw ?? {};
  const style: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) if (p[k] !== undefined) style[k] = p[k];

  const pairs = [...pairArr(p.rows, 'term', 'desc'), ...pairArr(p.steps, 'title', 'desc')];
  const vs = [p.vsA, p.vsB]
    .map((v) => str((v as Record<string, unknown> | undefined)?.name))
    .filter(Boolean) as string[];

  const listed = [...strArr(p.bullets), ...strArr(p.items), ...strArr(p.lines)];
  const goodBad = [...strArr(p.good), ...strArr(p.bad)];
  const callouts = pairArr(p.callouts, 'text', 'pos').map((c) => c.t);
  const items = listed.length
    ? listed
    : pairs.length
      ? pairs.map((x) => (x.d ? `${x.t} — ${x.d}` : x.t))
      : goodBad.length
        ? goodBad
        : callouts.length
          ? callouts
          : vs.length === 2
            ? vs
            : [];

  const banner = str(p.banner);
  const title =
    str(p.title) ??
    str(p.heading) ??
    str(p.term) ??
    str(p.patternName) ??
    str(p.patternEn) ??
    str(p.quote) ??
    banner ??
    (vs.length === 2 ? `${vs[0]} vs ${vs[1]}` : undefined);

  const kicker =
    str(p.kicker) ??
    str(p.eyebrow) ??
    str(p.label) ??
    str(p.badge) ??
    str(p.pill) ??
    str(p.when) ??
    str(p.index) ??
    (banner && banner !== title ? banner : undefined);

  // lead·resolve·cap은 템플릿마다 "한 줄 요지" 자리 — body가 따로 있으면 부연(sub)으로 내린다
  const leadLike = str(p.lead) ?? str(p.resolve) ?? str(p.cap);
  const body = str(p.body) ?? leadLike;
  const sub =
    str(p.sub) ??
    str(p.termEn) ??
    str(p.effect) ??
    str(p.attribution) ??
    (body && leadLike && body !== leadLike ? leadLike : undefined);

  const imageKey = IMAGE_KEY[template];
  const image =
    (imageKey ? str(p[imageKey]) : undefined) ??
    str(p.coverImage) ??
    str(p.image) ??
    str(p.media) ??
    str(p.shot);

  return {
    title,
    kicker,
    sub,
    body,
    items,
    pairs,
    big: str(p.big),
    unit: str(p.unit),
    footer: str(p.footer) ?? str(p.attribution),
    hl: str(p.hl),
    image,
    style,
  };
}

// ── 변환 ─────────────────────────────────────────────────────

export type Conversion = {
  props: Record<string, unknown>;
  /** 채우지 못한 필수 재료 — 있으면 "AI 재작성" 경로를 권한다 */
  missing: string[];
};

function clean(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

/** hl은 대상 문자열의 부분 문자열일 때만 유효 — 아니면 형광펜이 조용히 사라진다 */
function keepHl(hl: string | undefined, target: string | undefined): string | undefined {
  if (!hl || !target) return undefined;
  return target.replace(/\*\*/g, '').includes(hl) ? hl : undefined;
}

/** 목록을 min~max로 맞춘다. 부족하면 문단을 쪼개 채우고, 그래도 모자라면 빈 배열 */
function fitItems(bag: Bag, min: number, max: number): string[] {
  let list = bag.items;
  if (list.length < min) {
    const from = splitToItems(bag.body ?? bag.sub);
    if (from.length >= min) list = from;
    else if (list.length + from.length >= min) list = [...list, ...from];
  }
  return list.length >= min ? list.slice(0, max) : [];
}

function fitPairs(bag: Bag, min: number, max: number): Pair[] {
  if (bag.pairs.length >= min) return bag.pairs.slice(0, max);
  const list = fitItems(bag, min, max);
  return list.map((l) => {
    const m = l.split(/\s*[—:·|]\s*/);
    return m.length > 1 ? { t: m[0], d: m.slice(1).join(' ') } : { t: l };
  });
}

/** 짧은 단어 뽑기 — 빅넘버(big) 자리는 ≤6자여야 한다 */
function shortWord(bag: Bag): string | undefined {
  if (bag.big) return bag.big;
  const cands = [bag.title, bag.kicker, bag.sub].filter(Boolean) as string[];
  for (const c of cands) {
    const num = plain(c)!.match(/\d+(?:[.,]\d+)?\s*(?:%|배|억|만|천|시간|분|초|일|주|개월|년|x|X)?/);
    if (num) return num[0].replace(/\s+/g, '');
  }
  return undefined;
}

export function convertProps(
  from: CardTemplateId,
  to: CardTemplateId,
  raw: Record<string, unknown>
): Conversion {
  if (from === to) return { props: { ...raw }, missing: [] };
  const bag = harvest(from, raw);
  const missing: string[] = [];
  const need = <T,>(v: T | undefined, label: string): T | undefined => {
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) missing.push(label);
    return v;
  };

  const S = bag.style;
  const headline = bag.title ?? firstLine(bag.body) ?? bag.sub;
  const paragraph = bag.body ?? bag.sub ?? bag.items.join('\n') ?? undefined;

  let props: Record<string, unknown>;

  switch (to) {
    case 'C1':
      props = {
        ...S,
        kicker: plain(bag.kicker),
        title: need(headline, '제목'),
        hl: keepHl(bag.hl, headline),
        sub: bag.sub && bag.sub !== headline ? bag.sub : firstLine(bag.body),
        footer: plain(bag.footer),
        coverImage: bag.image,
      };
      break;
    case 'C2':
      props = {
        ...S,
        eyebrow: plain(bag.kicker),
        title: need(headline, '제목'),
        hl: keepHl(bag.hl, headline),
        sub: bag.sub && bag.sub !== headline ? bag.sub : firstLine(bag.body),
      };
      break;
    case 'C3':
      props = {
        ...S,
        logoText: plain(bag.kicker)?.slice(0, 2),
        title: need(headline, '제목'),
        hl: keepHl(bag.hl, headline),
        sub: bag.sub ?? firstLine(bag.body),
      };
      break;
    case 'C4': {
      const two = bag.items.length >= 2 ? bag.items.slice(0, 2) : plain(headline)?.split(/\s*(?:vs|VS|대)\s*/) ?? [];
      const [a, b] = two;
      props = {
        ...S,
        eyebrow: plain(bag.kicker),
        vsA: need(a ? { name: plain(a)!.slice(0, 20) } : undefined, 'A 이름'),
        vsB: need(b ? { name: plain(b)!.slice(0, 20) } : undefined, 'B 이름'),
        sub: bag.sub ?? firstLine(bag.body),
      };
      break;
    }
    case 'C5':
      props = {
        ...S,
        kicker: plain(bag.kicker) ?? (bag.big ? undefined : plain(firstLine(bag.title))),
        big: need(plain(shortWord(bag)), '큰 숫자/단어'),
        resolve: need(bag.body ?? bag.sub ?? bag.items[0], '해소 문장'),
        footer: plain(bag.footer),
        coverImage: bag.image,
      };
      break;
    case 'B1': {
      const rows = fitPairs(bag, 2, 5);
      props = {
        ...S,
        lead: bag.body !== headline ? bag.body : undefined,
        heading: need(headline, '제목'),
        hl: keepHl(bag.hl, headline),
        rows: need(rows.length >= 2 ? rows.map((r) => clean({ term: plain(r.t), desc: r.d })) : undefined, '항목 2개'),
      };
      break;
    }
    case 'B2': {
      const bullets = fitItems(bag, 1, 5);
      props = {
        ...S,
        banner: need(plain(bag.kicker ?? headline), '배너'),
        lead: bag.kicker && headline !== bag.kicker ? headline : undefined,
        bullets: need(bullets.length ? bullets : undefined, '불릿 1개'),
        media: bag.image,
      };
      break;
    }
    case 'B3':
      props = {
        ...S,
        badge: plain(bag.kicker),
        term: need(plain(headline)?.replace(/\n/g, ' '), '용어'),
        termEn: /^[\x20-\x7E]+$/.test(bag.sub ?? '') ? plain(bag.sub) : undefined,
        lead: need(bag.sub ?? firstLine(bag.body) ?? bag.items[0], '한 줄 정의'),
        body: bag.body && bag.body !== bag.sub ? bag.body : bag.items.slice(0, 2).join(' · ') || undefined,
      };
      break;
    case 'B4':
      props = {
        ...S,
        title: need(headline, '선언 문장'),
        hl: keepHl(bag.hl, headline),
        attribution: plain(bag.footer),
        coverImage: bag.image,
      };
      break;
    case 'B5': {
      // good/bad는 의미가 갈린 두 묶음이라 기계적으로 쪼개면 거짓말이 된다 — AI 재작성 권장
      const list = fitItems(bag, 2, 6);
      const half = Math.ceil(list.length / 2);
      props = {
        ...S,
        heading: plain(headline),
        good: need(list.length >= 2 ? list.slice(0, half).slice(0, 3) : undefined, '잘된 것'),
        bad: need(list.length >= 2 ? list.slice(half).slice(0, 3) : undefined, '별로였던 것'),
        image: bag.image,
      };
      break;
    }
    case 'B6': {
      const steps = fitPairs(bag, 2, 4);
      props = {
        ...S,
        heading: need(headline, '제목'),
        hl: keepHl(bag.hl, headline),
        steps: need(steps.length >= 2 ? steps.map((r) => clean({ title: plain(r.t), desc: r.d })) : undefined, '스텝 2개'),
      };
      break;
    }
    case 'B7':
      props = {
        ...S,
        big: need(plain(shortWord(bag)), '큰 숫자'),
        unit: plain(bag.unit),
        cap: need(bag.body ?? headline, '캡션'),
        sub: bag.sub !== bag.body ? bag.sub : undefined,
      };
      break;
    case 'B8': {
      const lines = fitItems(bag, 1, 8);
      props = {
        ...S,
        badge: plain(bag.kicker),
        patternEn: /^[\x20-\x7E]+$/.test(plain(headline) ?? '') ? plain(headline) : undefined,
        patternName: /^[\x20-\x7E]+$/.test(plain(headline) ?? '') ? undefined : plain(headline),
        when: plain(bag.sub),
        lines: need(lines.length ? lines : undefined, '맛보기 1줄'),
        effect: undefined,
      };
      break;
    }
    case 'B9':
      props = {
        ...S,
        lead: bag.body ?? headline,
        shot: need(bag.image, '스크린샷'),
        callouts: undefined,
      };
      break;
    case 'B10':
      props = {
        ...S,
        eyebrow: plain(bag.kicker),
        heading: need(headline, '제목'),
        hl: keepHl(bag.hl, headline),
        body: need(
          bag.body && bag.body !== headline ? bag.body : bag.items.join('\n\n') || bag.sub,
          '본문'
        ),
        note: plain(bag.footer),
      };
      break;
    case 'B11': {
      const cells = fitPairs(bag, 3, 4);
      props = {
        ...S,
        heading: need(headline, '제목'),
        hl: keepHl(bag.hl, headline),
        cells: need(
          cells.length >= 3 ? cells.map((r) => clean({ title: plain(r.t), desc: r.d })) : undefined,
          '항목 3개'
        ),
      };
      break;
    }
    case 'P7':
      props = {
        ...S,
        eyebrow: plain(bag.kicker),
        lead: need(bag.body ?? headline, '핵심 한 줄'),
        caption: bag.sub !== bag.body ? plain(bag.sub) : undefined,
        image: bag.image,
      };
      break;
    case 'P1': {
      const items = fitItems(bag, 2, 4);
      props = {
        ...S,
        eyebrow: plain(bag.kicker),
        lead: need(bag.body ?? headline, '핵심 한 줄'),
        items: need(items.length >= 2 ? items : undefined, '목록 2개'),
        image: bag.image,
      };
      break;
    }
    case 'P2':
      props = {
        ...S,
        eyebrow: plain(bag.kicker),
        heading: need(headline, '제목'),
        sub: bag.sub !== bag.body ? bag.sub : undefined,
        body: need(
          bag.body && bag.body !== headline ? bag.body : bag.items.join('\n') || bag.sub,
          '본문'
        ),
        image: bag.image,
      };
      break;
    case 'P3':
      props = {
        ...S,
        label: plain(bag.kicker),
        title: need(headline, '헤드라인'),
        items: bag.items.slice(0, 3),
        footer: plain(bag.footer),
        image: bag.image,
      };
      break;
    case 'P4':
      props = {
        ...S,
        quote: need(headline ?? bag.body, '인용문'),
        attribution: plain(bag.footer),
        image: bag.image,
      };
      break;
    case 'P5': {
      const items = fitItems(bag, 2, 4);
      props = {
        ...S,
        index: undefined,
        eyebrow: plain(bag.kicker),
        lead: need(bag.body ?? headline, '핵심 한 줄'),
        items: need(items.length >= 2 ? items : undefined, '목록 2개'),
        footer: plain(bag.footer),
        image: bag.image,
      };
      break;
    }
    case 'P6':
      props = {
        ...S,
        kicker: plain(bag.kicker) ?? (bag.big ? undefined : plain(firstLine(bag.title))),
        big: need(plain(shortWord(bag)), '큰 숫자/단어'),
        resolve: need(bag.body ?? bag.sub ?? bag.items[0], '해소 문장'),
        footer: plain(bag.footer),
        image: bag.image,
      };
      break;
    default:
      props = { ...raw };
  }

  return { props: clean(props), missing };
}

// ── 빈 슬라이드용 샘플 props ───────────────────────────────────
// 시각 피커의 미리보기(변환 재료가 없을 때)와 "AI 없이 빈 슬라이드 추가"에 함께 쓴다.
// 문구는 그대로 두면 티가 나도록 일부러 자리표시 어투로 적는다.

export const SAMPLE_PROPS: Record<CardTemplateId, Record<string, unknown>> = {
  C1: { kicker: '작은 프레이밍 한 줄', title: '커버 제목을\n여기에', hl: '커버 제목', sub: '읽는 데 5분 · 적용 30분', footer: '@CONCEPT' },
  C2: { eyebrow: '모두가 그렇다는데', title: '선언 문장을\n여기에', hl: '선언 문장', sub: '아래 한 줄 부연' },
  C3: { logoText: 'N', title: '도구 이름으로\n여는 커버', hl: '도구 이름', sub: '한 줄 소개' },
  C4: { eyebrow: '무엇이 더 나은가', vsA: { name: 'A 도구', by: '제작사' }, vsB: { name: 'B 도구', by: '제작사' }, sub: '비교 기준 한 줄' },
  C5: { kicker: '맥락 한 줄', big: '10배', resolve: '숫자가 말하는 **한 문장**' },
  B1: { lead: '**핵심**부터 정리하면', heading: '먼저 순서부터', hl: '순서', rows: [{ term: '첫 단계', desc: '무엇을 하는지' }, { term: '다음 단계', desc: '무엇을 하는지' }] },
  B2: { banner: '✓ 핵심 정리', bullets: ['첫 번째 요점', '두 번째 요점', '세 번째 요점'] },
  B3: { badge: '30초 개념', term: '용어', termEn: 'Term', lead: '한 줄 정의를 여기에', body: '왜 중요한지 **한 문장**' },
  B4: { title: '사진 위에\n한 문장', hl: '한 문장', attribution: '— 기록' },
  B5: { heading: '솔직 후기', good: ['잘된 것 하나', '잘된 것 둘'], bad: ['별로였던 것 하나'] },
  B6: { heading: '이렇게 세팅했어요', hl: '세팅', steps: [{ title: '첫 단계', desc: '설명 한 줄' }, { title: '다음 단계', desc: '설명 한 줄' }] },
  B7: { big: '40', unit: '%', cap: '무엇이 **얼마나** 달라졌나', sub: '측정 기준 한 줄' },
  B8: { badge: '프롬프트 패턴', patternEn: 'Pattern Name', patternName: '패턴 이름', when: '이런 상황에서', lines: ['# 언제 쓰는지 주석', '[변수]를 넣어 지시', '핵심 지시 한 줄'], effect: '기대 효과 한 줄' },
  B9: { lead: '화면에서 **여기**만 보면 됩니다' }, // shot은 호출부가 채운다(필수)
  B10: { eyebrow: 'DEEP DIVE', heading: '작은 활자로 길게\n싣는 제목', hl: '작은 활자', body: '첫 문단을 여기에. 다른 장보다 활자가 작아 긴 설명이 들어간다.\n\n둘째 문단부터는 오른쪽 칼럼으로 흐른다.', note: '· 하단 각주 한 줄' },
  B11: { heading: '네 가지로 정리', hl: '네 가지', cells: [{ title: '첫 항목', desc: '설명 한 줄' }, { title: '둘째 항목', desc: '설명 한 줄' }, { title: '셋째 항목', desc: '설명 한 줄' }, { title: '넷째 항목', desc: '설명 한 줄' }] },
  P1: { eyebrow: '라벨', lead: '이 장의 **핵심** 한 줄', items: ['첫 번째 항목', '두 번째 항목'] },
  P2: { eyebrow: '라벨', heading: '가장 크게 설 제목', sub: '부제 한 줄', body: '작은 회색 문단.\n위계로 읽히는 본문을 여기에.' },
  P3: { label: '라벨', title: '풀사진 위\n헤드라인', items: ['뒷받침 한 줄'], footer: '@CONCEPT' },
  P4: { quote: '인용하고 싶은 한 문장', attribution: '기록' },
  P5: { eyebrow: '라벨', lead: '이 장의 **핵심** 한 줄', items: ['첫 번째 항목', '두 번째 항목'], footer: '@CONCEPT' },
  P6: { kicker: '맥락 한 줄', big: '70%', resolve: '숫자가 말하는 **한 문장**' },
  P7: { eyebrow: '라벨', lead: '사진 두 장이 말하는 **한 줄**', caption: '사진 아래 회색 부연 한 줄' },
};

/** 새 슬라이드용 props — 사진 자리가 있는 템플릿엔 트레이의 첫 이미지를 미리 꽂아 준다 */
export function sampleProps(t: CardTemplateId, image?: string): Record<string, unknown> {
  const base = { ...SAMPLE_PROPS[t] };
  const key = IMAGE_KEY[t];
  if (key && image) base[key] = image;
  return base;
}
