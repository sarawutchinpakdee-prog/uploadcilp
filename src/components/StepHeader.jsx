import { Check } from 'lucide-react';

export default function StepHeader({ n, title, hint, done, right }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          className={`tag-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
            done ? 'border-lime-300 bg-lime-300 text-black' : 'border-white/15 bg-white/[0.05] text-zinc-300'
          }`}
        >
          {done ? <Check size={14} strokeWidth={3} /> : n}
        </span>
        <div>
          <h2 className="text-[15px] font-semibold leading-tight tracking-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}
