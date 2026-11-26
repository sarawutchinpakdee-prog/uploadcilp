import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const KEY = 'uploader-theme';
const read = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

// สลับโหมดมืด/สว่าง — เก็บค่าในเบราว์เซอร์ (ตั้งค่าเริ่มต้นตั้งแต่ index.html กันหน้าวาบ)
export default function ThemeToggle() {
  const [theme, setTheme] = useState(read);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch { /* โหมดส่วนตัว */ }
  }, [theme]);

  const light = theme === 'light';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={light}
      aria-label="สลับโหมดมืด/สว่าง"
      onClick={() => setTheme(light ? 'dark' : 'light')}
      className="relative flex h-9 w-[72px] shrink-0 items-center rounded-full border border-white/10 bg-white/[0.06] p-1 transition hover:border-lime-400/40"
    >
      <span className={`absolute h-7 w-8 rounded-full bg-lime-300 shadow-[0_4px_14px_-4px_rgba(190,242,100,.7)] transition-transform duration-300 ${light ? 'translate-x-[32px]' : 'translate-x-0'}`} />
      <Moon size={15} className="relative z-10 mx-auto text-black" style={{ opacity: light ? 0.45 : 1, color: light ? undefined : '#000' }} />
      <Sun size={15} className="relative z-10 mx-auto text-black" style={{ opacity: light ? 1 : 0.55 }} />
    </button>
  );
}
