/* eslint-disable @next/next/no-img-element */
import type { CSSProperties, ReactNode } from 'react';
import type { CardAccent, RenderSlideInput } from '@/types/cardpress';

// content/instagram/carousel-template/caselab-carousel-guide.html 의 슬라이드 14종 중
// C1(사진몰입 커버)·B2(이미지+배너+불릿)·B5(잘된것/별로였던것) 등을
// Satori(next/og) 호환으로 포팅. Satori 제약: CSS 변수·color-mix 불가 → JS 상수/mix 헬퍼,
// box-decoration-break 불가 → 형광펜(hl)은 한 줄 안의 단어에만.

export const CARD_W = 1080;
export const CARD_H = 1350;

// export: 엔딩 카드(lib/cardpress/endings.ts)가 카테고리색을 기본 포인트색으로 쓴다
export const ACCENTS: Record<CardAccent, string> = {
  'cat-case': '#2F6BFF', // 실전 케이스 = 블루
  'cat-trend': '#7C3AED', // AI 트렌드 = 바이올렛
  'cat-tool': '#0E9F6E', // AI 도구 = 에메랄드
  'cat-prompt': '#C2410C', // 바로쓰는 프롬프트 = 오렌지
  'cat-guide': '#0F766E', // 가이드 = 딥틸
};
const GOOD = '#2F6BFF'; // 잘된 것 (카테고리 무관 고정 — 블루=성공/레드=실패 대비)
const BAD = '#E11D48'; // 별로였던 것
const INK = '#14161C';
const MUTED = '#7A828F';
const BODY_TEXT = '#3A3F4A';

const DEFAULT_TAGS: Record<CardAccent, string> = {
  'cat-case': '실전 케이스',
  'cat-trend': 'AI 트렌드',
  'cat-tool': 'AI 도구',
  'cat-prompt': '프롬프트',
  'cat-guide': '가이드',
};

// color-mix(in srgb, C p%, #fff) 대체 — 흰 배경 위 틴트 계산
function mixWithWhite(hex: string, ratio: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v * ratio + 255 * (1 - ratio));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(ch);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const FONT = 'Pretendard';

// ── 가시성 자동 맞춤 ─────────────────────────────────────────
// 카드 크기(1080×1350)는 고정인데 슬라이드마다 텍스트 양은 제각각이다. 고정 폰트 크기를 쓰면
// 짧은 슬라이드는 아래가 절반씩 비어 글씨가 상대적으로 작아 보이고, 긴 슬라이드는 넘친다.
// → "남은 공간에 들어가는 가장 큰 크기"를 역산하고, 그래도 남는 여백은 항목 간격으로 흡수한다.
// Satori는 측정 API가 없으므로 폭은 em 근사로 계산한다(넉넉히 잡아 넘침보다 여백 쪽으로 실수).

const PAD_X = 72; // 흰 본문 카드 좌우 패딩
const PAD_Y = 80; // 상하 패딩
const BODY_W = CARD_W - PAD_X * 2; // 936
const TOPBAR_H = 44; // caselab 로고 줄 높이

const CJK_RE = /[ᄀ-ᇿ⺀-鿿가-힣豈-﫿＀-｠]/;

/** **강조**·==골드== 마커는 렌더에서 사라지므로 측정에서도 뺀다 */
function stripMarks(text: string): string {
  return text.replace(/\*\*/g, '').replace(/==/g, '');
}

// ── 글자 크기 배율 (슬라이드 props.textScale) ───────────────────────
// 왜 모듈 변수인가: 크기가 정해지는 자리가 180곳 가까이 되고(고정 fontSize + fitBlock 결과),
// 템플릿마다 props를 타고 내려보내면 한 곳만 빠뜨려도 그 요소만 안 커지는 조용한 버그가 된다.
// renderSlide가 한 장을 그리는 동안만 세워두고 끝나면 되돌린다 — JSX style 객체는 renderSlide
// 호출 중에 즉시 평가되므로(지연 렌더 아님) 장 사이에 값이 새지 않는다.
let TEXT_SCALE = 1;

/** 기준 크기 → 실제 크기. 모든 fontSize는 이 함수를 통과한다(fitBlock은 내부에서 적용). */
function fs(size: number): number {
  return TEXT_SCALE === 1 ? size : Math.max(12, Math.round(size * TEXT_SCALE));
}

/** 텍스트의 em 폭 — 한글·한자·전각은 1em, 라틴·숫자·공백은 0.55em (Pretendard 실측 근사) */
function emWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += CJK_RE.test(ch) ? 1 : 0.55;
  return w;
}

/** fontSize로 width 안에 렌더할 때 차지하는 줄 수 ('\n' 줄바꿈 + 자동 줄바꿈) */
function lineCount(text: string, fontSize: number, width: number): number {
  return stripMarks(text)
    .split('\n')
    .reduce((n, line) => n + Math.max(1, Math.ceil((emWidth(line) * fontSize * 1.04) / width)), 0);
}

/** 항목 목록을 height 안에 담는 최대 폰트 크기 + 그때의 항목 간격.
 *  max에서 1px씩 낮추며 처음 들어가는 크기를 쓰고, 남는 공간은 간격으로 (상한까지) 분배한다. */
function fitBlock(
  texts: string[],
  o: {
    width: number;
    height: number;
    max: number;
    min: number;
    lineHeight: number;
    /** 기본 간격 = size × gapRatio */
    gapRatio: number;
    /** 여백 흡수 상한 = size × gapMaxRatio (기본: gapRatio의 2배) */
    gapMaxRatio?: number;
    /** 항목마다 텍스트 외에 더 붙는 높이(패딩·헤더 등) */
    extraPerItem?: number;
  }
): { size: number; gap: number; height: number } {
  const extra = o.extraPerItem ?? 0;
  const textH = (f: number) =>
    texts.reduce((s, t) => s + lineCount(t, f, o.width) * f * o.lineHeight + extra, 0);
  const gaps = Math.max(0, texts.length - 1);
  // 배율은 탐색 범위에만 건다 — 높이 제약은 그대로라, 키웠는데 안 들어가면 알아서 되줄어든다
  const maxF = fs(o.max);
  const minF = fs(o.min);
  let size = minF;
  for (let f = Math.round(maxF); f >= Math.round(minF); f -= 1) {
    if (textH(f) + f * o.gapRatio * gaps <= o.height) {
      size = f;
      break;
    }
  }
  const base = size * o.gapRatio;
  const leftover = o.height - textH(size) - base * gaps;
  const gap =
    gaps > 0
      ? Math.round(Math.min(size * (o.gapMaxRatio ?? o.gapRatio * 2), base + Math.max(0, leftover) / gaps))
      : Math.round(base);
  return { size, gap, height: Math.round(textH(size) + gap * gaps) };
}

// 형광펜 배경색 — hlColor 오버라이드(가이드 팔레트: 블루·바이올렛·에메랄드·레드·골드), 기본은 포인트색
function hlBg(props: { hlColor?: string }, fallback: string): string {
  return props.hlColor && /^#[0-9a-fA-F]{6}$/.test(props.hlColor) ? props.hlColor : fallback;
}

/** 형광펜 표현 3종 — box(배경 박스) / text(글자색만) / underline(밑줄).
 *  Satori는 box-decoration-break·text-decoration 두께를 못 다루므로 밑줄은 borderBottom으로 그린다.
 *  text·underline은 색이 글자 자체에 실리므로 어두운 배경에서 흰색보다 어두워지지 않게 밝기를 올린다
 *  (블루 #2F6BFF 원색은 검은 사진 위 3.0:1 — 흰 글자 옆에서 혼자 안 읽힌다). */
function hlSpan(
  props: { hlColor?: string; hlStyle?: 'box' | 'text' | 'underline' },
  color: string,
  onDark: boolean
): CSSProperties {
  const base = hlBg(props, color);
  const lit = onDark ? mixWithWhite(base, 0.58) : base;
  switch (props.hlStyle) {
    case 'text':
      return { whiteSpace: 'pre', color: lit, textShadow: 'none' };
    case 'underline':
      return {
        whiteSpace: 'pre',
        color: onDark ? '#fff' : INK,
        borderBottom: `7px solid ${lit}`,
        paddingBottom: 2,
        textShadow: 'none',
      };
    default: {
      // 밝은 형광펜(골드·라임·옐로) 박스 위 흰 글자는 죽는다 — YIQ 명도로 글자색을 뒤집는다
      const n = parseInt(base.slice(1), 16);
      const yiq = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
      return {
        whiteSpace: 'pre',
        background: base,
        color: yiq > 150 ? INK : '#fff',
        padding: '2px 16px',
        borderRadius: 8,
        textShadow: 'none',
      };
    }
  }
}

// 슬라이드별 포인트색 오버라이드 (캔버스 편집) — 유효한 hex일 때만
function accentOf(accent: CardAccent, props: { accentColor?: string }): string {
  return props.accentColor && /^#[0-9a-fA-F]{6}$/.test(props.accentColor)
    ? props.accentColor
    : ACCENTS[accent];
}

// **강조** 마커 → 포인트색 볼드 스팬. pre-wrap: 세그먼트 경계의 공백 유지 + 내부 줄바꿈 허용.
// 낱말 단위로 쪼개 담는다 — flexWrap 컨테이너에서 스팬은 하나의 아이템이라, 통으로 두면
// 강조 뒤 문장 전체가 다음 줄로 밀려 "effort / 를 올리면…" 같은 어색한 줄바꿈이 난다.
function em(text: string, accent: string, base: CSSProperties = {}): ReactNode[] {
  const nodes: ReactNode[] = [];
  // '\n'은 스팬 안에 두면 안 먹는다 — pre-wrap은 스팬 내부만 끊고 부모 flex 줄은 못 끊어서
  // Satori에서 "넓은 공백"으로 렌더된다(강조 앞뒤가 벌어지던 원인). 줄을 먼저 쪼개고
  // 그 자리에 100% 폭·높이 0 스페이서를 넣어 flexWrap이 실제로 줄을 넘기게 한다.
  text.split('\n').forEach((rawLine, li) => {
    if (li > 0)
      nodes.push(
        <div key={`br${li}`} style={{ display: 'flex', width: '100%', height: 0 }} />
      );
    // 줄 끝·줄 앞 공백은 여기서 털어낸다 — 남기면 줄바꿈 자리에 빈칸으로 찍힌다.
    const line = rawLine.trim();
    if (!line) return;
    // **강조**=포인트색 · ==강조===골드(#E8B857, P계열 벤치마크 강조색과 동일).
    // 골드는 포인트색과 별개의 둘째 강조 축 — 썸네일 문법을 본문에서도 쓰게 해달라는 운영자 요청(2026-08-25).
    line.split(/(\*\*.+?\*\*|==.+?==)/g).forEach((seg, i) => {
      if (!seg) return;
      let content = seg;
      let style: CSSProperties = { ...base, whiteSpace: 'pre-wrap' };
      if (/^\*\*.+\*\*$/.test(seg)) {
        content = seg.slice(2, -2);
        style = { ...base, whiteSpace: 'pre-wrap', color: accent, fontWeight: 700 };
      } else if (/^==.+==$/.test(seg)) {
        content = seg.slice(2, -2);
        style = { ...base, whiteSpace: 'pre-wrap', color: PHOTO_ACCENT, fontWeight: 700 };
      }
      for (const word of content.match(/\S+\s*|\s+/g) ?? [content])
        nodes.push(
          <span key={`${li}-${i}-${nodes.length}`} style={style}>
            {word}
          </span>
        );
    });
  });
  return nodes;
}

// **·== 마커를 pre 스팬으로 파싱 — highlightLines 전용(em()과 달리 낱말 분해 없음, flex row 안 spans).
// **강조**: emAccent 색(없으면 색 유지, 볼드만) · ==강조==: 항상 골드(PHOTO_ACCENT).
// 마커를 안 먹는 필드에 편집기가 넣어도 별표가 화면에 그대로 나가지 않게 전 highlightLines가 통과한다.
function emPre(text: string, keyPrefix: string, emAccent?: string): ReactNode[] {
  return text.split(/(\*\*.+?\*\*|==.+?==)/g).flatMap((seg, i) => {
    if (!seg) return [];
    let content = seg;
    const style: CSSProperties = { whiteSpace: 'pre' };
    if (/^\*\*.+\*\*$/.test(seg)) {
      content = seg.slice(2, -2);
      style.fontWeight = 800;
      if (emAccent) style.color = emAccent;
    } else if (/^==.+==$/.test(seg)) {
      content = seg.slice(2, -2);
      style.fontWeight = 800;
      style.color = PHOTO_ACCENT;
    }
    return [
      <span key={`${keyPrefix}-${i}`} style={style}>
        {content}
      </span>,
    ];
  });
}

// '\n' 줄바꿈 + hl 부분 문자열 형광펜. 각 줄은 flex row(세그먼트 스팬)로 조립.
// emAccent: 이 줄들 속 **강조**의 글자색(포인트색 추종용). 안 주면 볼드만 입힌다.
function highlightLines(
  text: string,
  hl: string | undefined,
  lineStyle: CSSProperties,
  hlStyle: CSSProperties,
  emAccent?: string
): ReactNode[] {
  return text.split('\n').map((line, li) => {
    const segs = hl && line.includes(hl) ? line.split(hl) : null;
    // 줄은 기본 nowrap — 폭을 넘기면 꺾이지 않고 흘러 잘린다. 자동 줄바꿈이 필요한 템플릿은
    // lineStyle에 flexWrap:'wrap'을 넘겨 켠다(P11 제목). 기본값으로 켜면 v3 커버처럼 자리가
    // 고정된 잠금 규격의 글자 위치가 미세하게 밀려 픽셀 검수가 흔들린다 — 켤 곳만 켠다.
    return (
      <div key={li} style={{ display: 'flex', alignItems: 'center', ...lineStyle }}>
        {segs ? (
          segs.flatMap((seg, si) => {
            const parts: ReactNode[] = [];
            if (si > 0)
              parts.push(
                <span key={`hl${si}`} style={hlStyle}>
                  {hl}
                </span>
              );
            if (seg) parts.push(...emPre(seg, `s${si}`, emAccent));
            return parts;
          })
        ) : (
          emPre(line, 'l', emAccent)
        )}
      </div>
    );
  });
}

function Topbar({
  right,
  color,
  rightStyle,
}: {
  right?: ReactNode;
  color: string;
  rightStyle?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: fs(28), fontWeight: 700, letterSpacing: '-0.01em', color }}>caselab</span>
      {right ? (
        <span style={{ fontSize: fs(26), fontWeight: 600, color: MUTED, ...rightStyle }}>{right}</span>
      ) : null}
    </div>
  );
}

const cardBase: CSSProperties = {
  position: 'relative',
  width: CARD_W,
  height: CARD_H,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: FONT,
  wordBreak: 'keep-all',
};

