import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0b0b0f',
        panel: '#141419',
        accent: '#7c5cff',
      },
    },
  },
  plugins: [],
};

export default config;
