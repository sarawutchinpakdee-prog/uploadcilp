import { useEffect, useRef } from 'react';
import { CalendarClock, FlaskConical, Rocket } from 'lucide-react';
import { PLATFORM_MAP } from '../platforms.jsx';

// หน้าต่างสรุปก่อนโพสต์จริง — กันพลาดเพราะโพสต์จะขึ้นบัญชี/เพจจริงของผู้ใช้
export default function ConfirmDialog({ open, onClose, onConfirm, title, fileName, mode, whenText, targets }) {
  const confirmBtn = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    confirmBtn.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/75 p-4 backdrop-blur-md sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="card relative max-h-[90vh] w-full max-w-lg overflow-y-auto !bg-panel p-6 shadow-[0_0_80px_-30px_rgba(190,242,100,.35)]"
      >
        <h2 id="confirm-title" className="text-lg font-semibold tracking-tight">ยืนยันก่อนโพสต์</h2>
        <p className="mt-1 truncate text-sm text-zinc-400" title={title}>
          “{title}” <span className="text-zinc-600">· {fileName}</span>
        </p>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm">
          {mode === 'later' ? <CalendarClock size={16} className="text-lime-300" /> : <Rocket size={16} className="text-lime-300" />}
          {mode === 'later' ? `ตั้งเวลาโพสต์: ${whenText}` : 'โพสต์ทันที'}
        </div>

        <ul className="mt-4 space-y-2">
          {targets.map(({ pid, lines, note, real }) => {
            const p = PLATFORM_MAP[pid];
            return (
              <li key={pid} className="flex gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
                <span className="mt-0.5 text-white"><p.Icon size={20} /></span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    {p.name}
                    {!real && (
                      <span className="inline-flex items-center gap-1 rounded bg-zinc-700/70 px-1.5 py-0.5 text-[10px] font-normal text-zinc-300">
                        <FlaskConical size={10} /> จำลอง — ไม่ได้โพสต์จริง
                      </span>
                    )}
                  </div>
                  {lines.filter(Boolean).map((l) => (
                    <div key={l} className="text-xs text-zinc-400">{l}</div>
                  ))}
                  {note && real && <div className="mt-1 text-xs text-amber-300/90">{note}</div>}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">ยกเลิก</button>
          <button ref={confirmBtn} type="button" onClick={onConfirm} className="btn btn-primary px-5">
            ยืนยันและโพสต์
          </button>
        </div>
      </div>
    </div>
  );
}