// 사진 배경 + 톤 통일 스크림 (벤치마크 룰: 어떤 사진이 와도 살아남는 후처리가 톤 통일의 90%)
// overlay: 전체를 일괄 어둡게(0.2~0.35 / 빅넘버형 0.6+), 하단 45%는 0.85까지 떨어지는 그라데이션.
function PhotoBg({ image, overlay, pos }: { image?: string; overlay: number; pos?: string }) {
  return (
    <>
      {/* ⚠️ 사진은 반드시 <img>+objectFit로 채운다 — 배경 CSS의 cover 값을 Satori가 무시하고
          원본 크기로 타일링한다(2026-08-13 실발생: 커버 사진이 2×2 격자로 반복돼 나감).
          scripts/cardpress-verify.mjs의 소스 린트가 이 패턴을 금지한다. */}
      {image ? (
        <img
          data-bg="1"
          src={image}
          width={CARD_W}
          height={CARD_H}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: CARD_W,
            height: CARD_H,
            objectFit: 'cover',
            objectPosition: pos ?? '50% 50%',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: CARD_W,
            height: CARD_H,
            display: 'flex',
            backgroundImage: 'linear-gradient(135deg,#232a3d 0%,#12151f 100%)',
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: CARD_W,
          height: CARD_H,
          display: 'flex',
          background: `rgba(0,0,0,${overlay})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: CARD_W,
          height: CARD_H,
          display: 'flex',
          background:
            'linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 55%,rgba(0,0,0,0.85) 100%)',
        }}
      />
      {/* 상단 스크림 — 밝은 사진에서 topbar·태그가 안 읽히는 문제(실측 2.89:1). 벤치마크도 상단 비네트를 일괄 적용한다 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: CARD_W,
          height: Math.round(CARD_H * 0.16),
          display: 'flex',
          background: 'linear-gradient(180deg,rgba(0,0,0,0.42) 0%,rgba(0,0,0,0) 100%)',
        }}
      />
    </>
  );
}

// ---------- C1 · 사진 커버 (유형 4종) ----------
// 텍스트가 늘 좌하단에만 붙으면 소재가 달라도 같은 카드로 읽힌다. 벤치마크 커버를 분해해
// 네 자리로 나눴다: 좌하단(bottom) / 가운데 포스터(center) / 하단 밴드(band) / 하단 초대형(giant).
type C1Input = Extract<RenderSlideInput, { template: 'C1' }>;

function C1(input: C1Input) {
  switch (input.props.coverLayout) {
    case 'v3':
      return C1V3(input);
    case 'center':
      return C1Center(input);
    case 'band':
      return C1Band(input);
    case 'giant':
      return C1Giant(input);
    default:
      return C1Bottom(input);
  }
}

// ---------- C1 v3 · 잠금 규격 커버 ----------
// 피드 상위 계정(팔로워 5.7만, 게시물 102개) 분석 결과: 그 계정은 레이아웃을 한 번도 안 바꾼다.
// 상단은 비우고, 헤드라인은 예외 없이 2줄, 워드마크는 바닥 중앙, 스크림은 항상 깔려 있다.
// 다양성은 오직 배경 아트(coverArt 7종)에서만 나온다 — 규격이 같아야 그리드가 한 매체로 읽힌다.
//
// 규격(1080×1350 실측치, 원안의 cqw를 px로 환산):
//   좌우 여백 65 · 텍스트 블록 바닥 130 · 스크림 하단 66% · 아이브로우 33 · 헤드라인 99 · 워드마크 27
const V3_PAD = 65;
const V3_BLOCK_BOTTOM = 130;
const V3_SCRIM_H = Math.round(CARD_H * 0.66);
const V3_EYEBROW = 33;
const V3_HEADLINE = 99;
const V3_WM = 27;
const V3_WM_BOTTOM = 50;

// 하이라이트는 사람이 고르지 않는다 — 어두우면 블루, 밝으면 라임. 배경 밝기로만 정해서
// 시리즈 전체에 색 규칙이 보이게 한다(전에는 한 장은 파랑, 한 장은 초록이라 규칙이 안 보였다).
const V3_BLUE = '#2F4BF0';
const V3_LIME = '#C6F24E';

// v3 형광펜 기본색 — hlColor > 포인트색(전체, accentColor) > 톤 기본(블루/라임).
// "포인트색(전체)"을 보라로 골랐는데 커버만 파랑으로 남던 문제 정정(운영자 2026-08-30).
function v3Base(props: { hlColor?: string; accentColor?: string }, dark: boolean): string {
  const fallback =
    props.accentColor && /^#[0-9a-fA-F]{6}$/.test(props.accentColor)
      ? props.accentColor
      : dark
        ? V3_BLUE
        : V3_LIME;
  return hlBg(props, fallback);
}

// 형광펜 박스 글자색은 톤이 아니라 **박스색의 밝기**로 — 라임엔 잉크, 블루·보라엔 흰색.
// (기존 dark 톤 기준은 라이트 톤 + 어두운 커스텀색 조합에서 잉크 글자가 안 읽혔다)
function relLum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

const V3_SCRIM: Record<'dark' | 'light', string> = {
  dark: 'linear-gradient(to top, rgba(6,8,12,0.94) 22%, rgba(6,8,12,0.72) 46%, rgba(6,8,12,0) 100%)',
  light:
    'linear-gradient(to top, rgba(255,255,255,0.96) 22%, rgba(255,255,255,0.78) 46%, rgba(255,255,255,0) 100%)',
};

/** 아트별 기본 톤 — 밝은 아트 두 종만 light. 사람이 매번 고르지 않게 기본값을 못 박는다 */
function v3Tone(props: { coverArt?: string; tone?: 'dark' | 'light' }): 'dark' | 'light' {
  if (props.tone) return props.tone;
  return props.coverArt === 'studio' || props.coverArt === 'data' ? 'light' : 'dark';
}

const fill = (extra: CSSProperties = {}): CSSProperties => ({
  position: 'absolute',
  left: 0,
  top: 0,
  width: CARD_W,
  height: CARD_H,
  display: 'flex',
  ...extra,
});

// 터미널 — 개발 도구·설정 소재. 줄 앞 마커로 색을 정한다: '>' 프롬프트 / '#' 흐린 줄 / '!' 경고
function ArtTerm({ text }: { text?: string }) {
  // 기본값에 그럴듯한 수치를 넣지 않는다 — 운영자가 안 채우면 지어낸 데이터가 그대로 발행된다
  const lines = (text ?? '> 명령어를 여기에\n# 출력 줄\n! 강조할 줄').split('\n');
  return (
    <div
      style={fill({
        flexDirection: 'column',
        background: '#0C0E13',
        padding: `${97}px ${V3_PAD}px`,
        fontSize: fs(37),
        color: '#D6DEE8',
      })}
    >
      {lines.map((raw, i) => {
        const m = /^([>#!])\s?(.*)$/.exec(raw);
        const body = m ? m[2] : raw;
        const color = m?.[1] === '>' ? '#7EE787' : m?.[1] === '#' ? '#67717F' : m?.[1] === '!' ? '#E3B341' : '#D6DEE8';
        return (
          <div key={i} style={{ display: 'flex', height: 78, alignItems: 'center', color, whiteSpace: 'pre' }}>
            {m?.[1] === '>' ? `$ ${body}` : body}
          </div>
        );
      })}
    </div>
  );
}

// 오브젝트 스튜디오컷(밝음) — 스위치 하나로 "껐다"를 그림으로 끝낸다
function ArtStudio() {
  const w = 605;
  const h = 313;
  const x = Math.round((CARD_W - w) / 2);
  const y = 300;
  return (
    <div style={fill({ background: 'radial-gradient(ellipse at 50% 22%, #F3F4F6 0%, #D9DCE2 55%, #B9BEC8 100%)' })}>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          display: 'flex',
          borderRadius: 160,
          background: 'linear-gradient(180deg,#3B4150,#232833)',
          boxShadow: '0 64px 108px -32px rgba(30,35,48,0.45)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x + 28,
          top: y + 28,
          width: 257,
          height: 257,
          display: 'flex',
          borderRadius: 129,
          background: 'linear-gradient(180deg,#FFFFFF,#DFE3EA)',
          boxShadow: '0 17px 32px rgba(0,0,0,0.35)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x + w - 200,
          top: y + Math.round(h / 2) - 44,
          display: 'flex',
          fontSize: fs(65),
          fontWeight: 800,
          color: 'rgba(255,255,255,0.28)',
        }}
      >
        OFF
      </div>
    </div>
  );
}

// 매크로 클로즈업(어두움) — 키캡 하나. 초록 글로우로 "실행 중"의 인상만 남긴다
function ArtMacro() {
  return (
    <div style={fill({ background: 'radial-gradient(ellipse at 62% 30%, #2A3040 0%, #0D1017 62%, #06080C 100%)' })}>
      <div
        style={{
          position: 'absolute',
          left: -108,
          top: 108,
          width: 756,
          height: 756,
          display: 'flex',
          background: 'radial-gradient(circle at 50% 50%, rgba(126,231,135,0.30) 0%, rgba(126,231,135,0) 62%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 291,
          top: 210,
          width: 497,
          height: 432,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 43,
          transform: 'rotate(-2deg)',
          background: 'linear-gradient(160deg,#4A5364 0%,#232935 46%,#161B24 100%)',
          boxShadow: '0 86px 151px -43px rgba(0,0,0,0.7)',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: fs(58),
            fontWeight: 700,
            letterSpacing: '0.28em',
            paddingLeft: 16,
            color: 'rgba(255,255,255,0.32)',
          }}
        >
          enter
        </div>
      </div>
    </div>
  );
}

// 인용·밈 — 사용자 대사를 배경에 크게 눕힌다. 가장 저비용, 가장 잘 걸리는 유형
function ArtQuote({ text }: { text?: string }) {
  const q = text ?? '사용자 대사를\n여기에\n넣으세요';
  return (
    <div style={fill({ background: '#1B1F2B' })}>
      <div
        style={{
          position: 'absolute',
          left: V3_PAD,
          top: 30,
          display: 'flex',
          fontSize: fs(281),
          fontWeight: 800,
          color: V3_LIME,
        }}
      >
        “
      </div>
      <div
        style={{
          position: 'absolute',
          left: 76,
          top: 250,
          width: CARD_W - 152,
          display: 'flex',
          flexDirection: 'column',
          fontSize: fs(151),
          fontWeight: 800,
          letterSpacing: '-0.06em',
          color: 'rgba(255,255,255,0.14)',
        }}
      >
        {q.split('\n').map((line, i) => (
          <div key={i} style={{ display: 'flex', height: 166, alignItems: 'center' }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

// 3D 이리데슨트 블롭 — 트렌드·추상 소재.
// ⚠️ 원안의 conic-gradient는 Satori가 못 읽는다(에러 없이 통째로 사라진다) → radial 4겹으로 대체.
function ArtIri() {
  const box = { left: 140, top: 150, size: 800 };
  const layer = (bg: string): CSSProperties => ({
    position: 'absolute',
    left: box.left,
    top: box.top,
    width: box.size,
    height: box.size,
    display: 'flex',
    borderRadius: box.size / 2,
    background: bg,
  });
  return (
    <div style={fill({ background: '#07090E' })}>
      <div style={layer('radial-gradient(circle at 34% 30%, #4B6BFF 0%, rgba(75,107,255,0) 62%)')} />
      <div style={layer('radial-gradient(circle at 70% 38%, #9B5CF6 0%, rgba(155,92,246,0) 58%)')} />
      <div style={layer('radial-gradient(circle at 60% 74%, #F45D9B 0%, rgba(244,93,155,0) 56%)')} />
      <div style={layer('radial-gradient(circle at 28% 68%, #3BE0C8 0%, rgba(59,224,200,0) 54%)')} />
      <div style={layer('radial-gradient(circle at 38% 28%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 42%)')} />
    </div>
  );
}

// 데이터 차트(밝음) — 숫자가 있는 케이스.
// ⚠️ 인라인 <svg>는 Satori에서 불안정 → data URI <img>로 넣는다(이건 확실히 그려진다).
function ArtData({ text }: { text?: string }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80">
    <path d="M4 68 L40 30 L74 26 L96 24" fill="none" stroke="#0A0C11" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M96 24 L128 70 L196 72" fill="none" stroke="#C4453B" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="5 4"/>
    <circle cx="96" cy="24" r="4.6" fill="#C4453B"/>
  </svg>`;
  return (
    <div style={fill({ background: 'linear-gradient(180deg,#FBFBFC,#EDEFF3)' })}>
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
        width={907}
        height={367}
        style={{ position: 'absolute', left: 86, top: 216 }}
      />
      {text ? (
        <div
          style={{
            position: 'absolute',
            left: 86,
            top: 150,
            display: 'flex',
            fontSize: fs(40),
            fontWeight: 700,
            color: '#8A92A3',
          }}
        >
          {text.split('\n')[0]}
        </div>
      ) : null}
    </div>
  );
}

// 사진 — 기존 소재 그대로. v3는 하단 스크림이 따로 있으므로 여기선 전체 톤만 살짝 눌러준다.
function ArtPhoto({ image, overlay, pos }: { image?: string; overlay: number; pos?: string }) {
  return (
    <>
      {image ? (
        <img
          data-bg="1"
          src={image}
          width={CARD_W}
          height={CARD_H}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: CARD_W,
            height: CARD_H,
            objectFit: 'cover',
            objectPosition: pos ?? '50% 50%',
          }}
        />
      ) : (
        <div style={fill({ background: 'linear-gradient(135deg,#232a3d 0%,#12151f 100%)' })} />
      )}
      <div style={fill({ background: `rgba(0,0,0,${overlay})` })} />
    </>
  );
}

/** Simple Icons 슬러그 → CDN URL. 이미 URL이면 그대로 둔다.
 *  Satori가 원격 SVG를 그대로 렌더하는 것을 확인함(2026-08-18) — 로고를 벤더링할 필요가 없다. */
function iconUrl(slugOrUrl: string): string {
  return /^https?:\/\//.test(slugOrUrl)
    ? slugOrUrl
    : `https://cdn.simpleicons.org/${encodeURIComponent(slugOrUrl)}`;
}

/** 로고를 얹는 흰 타일 — 브랜드 색을 살리려면 어두운 배경에 흰 판을 깔아야 한다 */
function LogoTile({ src, x, y, size, pad }: { src: string; x: number; y: number; size: number; pad: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Math.round(size * 0.22),
        background: '#FFFFFF',
        boxShadow: '0 40px 80px -30px rgba(0,0,0,0.75)',
      }}
    >
      <img src={src} width={size - pad * 2} height={size - pad * 2} style={{ objectFit: 'contain' }} />
    </div>
  );
}

// 로고 2~3개를 나란히 — 조합 자체가 "따라하면 되는 레시피"라는 신호가 된다(레퍼런스 120만).
function ArtLogos({ icons }: { icons?: string[] }) {
  const list = (icons?.length ? icons : ['claude', 'notion']).slice(0, 3);
  const size = list.length >= 3 ? 250 : 300;
  const gap = list.length >= 3 ? 56 : 96;
  const total = list.length * size + (list.length - 1) * gap;
  const x0 = Math.round((CARD_W - total) / 2);
  const y = 330;
  return (
    <div style={fill({ background: 'radial-gradient(ellipse at 50% 28%, #1B2233 0%, #0A0C11 70%)' })}>
      {list.map((it, i) => (
        <LogoTile key={i} src={iconUrl(it)} x={x0 + i * (size + gap)} y={y} size={size} pad={Math.round(size * 0.24)} />
      ))}
      {list.slice(1).map((_, i) => (
        <div
          key={`x${i}`}
          style={{
            position: 'absolute',
            left: x0 + (i + 1) * (size + gap) - gap,
            top: y + Math.round(size / 2) - 34,
            width: gap,
            display: 'flex',
            justifyContent: 'center',
            fontSize: fs(58),
            fontWeight: 700,
            color: 'rgba(255,255,255,0.42)',
          }}
        >
          ×
        </div>
      ))}
    </div>
  );
}

// 아이콘 자리를 ?로 가림 — 이 피드 최고 조회수(265만)가 쓴 방식. 정보를 덜 주는 쪽이 더 눌린다.
// artIcons를 주면 앞의 몇 칸만 실제 로고로 열어 "나머지는 뭐지"를 만든다.
function ArtMask({ icons }: { icons?: string[] }) {
  // 3×2 — 3줄로 깔면 마지막 줄이 스크림에 먹혀서 축소했을 때 얼룩으로 남는다
  const CELL = 290;
  const GAP = 36;
  const cols = 3;
  const rows = 2;
  const x0 = Math.round((CARD_W - (cols * CELL + (cols - 1) * GAP)) / 2);
  const y0 = 150;
  const shown = icons ?? [];
  return (
    <div style={fill({ background: 'radial-gradient(ellipse at 50% 24%, #191F2E 0%, #0A0C11 72%)' })}>
      {Array.from({ length: cols * rows }, (_, i) => {
        const x = x0 + (i % cols) * (CELL + GAP);
        const y = y0 + Math.floor(i / cols) * (CELL + GAP);
        const icon = shown[i];
        return icon ? (
          <LogoTile key={i} src={iconUrl(icon)} x={x} y={y} size={CELL} pad={62} />
        ) : (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: CELL,
              height: CELL,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 55,
              background: 'rgba(255,255,255,0.06)',
              border: '2px solid rgba(255,255,255,0.10)',
              fontSize: fs(104),
              fontWeight: 800,
              color: 'rgba(255,255,255,0.30)',
            }}
          >
            ?
          </div>
        );
      })}
    </div>
  );
}

