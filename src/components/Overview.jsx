import { PLATFORMS } from '../platforms.jsx';
import StatsPanel from './StatsPanel.jsx';

// Bento overview: ทุกตัวเลขมาจาก state จริง (บัญชีที่เชื่อม / คิวงาน) ไม่มีข้อมูลสมมติ
const BARS = [
  { key: 'published', label: 'โพสต์แล้ว', color: '#bef264' },
  { key: 'scheduled', label: 'ตั้งเวลา', color: '#fbbf24' },
  { key: 'active', label: 'กำลังทำ', color: '#34d399' },
  { key: 'failed', label: 'ล้มเหลว', color: '#fb7185' },
];

function countJobs(jobs) {
  const c = { published: 0, scheduled: 0, active: 0, failed: 0 };
  jobs.forEach((j) =>
    Object.values(j.platforms).forEach((p) => {
      if (p.status === 'published') c.published++;
      else if (p.status === 'scheduled') c.scheduled++;
      else if (p.status === 'failed') c.failed++;
      else c.active++;
    }),
  );
  return c;
}

function Glow({ className = '' }) {
  return <div aria-hidden className={`pointer-events-none absolute -z-0 rounded-full blur-3xl ${className}`} />;
}

export default function Overview({ accounts, jobs, selected }) {
  const connected = PLATFORMS.filter((p) => accounts[p.id]?.connected);
  const c = countJobs(jobs);
  const total = c.published + c.scheduled + c.active + c.failed;

  return (
    <section className="mx-auto grid max-w-7xl gap-4 px-4 pb-8 sm:px-6 md:grid-cols-6" aria-label="ภาพรวม">
      {/* Connected accounts: avatar cluster + pills */}
      <div className="card relative overflow-hidden p-6 md:col-span-6">
        <Glow className="-bottom-16 left-10 h-44 w-44 bg-emerald-500/15" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-400">บัญชีที่เชื่อมต่อ</h3>
            <span className="tag-mono text-[11px] text-zinc-500">{connected.length}/{PLATFORMS.length}</span>
          </div>
          <div className="mt-4 flex -space-x-2">
            {PLATFORMS.map(({ id, Icon }) => {
              const on = accounts[id]?.connected;
              return (
                <span
                  key={id}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#0d100e] transition hover:-translate-y-1 ${
                    on ? 'bg-lime-300 text-black' : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  <Icon size={18} />
                </span>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const on = accounts[p.id]?.connected;
              return (
                <span key={p.id} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${on ? 'border-lime-400/30 bg-lime-400/10 text-lime-300' : 'border-white/10 text-zinc-500'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-lime-400' : 'bg-zinc-600'}`} />
                  {p.name}
                </span>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-zinc-500">เลือกไว้ลงโพสต์ {selected.length} แพลตฟอร์ม</p>
        </div>
      </div>

      <StatsPanel accounts={accounts} />

      {/* สถานะงานอัปโหลด: แถบกะทัดรัด */}
      <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3 md:col-span-6">
        <div className="flex items-baseline gap-2">
          <h3 className="text-xs font-medium text-zinc-400">สถานะงานอัปโหลด</h3>
          <span className="text-lg font-semibold tracking-tight">{total}</span>
        </div>
        <div className="flex h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
          {BARS.map((b) => (
            <div key={b.key} className="h-full transition-all duration-700" style={{ width: total ? `${(c[b.key] / total) * 100}%` : 0, background: b.color }} />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {BARS.map((b) => (
            <li key={b.key} className="flex items-center gap-1.5" style={{ opacity: c[b.key] ? 1 : 0.45 }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: b.color }} />
              <span className="text-zinc-400">{b.label}</span>
              <span className="tag-mono text-zinc-200">{c[b.key]}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
