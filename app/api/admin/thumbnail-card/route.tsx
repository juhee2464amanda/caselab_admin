import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadCardFonts } from '@/lib/cardpress/fonts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 사진 대신 쓰는 타이포 썸네일 — 제목만으로 목록 카드용 1200×750 PNG를 만든다.
// 프롬프트·가이드는 "찍을 사진"이 마땅치 않은 경우가 많고, 스톡 사진을 섞으면 목록 톤이 흐트러진다.
// 카드뉴스와 같은 렌더러(next/og = Satori)라 폰트·이모지 제약도 같다:
//   - 자식이 둘 이상인 div에는 display:flex를 반드시 명시(안 하면 조용히 겹쳐 그려진다)
//   - woff2 불가 → assets/fonts의 woff 4종(lib/cardpress/fonts.ts)
//   - undefined 스타일 값이 들어가면 렌더 자체가 크래시하므로 기본값을 항상 채운다
// (라우트 파일은 Next가 허용한 export만 둘 수 있어 상수는 모듈 로컬로 둔다)
const CARD_W = 1200;
const CARD_H = 750;

type VariantKey = 'beige' | 'ink' | 'accent' | 'light';

const ACCENT_BY_CATEGORY: Record<string, string> = {
  prompt: '#C2410C',
  guide: '#0F766E',
  tool: '#0E9F6E',
  'context-card': '#7C3AED',
};

const VARIANTS: Record<VariantKey, (accent: string) => { bg: string; ink: string; muted: string; label: string; bar: string; border: string }> = {
  // 브랜드 베이지+골드 (카드뉴스 계열 톤)
  beige: () => ({ bg: '#F7F2E8', ink: '#1A1712', muted: '#8A7F6B', label: '#9A7B3C', bar: '#C6A15B', border: '#E6DCC8' }),
  // 다크 잉크 — 목록에서 가장 눈에 띈다
  ink: () => ({ bg: '#14161C', ink: '#FFFFFF', muted: '#9AA1AE', label: '#D8B26A', bar: '#D8B26A', border: '#242833' }),
  // 카테고리 색 — 분류가 색으로 보인다
  accent: (accent) => ({ bg: accent, ink: '#FFFFFF', muted: 'rgba(255,255,255,0.72)', label: 'rgba(255,255,255,0.85)', bar: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.25)' }),
  // 화이트 미니멀 — 본가 카드 배경과 이어진다
  light: (accent) => ({ bg: '#FFFFFF', ink: '#0A0A0A', muted: '#8B95A1', label: accent, bar: accent, border: '#E5E8EB' }),
};

/** 1200폭 카드에서 넘치지 않는 제목 크기 — 한글 1em·라틴 0.55em 근사(카드뉴스 templates.tsx와 같은 규칙) */
function titleSize(title: string): number {
  let em = 0;
  for (const ch of title) em += /[ᄀ-ᇿ가-힣一-龿]/.test(ch) ? 1 : 0.55;
  const maxLineEm = (CARD_W - 160) / 1; // 폰트 크기 1일 때 한 줄에 들어가는 em
  for (const size of [96, 84, 72, 62, 54, 46]) {
    const lines = Math.ceil(em / (maxLineEm / size));
    if (lines <= 3) return size;
  }
  return 40;
}

export async function GET(req: NextRequest) {
  const devBypass =
    process.env.NODE_ENV !== 'production' && req.nextUrl.searchParams.get('dev') === '1';
  if (!devBypass) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const title = (sp.get('title') ?? '').trim().slice(0, 40) || '제목을 입력하세요';
  const label = (sp.get('label') ?? '').trim().slice(0, 12);
  const variantKey = (sp.get('variant') ?? 'beige') as VariantKey;
  const accent = ACCENT_BY_CATEGORY[sp.get('category') ?? 'prompt'] ?? ACCENT_BY_CATEGORY.prompt;
  const v = (VARIANTS[variantKey] ?? VARIANTS.beige)(accent);
  const size = titleSize(title);

  try {
    return new ImageResponse(
      (
        <div
          style={{
            width: CARD_W,
            height: CARD_H,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundColor: v.bg,
            padding: '72px 80px',
            fontFamily: 'Pretendard',
            border: variantKey === 'light' ? `2px solid ${v.border}` : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 56, height: 8, borderRadius: 4, backgroundColor: v.bar, display: 'flex' }} />
            {label ? (
              <span style={{ fontSize: 30, fontWeight: 700, color: v.label, letterSpacing: '-0.01em' }}>{label}</span>
            ) : null}
          </div>

          <div style={{ display: 'flex' }}>
            <span
              style={{
                fontSize: size,
                fontWeight: 800,
                color: v.ink,
                lineHeight: 1.24,
                letterSpacing: '-0.03em',
                // Satori는 word-break 지원이 제한적 — 한국어는 자동 줄바꿈으로 충분하다
              }}
            >
              {title}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 26, fontWeight: 600, color: v.muted, letterSpacing: '0.02em' }}>caselab</span>
            <span style={{ fontSize: 22, fontWeight: 500, color: v.muted }}>ai-caselab</span>
          </div>
        </div>
      ),
      { width: CARD_W, height: CARD_H, fonts: await loadCardFonts() }
    );
  } catch (e) {
    console.error('[admin/thumbnail-card]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'render failed' }, { status: 500 });
  }
}
