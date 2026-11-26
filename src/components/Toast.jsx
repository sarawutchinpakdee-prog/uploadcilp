import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const Ctx = createContext(null);
export const useToast = () => useContext(Ctx);

const STYLE = {
  success: { Icon: CheckCircle2, cls: 'text-lime-300', ring: 'border-lime-400/25' },
  error: { Icon: AlertCircle, cls: 'text-rose-300', ring: 'border-rose-400/30' },
  info: { Icon: Info, cls: 'text-white', ring: 'border-white/20' },
};

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setItems((l) => l.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (type, message, opts = {}) => {
      const id = ++idRef.current;
      setItems((l) => [...l.slice(-3), { id, type, message, title: opts.title }]);
      setTimeout(() => dismiss(id), opts.duration ?? (type === 'error' ? 9000 : 4500));
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (m, o) => push('success', m, o),
      error: (m, o) => push('error', m, o),
      info: (m, o) => push('info', m, o),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
      >
        {items.map((t) => {
          const { Icon, cls, ring } = STYLE[t.type];
          return (
            <div
              key={t.id}
              role={t.type === 'error' ? 'alert' : 'status'}
              className={`toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-panel/95 p-3.5 shadow-2xl shadow-black/40 backdrop-blur ${ring}`}
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${cls}`} />
              <div className="min-w-0 flex-1 text-sm">
                {t.title && <div className="font-semibold text-white">{t.title}</div>}
                <div className="whitespace-pre-line break-words text-zinc-300">{t.message}</div>
              </div>
              <button
                type="button"
                aria-label="ปิด"
                onClick={() => dismiss(t.id)}
                className="rounded p-0.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