// 3D 오브젝트 한 개 — coverImage에 투명배경 PNG(Fluent Emoji 3D · 3dicons 등)를 넣는다.
// 없으면 이리데슨트 구체로 떨어져서 빈 카드가 나가지 않는다.
function ArtObject({ image }: { image?: string }) {
  if (!image) return <ArtIri />;
  const size = 620;
  return (
    <div style={fill({ background: 'radial-gradient(ellipse at 50% 30%, #1A2130 0%, #07090E 72%)' })}>
      <div
        style={{
          position: 'absolute',
          left: Math.round((CARD_W - 840) / 2),
          top: 60,
          width: 840,
          height: 840,
          display: 'flex',
          background: 'radial-gradient(circle at 50% 50%, rgba(120,150,255,0.28) 0%, rgba(120,150,255,0) 62%)',
        }}
      />
      <img
        src={image}
        width={size}
        height={size}
        style={{
          position: 'absolute',
          left: Math.round((CARD_W - size) / 2),
          top: 170,
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

// 정밀 숫자 2개 — 반올림하지 않은 끝자리가 실제 데이터로 읽힌다(3만·5만은 광고로 읽힌다).
// artText 형식: "8시간 21분|세션 유지\n47회|하루 승인 요청"
function ArtNumbers({ text }: { text?: string }) {
  const rows = (text ?? '숫자|설명\n숫자|설명')
    .split('\n')
    .slice(0, 2)
    .map((l) => {
      const [value, label] = l.split('|');
      return { value: value?.trim() ?? '', label: label?.trim() ?? '' };
    });
  return (
    <div style={fill({ flexDirection: 'column', background: 'linear-gradient(160deg,#121826 0%,#07090E 68%)', padding: `120px ${V3_PAD}px` })}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', marginBottom: 56 }}>
          <div style={{ display: 'flex', fontSize: fs(146), fontWeight: 800, letterSpacing: '-0.05em', color: i === 0 ? '#C6F24E' : '#FFFFFF' }}>
            {r.value}
          </div>
          <div style={{ display: 'flex', fontSize: fs(38), fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
            {r.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function V3Art({ props }: { props: C1Input['props'] }) {
  switch (props.coverArt) {
    case 'logos':
      return <ArtLogos icons={props.artIcons} />;
    case 'mask':
      return <ArtMask icons={props.artIcons} />;
    case 'object':
      return <ArtObject image={props.coverImage} />;
    case 'numbers':
      return <ArtNumbers text={props.artText} />;
    case 'term':
      return <ArtTerm text={props.artText} />;
    case 'studio':
      return <ArtStudio />;
    case 'macro':
      return <ArtMacro />;
    case 'quote':
      return <ArtQuote text={props.artText} />;
    case 'iri':
      return <ArtIri />;
    case 'data':
      return <ArtData text={props.artText} />;
    default:
      return <ArtPhoto image={props.coverImage} overlay={props.overlay ?? 0.22} pos={props.coverPos} />;
  }
}

// ---------- 콘텐츠 썸네일(16:9) ----------
// 본가 카드는 썸네일을 16:9로 가운데 크롭한다(components/content/RelatedCarousel.tsx).
// 세로 커버(1080×1350)를 그대로 넣으면 v3의 핵심인 하단 블록이 통째로 잘려나가므로
// 같은 규격의 언어를 16:9에 다시 앉힌다 — 아트 → 스크림 → 아이브로우+2줄 → 바닥 워드마크.
export const THUMB_W = 1200;
export const THUMB_H = 675;

// 16:9는 세로 카드를 잘라 쓰는 게 아니라 **반으로 나눈다**.
// 아트를 확대해 들여다보면(첫 시도) 아트마다 주인공 위치가 달라서 어떤 건 머리가 잘리고
// 어떤 건 숫자가 스크림에 먹혔다. 오른쪽 540×675는 정확히 4:5 — 세로 아트를 0.5배로 줄이면
// 잘리는 데 없이 통째로 들어가고, 왼쪽은 글 전용이라 사진이 뭐가 오든 헤드라인이 안 죽는다.
const WIDE_ART_W = 540;
const WIDE_SCALE = WIDE_ART_W / CARD_W; // 0.5

function C1V3Wide({ accent, props }: C1Input) {
  const tone = v3Tone(props);
  const dark = tone === 'dark';
  const base = v3Base(props, dark);
  const eyebrow = props.kicker ?? props.tag ?? DEFAULT_TAGS[accent];
  const panelBg = dark ? '#07090E' : '#F3F4F6';
  const artX = THUMB_W - WIDE_ART_W;
  const isPhoto = !props.coverArt || props.coverArt === 'photo';
  return (
    <div
      style={{
        position: 'relative',
        width: THUMB_W,
        height: THUMB_H,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: FONT,
        wordBreak: 'keep-all',
        background: panelBg,
        color: dark ? '#fff' : INK,
      }}
    >
      {/* 오른쪽 — 아트 통째로 */}
      <div
        style={{
          position: 'absolute',
          left: artX,
          top: 0,
          width: WIDE_ART_W,
          height: THUMB_H,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {isPhoto ? (
          props.coverImage ? (
            <img
              data-bg="1"
              src={props.coverImage}
              width={WIDE_ART_W}
              height={THUMB_H}
              style={{ width: WIDE_ART_W, height: THUMB_H, objectFit: 'cover', objectPosition: props.coverPos ?? '50% 50%' }}
            />
          ) : (
            <div
              style={{
                width: WIDE_ART_W,
                height: THUMB_H,
                display: 'flex',
                background: 'linear-gradient(135deg,#232a3d 0%,#12151f 100%)',
              }}
            />
          )
        ) : (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: CARD_W,
              height: CARD_H,
              display: 'flex',
              transform: `scale(${WIDE_SCALE})`,
              transformOrigin: 'top left',
            }}
          >
            <V3Art props={props} />
          </div>
        )}
      </div>
      {/* 이음매 — 글 패널 쪽으로 아트를 흘려서 두 쪽이 갈라져 보이지 않게 한다 */}
      <div
        style={{
          position: 'absolute',
          left: artX - 1,
          top: 0,
          width: 150,
          height: THUMB_H,
          display: 'flex',
          background: `linear-gradient(to right, ${panelBg} 0%, ${dark ? 'rgba(7,9,14,0)' : 'rgba(243,244,246,0)'} 100%)`,
        }}
      />
      {/* 왼쪽 — 글 전용 */}
      <div
        style={{
          position: 'absolute',
          left: 56,
          bottom: 88,
          width: artX - 112,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: fs(22),
            fontWeight: 700,
            marginBottom: 16,
            color: dark ? 'rgba(255,255,255,0.66)' : '#6B7382',
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: fs(46),
            fontWeight: 800,
            letterSpacing: '-0.052em',
            color: dark ? '#fff' : INK,
          }}
        >
          {highlightLines(props.title, props.hl, { minHeight: 60 }, v3Hl(props, base, dark))}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 56, bottom: 40, display: 'flex' }}>
        <div
          style={{
            display: 'flex',
            fontSize: fs(18),
            fontWeight: 800,
            letterSpacing: '0.42em',
            color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(10,12,17,0.38)',
          }}
        >
          CASELAB
        </div>
      </div>
    </div>
  );
}

/** v3 형광펜 — box형은 톤에 따라 글자색이 갈린다(라임 위 흰 글씨는 안 읽힌다) */
function v3Hl(props: C1Input['props'], base: string, dark: boolean): CSSProperties {
  const s = hlSpan(props, base, dark);
  if (props.hlStyle && props.hlStyle !== 'box') return s;
  return { ...s, background: base, color: relLum(base) > 0.55 ? INK : '#fff' };
}

function C1V3({ accent, props }: C1Input) {
  const tone = v3Tone(props);
  const dark = tone === 'dark';
  const base = v3Base(props, dark);
  const eyebrow = props.kicker ?? props.tag ?? DEFAULT_TAGS[accent];
  return (
    <div style={{ ...cardBase, background: dark ? '#07090E' : '#F3F4F6', color: dark ? '#fff' : INK }}>
      <V3Art props={props} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: CARD_W,
          height: V3_SCRIM_H,
          display: 'flex',
          background: V3_SCRIM[tone],
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: V3_PAD,
          bottom: V3_BLOCK_BOTTOM,
          width: CARD_W - V3_PAD * 2,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: fs(V3_EYEBROW),
            fontWeight: 700,
            marginBottom: 26,
            color: dark ? 'rgba(255,255,255,0.66)' : '#6B7382',
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: fs(V3_HEADLINE),
            fontWeight: 800,
            letterSpacing: '-0.052em',
            color: dark ? '#fff' : INK,
          }}
        >
          {highlightLines(props.title, props.hl, { minHeight: Math.round(fs(V3_HEADLINE) * 1.24) }, v3Hl(props, base, dark))}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: V3_WM_BOTTOM,
          width: CARD_W,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: fs(V3_WM),
            fontWeight: 800,
            letterSpacing: '0.42em',
            paddingLeft: 11, // 자간이 마지막 글자 뒤에도 붙어서 그만큼 왼쪽으로 밀린다
            color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(10,12,17,0.38)',
          }}
        >
          CASELAB
        </div>
      </div>
    </div>
  );
}

// bottom — 기존 기본형(좌하단). titleAnchor로 세로 위치만 옮긴다.
function C1Bottom({ accent, props }: C1Input) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: '#1a1e2a', color: '#fff' }}>
      <PhotoBg image={props.coverImage} overlay={props.overlay ?? 0.28} pos={props.coverPos} />
      <div
        style={{
          position: 'relative',
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: 72,
        }}
      >
        <Topbar
          color="#fff"
          right={props.tag ?? DEFAULT_TAGS[accent]}
          rightStyle={{
            fontSize: fs(28),
            color: '#fff',
            opacity: 0.9,
            borderBottom: '2px solid rgba(255,255,255,0.7)',
            paddingBottom: 4,
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            ...(props.titleAnchor === 'top'
              ? { marginTop: 48 }
              : props.titleAnchor === 'center'
                ? { marginTop: 'auto', marginBottom: 'auto' }
                : { marginTop: 'auto' }),
          }}
        >
          {props.kicker ? (
            <div
              style={{
                display: 'flex',
                fontSize: fs(32),
                fontWeight: 700,
                color: 'rgba(255,255,255,0.88)',
                marginBottom: 22,
              }}
            >
              {props.kicker}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: fs(80),
              fontWeight: 800,
              letterSpacing: '-0.04em',
              textShadow: '0 2px 24px rgba(0,0,0,0.4)',
            }}
          >
            {highlightLines(props.title, props.hl, { minHeight: 100 }, hlSpan(props, color, true))}
          </div>
          {props.sub ? (
            <div style={{ fontSize: fs(34), fontWeight: 600, opacity: 0.92, marginTop: 24 }}>
              {props.sub}
            </div>
          ) : null}
          {props.footer ? (
            <div
              style={{
                display: 'flex',
                fontSize: fs(24),
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: 'rgba(255,255,255,0.62)',
                marginTop: 30,
              }}
            >
              {props.footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** 워드마크 — 포스터형·밴드형의 브랜드 마감. 상단 로고 줄을 안 쓰는 자리에 대신 선다 */
function Wordmark({ size = 30, alpha = 0.9 }: { size?: number; alpha?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        fontSize: size,
        fontWeight: 700,
        letterSpacing: '-0.01em',
        color: `rgba(255,255,255,${alpha})`,
      }}
    >
      caselab
    </div>
  );
}

// center — 가운데 정렬 포스터형. 상단은 태그 한 줄, 하단은 워드마크로 닫아 좌우·상하 대칭을 만든다.
// 사진이 밋밋하거나(그라데이션 폴백 포함) 제목이 짧은 소재에서 가장 안정적으로 서는 유형.
function C1Center({ accent, props }: C1Input) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: '#1a1e2a', color: '#fff' }}>
      <PhotoBg image={props.coverImage} overlay={props.overlay ?? 0.4} pos={props.coverPos} />
      <div
        style={{
          position: 'relative',
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '72px 84px 76px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: fs(26),
            fontWeight: 700,
            letterSpacing: '0.1em', // 한글은 0.2em을 주면 낱글자로 흩어져 읽힌다
            color: 'rgba(255,255,255,0.82)',
          }}
        >
          {props.tag ?? DEFAULT_TAGS[accent]}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 'auto',
            marginBottom: 'auto',
          }}
        >
          {props.kicker ? (
            <div
              style={{
                display: 'flex',
                fontSize: fs(32),
                fontWeight: 700,
                color: 'rgba(255,255,255,0.88)',
                marginBottom: 24,
              }}
            >
              {props.kicker}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              fontSize: fs(78),
              fontWeight: 800,
              letterSpacing: '-0.04em',
              textAlign: 'center',
              textShadow: '0 2px 24px rgba(0,0,0,0.45)',
            }}
          >
            {highlightLines(
              props.title,
              props.hl,
              { minHeight: 98, justifyContent: 'center' },
              hlSpan(props, color, true)
            )}
          </div>
          {props.sub ? (
            <div
              style={{
                display: 'flex',
                fontSize: fs(33),
                fontWeight: 600,
                opacity: 0.9,
                marginTop: 26,
                textAlign: 'center',
              }}
            >
              {props.sub}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {props.footer ? (
            <div
              style={{
                display: 'flex',
                fontSize: fs(24),
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: 'rgba(255,255,255,0.62)',
                marginBottom: 16,
              }}
            >
              {props.footer}
            </div>
          ) : null}
          <Wordmark />
        </div>
      </div>
    </div>
  );
}

// band — 상단 사진 + 하단 검은 밴드(레터박스). 인물·스크린샷처럼 사진이 복잡해서 글자가 묻히는
// 커버에서 유일하게 안전한 구조다(스크림을 아무리 깔아도 얼굴 위 흰 글씨는 안 읽힌다).
const C1_BAND_PHOTO = 800;

