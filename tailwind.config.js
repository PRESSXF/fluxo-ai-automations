/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        sunk: 'rgb(var(--sunk) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        ink2: 'rgb(var(--ink2) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        ember: 'rgb(var(--ember) / <alpha-value>)',
        emberlight: 'rgb(var(--emberlight) / <alpha-value>)',
        trig: 'rgb(var(--trig) / <alpha-value>)',
        cond: 'rgb(var(--cond) / <alpha-value>)',
        act: 'rgb(var(--act) / <alpha-value>)',
        ai: 'rgb(var(--ai) / <alpha-value>)',
        ctrl: 'rgb(var(--ctrl) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        bad: 'rgb(var(--bad) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Space Grotesk Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        pulsering: { '0%': { boxShadow: '0 0 0 0 rgb(var(--ember) / .45)' }, '100%': { boxShadow: '0 0 0 10px rgb(var(--ember) / 0)' } },
        dash: { to: { strokeDashoffset: '-24' } },
      },
      animation: {
        rise: 'rise .25s cubic-bezier(.2,.7,.2,1) both',
        pulsering: 'pulsering 1.2s ease-out infinite',
        dash: 'dash .8s linear infinite',
      },
    },
  },
  plugins: [],
}
