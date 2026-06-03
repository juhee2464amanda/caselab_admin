import type { Config } from 'tailwindcss';
import { userTokens } from './lib/tokens';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    // D61 (2026-06-03) — Tremor 시각화 컴포넌트 스타일 인식
    './node_modules/@tremor/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        // 표준 토큰 (D59 통일) — 모든 페이지 user mockup index 정합
        bg: userTokens.bgBase,
        ink: userTokens.ink,
        accent: {
          DEFAULT: userTokens.accent,
          50: '#EFF6FF',
          100: '#DBEAFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          900: '#1E3A8A',
          hover: userTokens.accentHover,
        },
        muted: {
          DEFAULT: userTokens.bgSubtle,
          foreground: userTokens.inkMuted,
        },
        border: userTokens.border,

        // user namespace (`bg-user-base` 등) — 명시적 토큰
        user: {
          base: userTokens.bgBase,
          subtle: userTokens.bgSubtle,
          ink: userTokens.ink,
          'ink-muted': userTokens.inkMuted,
          accent: userTokens.accent,
          'accent-hover': userTokens.accentHover,
          border: userTokens.border,
        },

        // admin namespace (D59 하위호환 alias, 신규 코드는 user-* 사용) — D46 폐기
        admin: {
          base: userTokens.bgBase,
          subtle: userTokens.bgSubtle,
          ink: userTokens.ink,
          'ink-muted': userTokens.inkMuted,
          accent: userTokens.accent,
          'accent-hover': userTokens.accentHover,
          border: userTokens.border,
        },
      },
      fontFamily: {
        // D58 (2026-06-03) — Noto Serif KR 폐기. font-serif도 Pretendard로 매핑 (mockup 정합).
        // 기존 font-serif 사용처는 하위 호환 유지, 신규는 font-sans + font-bold/extrabold 권장.
        serif: ['Pretendard', 'system-ui', 'sans-serif'],
        sans: ['Pretendard', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(10,10,10,0.04), 0 1px 2px rgba(10,10,10,0.06)',
        elevated: '0 4px 16px rgba(10,10,10,0.06), 0 2px 6px rgba(10,10,10,0.04)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
