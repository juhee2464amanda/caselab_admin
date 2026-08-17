/* eslint-disable @next/next/no-img-element */
import type { CSSProperties, ReactNode } from 'react';
import type { CardAccent, RenderSlideInput } from '@/types/cardpress';

// content/instagram/carousel-template/caselab-carousel-guide.html 의 슬라이드 14종 중
// C1(사진몰입 커버)·B2(이미지+배너+불릿)·B5(잘된것/별로였던것) 등을
// Satori(next/og) 호환으로 포팅. Satori 제약: CSS 변수·color-mix 불가 → JS 상수/mix 헬퍼,
// box-decoration-break 불가 → 형광펜(hl)은 한 줄 안의 단어에만.

export const CARD_W = 1080;
export const CARD_H = 1350;

const ACCENTS: Record<CardAccent, string> = {
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

/** **강조** 마커는 렌더에서 사라지므로 측정에서도 뺀다 */
function stripMarks(text: string): string {
  return text.replace(/\*\*/g, '');
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
  let size = o.min;
  for (let f = Math.round(o.max); f >= Math.round(o.min); f -= 1) {
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
    default:
      return {
        whiteSpace: 'pre',
        background: base,
        color: '#fff',
        padding: '2px 16px',
        borderRadius: 8,
        textShadow: 'none',
      };
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
    line.split(/\*\*(.+?)\*\*/g).forEach((seg, i) => {
      if (!seg) return;
      const style: CSSProperties =
        i % 2 === 1
          ? { ...base, whiteSpace: 'pre-wrap', color: accent, fontWeight: 700 }
          : { ...base, whiteSpace: 'pre-wrap' };
      for (const word of seg.match(/\S+\s*|\s+/g) ?? [seg])
        nodes.push(
          <span key={`${li}-${i}-${nodes.length}`} style={style}>
            {word}
          </span>
        );
    });
  });
  return nodes;
}