function C1Band({ accent, props }: C1Input) {
  const color = accentOf(accent, props);
  const label = props.label ?? props.kicker ?? props.tag ?? DEFAULT_TAGS[accent];
  const bodyH = CARD_H - C1_BAND_PHOTO;
  // 밴드 안 세로 예산: 상하 안전여백 72×2 + 라벨 52 + 간격 26 + (sub 62) 을 뺀 나머지가 제목 몫.
  // 블록은 밴드 안에서 세로 중앙 정렬한다 — 바닥에 붙이면 제목과 sub 사이가 텅 비어 두 덩어리로 읽힌다.
  const avail = bodyH - 144 - 52 - 26 - (props.sub ? 62 : 0);
  const fit = fitBlock([props.title], {
    width: BODY_W,
    height: avail,
    max: 68,
    min: 40,
    lineHeight: 1.26,
    gapRatio: 0,
  });
  return (
    <div style={{ ...cardBase, background: DARK_BG, color: '#fff' }}>
      <PhotoBand image={props.coverImage} height={C1_BAND_PHOTO} pos={props.coverPos} />
      <div
        style={{
          position: 'absolute',
          top: 54,
          left: 0,
          width: CARD_W,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Wordmark size={28} alpha={0.92} />
      </div>
      <div
        style={{
          position: 'relative',
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 72px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            alignItems: 'center',
            border: '2px solid rgba(255,255,255,0.5)',
            borderRadius: 999,
            padding: '8px 22px',
            fontSize: fs(25),
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.94)',
          }}
        >
          {label}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 26,
            fontSize: fit.size,
            fontWeight: 800,
            letterSpacing: '-0.035em',
          }}
        >
          {highlightLines(
            props.title,
            props.hl,
            { minHeight: Math.round(fit.size * 1.26) },
            hlSpan(props, color, true)
          )}
        </div>
        {props.sub ? (
          <div
            style={{
              display: 'flex',
              marginTop: 22,
              fontSize: fs(31),
              fontWeight: 600,
              color: 'rgba(255,255,255,0.72)',
            }}
          >
            {props.sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// giant — 상단을 비우고 하단 절반에 초대형 2줄. 짧고 센 헤드라인 전용(길면 자동으로 줄어든다).
const C1_GIANT_BLOCK = 470; // 헤드라인 블록 세로 예산

function C1Giant({ accent, props }: C1Input) {
  const color = accentOf(accent, props);
  const fit = fitBlock([props.title], {
    width: BODY_W,
    height: C1_GIANT_BLOCK,
    max: 126,
    min: 68,
    lineHeight: 1.14,
    gapRatio: 0,
  });
  return (
    <div style={{ ...cardBase, background: '#1a1e2a', color: '#fff' }}>
      <PhotoFull
        image={props.coverImage}
        pos={props.coverPos}
        overlay={props.overlay ?? 0.22}
        textTop={CARD_H - C1_GIANT_BLOCK - 120}
      />
      {/* 상단 비네트 — PhotoFull은 아래쪽만 눌러서 밝은 사진에선 topbar가 2.19:1로 안 읽힌다(검수 검출) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: CARD_W,
          height: Math.round(CARD_H * 0.18),
          display: 'flex',
          background: 'linear-gradient(180deg,rgba(0,0,0,0.5) 0%,rgba(0,0,0,0) 100%)',
        }}
      />
      <div
        style={{
          position: 'relative',
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '72px 72px 84px',
        }}
      >
        <Topbar
          color="#fff"
          right={props.tag ?? DEFAULT_TAGS[accent]}
          rightStyle={{ fontSize: fs(26), color: 'rgba(255,255,255,0.78)', letterSpacing: '0.06em' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
          {props.kicker ? (
            <div
              style={{
                display: 'flex',
                fontSize: fs(30),
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: 'rgba(255,255,255,0.86)',
                marginBottom: 20,
              }}
            >
              {props.kicker}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: fit.size,
              fontWeight: 800,
              letterSpacing: '-0.05em',
            }}
          >
            {highlightLines(
              props.title,
              props.hl,
              { minHeight: Math.round(fit.size * 1.14) },
              hlSpan(props, color, true)
            )}
          </div>
          {props.sub ? (
            <div
              style={{
                display: 'flex',
                fontSize: fs(32),
                fontWeight: 600,
                color: 'rgba(255,255,255,0.8)',
                marginTop: 22,
              }}
            >
              {props.sub}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------- C5 · 빅넘버 커버 (사진 실패 폴백형 — 사진은 텍스처, 숫자/단어가 주인공) ----------
function C5({ accent, props }: Extract<RenderSlideInput, { template: 'C5' }>) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: DARK_BG, color: '#fff' }}>
      <PhotoBg image={props.coverImage} overlay={props.overlay ?? 0.68} pos={props.coverPos} />
      <div
        style={{
          position: 'relative',
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: 72,
        }}
      >
        <Topbar color="#fff" right={DEFAULT_TAGS[accent]} rightStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: fs(26) }} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 'auto',
            marginBottom: 'auto',
          }}
        >
          {props.kicker ? (
            <div style={{ display: 'flex', fontSize: fs(34), fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
              {props.kicker}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              marginTop: 24,
              fontSize: fs(190),
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: '-0.045em',
              color,
            }}
          >
            {props.big}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: 30,
              fontSize: fs(44),
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.35,
            }}
          >
            {props.resolve.split('\n').map((line, i) => (
              <div key={i} style={{ display: 'flex', flexWrap: 'wrap' }}>
                {em(line, '#fff')}
              </div>
            ))}
          </div>
        </div>
        {props.footer ? (
          <div
            style={{
              display: 'flex',
              fontSize: fs(24),
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.58)',
            }}
          >
            {props.footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- B2 · 배너 + 불릿 (lead가 있으면 '개요' 모드) ----------
// 개요 모드: 이 장에서 가장 중요한 사실 한 줄(lead)이 큰 패널로 먼저 서고, 나머지는 번호 목록으로
// 뒷받침한다. 오버뷰 슬라이드가 모두 같은 굵기의 불릿이면 "무엇이 중요한지"가 안 보이기 때문.
const B2_BANNER = 48;
// 배너 높이는 글자 크기를 따라가야 한다 — 상수로 굳혀두면 textScale을 올렸을 때 글자가 배너를 넘는다
const b2BannerH = () => Math.round(fs(B2_BANNER) * 1.3) + 26; // 상하 패딩 13*2

function B2({ accent, props }: Extract<RenderSlideInput, { template: 'B2' }>) {
  const color = accentOf(accent, props);
  const lead = props.lead?.trim();
  const mediaH = props.media ? 372 : 0;

  // 세로 예산 — 패딩·톱바·이미지·배너를 뺀 나머지를 lead → 불릿 순으로 나눠 쓴다
  let rest = CARD_H - PAD_Y * 2 - TOPBAR_H - (mediaH ? mediaH + 40 : 0) - (40 + b2BannerH()) - 52;
  const leadFit = lead
    ? fitBlock([lead], {
        width: BODY_W - 96, // 좌측 바 8 + 좌우 패딩 44
        height: Math.min(rest * 0.46, 330),
        max: 58,
        min: 34,
        lineHeight: 1.3,
        gapRatio: 0,
      })
    : null;
  if (leadFit) rest -= leadFit.height + 68 + 36; // 패널 상하 패딩 34*2 + 아래 여백

  // 불릿 — 남은 공간을 채우는 최대 크기로. 개요 모드는 lead가 주인공이라 한 단계 작게.
  const gutter = lead ? 88 : 44; // 번호 칩 / 점 + 여백
  const fit = fitBlock(props.bullets, {
    width: BODY_W - gutter,
    height: Math.max(rest, 200),
    max: lead ? 40 : 48,
    min: 26,
    lineHeight: 1.5,
    gapRatio: 0.6,
    gapMaxRatio: 1.5,
  });
  const chip = Math.round(fit.size * 1.4);

  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: `${PAD_Y}px ${PAD_X}px` }}>
      <Topbar color={INK} right={props.page} />
      {props.media ? (
        <div
          style={{
            display: 'flex',
            marginTop: 40,
            width: '100%',
            height: mediaH,
            borderRadius: 20,
            overflow: 'hidden',
            background: '#EEF1F6',
            flexShrink: 0,
          }}
        >
          <img
            src={props.media}
            alt=""
            width={BODY_W}
            height={mediaH}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
          />
        </div>
      ) : null}
      {/* 배너~불릿을 한 덩어리로 묶어 남는 공간을 위아래로 나눠 갖는다 (아래만 텅 비던 문제) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          justifyContent: 'center',
          marginTop: 40,
        }}
      >
        <div style={{ display: 'flex', flexShrink: 0 }}>
          <span
            style={{
              background: color,
              color: '#fff',
              fontSize: fs(B2_BANNER),
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.3,
              padding: '13px 26px',
              borderRadius: 12,
            }}
          >
            {props.banner}
          </span>
        </div>
        {leadFit ? (
          <div
            style={{
              display: 'flex',
              marginTop: 36,
              flexShrink: 0,
              background: mixWithWhite(color, 0.07),
              borderLeft: `8px solid ${color}`,
              borderTopRightRadius: 18,
              borderBottomRightRadius: 18,
              padding: '34px 44px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                fontSize: leadFit.size,
                fontWeight: 800,
                lineHeight: 1.3,
                letterSpacing: '-0.025em',
              }}
            >
              {em(lead!, color)}
            </div>
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: fit.gap,
            marginTop: 52,
          }}
        >
          {props.bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: lead ? 26 : 22, alignItems: 'flex-start' }}>
              {lead ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: chip,
                    height: chip,
                    borderRadius: 12,
                    background: mixWithWhite(color, 0.12),
                    color,
                    fontSize: Math.round(fit.size * 0.62),
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    width: 16,
                    height: 16,
                    marginTop: Math.round(fit.size * 0.55),
                    borderRadius: 8,
                    background: color,
                    flexShrink: 0,
                  }}
                />
              )}
              {/* 폭을 명시 — Satori는 앞의 점·번호 칩을 빼지 않고 줄바꿈 폭을 잡아 오른쪽으로 삐져나간다 */}
              <div
                style={{
                  width: BODY_W - gutter,
                  fontSize: fit.size,
                  lineHeight: 1.5,
                  fontWeight: 500,
                  display: 'flex',
                  flexWrap: 'wrap',
                }}
              >
                {em(b, color)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- B5 · 잘된 것 / 별로였던 것 (caselab 시그니처) ----------
// ---------- B5 · 솔직 후기 (잘된 것 / 별로였던 것) ----------
//
// 2026-08-14 재디자인: 파스텔 라운드 패널 + 원형 ✓/✕ 배지는 프레임워크 alert 컴포넌트 룩이라
// 캐러셀에서 이 장만 "제품 UI"로 튀었다(운영자 피드백 "AI티"). 다크 편집 문법으로 교체 —
// 헤어라인 라벨(골드=잘된 것 / 코랄=별로였던 것) + 1px 구분선, 본문은 순백.
// 색은 라벨과 강조 1구절에만 쓴다 — 여러 군데 흩어지면 얼룩처럼 지저분해진다.
//
// layout: 'split'(사진 밴드 + 상하 2단) | 'versus'(좌우 대비). 재료가 짧으면 versus가 대칭으로
// 읽히고, 길면 split이 한 줄에 떨어진다. 미지정 시 항목 길이로 자동 선택.
const B5_GOLD = '#F2C75C';
const B5_CORAL = '#FF8F6B';
const B5_LABEL_EN = 'rgba(255,255,255,0.55)';
const B5_RULE = 'rgba(255,255,255,0.2)';
const B5_PAD = 78;
const B5_W = CARD_W - B5_PAD * 2;

/** 헤어라인 + 한글 라벨 + 영문 트래킹 — 원형 아이콘 배지를 대체 */
function ToneLabel({ ko, en, color }: { ko: string; en: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ display: 'flex', width: 30, height: 4, backgroundColor: color }} />
      <div style={{ display: 'flex', fontSize: fs(32), fontWeight: 800, color, letterSpacing: '-0.01em' }}>
        {ko}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: fs(19),
          fontWeight: 700,
          letterSpacing: '0.18em',
          color: B5_LABEL_EN,
        }}
      >
        {en}
      </div>
    </div>
  );
}

/** 항목 목록 — 현행이 빠뜨렸던 em() 처리를 넣는다(없으면 `**` 별표가 화면에 그대로 나갔다) */
function ToneItems({
  items,
  accent,
  size,
  gap,
  width,
}: {
  items: string[];
  accent: string;
  size: number;
  gap: number;
  width: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, marginTop: 20 }}>
      {items.map((t, i) => (
        <div key={i} style={{ display: 'flex', flexWrap: 'wrap', width }}>
          {em(t, accent, { fontSize: size, fontWeight: 600, color: '#fff', lineHeight: 1.42 })}
        </div>
      ))}
    </div>
  );
}

function B5({ props }: Extract<RenderSlideInput, { template: 'B5' }>) {
  const longest = Math.max(...[...props.good, ...props.bad].map((t) => stripMarks(t).length));
  const layout = props.layout ?? (longest <= 26 ? 'versus' : 'split');
  const goodLabel = props.goodLabel ?? '잘된 것';
  const badLabel = props.badLabel ?? '별로였던 것';

  if (layout === 'versus') {
    const colW = (CARD_W - B5_PAD * 2 - 52) / 2;
    // 두 열을 한 번에 재서 같은 크기로 — 열마다 글씨가 다르면 비교가 흐려진다
    const fit = fitBlock([...props.good, ...props.bad], {
      width: colW,
      height: 520,
      max: 44,
      min: 26,
      lineHeight: 1.36,
      gapRatio: 0.75,
      gapMaxRatio: 1.1,
    });
    const col = (label: string, en: string, color: string, items: string[]) => (
      <div style={{ display: 'flex', flexDirection: 'column', width: colW }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ display: 'flex', width: 26, height: 4, backgroundColor: color }} />
          <div style={{ display: 'flex', fontSize: fs(30), fontWeight: 800, color }}>{label}</div>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: fs(18),
            fontWeight: 700,
            letterSpacing: '0.18em',
            color: B5_LABEL_EN,
            marginBottom: 28,
          }}
        >
          {en}
        </div>
        <ToneItems items={items} accent={color} size={fit.size} gap={fit.gap} width={colW} />
      </div>
    );
    return (
      <div
        style={{
          ...cardBase,
          backgroundColor: DARK_BG,
          justifyContent: 'center',
          padding: `0 ${B5_PAD}px`,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: fs(58),
            fontWeight: 800,
            color: '#fff',
            letterSpacing: '-0.03em',
            marginBottom: 14,
          }}
        >
          {props.heading ?? '솔직 후기'}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: fs(25),
            fontWeight: 700,
            letterSpacing: '0.2em',
            color: B5_LABEL_EN,
            marginBottom: 62,
          }}
        >
          3개월 써보고 남은 것
        </div>
        <div style={{ display: 'flex', gap: 26 }}>
          {col(goodLabel, 'WORKED', B5_GOLD, props.good)}
          <div style={{ display: 'flex', width: 1, backgroundColor: B5_RULE }} />
          {col(badLabel, "DIDN'T", B5_CORAL, props.bad)}
        </div>
      </div>
    );
  }

  // split — 사진 밴드 + 상하 2단
  const bandH = 430;
  const inner = CARD_H - bandH - 64;
  const fit = fitBlock([...props.good, ...props.bad], {
    width: B5_W,
    height: inner - (36 + 20) * 2 - 80, // 라벨 2줄 + 구분선 여백
    max: 44,
    min: 27,
    lineHeight: 1.42,
    gapRatio: 0.3,
    gapMaxRatio: 0.5,
  });
  return (
    <div style={{ ...cardBase, backgroundColor: '#000' }}>
      <PhotoBand image={props.image} height={bandH} pos={props.coverPos} />
      {/* 라벨 전용 스크림 — 밴드 그라데이션만으론 밝은 사진에서 2.7:1까지 떨어진다(검수 검출).
          사진을 고를 수 없는 자동 파이프라인이라, 글자가 놓이는 자리는 배경을 확정해 둔다. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: CARD_W,
          height: 190,
          display: 'flex',
          backgroundImage: 'linear-gradient(180deg,rgba(0,0,0,0.78) 0%,rgba(0,0,0,0.42) 55%,rgba(0,0,0,0) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: B5_PAD,
          top: 74,
          display: 'flex',
          fontSize: fs(27),
          fontWeight: 700,
          letterSpacing: '0.22em',
          color: '#fff',
        }}
      >
        {props.heading ?? '솔직 후기'}
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: `0 ${B5_PAD}px 64px`,
          backgroundColor: '#000',
        }}
      >
        <ToneLabel ko={goodLabel} en="WORKED" color={B5_GOLD} />
        <ToneItems items={props.good} accent={B5_GOLD} size={fit.size} gap={fit.gap} width={B5_W} />
        {/* 구분선은 borderTop으로 — 높이 1px짜리 독립 div는 Satori가 점으로 찌그러뜨린다(실측).
            RuleList가 borderTop을 쓰는 것과 같은 이유. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderTop: `1px solid ${B5_RULE}`,
            marginTop: 40,
            paddingTop: 40,
          }}
        >
          <ToneLabel ko={badLabel} en="DIDN'T" color={B5_CORAL} />
          <ToneItems items={props.bad} accent={B5_CORAL} size={fit.size} gap={fit.gap} width={B5_W} />
        </div>
      </div>
    </div>
  );
}

const DARK_BG = '#12151C';
const DARK_KW = '#8EB0FF'; // card--dark .kw

// 다크 카드용 필 배지 (C2·C3·C4 우상단)
function pillStyle(): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(255,255,255,0.12)',
    border: '1.5px solid rgba(255,255,255,0.28)',
    borderRadius: 999,
    padding: '9px 20px',
    fontSize: fs(25),
    fontWeight: 600,
    color: '#fff',
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ---------- C2 · 문장형 다크 커버 ----------
function C2({ accent, props }: Extract<RenderSlideInput, { template: 'C2' }>) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: DARK_BG, color: '#fff', padding: '80px 72px' }}>
      <Topbar color="#fff" right={props.pill ?? `⚡ ${DEFAULT_TAGS[accent]}`} rightStyle={pillStyle()} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 'auto',
          marginBottom: 'auto',
        }}
      >
        {props.eyebrow ? (
          <div
            style={{
              display: 'flex',
              fontSize: fs(30),
              fontWeight: 600,
              color: 'rgba(255,255,255,0.78)',
              marginBottom: 24,
            }}
          >
            {props.eyebrow}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: fs(66),
            fontWeight: 800,
            letterSpacing: '-0.035em',
          }}
        >
          {highlightLines(
            props.title,
            props.hl,
            { minHeight: 82 },
            hlSpan(props, color, true)
          )}
        </div>
      </div>
      {props.sub ? (
        <div style={{ display: 'flex', fontSize: fs(36), lineHeight: 1.55, color: 'rgba(255,255,255,0.72)' }}>
          {props.sub}
        </div>
      ) : null}
    </div>
  );
}

// ---------- C3 · 툴/뉴스 커버 (로고 배지 중앙) ----------
function C3({ accent, props }: Extract<RenderSlideInput, { template: 'C3' }>) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: DARK_BG, color: '#fff', padding: '80px 72px' }}>
      <Topbar color="#fff" right={props.pill ?? `🔧 ${DEFAULT_TAGS[accent]}`} rightStyle={pillStyle()} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: 'auto',
          marginBottom: 'auto',
        }}
      >
        {props.logoText ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 180,
              height: 180,
              borderRadius: 40,
              background: 'rgba(255,255,255,0.08)',
              border: '1.5px solid rgba(255,255,255,0.18)',
              fontSize: fs(64),
              fontWeight: 800,
              marginBottom: 44,
            }}
          >
            {props.logoText}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontSize: fs(66),
            fontWeight: 800,
            letterSpacing: '-0.035em',
            textAlign: 'center',
          }}
        >
          {highlightLines(
            props.title,
            props.hl,
            { minHeight: 82, justifyContent: 'center' },
            hlSpan(props, color, true)
          )}
        </div>
      </div>
      {props.sub ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            fontSize: fs(36),
            lineHeight: 1.55,
            color: 'rgba(255,255,255,0.72)',
          }}
        >
          {props.sub}
        </div>
      ) : null}
    </div>
  );
}

// ---------- C4 · VS 비교 커버 ----------
function C4({ accent, props }: Extract<RenderSlideInput, { template: 'C4' }>) {
  const color = accentOf(accent, props);
  const vsBox: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flexGrow: 1,
    flexBasis: 0,
    background: 'rgba(255,255,255,0.06)',
    border: '1.5px solid rgba(255,255,255,0.16)',
    borderRadius: 28,
    padding: '48px 40px',
    textAlign: 'center',
  };
  return (
    <div style={{ ...cardBase, background: DARK_BG, color: '#fff', padding: '80px 72px' }}>
      <Topbar color="#fff" right={props.pill ?? '🔧 도구 비교'} rightStyle={pillStyle()} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 'auto',
          marginBottom: 'auto',
        }}
      >
        {props.eyebrow ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              fontSize: fs(30),
              fontWeight: 600,
              color: 'rgba(255,255,255,0.78)',
              marginBottom: 40,
            }}
          >
            {props.eyebrow}
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          {[props.vsA, null, props.vsB].map((side, i) =>
            side === null ? (
              <span key={i} style={{ fontSize: fs(48), fontWeight: 800, color }}>
                VS
              </span>
            ) : (
              <div key={i} style={vsBox}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    fontSize: fs(52),
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    textAlign: 'center',
                  }}
                >
                  {side.name.split('\n').map((l, li) => (
                    <span key={li}>{l}</span>
                  ))}
                </div>
                {side.by ? (
                  <div style={{ fontSize: fs(30), color: 'rgba(255,255,255,0.7)', marginTop: 10 }}>
                    {side.by}
                  </div>
                ) : null}
              </div>
            )
          )}
        </div>
      </div>
      {props.sub ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            fontSize: fs(36),
            lineHeight: 1.55,
            color: 'rgba(255,255,255,0.72)',
          }}
        >
          {props.sub}
        </div>
      ) : null}
    </div>
  );
}

// ---------- B1 · 개요·타임라인 리스트 ----------
const B1_ROW_H = 90; // 점(40)·term(44*1.3)·상하 패딩 16*2 기준 한 줄 높이

function B1({ accent, props }: Extract<RenderSlideInput, { template: 'B1' }>) {
  const color = accentOf(accent, props);
  // 항목 간격만 남는 공간에서 (상한까지) 키우고, 덩어리 전체는 세로 가운데로.
  // Satori는 space-evenly를 모르므로 간격을 직접 계산한다.
  const leadH = props.lead ? 52 + lineCount(props.lead, 34, BODY_W) * 34 * 1.55 : 0;
  const listH = CARD_H - PAD_Y * 2 - TOPBAR_H - leadH - (36 + 75) - 40;
  const rowGap = Math.max(
    0,
    Math.min(30, (listH - B1_ROW_H * props.rows.length) / Math.max(1, props.rows.length - 1))
  );
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      <Topbar color={INK} right={props.page} />
      {/* 도입~타임라인을 한 덩어리로 — 선이 카드 바닥까지 늘어지지 않게 목록은 내용만큼만 차지한다 */}
      <div
        style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}
      >
      {props.lead ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            marginTop: 0,
            fontSize: fs(34),
            lineHeight: 1.55,
            color: MUTED,
          }}
        >
          {em(props.lead, INK)}
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 36,
          fontSize: fs(60),
          fontWeight: 800,
          letterSpacing: '-0.035em',
        }}
      >
        {highlightLines(
          props.heading,
          props.hl,
          { minHeight: 75 },
          hlSpan(props, color, false)
        )}
      </div>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: Math.round(rowGap),
          marginTop: 40,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 19,
            top: 18,
            bottom: 18,
            width: 3,
            background: `linear-gradient(180deg,${color},rgba(0,0,0,0.08))`,
            borderRadius: 2,
            display: 'flex',
          }}
        />
        {props.rows.map((r, i) => (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 26, padding: '16px 0' }}
          >
            <div
              style={{
                display: 'flex',
                width: 40,
                height: 40,
                borderRadius: 20,
                background: color,
                boxShadow: `0 0 0 8px ${hexToRgba(color, 0.16)}`,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: fs(44), fontWeight: 800, letterSpacing: '-0.02em' }}>{r.term}</span>
            {r.desc ? <span style={{ fontSize: fs(32), color: MUTED }}>{r.desc}</span> : null}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

// ---------- B3 · 용어·정의 카드 ----------
function B3({ accent, props }: Extract<RenderSlideInput, { template: 'B3' }>) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      <Topbar color={INK} right={props.page} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          justifyContent: 'center', // 본문 블록 세로 가운데 — B2·B5·B6과 동일 규칙
        }}
      >
        <div style={{ display: 'flex' }}>
          <span
            style={{
              background: color,
              color: '#fff',
              fontSize: fs(26),
              fontWeight: 800,
              letterSpacing: '0.06em',
              padding: '10px 22px',
              borderRadius: 999,
            }}
          >
            {props.badge ?? '30초 개념'}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: fs(96),
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
            color,
            marginTop: 36,
          }}
        >
          {props.term}
        </div>
        {props.termEn ? (
          <div style={{ display: 'flex', fontSize: fs(36), color: MUTED, marginTop: 12 }}>
            {props.termEn}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            width: 120,
            height: 6,
            background: color,
            borderRadius: 3,
            marginTop: 44,
            marginBottom: 44,
          }}
        />
        <div
          style={{
            display: 'flex',
            fontSize: fs(50),
            fontWeight: 800,
            lineHeight: 1.35,
            letterSpacing: '-0.02em',
          }}
        >
          {props.lead}
        </div>
        {props.body ? (
          /* 부연은 흐린 회색 32px이라 폰에서 거의 안 읽혔다 — 본문색·36px로 */
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              marginTop: 30,
              fontSize: fs(36),
              lineHeight: 1.6,
              color: BODY_TEXT,
            }}
          >
            {em(props.body, color)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- B4 · 인용/선언 카드 (사진 위 한 문장) ----------
function B4({ accent, props }: Extract<RenderSlideInput, { template: 'B4' }>) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: '#1c2740', color: '#fff' }}>
      <PhotoBg image={props.coverImage} overlay={props.overlay ?? 0.45} pos={props.coverPos} />
      <div
        style={{
          position: 'relative',
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 72,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontSize: fs(60),
            fontWeight: 800,
            lineHeight: 1.22,
            letterSpacing: '-0.035em',
            textAlign: 'center',
            textShadow: '0 2px 24px rgba(0,0,0,0.4)',
          }}
        >
          {highlightLines(
            props.title,
            props.hl,
            { minHeight: 75, justifyContent: 'center' },
            hlSpan(props, color, true)
          )}
        </div>
        {props.attribution ? (
          <div style={{ display: 'flex', fontSize: fs(34), fontWeight: 600, opacity: 0.8, marginTop: 36 }}>
            {props.attribution}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- B6 · 스텝 프로세스 ----------
function B6({ accent, props }: Extract<RenderSlideInput, { template: 'B6' }>) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      <Topbar color={INK} right={props.page} />
      {/* 제목~스텝을 한 덩어리로 묶어 남는 공간을 위아래로 나눠 갖는다 */}
      <div
        style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}
      >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontSize: fs(54),
          fontWeight: 800,
          letterSpacing: '-0.035em',
        }}
      >
        {highlightLines(
          props.heading,
          props.hl,
          { minHeight: 68 },
          hlSpan(props, color, false)
        )}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          marginTop: 44,
        }}
      >
        {props.steps.map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 28,
              background: '#F5F7FB',
              borderRadius: 18,
              padding: '32px 36px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 78,
                height: 78,
                borderRadius: 20,
                background: color,
                color: '#fff',
                fontSize: fs(38),
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: fs(42), fontWeight: 800, letterSpacing: '-0.02em' }}>
                {s.title}
              </span>
              {s.desc ? (
                <span style={{ fontSize: fs(31), color: BODY_TEXT, marginTop: 8 }}>{s.desc}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

// ---------- B7 · 숫자 하이라이트 (다크) ----------
function B7({ props }: Extract<RenderSlideInput, { template: 'B7' }>) {
  return (
    <div style={{ ...cardBase, background: DARK_BG, color: '#fff', padding: '80px 72px' }}>
      <Topbar color="#fff" right={props.page} rightStyle={{ color: 'rgba(255,255,255,0.6)' }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          justifyContent: 'center', // 본문 블록 세로 가운데 — B2·B5·B6과 동일 규칙
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span
            style={{ fontSize: fs(220), fontWeight: 800, lineHeight: 1, letterSpacing: '-0.05em', color: DARK_KW }}
          >
            {props.big}
          </span>
          {props.unit ? (
            <span style={{ fontSize: fs(90), fontWeight: 800, color: DARK_KW }}>{props.unit}</span>
          ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 20,
            fontSize: fs(44),
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1.35,
          }}
        >
          {props.cap.split('\n').map((line, i) => (
            <div key={i} style={{ display: 'flex', flexWrap: 'wrap' }}>
              {em(line, DARK_KW)}
            </div>
          ))}
        </div>
        {props.sub ? (
          <div
            style={{
              display: 'flex',
              marginTop: 18,
              fontSize: fs(34),
              lineHeight: 1.55,
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            {props.sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- B8 · 프롬프트 블록 ----------
// [변수]는 초록, '#' 시작 줄은 주석색. 모노스페이스 폰트는 미벤더링 — Pretendard로 렌더.
function promptLine(line: string): ReactNode[] {
  if (line.trimStart().startsWith('#')) {
    return [
      <span key="c" style={{ color: '#5E7BB5', whiteSpace: 'pre-wrap' }}>
        {line}
      </span>,
    ];
  }
  return line.split(/(\[[^\]]+\])/g).map((seg, i) => (
    <span
      key={i}
      style={{ color: seg.startsWith('[') ? '#7CE1B0' : '#D7E0F5', whiteSpace: 'pre-wrap' }}
    >
      {seg}
    </span>
  ));
}

// 8자리 hex 알파 — Satori가 rgba() 대신 #RRGGBBAA도 받는다. accent에 투명도 입힐 때 사용.
function hexA(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

function B8({ accent, props }: Extract<RenderSlideInput, { template: 'B8' }>) {
  const color = accentOf(accent, props);
  const promptBox = (fontSize: number) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginTop: 36,
        background: '#0F1320',
        borderRadius: 20,
        padding: '40px 44px',
        fontSize,
        lineHeight: 1.7,
      }}
    >
      {props.lines.map((line, i) => (
        <div key={i} style={{ display: 'flex', flexWrap: 'wrap' }}>
          {promptLine(line)}
        </div>
      ))}
    </div>
  );

  // 신레이아웃 — 다크 프리미엄. 흰 카드+파란 박스가 "AI 생성 티"의 주범이라 OLED 블랙으로 전환
  // (운영자 결정 2026-08-24). 한 세트에 B8이 연속 3장씩 나오므로 페이지 번호로 3변형 로테이션:
  // 0 터미널(신호등 헤더) · 1 스크립트(accent 세로바) · 2 라인넘버. 정보 구조는 동일, 껍데기만 다르다.
  if (props.patternName) {
    const variant =
      (parseInt((props.page ?? '').split('/')[0], 10) ||
        parseInt((props.badge ?? '').replace(/\D/g, ''), 10) ||
        0) % 3;
    // 이중 베젤: 유리판(inner)을 알루미늄 트레이(outer)에 얹은 구조 — 평평한 단색 박스 금지
    const outerShell: CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      marginTop: 40,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 30,
      padding: 8,
    };
    const innerCore: CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      background: variant === 2 ? '#1B1E26' : '#14171F',
      borderRadius: 23,
      borderTop: '1px solid rgba(255,255,255,0.09)',
      padding: '34px 40px',
      fontSize: fs(30),
      lineHeight: 1.75,
    };
    // 배경 오브 — 변형마다 위치·색이 달라 연속 장이 같은 판박이로 안 보인다
    const orbPos =
      variant === 0 ? 'at 85% 8%' : variant === 1 ? 'at 8% 92%' : 'at 50% -10%';
    return (
      <div
        style={{
          ...cardBase,
          background: '#050505',
          backgroundImage: `radial-gradient(circle ${orbPos}, ${hexA(color, 0.16)} 0%, rgba(5,5,5,0) 55%)`,
          color: '#F4F6FB',
          padding: '80px 72px',
        }}
      >
        <Topbar color="#F4F6FB" right={props.page} rightStyle={{ color: 'rgba(244,246,251,0.45)' }} />
        {/* 배지~프롬프트 박스를 한 덩어리로 묶어 남은 공간 세로 중앙에 — 상단 쏠림·중간 구멍 둘 다 방지 */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 'auto' }}>
        <div style={{ display: 'flex' }}>
          <span
            style={{
              background: hexA(color, 0.14),
              border: `1px solid ${hexA(color, 0.45)}`,
              color,
              fontSize: fs(23),
              fontWeight: 800,
              letterSpacing: '0.14em',
              padding: '10px 24px',
              borderRadius: 999,
            }}
          >
            {props.badge ?? '프롬프트 패턴'}
          </span>
        </div>
        {props.patternEn ? (
          /* 영어 패턴명 원문이 주인공, 한글 제목은 아래 부제 (운영자 결정 2026-07-21) */
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 30 }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                fontSize: fs(58),
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1.12,
              }}
            >
              {props.patternEn}
            </div>
            <div style={{ display: 'flex', marginTop: 14, fontSize: fs(35), fontWeight: 700, color: 'rgba(244,246,251,0.66)' }}>
              {props.patternName}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              marginTop: 30,
              fontSize: fs(64),
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 1.15,
            }}
          >
            {props.patternName}
          </div>
        )}
        {props.when ? (
          <div style={{ display: 'flex', marginTop: 20, fontSize: fs(33), lineHeight: 1.5, color: 'rgba(244,246,251,0.55)' }}>
            <span>{`"${props.when}"`}</span>
          </div>
        ) : null}
        {/* 효과/설명은 패턴 소개의 일부 — 프롬프트 맛보기보다 위 (운영자 결정 2026-07-21) */}
        {props.effect ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 24,
              fontSize: fs(33),
              fontWeight: 700,
              color,
            }}
          >
            {/* ✦ 글리프는 twemoji 치환으로 깨짐 → CSS 다이아몬드 */}
            <div
              style={{
                display: 'flex',
                width: 16,
                height: 16,
                background: color,
                transform: 'rotate(45deg)',
                borderRadius: 3,
                flexShrink: 0,
              }}
            />
            <span>{props.effect}</span>
          </div>
        ) : null}
        <div style={outerShell}>
          {variant === 0 ? (
            /* 터미널 헤더 — 신호등 3점 + 파일명 */
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '18px 26px 14px',
              }}
            >
              {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
                <div key={c} style={{ display: 'flex', width: 18, height: 18, borderRadius: 999, background: c }} />
              ))}
              <span style={{ fontSize: fs(24), fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(244,246,251,0.4)', marginLeft: 10 }}>
                prompt.md
              </span>
            </div>
          ) : variant === 1 ? (
            <div style={{ display: 'flex', alignItems: 'center', padding: '18px 26px 14px' }}>
              <span style={{ fontSize: fs(22), fontWeight: 700, letterSpacing: '0.22em', color: hexA(color, 0.85) }}>
                ACTUAL PROMPT
              </span>
            </div>
          ) : null}
          {/* undefined 값을 style에 넣으면 Satori가 조용히 죽는다 — 조건부 스프레드로만 추가 */}
          <div style={{ ...innerCore, ...(variant === 1 ? { borderLeft: `5px solid ${color}` } : {}) }}>
            {props.lines.map((line, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {variant === 2 ? (
                    <span style={{ color: 'rgba(244,246,251,0.28)', whiteSpace: 'pre', fontWeight: 600 }}>
                      {`${String(i + 1).padStart(2, '0')}  `}
                    </span>
                  ) : null}
                  {promptLine(line)}
                </div>
                {/* 영·한 병기 — 원문 줄 아래 작은 한글 번역 (linesKo가 있을 때만) */}
                {props.linesKo?.[i] ? (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      fontSize: fs(23),
                      lineHeight: 1.5,
                      color: 'rgba(244,246,251,0.42)',
                      marginBottom: 14,
                      paddingLeft: variant === 2 ? 52 : 0,
                    }}
                  >
                    {props.linesKo[i]}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        </div>
        {props.ctaLine ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 'auto',
              alignSelf: 'flex-start',
              background: hexA(color, 0.1),
              border: `2px solid ${hexA(color, 0.35)}`,
              borderRadius: 16,
              padding: '24px 30px',
              fontSize: fs(31),
              fontWeight: 700,
              color: '#F4F6FB',
            }}
          >
            {props.ctaLine}
          </div>
        ) : null}
      </div>
    );
  }

  // 레거시 레이아웃 (구 저장분 렌더 호환)
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      <Topbar color={INK} right={props.page} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 44,
          fontSize: fs(52),
          fontWeight: 800,
          letterSpacing: '-0.035em',
        }}
      >
        {highlightLines(
          props.heading ?? '오늘의 프롬프트',
          props.hl ?? '프롬프트',
          { minHeight: 65 },
          hlSpan(props, color, false)
        )}
      </div>
      {promptBox(31)}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginTop: 26,
          fontSize: fs(30),
          fontWeight: 600,
          color,
        }}
      >
        {props.tip ?? props.ctaLine ?? '📌 저장해두고 필요할 때 다시 보기'}
      </div>
    </div>
  );
}

