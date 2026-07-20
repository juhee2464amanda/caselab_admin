/* eslint-disable @next/next/no-img-element */
import type { CSSProperties, ReactNode } from 'react';
import type { CardAccent, RenderSlideInput } from '@/types/cardpress';

// content/instagram/carousel-template/caselab-carousel-guide.html 의 슬라이드 14종 중
// C1(사진몰입 커버)·B2(이미지+배너+불릿)·B5(잘된것/별로였던것)·O1(마무리 CTA)을
// Satori(next/og) 호환으로 포팅. Satori 제약: CSS 변수·color-mix 불가 → JS 상수/mix 헬퍼,
// box-decoration-break 불가 → 형광펜(hl)은 한 줄 안의 단어에만.

export const CARD_W = 1080;
export const CARD_H = 1350;

const ACCENTS: Record<CardAccent, string> = {
  'cat-case': '#2F6BFF', // 실전 케이스 = 블루
  'cat-trend': '#7C3AED', // AI 트렌드 = 바이올렛
  'cat-tool': '#0E9F6E', // AI 도구 = 에메랄드
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
};

// color-mix(in srgb, C p%, #fff) 대체 — 흰 배경 위 틴트 계산
function mixWithWhite(hex: string, ratio: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v * ratio + 255 * (1 - ratio));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(ch);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const FONT = 'Pretendard';

// 형광펜 배경색 — hlColor 오버라이드(가이드 팔레트: 블루·바이올렛·에메랄드·레드·골드), 기본은 포인트색
function hlBg(props: { hlColor?: string }, fallback: string): string {
  return props.hlColor && /^#[0-9a-fA-F]{6}$/.test(props.hlColor) ? props.hlColor : fallback;
}

// 슬라이드별 포인트색 오버라이드 (캔버스 편집) — 유효한 hex일 때만
function accentOf(accent: CardAccent, props: { accentColor?: string }): string {
  return props.accentColor && /^#[0-9a-fA-F]{6}$/.test(props.accentColor)
    ? props.accentColor
    : ACCENTS[accent];
}

// **강조** 마커 → 포인트색 볼드 스팬. pre-wrap: 세그먼트 경계의 공백 유지 + 내부 줄바꿈 허용.
function em(text: string, accent: string, base: CSSProperties = {}): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((seg, i) =>
    i % 2 === 1 ? (
      <span key={i} style={{ ...base, whiteSpace: 'pre-wrap', color: accent, fontWeight: 700 }}>
        {seg}
      </span>
    ) : (
      <span key={i} style={{ ...base, whiteSpace: 'pre-wrap' }}>
        {seg}
      </span>
    )
  );
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
      <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', color }}>caselab</span>
      {right ? (
        <span style={{ fontSize: 24, fontWeight: 600, color: MUTED, ...rightStyle }}>{right}</span>
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
      <div
        data-bg={image ? '1' : undefined}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: CARD_W,
          height: CARD_H,
          display: 'flex',
          backgroundImage: image
            ? `url(${image})`
            : 'linear-gradient(135deg,#232a3d 0%,#12151f 100%)',
          backgroundSize: 'cover',
          backgroundPosition: pos ?? '50% 50%',
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
    </>
  );
}

