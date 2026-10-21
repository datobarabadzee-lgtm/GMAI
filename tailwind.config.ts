import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Every ground and text tone is a CSS variable (globals.css) so one set of
         * utilities renders both themes: light by default, dark on `html.dark`.
         * The names are kept (`ink`, `slate`, `cyan`) so the existing modules
         * re-skin without a rewrite; in the light theme `ink` is the light ground
         * and `slate-100` the darkest text.
         */
        ink: {
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          850: 'rgb(var(--ink-850) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
        },
        slate: {
          50: 'rgb(var(--slate-50) / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)',
          900: 'rgb(var(--slate-900) / <alpha-value>)',
        },
        /** Strongest text: navy in the light theme, near-white in the dark one. */
        fg: 'rgb(var(--fg) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        /** LeaderMED navy — the header and hero ground in both themes. */
        navy: { DEFAULT: '#102638', 2: '#0B1C2A', 3: '#163248' },
        /** LeaderMED cyan. DEFAULT is tuned per theme for text legibility; `brand` is the exact mark colour. */
        cyan: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
          deep: '#009FD1',
          brand: '#08C6FF',
        },
        leadermed: {
          blue: '#1854A8',
          orange: '#D85418',
          green: '#0C9C18',
          yellow: '#F0B418',
        },
        clinical: {
          critical: 'rgb(var(--c-critical) / <alpha-value>)',
          high: 'rgb(var(--c-high) / <alpha-value>)',
          moderate: 'rgb(var(--c-moderate) / <alpha-value>)',
          low: 'rgb(var(--c-low) / <alpha-value>)',
          info: 'rgb(var(--c-info) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['var(--font-latin)', 'var(--font-ge)', 'Noto Sans Georgian', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem', '3xl': '1.75rem' },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        soft: 'var(--shadow-soft)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'none' } },
        pulseSoft: { '0%,100%': { opacity: '0.35' }, '50%': { opacity: '1' } },
      },
      animation: {
        'fade-up': 'fade-up .18s ease-out both',
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
export default config;