// ---------- B9 · 스크린샷 스포트라이트 ----------
const CALLOUT_POS: Record<'tl' | 'tr' | 'bl' | 'br', CSSProperties> = {
  tl: { top: 60, left: 60 },
  tr: { top: 60, right: 60 },
  bl: { bottom: 60, left: 60 },
  br: { bottom: 60, right: 60 },
};

function B9({ accent, props }: Extract<RenderSlideInput, { template: 'B9' }>) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      {props.bare ? null : <Topbar color={INK} right={props.page} />}
      {/* 짧은 리드는 설명문이 아니라 헤드라인이다 → 크고 굵게.
          폰에서 캐러셀은 엄지로 넘기며 스치듯 보는데, 34px 설명체로 길게 적으면 아무도 안 읽는다.
          긴 리드(기존 스크린샷 슬라이드)는 그대로 34px 본문으로 남는다. */}
      {props.lead ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            marginTop: 40,
            fontSize: fs(stripMarks(props.lead).length <= 16 ? 72 : 34),
            fontWeight: stripMarks(props.lead).length <= 16 ? 800 : 400,
            lineHeight: stripMarks(props.lead).length <= 16 ? 1.26 : 1.55,
            letterSpacing: stripMarks(props.lead).length <= 16 ? '-0.03em' : '0',
            color: stripMarks(props.lead).length <= 16 ? INK : BODY_TEXT,
          }}
        >
          {em(props.lead, color, {
            fontWeight: stripMarks(props.lead).length <= 16 ? 800 : 400,
          })}
        </div>
      ) : null}
      {/* 스크린샷은 남는 세로를 다 쓴다 — 작게 박아두면 폰에서 아무것도 안 보인다 */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          marginTop: 36,
          width: '100%',
          flexGrow: 1,
          borderRadius: 22,
          overflow: 'hidden',
          background: '#E9EDF4',
        }}
      >
        <img
          src={props.shot}
          alt=""
          width={BODY_W}
          height={860}
          style={{ objectFit: 'cover', width: '100%', height: '100%' }}
        />
        {(props.callouts ?? []).map((c, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              ...CALLOUT_POS[c.pos],
              display: 'flex',
              background: color,
              color: '#fff',
              fontSize: fs(30),
              fontWeight: 700,
              padding: '16px 24px',
              borderRadius: 14,
              boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
            }}
          >
            {c.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// P 계열 — 사진 편집형 본문 템플릿
//
// 왜 필요한가: 벤치마크(@doseodam_ 48장 전수 + 2026-08 레퍼런스 4건)는 커버뿐 아니라
// **모든 장**이 사진 기반이다(photo-hook 69%). 우리는 스크림·빅넘버 룰을 커버(C1·C5)에만
// 적용해서, 캐러셀 2장째부터 흰 배경 + 알약 배지 + 불릿 점으로 떨어졌다 → "제품 UI" 인상.
// 여기서 라벨은 헤어라인 + 트래킹 텍스트, 목록은 번호 + 1px 구분선, 강조는 카드당 1구절로 바꾼다.
//
// 대비 불변식: P 계열 텍스트는 **반드시 스크림 위에** 올린다. 사진 밝기는 통제할 수 없고
// (Unsplash 자동 채택), 밝은 사진 + 흰 글씨는 조용히 안 읽히는 카드를 만든다.
// scripts/cardpress-verify.mjs가 렌더 PNG의 글자/배경 대비를 실측해 4.5:1 미만이면 실패시킨다.
// ============================================================

// 골드 — ==강조==의 고정색(둘째 강조 축, 썸네일 문법). **강조**는 P계열 포함 어디서나
// accentOf(카테고리 기본색 ?? accentColor 오버라이드) = 편집기 툴바 "A 포인트색"과 일치
// (운영자 요청 2026-08-30 — "포인트색을 눌러도 골드가 나옴" 정정. 골드 고정은 ==로 이관).
const PHOTO_ACCENT = '#E8B857';
const P_TEXT = '#FFFFFF';
const P_TEXT_2 = 'rgba(255,255,255,0.90)'; // 부본문 — 0.7대로 내리면 사진 위에서 대비가 무너진다
const P_TEXT_3 = 'rgba(255,255,255,0.66)'; // eyebrow 전용(작고 짧은 텍스트만)
const P_RULE = 'rgba(255,255,255,0.18)';
const P_PAD = 78;
const P_W = CARD_W - P_PAD * 2; // 924

/** P 계열 강조색 — 기본 골드, 슬라이드별 accentColor 오버라이드 허용 */
function photoAccent(props: { accentColor?: string }): string {
  return props.accentColor && /^#[0-9a-fA-F]{6}$/.test(props.accentColor)
    ? props.accentColor
    : PHOTO_ACCENT;
}

/** 사진 밴드 + 하단으로 갈수록 검게 떨어지는 스크림. 밝은 사진이 와도 블랙 패널과 이어붙는다. */
function PhotoBand({ image, height, pos }: { image?: string; height: number; pos?: string }) {
  return (
    <div
      style={{
        width: CARD_W,
        height,
        display: 'flex',
        backgroundImage: 'linear-gradient(135deg,#232a3d 0%,#12151f 100%)',
      }}
    >
      {/* 사진은 <img>+objectFit로만 — 배경 CSS는 크기 지정이 통째로 무시되고 원본 크기로 타일링된다.
          px를 명시해도 마찬가지(2026-08-13 실측: 512×768 사진이 660px 밴드에서 2×2로 반복). */}
      {image ? (
        <img
          src={image}
          width={CARD_W}
          height={height}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: CARD_W,
            height,
            objectFit: 'cover',
            objectPosition: pos ?? '50% 50%',
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: CARD_W,
          height,
          display: 'flex',
          // 상단 0.46 — 밴드 위에 라벨을 올리는 템플릿(B5 split)이 있어 상단 대비를 확보해야 한다.
          // 0.30이던 시절 밝은 사진에서 "솔직 후기" 라벨이 2.01:1로 안 읽혔다(검수 스크립트 검출).
          backgroundImage:
            'linear-gradient(180deg,rgba(0,0,0,0.46) 0%,rgba(0,0,0,0.14) 44%,rgba(0,0,0,0.72) 86%,rgba(0,0,0,1) 100%)',
        }}
      />
    </div>
  );
}

/** 전면 사진 + 텍스트 영역 보장 스크림. textTop 위쪽부터 검게 눌러 흰 글씨 대비를 확보한다. */
function PhotoFull({
  image,
  pos,
  overlay,
  textTop,
}: {
  image?: string;
  pos?: string;
  overlay: number;
  textTop: number;
}) {
  return (
    <>
      {image ? (
        <img
          src={image}
          width={CARD_W}
          height={CARD_H}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: CARD_W,
            height: CARD_H,
            objectFit: 'cover',
            objectPosition: pos ?? '50% 50%',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: CARD_W,
            height: CARD_H,
            display: 'flex',
            backgroundImage: 'linear-gradient(135deg,#232a3d 0%,#12151f 100%)',
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: CARD_W,
          height: CARD_H,
          display: 'flex',
          background: `rgba(0,0,0,${overlay})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: Math.max(0, textTop - 220),
          width: CARD_W,
          height: CARD_H - Math.max(0, textTop - 220),
          display: 'flex',
          backgroundImage:
            'linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0.62) 34%,rgba(0,0,0,0.88) 62%,rgba(0,0,0,0.95) 100%)',
        }}
      />
    </>
  );
}

/** 헤어라인 + 트래킹 라벨 — 알약 배지를 대체한다(배지는 프레임워크 UI 인상의 주범) */
function Eyebrow({ text, centered, color }: { text: string; centered?: boolean; color?: string }) {
  const rule = (
    <div style={{ display: 'flex', width: 46, height: 1, backgroundColor: 'rgba(255,255,255,0.34)' }} />
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      {centered ? rule : null}
      <div
        style={{
          display: 'flex',
          fontSize: fs(22),
          fontWeight: 700,
          letterSpacing: '0.2em',
          color: color ?? P_TEXT_3,
        }}
      >
        {text}
      </div>
      {centered ? rule : null}
    </div>
  );
}

/** 번호 + 1px 구분선 목록 — 불릿 점을 대체 */
function RuleList({
  items,
  size,
  gap,
  accent,
}: {
  items: string[];
  size: number;
  gap: number;
  accent: string;
}) {
  const pad = Math.round(gap / 2);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {items.map((t, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 24,
            paddingTop: i === 0 ? 0 : pad,
            paddingBottom: pad,
            // 'none' 명시 — undefined 값은 Satori 스타일 파서를 죽인다(P1·P5 응답이 통째로 끊겼던 원인)
            borderTop: i === 0 ? 'none' : `1px solid ${P_RULE}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: Math.round(size * 0.58),
              fontWeight: 800,
              letterSpacing: '0.1em',
              color: accent,
              paddingTop: Math.round(size * 0.24),
            }}
          >
            {String(i + 1).padStart(2, '0')}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              width: P_W - 70,
              lineHeight: 1.4,
            }}
          >
            {em(t, accent, { fontSize: size, fontWeight: 500, color: P_TEXT_2, lineHeight: 1.4 })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- B10/B18 · 미니 에디토리얼 — 작은 활자 밀도형 (B18 = 다크 트윈) ----------
// 다른 B가 "크게 한 방"이면 이쪽은 잡지 칼럼: 긴 설명을 안 자르고 작은 활자 2단으로 싣는다.
function EditorialMini({
  accent,
  props,
  dark,
}: {
  accent: CardAccent;
  props: Extract<RenderSlideInput, { template: 'B10' }>['props'];
  dark?: boolean;
}) {
  const color = accentOf(accent, props);
  const ink = dark ? '#F4F6FB' : INK;
  const bodyCol = dark ? 'rgba(244,246,251,0.72)' : BODY_TEXT;
  const ruleCol = dark ? 'rgba(255,255,255,0.14)' : 'rgba(20,22,28,0.12)';
  const muted = dark ? 'rgba(244,246,251,0.4)' : MUTED;
  const paras = props.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const twoCol = paras.length >= 2;
  const half = Math.ceil(paras.length / 2);
  const colStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    width: twoCol ? 444 : 936,
    gap: 26,
  };
  const para = (t: string, i: number) => (
    <div key={i} style={{ display: 'flex', flexWrap: 'wrap', fontSize: fs(twoCol ? 24 : 27), lineHeight: 1.8, color: bodyCol }}>
      {em(t, color)}
    </div>
  );
  return (
    <div
      style={{
        ...cardBase,
        background: dark ? '#050505' : '#fff',
        ...(dark
          ? { backgroundImage: `radial-gradient(circle at 88% 6%, ${hexA(color, 0.14)} 0%, rgba(5,5,5,0) 55%)` }
          : {}),
        color: ink,
        padding: '80px 72px',
      }}
    >
      <Topbar color={ink} right={props.page} />
      {props.eyebrow ? (
        <div style={{ display: 'flex', marginTop: 56, fontSize: fs(22), fontWeight: 700, letterSpacing: '0.2em', color }}>
          {props.eyebrow}
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: props.eyebrow ? 20 : 56, letterSpacing: '-0.02em' }}>
        {highlightLines(
          props.heading,
          props.hl,
          { fontSize: fs(46), fontWeight: 800, lineHeight: 1.25 },
          { whiteSpace: 'pre', color }
        )}
      </div>
      <div style={{ display: 'flex', marginTop: 36, height: 1, width: '100%', background: ruleCol }} />
      <div style={{ display: 'flex', gap: 48, marginTop: 36 }}>
        <div style={colStyle}>{(twoCol ? paras.slice(0, half) : paras).map(para)}</div>
        {twoCol ? <div style={colStyle}>{paras.slice(half).map(para)}</div> : null}
      </div>
      {props.note ? (
        <div style={{ display: 'flex', marginTop: 'auto', fontSize: fs(22), color: muted }}>{props.note}</div>
      ) : null}
    </div>
  );
}

function B10(input: Extract<RenderSlideInput, { template: 'B10' }>) {
  return <EditorialMini accent={input.accent} props={input.props} />;
}
function B18(input: Extract<RenderSlideInput, { template: 'B18' }>) {
  return <EditorialMini accent={input.accent} props={input.props} dark />;
}

// ---------- B12 · 체크리스트 — CSS 체크박스(글리프는 twemoji 치환 위험) ----------
function B12({ accent, props }: Extract<RenderSlideInput, { template: 'B12' }>) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      <Topbar color={INK} right={props.page} />
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 56, letterSpacing: '-0.02em' }}>
        {highlightLines(
          props.heading,
          props.hl,
          { fontSize: fs(52), fontWeight: 800, lineHeight: 1.25 },
          { whiteSpace: 'pre', color }
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 48, gap: 30 }}>
        {props.items.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: 12,
                background: hexA(color, 0.12),
                border: `2px solid ${hexA(color, 0.5)}`,
                flexShrink: 0,
                marginTop: 4,
              }}
            >
              {/* 체크 표시 — 회전 바 2개 (✓ 글리프는 twemoji가 이미지로 치환해 깨진다) */}
              <div
                style={{
                  display: 'flex',
                  width: 17,
                  height: 9,
                  borderLeft: `4px solid ${color}`,
                  borderBottom: `4px solid ${color}`,
                  transform: 'rotate(-45deg) translateY(-2px)',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: fs(31), lineHeight: 1.55, color: BODY_TEXT }}>
              {em(t, color)}
            </div>
          </div>
        ))}
      </div>
      {props.footer ? (
        <div style={{ display: 'flex', marginTop: 'auto', fontSize: fs(24), color: MUTED }}>{props.footer}</div>
      ) : null}
    </div>
  );
}