// ---------- C1 · 사진몰입형 커버 ----------
function C1({ accent, props }: Extract<RenderSlideInput, { template: 'C1' }>) {
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
                fontSize: 28,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.85)',
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
              fontSize: 80,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              textShadow: '0 2px 24px rgba(0,0,0,0.4)',
            }}
          >
            {highlightLines(
              props.title,
              props.hl,
              { minHeight: 100 },
              {
                background: hlBg(props, color),
                color: '#fff',
                padding: '2px 16px',
                borderRadius: 8,
                textShadow: 'none',
              }
            )}
          </div>
          {props.sub ? (
            <div style={{ fontSize: 30, fontWeight: 600, opacity: 0.9, marginTop: 22 }}>
              {props.sub}
            </div>
          ) : null}
          {props.footer ? (
            <div
              style={{
                display: 'flex',
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: 'rgba(255,255,255,0.55)',
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
            <div style={{ display: 'flex', fontSize: 32, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
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
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '0.12em',
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

// ---------- B2 · 이미지 + 배너 + 불릿 ----------
function B2({ accent, props }: Extract<RenderSlideInput, { template: 'B2' }>) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      <Topbar color={INK} right={props.page} />
      {props.media ? (
        <div
          style={{
            display: 'flex',
            marginTop: 44,
            width: '100%',
            height: 420,
            borderRadius: 20,
            overflow: 'hidden',
            background: '#EEF1F6',
          }}
        >
          <img
            src={props.media}
            alt=""
            width={CARD_W - 144}
            height={420}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
          />
        </div>
      ) : null}
      <div style={{ display: 'flex', marginTop: 44 }}>
        <span
          style={{
            background: color,
            color: '#fff',
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1.3,
            padding: '12px 24px',
            borderRadius: 10,
          }}
        >
          {props.banner}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32, marginTop: 44 }}>
        {props.bullets.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div
              style={{
                display: 'flex',
                width: 14,
                height: 14,
                marginTop: 16,
                borderRadius: 7,
                background: color,
                flexShrink: 0,
              }}
            />
            <div style={{ fontSize: 32, lineHeight: 1.5, display: 'flex', flexWrap: 'wrap' }}>
              {em(b, color)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- B5 · 잘된 것 / 별로였던 것 (caselab 시그니처) ----------
function ProCon({
  tone,
  label,
  items,
}: {
  tone: 'good' | 'bad';
  label: string;
  items: string[];
}) {
  const color = tone === 'good' ? GOOD : BAD;
  const mixBg = tone === 'good' ? 0.08 : 0.07;
  const mixLine = tone === 'good' ? 0.3 : 0.28;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 20,
        padding: '40px 42px',
        background: mixWithWhite(color, mixBg),
        border: `2px solid ${mixWithWhite(color, mixLine)}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          fontSize: 38,
          fontWeight: 800,
          color,
          marginBottom: 20,
        }}
      >
        {/* ✓·✕ 글리프는 twemoji로 치환돼 톤이 깨짐 → CSS 도형으로 직접 그림 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: 26,
            background: color,
          }}
        >
          {tone === 'good' ? (
            <div
              style={{
                width: 24,
                height: 13,
                borderLeft: '5px solid #fff',
                borderBottom: '5px solid #fff',
                transform: 'rotate(-45deg)',
                marginTop: -6,
              }}
            />
          ) : (
            <div
              style={{
                position: 'relative',
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  width: 28,
                  height: 5,
                  background: '#fff',
                  borderRadius: 3,
                  transform: 'rotate(45deg)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  width: 28,
                  height: 5,
                  background: '#fff',
                  borderRadius: 3,
                  transform: 'rotate(-45deg)',
                }}
              />
            </div>
          )}
        </div>
        <span>{label}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((t, i) => (
          <div key={i} style={{ fontSize: 29, lineHeight: 1.55, color: BODY_TEXT, display: 'flex' }}>
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function B5({ props }: Extract<RenderSlideInput, { template: 'B5' }>) {
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      <Topbar color={INK} right={props.page} />
      <div
        style={{
          display: 'flex',
          marginTop: 44,
          fontSize: 52,
          fontWeight: 800,
          letterSpacing: '-0.035em',
        }}
      >
        {props.heading ?? '솔직 후기'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 44 }}>
        <ProCon tone="good" label={props.goodLabel ?? '잘된 것'} items={props.good} />
        <ProCon tone="bad" label={props.badLabel ?? '별로였던 것'} items={props.bad} />
      </div>
    </div>
  );
}

// ---------- O1 · 마무리 · CTA (포인트색 배경) ----------
function O1({ accent, props }: Extract<RenderSlideInput, { template: 'O1' }>) {
  const color = accentOf(accent, props);
  const actions = props.actions ?? [
    { icon: '🔖', text: '저장해두고 필요할 때 다시 보기' },
    { icon: '💬', text: '여러분 케이스도 댓글로 남겨주세요' },
  ];
  return (
    <div style={{ ...cardBase, background: color, color: '#fff', padding: '80px 72px' }}>
      <Topbar color="#fff" right={props.page} rightStyle={{ color: 'rgba(255,255,255,0.6)' }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 48, // 본문 눈높이 통일
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
          {props.eyebrow ?? '오늘의 정리'}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 28,
            fontSize: 66,
            fontWeight: 800,
            letterSpacing: '-0.035em',
          }}
        >
          {highlightLines(
            props.title,
            props.hl,
            { minHeight: 82 },
            { background: hlBg(props, 'rgba(255,255,255,0.22)'), padding: '2px 12px', borderRadius: 8 }
          )}
        </div>
        {props.body ? (
          <div
            style={{
              display: 'flex',
              marginTop: 28,
              fontSize: 32,
              lineHeight: 1.6,
              color: 'rgba(255,255,255,0.92)',
            }}
          >
            <span>{props.body}</span>
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 'auto' }}>
        {actions.map((a, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              background: 'rgba(255,255,255,0.12)',
              border: '1.5px solid rgba(255,255,255,0.3)',
              borderRadius: 16,
              padding: '26px 30px',
              fontSize: 30,
              fontWeight: 600,
            }}
          >
            <span>{a.icon}</span>
            <span>{a.text}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: 36,
          fontSize: 26,
          fontWeight: 700,
          opacity: 0.95,
        }}
      >
        {props.handle ?? '@caselab'}
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
    padding: '8px 18px',
    fontSize: 22,
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
              fontSize: 26,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.7)',
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
            { background: hlBg(props, color), color: '#fff', padding: '2px 16px', borderRadius: 8 }
          )}
        </div>
      </div>
      {props.sub ? (
        <div style={{ display: 'flex', fontSize: 32, lineHeight: 1.6, color: 'rgba(255,255,255,0.6)' }}>
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
            { background: hlBg(props, color), color: '#fff', padding: '2px 16px', borderRadius: 8 }
          )}
        </div>
      </div>
      {props.sub ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            fontSize: 32,
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.6)',
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
              fontSize: 26,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.7)',
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
                  <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>
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
            fontSize: 32,
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          {props.sub}
        </div>
      ) : null}
    </div>
  );
}

// ---------- B1 · 개요·타임라인 리스트 ----------
function B1({ accent, props }: Extract<RenderSlideInput, { template: 'B1' }>) {
  const color = accentOf(accent, props);
  return (
    <div style={{ ...cardBase, background: '#fff', color: INK, padding: '80px 72px' }}>
      <Topbar color={INK} right={props.page} />
      {props.lead ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            marginTop: 56,
            fontSize: 30,
            lineHeight: 1.6,
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
          { background: hlBg(props, color), color: '#fff', padding: '2px 16px', borderRadius: 8 }
        )}
      </div>
      <div
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', marginTop: 44 }}
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
            style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '20px 0' }}
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
            <span style={{ fontSize: 38, fontWeight: 800 }}>{r.term}</span>
            {r.desc ? <span style={{ fontSize: 28, color: MUTED }}>{r.desc}</span> : null}
          </div>
        ))}
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
          marginTop: 48, // 본문 눈높이 통일 — B2·B8과 같은 상단 시작
        }}
      >
        <div style={{ display: 'flex' }}>
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
          <div style={{ display: 'flex', fontSize: 34, color: MUTED, marginTop: 12 }}>
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
            fontSize: 44,
            fontWeight: 800,
            lineHeight: 1.35,
            letterSpacing: '-0.02em',
          }}
        >
          {props.lead}
        </div>
        {props.body ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              marginTop: 28,
              fontSize: 32,
              lineHeight: 1.6,
              color: MUTED,
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
            { background: hlBg(props, color), color: '#fff', padding: '2px 16px', borderRadius: 8, textShadow: 'none' }
          )}
        </div>
        {props.attribution ? (
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, opacity: 0.75, marginTop: 36 }}>
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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 44,
          fontSize: 54,
          fontWeight: 800,
          letterSpacing: '-0.035em',
        }}
      >
        {highlightLines(
          props.heading,
          props.hl,
          { minHeight: 68 },
          { background: hlBg(props, color), color: '#fff', padding: '2px 16px', borderRadius: 8 }
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 44 }}>
        {props.steps.map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 26,
              background: '#F5F7FB',
              borderRadius: 18,
              padding: '30px 34px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 70,
                height: 70,
                borderRadius: 18,
                background: color,
                color: '#fff',
                fontSize: 34,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 36, fontWeight: 800 }}>{s.title}</span>
              {s.desc ? (
                <span style={{ fontSize: 26, color: MUTED, marginTop: 6 }}>{s.desc}</span>
              ) : null}
            </div>
          </div>
        ))}
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
          marginTop: 48, // 본문 눈높이 통일
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
              marginTop: 16,
              fontSize: 30,
              lineHeight: 1.6,
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
        {props.when ? (
          <div style={{ display: 'flex', marginTop: 18, fontSize: 30, lineHeight: 1.5, color: MUTED }}>
            <span>{`"${props.when}"`}</span>
          </div>
        ) : null}
        {promptBox(27)}
        {props.effect ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 30,
              fontSize: 29,
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
              padding: '22px 28px',
              fontSize: 28,
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
          { background: hlBg(props, color), color: '#fff', padding: '2px 16px', borderRadius: 8 }
        )}
      </div>
      {promptBox(28)}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginTop: 26,
          fontSize: 26,
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
      <Topbar color={INK} right={props.page} />
      {props.lead ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            marginTop: 44,
            fontSize: 30,
            lineHeight: 1.6,
            color: MUTED,
          }}
        >
          {em(props.lead, INK)}
        </div>
      ) : null}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          marginTop: 36,
          width: '100%',
          height: 720,
          borderRadius: 22,
          overflow: 'hidden',
          background: '#E9EDF4',
        }}
      >
        <img
          src={props.shot}
          alt=""
          width={CARD_W - 144}
          height={720}
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
              fontSize: 26,
              fontWeight: 700,
              padding: '14px 22px',
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

export function renderSlide(input: RenderSlideInput): ReactNode {
  switch (input.template) {
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
    case 'O1':
      return <O1 {...input} />;
  }
}
