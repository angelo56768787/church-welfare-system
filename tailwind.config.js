/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#142544', 800: '#1b3157', 700: '#243d6b' },
        brand: { DEFAULT: '#315BBD', 50: '#eef3fc', 100: '#dbe6f8' },
        teal: { DEFAULT: '#2E8C7B', 50: '#e8f5f2' },
        gold: '#D5AE6B',
        surface: '#FFFFFF', bg: '#F5F7FA', ink: '#202B3C', muted: '#687589',
      },
      fontFamily: { sans: ['"IBM Plex Sans Arabic"', 'Inter', 'system-ui', 'sans-serif'], num: ['Inter', '"IBM Plex Sans Arabic"', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(20,37,68,.04), 0 4px 16px rgba(20,37,68,.05)' },
    },
  },
  plugins: [],
};
