/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // โทนสีหลัก: Midnight Black + Pure White, เน้นด้วย Lime Green (ใช้ lime-400 #a3e635 เป็นสีปุ่ม)
        midnight: '#090B0A',
        panel: '#121512',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans: ['"IBM Plex Sans Thai"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