// '\n' 줄바꿈 + hl 부분 문자열 형광펜. 각 줄은 flex row(세그먼트 스팬)로 조립.
function highlightLines(
  text: string,
  hl: string | undefined,
  lineStyle: CSSProperties,
  hlStyle: CSSProperties
): ReactNode[] {
  return text.split('\n').map((line, li) => {
    const segs = hl && line.includes(hl) ? line.split(hl) : null;
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
            if (seg)
              parts.push(
                <span key={`s${si}`} style={{ whiteSpace: 'pre' }}>
                  {seg}
                </span>
              );
            return parts;
          })
        ) : (
          <span style={{ whiteSpace: 'pre' }}>{line}</span>
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
      <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em', color }}>caselab</span>
      {right ? (
        <span style={{ fontSize: 26, fontWeight: 600, color: MUTED, ...rightStyle }}>{right}</span>
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
            fontSize: 28,
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
                fontSize: 32,
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
              fontSize: 80,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              textShadow: '0 2px 24px rgba(0,0,0,0.4)',
            }}
          >
            {highlightLines(props.title, props.hl, { minHeight: 100 }, hlSpan(props, color, true))}
          </div>
          {props.sub ? (
            <div style={{ fontSize: 34, fontWeight: 600, opacity: 0.92, marginTop: 24 }}>
              {props.sub}
            </div>
          ) : null}
          {props.footer ? (
            <div
              style={{
                display: 'flex',
                fontSize: 24,
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
            fontSize: 26,
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
                fontSize: 32,
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
              fontSize: 78,
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
                fontSize: 33,
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
                fontSize: 24,
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
            fontSize: 25,
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
              fontSize: 31,
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
          rightStyle={{ fontSize: 26, color: 'rgba(255,255,255,0.78)', letterSpacing: '0.06em' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
          {props.kicker ? (
            <div
              style={{
                display: 'flex',
                fontSize: 30,
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
                fontSize: 32,
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
        <Topbar color="#fff" right={DEFAULT_TAGS[accent]} rightStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: 26 }} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 'auto',
            marginBottom: 'auto',
          }}
        >
          {props.kicker ? (
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
              {props.kicker}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              marginTop: 24,
              fontSize: 190,
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
              fontSize: 44,
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
              fontSize: 24,
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
const B2_BANNER_H = Math.round(B2_BANNER * 1.3) + 26; // 상하 패딩 13*2

function B2({ accent, props }: Extract<RenderSlideInput, { template: 'B2' }>) {
  const color = accentOf(accent, props);
  const lead = props.lead?.trim();
  const mediaH = props.media ? 372 : 0;

  // 세로 예산 — 패딩·톱바·이미지·배너를 뺀 나머지를 lead → 불릿 순으로 나눠 쓴다
  let rest = CARD_H - PAD_Y * 2 - TOPBAR_H - (mediaH ? mediaH + 40 : 0) - (40 + B2_BANNER_H) - 52;
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
              fontSize: B2_BANNER,
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
      <div style={{ display: 'flex', fontSize: 32, fontWeight: 800, color, letterSpacing: '-0.01em' }}>
        {ko}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 19,
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
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, color }}>{label}</div>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 18,
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
            fontSize: 58,
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
            fontSize: 25,
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
          fontSize: 27,
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
    fontSize: 25,
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
              fontSize: 30,
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
            fontSize: 66,
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
        <div style={{ display: 'flex', fontSize: 36, lineHeight: 1.55, color: 'rgba(255,255,255,0.72)' }}>
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
              fontSize: 64,
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
            fontSize: 66,
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
            fontSize: 36,
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
              fontSize: 30,
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
              <span key={i} style={{ fontSize: 48, fontWeight: 800, color }}>
                VS
              </span>
            ) : (
              <div key={i} style={vsBox}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    fontSize: 52,
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
                  <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.7)', marginTop: 10 }}>
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
            fontSize: 36,
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
            fontSize: 34,
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
          fontSize: 60,
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
            <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.02em' }}>{r.term}</span>
            {r.desc ? <span style={{ fontSize: 32, color: MUTED }}>{r.desc}</span> : null}
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
              fontSize: 26,
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
            fontSize: 96,
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
          <div style={{ display: 'flex', fontSize: 36, color: MUTED, marginTop: 12 }}>
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
            fontSize: 50,
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
              fontSize: 36,
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
            fontSize: 60,
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
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, opacity: 0.8, marginTop: 36 }}>
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
          fontSize: 54,
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
                fontSize: 38,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {s.title}
              </span>
              {s.desc ? (
                <span style={{ fontSize: 31, color: BODY_TEXT, marginTop: 8 }}>{s.desc}</span>
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
            style={{ fontSize: 220, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.05em', color: DARK_KW }}
          >
            {props.big}
          </span>
          {props.unit ? (
            <span style={{ fontSize: 90, fontWeight: 800, color: DARK_KW }}>{props.unit}</span>
          ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 20,
            fontSize: 44,
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
              fontSize: 34,
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

  // 신레이아웃 — 패턴을 판다: 배지 → 패턴명 → 상황 → 맛보기 → 효과 → CTA(댓글→DM 등)
  if (props.patternName) {
    return (
      <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
        <Topbar color={INK} right={props.page} />
        <div style={{ display: 'flex', marginTop: 48 }}>
          <span
            style={{
              background: color,
              color: '#fff',
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: '0.06em',
              padding: '10px 22px',
              borderRadius: 999,
            }}
          >
            {props.badge ?? '프롬프트 패턴'}
          </span>
        </div>
        {props.patternEn ? (
          /* 영어 패턴명 원문이 주인공, 한글 제목은 아래 부제 (운영자 결정 2026-07-21) */
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28 }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                fontSize: 58,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1.12,
              }}
            >
              {props.patternEn}
            </div>
            {props.patternName ? (
              <div style={{ display: 'flex', marginTop: 14, fontSize: 35, fontWeight: 700, color: 'rgba(20,22,28,0.78)' }}>
                {props.patternName}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              marginTop: 28,
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 1.15,
            }}
          >
            {props.patternName}
          </div>
        )}
        {props.when ? (
          <div style={{ display: 'flex', marginTop: 20, fontSize: 33, lineHeight: 1.5, color: BODY_TEXT }}>
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
              fontSize: 33,
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
        {promptBox(30)}
        {props.ctaLine ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 'auto',
              alignSelf: 'flex-start',
              background: mixWithWhite(color, 0.08),
              border: `2px solid ${mixWithWhite(color, 0.3)}`,
              borderRadius: 16,
              padding: '24px 30px',
              fontSize: 31,
              fontWeight: 700,
              color: INK,
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
          fontSize: 52,
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
          fontSize: 30,
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
            fontSize: stripMarks(props.lead).length <= 16 ? 72 : 34,
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
              fontSize: 30,
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

const PHOTO_ACCENT = '#E8B857'; // 골드 — 벤치마크 기본 강조색(카드당 1구절). accentColor로 오버라이드
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
          fontSize: 22,
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
    max: 76,
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
    gapRatio: 0.95,
    gapMaxRatio: 1.7,
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
          {em(props.lead, ac, {
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
    max: 66,
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
          {em(props.heading, ac, {
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
            {em(props.sub, ac, {
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
          {em(props.body, ac, {
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
    max: 80,
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
          {em(props.title, ac, {
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
                  {em(t, ac, {
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
              fontSize: 22,
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
function P4({ props }: Extract<RenderSlideInput, { template: 'P4' }>) {
  const ac = photoAccent(props);
  const quote = fitBlock([props.quote], {
    width: P_W,
    height: 520,
    max: 76,
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
            fontSize: 96,
            fontWeight: 800,
            color: ac,
            lineHeight: 1,
            marginBottom: 8,
          }}
        >
          “
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', letterSpacing: '-0.02em' }}>
          {em(props.quote, ac, {
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
              fontSize: 30,
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
    max: 94,
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
    gapRatio: 1.0,
    gapMaxRatio: 1.5,
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
              style={{ display: 'flex', fontSize: 25, fontWeight: 800, letterSpacing: '0.1em', color: ac }}
            >
              {props.index}
            </div>
          ) : null}
          <Eyebrow text={props.eyebrow ?? DEFAULT_TAGS[accent]} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', letterSpacing: '-0.025em', marginBottom: 48 }}>
          {em(props.lead, ac, { fontSize: lead.size, fontWeight: 800, color: P_TEXT, lineHeight: 1.2 })}
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
            fontSize: 22,
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
    max: 230,
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
        <div
          style={{
            display: 'flex',
            fontSize: big.size,
            fontWeight: 800,
            color: ac,
            lineHeight: 1.02,
            letterSpacing: '-0.04em',
            marginBottom: 44,
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
          {em(props.resolve, ac, {
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
            fontSize: 22,
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
  switch (input.template) {
    case 'P1':
      return <P1 {...input} />;
    case 'P2':
      return <P2 {...input} />;
    case 'P3':
      return <P3 {...input} />;
    case 'P4':
      return <P4 {...input} />;
    case 'P5':
      return <P5 {...input} />;
    case 'P6':
      return <P6 {...input} />;
    case 'C1':
      return <C1 {...input} />;
    case 'C2':
      return <C2 {...input} />;
    case 'C3':
      return <C3 {...input} />;
    case 'C4':
      return <C4 {...input} />;
    case 'C5':
      return <C5 {...input} />;
    case 'B1':
      return <B1 {...input} />;
    case 'B2':
      return <B2 {...input} />;
    case 'B3':
      return <B3 {...input} />;
    case 'B4':
      return <B4 {...input} />;
    case 'B5':
      return <B5 {...input} />;
    case 'B6':
      return <B6 {...input} />;
    case 'B7':
      return <B7 {...input} />;
    case 'B8':
      return <B8 {...input} />;
    case 'B9':
      return <B9 {...input} />;
  }
}
