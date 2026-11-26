import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FlaskConical, Link2, Loader2 } from 'lucide-react';
import { isRealPlatform } from '../apiService.js';
import { PLATFORMS } from '../platforms.jsx';
import StepHeader from './StepHeader.jsx';
import Toggle from './Toggle.jsx';

export default function PlatformPanel({
  accounts, selected, loading, connecting, warnings, fbPageId,
  onToggle, onConnect, onDisconnect, onFbPage,
}) {
  // กดตัดการเชื่อมต่อ 2 ครั้ง (ครั้งแรกขอยืนยัน) กันกดพลาด
  const [confirmId, setConfirmId] = useState(null);
  useEffect(() => {
    if (!confirmId) return undefined;
    const t = setTimeout(() => setConfirmId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmId]);

  return (
    <section className="card p-5" aria-label="เลือกแพลตฟอร์ม">
      <StepHeader
        n={3}
        title="เลือกแพลตฟอร์ม"
        hint={`เปิดสวิตช์เพื่อส่งคลิปไปลง · เลือกแล้ว ${selected.length}/${PLATFORMS.length}`}
        done={selected.length > 0}
      />

      <ul className="space-y-2">
        {PLATFORMS.map(({ id, name, sub, Icon, accent }) => {
          const acc = accounts[id];
          const on = selected.includes(id) && acc.connected;
          const busy = connecting === id;
          const real = isRealPlatform(id);
          const warns = on ? warnings[id] || [] : [];

          return (
            <li
              key={id}
              className={`rounded-2xl border p-3 transition-all duration-300 ${
                on ? 'border-lime-400/30 bg-gradient-to-r from-lime-400/[0.08] to-transparent' : 'border-white/[0.08] hover:border-white/[0.16]'
              }`}
              style={on ? { boxShadow: '0 0 40px -18px rgba(190,242,100,.6)' } : undefined}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] ${on ? 'text-lime-200' : 'text-white'}`}
                >
                  <Icon size={20} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-xs text-zinc-500">{sub}</span>
                    {!real && (
                      <span className="inline-flex items-center gap-1 tag-mono rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-300" title="ยังไม่ได้ต่อ API จริง — โพสต์ได้แค่แบบจำลอง">
                        <FlaskConical size={10} /> จำลอง
                      </span>
                    )}
                  </div>

                  {loading ? (
                    <div className="mt-1.5 h-3 w-28 animate-pulse rounded bg-zinc-800" />
                  ) : acc.connected ? (
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                      <CheckCircle2 size={12} className="shrink-0 text-lime-400" />
                      <span className="truncate text-zinc-300">{acc.handle}</span>
                      <button
                        type="button"
                        onClick={() => (confirmId === id ? (setConfirmId(null), onDisconnect(id)) : setConfirmId(id))}
                        className={`shrink-0 text-[11px] underline-offset-2 hover:underline ${
                          confirmId === id ? 'font-medium text-rose-400' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {confirmId === id ? 'กดอีกครั้งเพื่อยืนยัน' : 'ตัดการเชื่อมต่อ'}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-zinc-500">ยังไม่ได้เชื่อมต่อ</div>
                  )}
                </div>

                {loading ? null : acc.connected ? (
                  <Toggle checked={on} onChange={(v) => onToggle(id, v)} label={`ส่งไป ${name}`} />
                ) : (
                  <button
                    type="button"
                    onClick={() => onConnect(id)}
                    disabled={busy}
                    className="btn btn-primary shrink-0 px-3 py-1.5 text-xs"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                    {busy ? 'กำลังเชื่อมต่อ…' : 'เชื่อมต่อ'}
                  </button>
                )}
              </div>

              {id === 'facebook' && on && acc.pages?.length > 1 && (
                <div className="mt-3">
                  <label className="label" htmlFor="fb-page">โพสต์ลง Page</label>
                  <select id="fb-page" className="input py-1.5" value={fbPageId} onChange={(e) => onFbPage(e.target.value)}>
                    {acc.pages.map((pg) => <option key={pg.id} value={pg.id}>{pg.name}</option>)}
                  </select>
                </div>
              )}

              {warns.length > 0 && (
                <ul className="mt-2.5 space-y-1">
                  {warns.map((w) => (
                    <li key={w} className="flex items-start gap-1.5 text-xs text-amber-300/90">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
