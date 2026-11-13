import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#16202A',
        ink2: '#26313D',
        muted: '#5B6673',
        line: '#E1E5EA',
        ground: '#F4F5F7',
        brand: { DEFAULT: '#1F5FBF', dark: '#174A94', soft: '#E3ECFA' },
        ok: { DEFAULT: '#166534', soft: '#DDF1E4' },
        warn: { DEFAULT: '#9A3412', soft: '#FDEBD8' },
        bad: { DEFAULT: '#9B1C1C', soft: '#FBE3E3' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
