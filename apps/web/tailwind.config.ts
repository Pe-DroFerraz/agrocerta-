import type { Config } from 'tailwindcss';
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#2F7D4F',
        forest: '#14532D',
        cream: '#FAF7F0',
        gold: '#E9B949',
        earth: '#8B5E3C',
      },
      fontFamily: { sans: ['Inter', 'sans-serif'], heading: ['Plus Jakarta Sans', 'sans-serif'] },
      boxShadow: { soft: '0 3px 20px rgba(30,60,40,.035)' },
    },
  },
  plugins: [],
} satisfies Config;
