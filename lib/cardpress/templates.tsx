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

// ---------- C1 · 사진몰입형 커버 ----------
function C1({ accent, props }: Extract<RenderSlideInput, { template: 'C1' }>) {
  const color = ACCENTS[accent];
  return (
    <div style={{ ...cardBase, background: '#1a1e2a', color: '#fff' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: CARD_W,
          height: CARD_H,
          display: 'flex',
          backgroundImage: props.coverImage
            ? `url(${props.coverImage})`
            : 'linear-gradient(135deg,#232a3d 0%,#12151f 100%)',
          backgroundSize: `${CARD_W}px ${CARD_H}px`,
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
            'linear-gradient(180deg,rgba(0,0,0,0.15) 0%,rgba(0,0,0,0) 32%,rgba(0,0,0,0.62) 100%)',
        }}
      />
      <div
        style={{
          position: 'relative',
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
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
        <div style={{ display: 'flex', flexDirection: 'column' }}>
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
                background: color,
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
        </div>
      </div>
    </div>
  );
}

// ---------- B2 · 이미지 + 배너 + 불릿 ----------
function B2({ accent, props }: Extract<RenderSlideInput, { template: 'B2' }>) {
  const color = ACCENTS[accent];
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
  const color = ACCENTS[accent];
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
          marginTop: 'auto',
          marginBottom: 'auto',
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
            { background: 'rgba(255,255,255,0.22)', padding: '2px 12px', borderRadius: 8 }
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
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

export function renderSlide(input: RenderSlideInput): ReactNode {
  switch (input.template) {
    case 'C1':
      return <C1 {...input} />;
    case 'B2':
      return <B2 {...input} />;
    case 'B5':
      return <B5 {...input} />;
    case 'O1':
      return <O1 {...input} />;
  }
}