// ---------- B13 · Q&A — 큰 질문 하나 + 답변 문단 ----------
function B13({ accent, props }: Extract<RenderSlideInput, { template: 'B13' }>) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      <Topbar color={INK} right={props.page} />
      <div style={{ display: 'flex', marginTop: 64, fontSize: fs(88), fontWeight: 800, color, lineHeight: 1 }}>Q.</div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24, letterSpacing: '-0.02em' }}>
        {highlightLines(
          props.question,
          props.hl,
          { fontSize: fs(52), fontWeight: 800, lineHeight: 1.3 },
          { whiteSpace: 'pre', color }
        )}
      </div>
      <div style={{ display: 'flex', marginTop: 48, height: 1, width: '100%', background: 'rgba(20,22,28,0.12)' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 26, marginTop: 48 }}>
        <div style={{ display: 'flex', fontSize: fs(44), fontWeight: 800, color: 'rgba(20,22,28,0.35)', lineHeight: 1 }}>A.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', width: 850, fontSize: fs(30), lineHeight: 1.7, color: BODY_TEXT }}>
          {em(props.answer, color)}
        </div>
      </div>
      {props.note ? (
        <div style={{ display: 'flex', marginTop: 'auto', fontSize: fs(24), color: MUTED }}>{props.note}</div>
      ) : null}
    </div>
  );
}

// ---------- B14 · 비교 2열 — C4 VS커버의 본문 버전 ----------
function B14({ accent, props }: Extract<RenderSlideInput, { template: 'B14' }>) {
  const color = accentOf(accent, props);
  const col = (title: string, items: string[], tinted: boolean) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 456,
        background: tinted ? hexA(color, 0.08) : '#F4F5F8',
        border: tinted ? `1px solid ${hexA(color, 0.35)}` : '1px solid rgba(20,22,28,0.06)',
        borderRadius: 26,
        padding: '38px 40px',
      }}
    >
      <div style={{ display: 'flex', fontSize: fs(34), fontWeight: 800, color: tinted ? color : INK }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26, gap: 20 }}>
        {items.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ display: 'flex', width: 8, height: 8, borderRadius: 999, background: tinted ? color : '#9AA1AD', marginTop: 15, flexShrink: 0 }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: fs(26), lineHeight: 1.6, color: BODY_TEXT }}>{t}</div>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      <Topbar color={INK} right={props.page} />
      {props.heading ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 56, fontSize: fs(48), fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
          {props.heading}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 24, marginTop: props.heading ? 44 : 64 }}>
        {col(props.aTitle, props.aItems, true)}
        {col(props.bTitle, props.bItems, false)}
      </div>
    </div>
  );
}

