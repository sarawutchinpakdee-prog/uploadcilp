import { CalendarClock, Circle, CheckCircle2, Rocket, Send, Zap } from 'lucide-react';
import StepHeader from './StepHeader.jsx';

const pad = (n) => String(n).padStart(2, '0');
export const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export default function PublishPanel({ mode, onMode, dateTime, onDateTime, onSubmit, checklist, blocker, selectedCount }) {
  return (
    <section className="card p-5" aria-label="โพสต์">
      <StepHeader n={4} title="โพสต์" hint="เลือกเวลาแล้วกดส่ง" />

      <div className="grid grid-cols-2 gap-1 rounded-full border border-white/[0.08] bg-black/40 p-1" role="group" aria-label="เวลาโพสต์">
        <Seg active={mode === 'now'} onClick={() => onMode('now')} icon={<Zap size={15} />}>โพสต์ทันที</Seg>
        <Seg active={mode === 'later'} onClick={() => onMode('later')} icon={<CalendarClock size={15} />}>ตั้งเวลา</Seg>
      </div>

      {mode === 'later' && (
        <div className="mt-3">
          <label className="label" htmlFor="when">วันและเวลาที่จะโพสต์</label>
          <input
            id="when"
            type="datetime-local"
            className="input"
            min={toLocalInput(new Date())}
            value={dateTime}
            onChange={(e) => onDateTime(e.target.value)}
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
            Facebook ตั้งเวลาได้ล่วงหน้า 10 นาที–30 วัน · TikTok ไม่รองรับการตั้งเวลา
          </p>
        </div>
      )}

      <ul className="mt-4 space-y-1.5">
        {checklist.map(({ label, ok }) => (
          <li key={label} className={`flex items-center gap-2 text-sm ${ok ? 'text-zinc-300' : 'text-zinc-500'}`}>
            {ok ? <CheckCircle2 size={16} className="text-lime-400" /> : <Circle size={16} />}
            {label}
          </li>
        ))}
      </ul>

      <button type="button" onClick={onSubmit} disabled={!!blocker} className="btn btn-primary mt-5 w-full py-3.5 text-[15px] font-semibold">
        {mode === 'now' ? <Rocket size={18} /> : <Send size={18} />}
        {mode === 'now' ? 'โพสต์' : 'ตั้งเวลาโพสต์'}
        {selectedCount > 0 ? ` ไปยัง ${selectedCount} แพลตฟอร์ม` : ''}
      </button>
      {blocker && <p className="mt-2 text-center text-xs text-zinc-500">{blocker}</p>}
    </section>
  );
}

function Seg({ active, icon, children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition ${
        active ? 'bg-lime-300 text-black shadow-[0_6px_20px_-6px_rgba(190,242,100,.6)]' : 'text-zinc-400 hover:text-white'
      }`}
      {...rest}
    >
      {icon} {children}
    </button>
  );
}
