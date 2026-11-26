import { useState } from 'react';
import { X } from 'lucide-react';
import { normalizeTag } from '../utils/video.js';

export default function TagInput({ tags, onChange, placeholder = 'พิมพ์แล้วกด Enter หรือ , เพื่อเพิ่มแฮชแท็ก' }) {
  const [draft, setDraft] = useState('');

  const commit = (raw) => {
    const parts = raw.split(/[,\s]+/).map(normalizeTag).filter(Boolean);
    if (!parts.length) return;
    const next = [...tags];
    parts.forEach((p) => {
      if (!next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p);
    });
    onChange(next);
    setDraft('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/40 px-2 py-1.5 focus-within:border-lime-400 focus-within:ring-2 focus-within:ring-lime-400/25">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-lime-500/15 px-2.5 py-1 text-xs font-medium text-lime-300">
          #{t}
          <button
            type="button"
            aria-label={`ลบ ${t}`}
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="rounded-full p-0.5 hover:bg-lime-500/30"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        placeholder={tags.length ? '' : placeholder}
        className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-zinc-500"
      />
    </div>
  );
}