// ---------- B15 · 다크 인용 — 사진 없이 타이포로 한 문장을 세운다 ----------
function B15({ accent, props }: Extract<RenderSlideInput, { template: 'B15' }>) {
  const color = accentOf(accent, props);
  return (
    <div
      style={{
        ...cardBase,
        background: '#050505',
        backgroundImage: `radial-gradient(circle at 12% 90%, ${hexA(color, 0.14)} 0%, rgba(5,5,5,0) 55%)`,
        color: '#F4F6FB',
        padding: '80px 72px',
      }}
    >
      <Topbar color="#F4F6FB" right={props.page} rightStyle={{ color: 'rgba(244,246,251,0.45)' }} />
      <div style={{ display: 'flex', marginTop: 'auto', fontSize: fs(160), fontWeight: 800, color: hexA(color, 0.85), lineHeight: 0.6 }}>
        {'"'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 44, letterSpacing: '-0.02em' }}>
        {highlightLines(
          props.quote,
          props.hl,
          { fontSize: fs(58), fontWeight: 800, lineHeight: 1.35 },
          { whiteSpace: 'pre', color }
        )}
      </div>
      {props.attribution ? (
        <div style={{ display: 'flex', marginTop: 40, fontSize: fs(29), fontWeight: 600, color: 'rgba(244,246,251,0.55)' }}>
          {`— ${props.attribution}`}
        </div>
      ) : null}
      {props.context ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 20, fontSize: fs(25), lineHeight: 1.6, color: 'rgba(244,246,251,0.4)', marginBottom: 'auto' }}>
          {props.context}
        </div>
      ) : (
        <div style={{ display: 'flex', marginBottom: 'auto' }} />
      )}
    </div>
  );
}

// ---------- B16 · 스탯 타일 — 숫자 2~3개 나란히 ----------
function B16({ accent, props }: Extract<RenderSlideInput, { template: 'B16' }>) {
  const color = accentOf(accent, props);
  const n = props.stats.length;
  const w = n === 2 ? 456 : 296;
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      <Topbar color={INK} right={props.page} />
      {props.heading ? (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 56, letterSpacing: '-0.02em' }}>
          {highlightLines(
            props.heading,
            props.hl,
            { fontSize: fs(48), fontWeight: 800, lineHeight: 1.25 },
            { whiteSpace: 'pre', color }
          )}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 24, marginTop: props.heading ? 48 : 80 }}>
        {props.stats.map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: w,
              minHeight: 280,
              background: i === 0 ? hexA(color, 0.08) : '#F4F5F8',
              border: i === 0 ? `1px solid ${hexA(color, 0.35)}` : '1px solid rgba(20,22,28,0.06)',
              borderRadius: 26,
              padding: '40px 36px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <span style={{ fontSize: fs(n === 2 ? 96 : 76), fontWeight: 800, letterSpacing: '-0.03em', color: i === 0 ? color : INK, lineHeight: 1 }}>
                {s.big}
              </span>
              {s.unit ? (
                <span style={{ fontSize: fs(34), fontWeight: 700, color: MUTED, marginLeft: 6, marginBottom: 8 }}>{s.unit}</span>
              ) : null}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 'auto', fontSize: fs(25), lineHeight: 1.5, color: BODY_TEXT }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
      {props.footer ? (
        <div style={{ display: 'flex', marginTop: 'auto', fontSize: fs(24), color: MUTED }}>{props.footer}</div>
      ) : null}
    </div>
  );
}

// ---------- B17 · 세로 타임라인 — 점·선 레일 ----------
function B17({ accent, props }: Extract<RenderSlideInput, { template: 'B17' }>) {
  const color = accentOf(accent, props);
  const last = props.steps.length - 1;
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      <Topbar color={INK} right={props.page} />
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 56, letterSpacing: '-0.02em' }}>
        {highlightLines(
          props.heading,
          props.hl,
          { fontSize: fs(50), fontWeight: 800, lineHeight: 1.25 },
          { whiteSpace: 'pre', color }
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 52 }}>
        {props.steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 30 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
              <div style={{ display: 'flex', width: 20, height: 20, borderRadius: 999, background: color, marginTop: 8, flexShrink: 0 }} />
              {i !== last ? (
                <div style={{ display: 'flex', width: 3, flex: 1, background: hexA(color, 0.25), borderRadius: 2, marginTop: 6, marginBottom: 6 }} />
              ) : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: i !== last ? 40 : 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: fs(33), fontWeight: 800 }}>{s.title}</div>
              {s.desc ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 10, fontSize: fs(26), lineHeight: 1.6, color: BODY_TEXT }}>{s.desc}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- C6 · 에디토리얼 커버 — 화이트 대여백 ----------
function C6({ accent, props }: Extract<RenderSlideInput, { template: 'C6' }>) {
  const color = accentOf(accent, props);
  const rule = <div style={{ display: 'flex', height: 1, width: '100%', background: 'rgba(20,22,28,0.14)' }} />;
  return (
    <div style={{ ...cardBase, background: '#FDFCFA', color: INK, padding: '88px 80px' }}>
      <Topbar color={INK} />
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: 34 }}>
        {rule}
        {props.kicker ? (
          <div style={{ display: 'flex', fontSize: fs(24), fontWeight: 700, letterSpacing: '0.22em', color }}>{props.kicker}</div>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', letterSpacing: '-0.03em' }}>
          {highlightLines(
            props.title,
            props.hl,
            { fontSize: fs(84), fontWeight: 800, lineHeight: 1.18 },
            { whiteSpace: 'pre', color }
          )}
        </div>
        {props.sub ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: fs(31), lineHeight: 1.55, color: BODY_TEXT }}>{props.sub}</div>
        ) : null}
        {rule}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
        <span style={{ fontSize: fs(24), fontWeight: 600, color: MUTED }}>{props.footer ?? ''}</span>
        <span style={{ fontSize: fs(24), fontWeight: 700, color }}>caselab.kr</span>
      </div>
    </div>
  );
}

// ---------- C7 · 스플릿 커버 — 좌 다크 타이포 / 우 세로 사진 ----------
function C7({ accent, props }: Extract<RenderSlideInput, { template: 'C7' }>) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, flexDirection: 'row', background: '#050505' }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: props.coverImage ? 620 : CARD_W, padding: '80px 56px 72px 64px', color: '#F4F6FB' }}>
        <span style={{ fontSize: fs(28), fontWeight: 700, letterSpacing: '-0.01em' }}>caselab</span>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 'auto', gap: 28 }}>
          {props.kicker ? (
            <div style={{ display: 'flex', fontSize: fs(24), fontWeight: 700, letterSpacing: '0.18em', color }}>{props.kicker}</div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', letterSpacing: '-0.02em' }}>
            {highlightLines(
              props.title,
              props.hl,
              { fontSize: fs(62), fontWeight: 800, lineHeight: 1.22 },
              { whiteSpace: 'pre', color }
            )}
          </div>
          {props.sub ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: fs(27), lineHeight: 1.6, color: 'rgba(244,246,251,0.6)' }}>{props.sub}</div>
          ) : null}
        </div>
      </div>
      {props.coverImage ? (
        // ⚠️ 배경 CSS cover는 Satori가 타일링 — 반드시 <img>+objectFit
        <img
          src={props.coverImage}
          width={CARD_W - 620}
          height={CARD_H}
          style={{ objectFit: 'cover', width: CARD_W - 620, height: CARD_H }}
        />
      ) : null}
    </div>
  );
}

// ---------- P8 · 폴라로이드 — 크림 바탕 + 흰 프레임 사진 기울임 ----------
function P8({ accent, props }: Extract<RenderSlideInput, { template: 'P8' }>) {
  const ac = photoAccent(props);
  return (
    <div style={{ ...cardBase, background: '#FAF7F0', color: INK, padding: '80px 72px', alignItems: 'center' }}>
      <Topbar color={INK} right={props.page} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 'auto',
          background: '#fff',
          padding: '26px 26px 30px',
          borderRadius: 8,
          boxShadow: '0 24px 60px rgba(30,25,15,0.18)',
          transform: 'rotate(-2deg)',
        }}
      >
        {props.image ? (
          <img src={props.image} width={780} height={760} style={{ objectFit: 'cover', width: 780, height: 760, borderRadius: 4 }} />
        ) : (
          <div style={{ display: 'flex', width: 780, height: 760, borderRadius: 4, backgroundImage: 'linear-gradient(135deg, #E8E2D6 0%, #D6CFC0 100%)' }} />
        )}
        {props.caption ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24, fontSize: fs(27), color: '#6B6357' }}>{props.caption}</div>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginTop: 64,
          marginBottom: 'auto',
          letterSpacing: '-0.02em',
          maxWidth: 860,
        }}
      >
        {em(props.lead, accentOf(accent, props), { fontSize: fs(46), fontWeight: 800, lineHeight: 1.35 })}
      </div>
    </div>
  );
}

// ---------- P9 · 매거진 스플릿 — 좌 세로 사진 / 우 텍스트 칼럼 ----------
function P9({ accent, props }: Extract<RenderSlideInput, { template: 'P9' }>) {
  const ac = photoAccent(props);
  const photoW = 470;
  return (
    <div style={{ ...cardBase, flexDirection: 'row', background: '#0B0D12' }}>
      {props.image ? (
        <img src={props.image} width={photoW} height={CARD_H} style={{ objectFit: 'cover', width: photoW, height: CARD_H }} />
      ) : (
        <div style={{ display: 'flex', width: photoW, height: CARD_H, backgroundImage: 'linear-gradient(180deg, #1A1E28 0%, #05060A 100%)' }} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '76px 58px 72px', color: '#F4F6FB' }}>
        <span style={{ fontSize: fs(26), fontWeight: 700 }}>caselab</span>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 'auto' }}>
          {props.eyebrow ? (
            <div style={{ display: 'flex', fontSize: fs(22), fontWeight: 700, letterSpacing: '0.2em', color: ac, marginBottom: 24 }}>
              {props.eyebrow}
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', letterSpacing: '-0.02em' }}>
            {highlightLines(
              props.heading,
              props.hl,
              { fontSize: fs(50), fontWeight: 800, lineHeight: 1.28 },
              { whiteSpace: 'pre', color: ac }
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 30, fontSize: fs(26), lineHeight: 1.75, color: 'rgba(244,246,251,0.66)' }}>
            {em(props.body, accentOf(accent, props))}
          </div>
        </div>
        <span style={{ fontSize: fs(24), fontWeight: 600, color: 'rgba(244,246,251,0.35)' }}>{props.page ?? ''}</span>
      </div>
    </div>
  );
}

// ---------- P10 · 디바이스 프레임 — 스크린샷을 브라우저 창에 앉히고 아래 리드 ----------
function P10({ accent, props }: Extract<RenderSlideInput, { template: 'P10' }>) {
  const ac = photoAccent(props);
  return (
    <div style={{ ...cardBase, backgroundColor: '#000', padding: '72px 64px', alignItems: 'center' }}>
      <Topbar color="#F4F6FB" right={props.page} rightStyle={{ color: 'rgba(244,246,251,0.45)' }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 56,
          width: 952,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 26,
          padding: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '16px 24px 12px' }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
            <div key={c} style={{ display: 'flex', width: 16, height: 16, borderRadius: 999, background: c }} />
          ))}
          <span style={{ fontSize: fs(22), fontWeight: 600, color: 'rgba(244,246,251,0.4)', marginLeft: 8 }}>
            {props.frameLabel ?? 'localhost:3000'}
          </span>
        </div>
        {props.image ? (
          <img src={props.image} width={940} height={680} style={{ objectFit: 'cover', width: 940, height: 680, borderRadius: 18 }} />
        ) : (
          <div style={{ display: 'flex', width: 940, height: 680, borderRadius: 18, backgroundImage: 'linear-gradient(135deg, #171B24 0%, #05060A 100%)' }} />
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginTop: 58, maxWidth: 900, letterSpacing: '-0.02em' }}>
        {em(props.lead, accentOf(accent, props), { fontSize: fs(46), fontWeight: 800, color: P_TEXT, lineHeight: 1.32 })}
      </div>
      {props.caption ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginTop: 22, fontSize: fs(26), lineHeight: 1.6, color: P_TEXT_3 }}>
          {props.caption}
        </div>
      ) : null}
    </div>
  );
}

// ---------- B11 · 텍스트 그리드 — 항목 3~4개를 2×2 타일로 ----------
function B11({ accent, props }: Extract<RenderSlideInput, { template: 'B11' }>) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      <Topbar color={INK} right={props.page} />
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 56, letterSpacing: '-0.02em' }}>
        {highlightLines(
          props.heading,
          props.hl,
          { fontSize: fs(46), fontWeight: 800, lineHeight: 1.25 },
          { whiteSpace: 'pre', color }
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 44 }}>
        {props.cells.map((c, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 456,
              minHeight: 300,
              background: '#F4F5F8',
              border: '1px solid rgba(20,22,28,0.06)',
              borderRadius: 26,
              padding: '36px 38px',
            }}
          >
            <div style={{ display: 'flex', fontSize: fs(24), fontWeight: 800, letterSpacing: '0.1em', color }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 16, fontSize: fs(32), fontWeight: 800, lineHeight: 1.3 }}>
              {c.title}
            </div>
            {c.desc ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 14, fontSize: fs(24), lineHeight: 1.65, color: BODY_TEXT }}>
                {c.desc}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- P7 · 사진 그리드 — 사진 2장 나란히(1장이면 풀폭) + 아래 리드 ----------
function P7({ accent, props }: Extract<RenderSlideInput, { template: 'P7' }>) {
  const ac = photoAccent(props);
  const eyebrow = props.eyebrow ?? DEFAULT_TAGS[accent];
  const duo = !!(props.image && props.image2);
  const photoH = 620;
  const photo = (url: string, w: number) => (
    // ⚠️ 배경 CSS cover는 Satori가 타일링한다 — 반드시 <img>+objectFit
    <img src={url} width={w} height={photoH} style={{ objectFit: 'cover', width: w, height: photoH }} />
  );
  return (
    <div style={{ ...cardBase, backgroundColor: '#000' }}>
      <div style={{ display: 'flex', gap: duo ? 8 : 0, height: photoH, overflow: 'hidden' }}>
        {props.image ? (
          duo ? (
            <>
              {photo(props.image, 536)}
              {photo(props.image2!, 536)}
            </>
          ) : (
            photo(props.image, CARD_W)
          )
        ) : (
          <div
            style={{
              display: 'flex',
              width: CARD_W,
              height: photoH,
              backgroundImage: 'linear-gradient(135deg, #14171F 0%, #05060A 100%)',
            }}
          />
        )}
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: `46px ${P_PAD}px 54px`,
          backgroundColor: '#000',
        }}
      >
        {eyebrow ? (
          <div style={{ display: 'flex', marginBottom: 30 }}>
            <Eyebrow text={eyebrow} centered />
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            letterSpacing: '-0.02em',
          }}
        >
          {em(props.lead, accentOf(accent, props), { fontSize: fs(52), fontWeight: 800, color: P_TEXT, lineHeight: 1.3 })}
        </div>
        {props.caption ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: 26,
              fontSize: fs(27),
              lineHeight: 1.6,
              color: P_TEXT_3,
            }}
          >
            {props.caption}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- P11 · 화이트 매거진 — 상단 풀폭 사진 + 흰 바탕 좌정렬 제목/문단 ----------
// 레퍼런스: biscit.co.kr 캐러셀. 강조는 accent색이 아니라 볼드 검정 — 잡지 문법 유지.
function P11({ accent, props }: Extract<RenderSlideInput, { template: 'P11' }>) {
  const photoH = 720;
  // **강조** = 포인트색(카테고리 기본색, accentColor 오버라이드) — 편집기 툴바의 "A 포인트색"과 일치
  const emAc = accentOf(accent, props);
  // 제목은 분량 맞춤 42–56 — 고정 44는 이웃 장(46~60)보다 작아 "8~9장만 글씨가 작다"로 보였다
  const heading = fitBlock([props.heading], {
    width: CARD_W - 128,
    height: 200,
    max: 56,
    min: 42,
    lineHeight: 1.28,
    gapRatio: 0,
  });
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK }}>
      <div style={{ display: 'flex', position: 'relative', height: photoH, overflow: 'hidden' }}>
        {props.image ? (
          // ⚠️ 배경 CSS cover는 Satori가 타일링 — 반드시 <img>+objectFit
          <img src={props.image} width={CARD_W} height={photoH} style={{ objectFit: 'cover', width: CARD_W, height: photoH }} />
        ) : (
          <div style={{ display: 'flex', width: CARD_W, height: photoH, backgroundImage: 'linear-gradient(135deg, #ECEEF2 0%, #D9DDE4 100%)' }} />
        )}
        {props.credit ? (
          <span
            style={{
              position: 'absolute',
              top: 28,
              left: 32,
              fontSize: fs(20),
              color: 'rgba(255,255,255,0.75)',
            }}
          >
            {props.credit}
          </span>
        ) : null}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '56px 64px 60px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', letterSpacing: '-0.02em' }}>
          {highlightLines(
            props.heading,
            props.hl,
            { fontSize: heading.size, fontWeight: 800, lineHeight: 1.28, flexWrap: 'wrap' },
            /* text-decoration은 Satori 지원이 불안정 — 형광펜은 옅은 옐로 박스로 */
            { whiteSpace: 'pre', background: '#FFF3B0', padding: '0 6px', borderRadius: 6 },
            emAc
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 28, fontSize: fs(33), lineHeight: 1.62, color: BODY_TEXT }}>
          {em(props.body, emAc)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
          <span style={{ fontSize: fs(22), fontWeight: 700, color: 'rgba(20,22,28,0.4)' }}>caselab</span>
          <span style={{ fontSize: fs(22), fontWeight: 600, color: 'rgba(20,22,28,0.35)' }}>{props.page ?? ''}</span>
        </div>
      </div>
    </div>
  );
}

