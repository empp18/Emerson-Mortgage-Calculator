/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './App.tsx', './index.tsx', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-primary': '#005A9C',
        'brand-secondary': '#F2A900',
        'brand-light': '#F0F7FF',
        'brand-dark': '#002D4E',
        'brand-paper': '#FBFAF7',
        'brand-ink': '#14213D',
        'brand-muted': '#5B6577',
        'brand-line': '#E3E6EC',
        'brand-chip': '#EAF2F9',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