// ---------- P1 · 스플릿(사진 상단) + 번호 목록 ----------
function P1({ accent, props }: Extract<RenderSlideInput, { template: 'P1' }>) {
  const ac = photoAccent(props);
  const photoH = Math.max(420, Math.min(840, props.photoH ?? 660));
  const inner = CARD_H - photoH - 46 - 54;
  const eyebrow = props.eyebrow ?? DEFAULT_TAGS[accent];
  const eyebrowH = eyebrow ? 30 + 34 : 0;
  const lead = fitBlock([props.lead], {
    width: P_W,
    height: Math.min(280, Math.round(inner * 0.44)),
    max: 60, // 캐러셀 공용 스케일: 메인 문장 42–60 (2026-08-30 통일 — 장마다 44↔76 널뛰던 문제)
    min: 42,
    lineHeight: 1.26,
    gapRatio: 0,
  });
  const listH = Math.max(120, inner - eyebrowH - lead.height - 40);
  const item = fitBlock(props.items, {
    width: P_W - 70,
    height: listH,
    max: 40,
    min: 25,
    lineHeight: 1.4,
    // 항목이 적으면 남는 세로 여백을 간격이 다 먹어서 3줄이 카드 전체에 흩뿌려진다
    // (2026-08-30 운영자: "3가지 적을 때 사이가 너무 멀다"). 상한을 글자 크기 수준으로 묶어
    // 목록이 한 덩어리로 읽히게 하고, 남는 공간은 가운데 정렬로 흘려보낸다.
    gapRatio: 0.6,
    gapMaxRatio: 0.9,
  });
  return (
    <div style={{ ...cardBase, backgroundColor: '#000' }}>
      <PhotoBand image={props.image} height={photoH} pos={props.coverPos} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: `46px ${P_PAD}px 54px`,
          backgroundColor: '#000',
        }}
      >
        {eyebrow ? (
          <div style={{ display: 'flex', marginBottom: 34 }}>
            <Eyebrow text={eyebrow} centered />
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginBottom: 40,
            letterSpacing: '-0.02em',
          }}
        >
          {em(props.lead, accentOf(accent, props), {
            fontSize: lead.size,
            fontWeight: 800,
            color: P_TEXT,
            lineHeight: 1.26,
          })}
        </div>
        <RuleList items={props.items} size={item.size} gap={item.gap} accent={ac} />
      </div>
    </div>
  );
}

// ---------- P2 · 스플릿(사진 상단) + 문단 ----------
// 레퍼런스(trenddalkak.ai·success_spoon) 문법: 큰 제목 → 중간 부제 → 작은 회색 본문.
// 크기를 균일하게 키우는 대신 위계로 읽히게 한다.
function P2({ accent, props }: Extract<RenderSlideInput, { template: 'P2' }>) {
  const ac = photoAccent(props);
  const photoH = Math.max(420, Math.min(840, props.photoH ?? 600));
  const inner = CARD_H - photoH - 46 - 58;
  const eyebrow = props.eyebrow ?? DEFAULT_TAGS[accent];
  const eyebrowH = eyebrow ? 30 + 32 : 0;
  const heading = fitBlock([props.heading], {
    width: P_W,
    height: Math.min(260, Math.round(inner * 0.4)),
    max: 60,
    min: 40,
    lineHeight: 1.28,
    gapRatio: 0,
  });
  const subH = props.sub ? 26 + Math.round(heading.size * 0.62) * 1.4 : 0;
  const bodyH = Math.max(110, inner - eyebrowH - heading.height - subH - 34);
  const body = fitBlock([props.body], {
    width: P_W,
    height: bodyH,
    max: 34,
    min: 23,
    lineHeight: 1.62,
    gapRatio: 0,
  });
  return (
    <div style={{ ...cardBase, backgroundColor: '#000' }}>
      <PhotoBand image={props.image} height={photoH} pos={props.coverPos} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: `46px ${P_PAD}px 58px`,
          backgroundColor: '#000',
        }}
      >
        {eyebrow ? (
          <div style={{ display: 'flex', marginBottom: 32 }}>
            <Eyebrow text={eyebrow} centered />
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            letterSpacing: '-0.02em',
          }}
        >
          {em(props.heading, accentOf(accent, props), {
            fontSize: heading.size,
            fontWeight: 800,
            color: P_TEXT,
            lineHeight: 1.28,
          })}
        </div>
        {props.sub ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: 26,
            }}
          >
            {em(props.sub, accentOf(accent, props), {
              fontSize: Math.round(heading.size * 0.62),
              fontWeight: 700,
              color: P_TEXT_2,
              lineHeight: 1.4,
            })}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: 34,
            textAlign: 'center',
          }}
        >
          {em(props.body, accentOf(accent, props), {
            fontSize: body.size,
            fontWeight: 500,
            color: P_TEXT_2,
            lineHeight: 1.62,
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- P3 · 풀블리드 사진 + 하단 스크림 ----------
function P3({ accent, props }: Extract<RenderSlideInput, { template: 'P3' }>) {
  const ac = photoAccent(props);
  const items = props.items ?? [];
  const title = fitBlock([props.title], {
    width: P_W,
    height: 300,
    max: 60,
    min: 46,
    lineHeight: 1.24,
    gapRatio: 0,
  });
  const item = items.length
    ? fitBlock(items, {
        width: P_W,
        height: 220,
        max: 34,
        min: 24,
        lineHeight: 1.45,
        gapRatio: 0.42,
        gapMaxRatio: 0.6,
      })
    : { size: 0, gap: 0, height: 0 };
  const bottomPad = 88;
  const blockH = 30 + 26 + title.height + (items.length ? 30 + 3 + 28 + item.height : 0);
  const textTop = CARD_H - bottomPad - blockH;
  return (
    <div style={{ ...cardBase }}>
      <PhotoFull
        image={props.image}
        pos={props.coverPos}
        overlay={props.overlay ?? 0.34}
        textTop={textTop}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: CARD_W,
          height: CARD_H,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: `0 ${P_PAD}px ${bottomPad}px`,
        }}
      >
        <div style={{ display: 'flex', marginBottom: 26 }}>
          <Eyebrow text={props.label ?? DEFAULT_TAGS[accent]} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', letterSpacing: '-0.02em' }}>
          {em(props.title, accentOf(accent, props), {
            fontSize: title.size,
            fontWeight: 800,
            color: P_TEXT,
            lineHeight: 1.24,
          })}
        </div>
        {items.length ? (
          <>
            <div
              style={{
                display: 'flex',
                width: 78,
                height: 3,
                backgroundColor: ac,
                marginTop: 30,
                marginBottom: 28,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: item.gap }}>
              {items.map((t, i) => (
                <div key={i} style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {em(t, accentOf(accent, props), {
                    fontSize: item.size,
                    fontWeight: 500,
                    color: P_TEXT_2,
                    lineHeight: 1.45,
                  })}
                </div>
              ))}
            </div>
          </>
        ) : null}
        {props.footer ? (
          <div
            style={{
              display: 'flex',
              marginTop: 34,
              fontSize: fs(22),
              fontWeight: 800,
              letterSpacing: '0.18em',
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            {props.footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- P4 · 풀블리드 사진 + 인용 ----------
function P4({ accent, props }: Extract<RenderSlideInput, { template: 'P4' }>) {
  const ac = photoAccent(props);
  const quote = fitBlock([props.quote], {
    width: P_W,
    height: 520,
    max: 60,
    min: 42,
    lineHeight: 1.36,
    gapRatio: 0,
  });
  return (
    <div style={{ ...cardBase }}>
      <PhotoFull
        image={props.image}
        pos={props.coverPos}
        overlay={props.overlay ?? 0.56}
        textTop={Math.round(CARD_H / 2 - quote.height / 2)}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: CARD_W,
          height: CARD_H,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: `0 ${P_PAD}px`,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: fs(96),
            fontWeight: 800,
            color: ac,
            lineHeight: 1,
            marginBottom: 8,
          }}
        >
          “
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', letterSpacing: '-0.02em' }}>
          {em(props.quote, accentOf(accent, props), {
            fontSize: quote.size,
            fontWeight: 800,
            color: P_TEXT,
            lineHeight: 1.36,
          })}
        </div>
        {props.attribution ? (
          <div
            style={{
              display: 'flex',
              marginTop: 40,
              fontSize: fs(30),
              fontWeight: 600,
              color: P_TEXT_2,
            }}
          >
            {`— ${props.attribution}`}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- P5 · 블랙아웃(사진을 텍스처로) + 번호 목록 ----------
// 사진 수급 실패·프롬프트/코드처럼 사진이 붙지 않는 소재의 폴백. 타이포가 주인공.
function P5({ accent, props }: Extract<RenderSlideInput, { template: 'P5' }>) {
  const ac = photoAccent(props);
  const lead = fitBlock([props.lead], {
    width: P_W,
    height: 300,
    max: 76, // 타이포가 주인공인 블랙 폴백만 예외로 크게
    min: 52,
    lineHeight: 1.2,
    gapRatio: 0,
  });
  const item = fitBlock(props.items, {
    width: P_W - 70,
    height: 420,
    max: 40,
    min: 26,
    lineHeight: 1.4,
    // P1과 같은 규칙 — 목록 간격은 템플릿마다 달라 보이면 안 된다
    gapRatio: 0.6,
    gapMaxRatio: 0.9,
  });
  return (
    <div style={{ ...cardBase, backgroundColor: DARK_BG }}>
      <PhotoFull
        image={props.image}
        pos={props.coverPos}
        overlay={props.overlay ?? 0.86}
        textTop={CARD_H}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: CARD_W,
          height: CARD_H,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: `0 ${P_PAD}px`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 44 }}>
          {props.index ? (
            <div
              style={{ display: 'flex', fontSize: fs(25), fontWeight: 800, letterSpacing: '0.1em', color: ac }}
            >
              {props.index}
            </div>
          ) : null}
          <Eyebrow text={props.eyebrow ?? DEFAULT_TAGS[accent]} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', letterSpacing: '-0.025em', marginBottom: 48 }}>
          {em(props.lead, accentOf(accent, props), { fontSize: lead.size, fontWeight: 800, color: P_TEXT, lineHeight: 1.2 })}
        </div>
        <RuleList items={props.items} size={item.size} gap={item.gap} accent={ac} />
      </div>
      {props.footer ? (
        <div
          style={{
            position: 'absolute',
            left: P_PAD,
            bottom: 76,
            display: 'flex',
            fontSize: fs(22),
            fontWeight: 800,
            letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.45)',
          }}
        >
          {props.footer}
        </div>
      ) : null}
    </div>
  );
}

// ---------- P6 · 블랙아웃 + 빅넘버(본문용) ----------
// C5는 커버 전용이라 본문 흐름에서 숫자 한 방을 박을 자리가 없었다.
function P6({ accent, props }: Extract<RenderSlideInput, { template: 'P6' }>) {
  const ac = photoAccent(props);
  const big = fitBlock([props.big], {
    width: P_W,
    height: 320,
    // 본문 빅넘버는 230까지 허용하지만, 엔딩 카드는 bigMax로 낮춰 쓴다(230은 키워드에 너무 컸다)
    max: Math.min(230, props.bigMax ?? 230),
    min: 90,
    lineHeight: 1.02,
    gapRatio: 0,
  });
  const resolve = fitBlock([props.resolve], {
    width: P_W,
    height: 250,
    max: 46,
    min: 28,
    lineHeight: 1.44,
    gapRatio: 0,
  });
  return (
    <div style={{ ...cardBase, backgroundColor: DARK_BG }}>
      <PhotoFull
        image={props.image}
        pos={props.coverPos}
        overlay={props.overlay ?? 0.82}
        textTop={CARD_H}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: CARD_W,
          height: CARD_H,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: `0 ${P_PAD}px`,
        }}
      >
        {props.kicker ? (
          <div style={{ display: 'flex', marginBottom: 40 }}>
            <Eyebrow text={props.kicker} centered />
          </div>
        ) : null}
        {/* 문장 앞머리 — 라벨이 아니라 문장의 일부라, resolve와 같은 조판으로 맞춘다.
            이게 있으면 "앞머리 / 키워드 / 뒷말"이 한 문장으로 읽히도록 상하 간격을 좁힌다. */}
        {props.leadIn ? (
          <div
            style={{
              display: 'flex',
              fontSize: resolve.size,
              fontWeight: 600,
              color: P_TEXT_2,
              lineHeight: 1.44,
              marginBottom: 10,
            }}
          >
            {props.leadIn}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            fontSize: big.size,
            fontWeight: 800,
            color: ac,
            lineHeight: 1.02,
            letterSpacing: '-0.04em',
            marginBottom: props.leadIn ? 10 : 44,
          }}
        >
          {props.big}
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          {em(props.resolve, accentOf(accent, props), {
            fontSize: resolve.size,
            fontWeight: 600,
            color: P_TEXT_2,
            lineHeight: 1.44,
          })}
        </div>
      </div>
      {props.footer ? (
        <div
          style={{
            position: 'absolute',
            left: P_PAD,
            bottom: 76,
            display: 'flex',
            fontSize: fs(22),
            fontWeight: 800,
            letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.45)',
          }}
        >
          {props.footer}
        </div>
      ) : null}
    </div>
  );
}

export function renderSlide(input: RenderSlideInput): ReactNode {
  const scale = (input.props as { textScale?: number }).textScale;
  TEXT_SCALE = typeof scale === 'number' && scale >= 0.8 && scale <= 1.25 ? scale : 1;
  try {
    return renderSlideInner(input);
  } finally {
    // 다음 장이 이 장의 배율을 물려받지 않게 반드시 되돌린다
    TEXT_SCALE = 1;
  }
}

// ⚠️ 여기서는 템플릿을 <P11 {...input}/> 같은 JSX 요소로 만들면 안 된다 — 요소는 함수 본문을
// 바로 실행하지 않아서, 크기가 정해지는 시점이 renderSlide가 TEXT_SCALE을 되돌린 뒤(Satori가
// 그릴 때)로 밀린다. 함수를 직접 호출해 style 객체를 그 자리에서 평가시킨다.
function renderSlideInner(input: RenderSlideInput): ReactNode {
  switch (input.template) {
    case 'P1':
      return P1(input);
    case 'P2':
      return P2(input);
    case 'P3':
      return P3(input);
    case 'P4':
      return P4(input);
    case 'P5':
      return P5(input);
    case 'P6':
      return P6(input);
    case 'C1':
      return C1(input);
    case 'C2':
      return C2(input);
    case 'C3':
      return C3(input);
    case 'C4':
      return C4(input);
    case 'C5':
      return C5(input);
    case 'B1':
      return B1(input);
    case 'B2':
      return B2(input);
    case 'B3':
      return B3(input);
    case 'B4':
      return B4(input);
    case 'B5':
      return B5(input);
    case 'B6':
      return B6(input);
    case 'B7':
      return B7(input);
    case 'B8':
      return B8(input);
    case 'B9':
      return B9(input);
    case 'B10':
      return B10(input);
    case 'B11':
      return B11(input);
    case 'B12':
      return B12(input);
    case 'B13':
      return B13(input);
    case 'B14':
      return B14(input);
    case 'B15':
      return B15(input);
    case 'B16':
      return B16(input);
    case 'B17':
      return B17(input);
    case 'B18':
      return B18(input);
    case 'C6':
      return C6(input);
    case 'C7':
      return C7(input);
    case 'P7':
      return P7(input);
    case 'P8':
      return P8(input);
    case 'P9':
      return P9(input);
    case 'P10':
      return P10(input);
    case 'P11':
      return P11(input);
  }
}

/** 콘텐츠 썸네일(16:9) 렌더 — C1 v3 커버만 지원한다.
 *  나머지 템플릿은 16:9로 앉힐 자리가 없어서 라우트에서 막는다(조용히 이상한 그림을 내보내지 않는다). */
export function renderThumb16x9(input: RenderSlideInput): ReactNode {
  if (input.template !== 'C1') return null;
  return C1V3Wide(input);
}
