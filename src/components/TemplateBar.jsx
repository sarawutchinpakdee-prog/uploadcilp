import { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, Check, Layers, X } from 'lucide-react';
import { useToast } from './Toast.jsx';

// แม่แบบข้อมูลโพสต์: เซฟชุดแฮชแท็ก/ข้อความท้ายโพสต์/ลิงก์ (+ ตั้งค่า YouTube) ไว้ใช้ซ้ำกับทุกคลิป กดทีเดียวเติมให้
// เก็บในเบราว์เซอร์นี้ (localStorage) — ไม่ส่งออกไปที่ใด
const KEY = 'uploader-templates-v1';
const MAX = 12;
const YT_KEYS = ['category', 'language', 'playlistId', 'notifySubscribers', 'embeddable', 'publicStats'];

const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const save = (list) => {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* โหมดส่วนตัว/พื้นที่เต็ม */ }
};

export default function TemplateBar({ meta, onMeta, youtubeSettings, onYoutubeSettings }) {
  const toast = useToast();
  const [list, setList] = useState(load);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [usedId, setUsedId] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { if (naming) inputRef.current?.focus(); }, [naming]);

  const commit = (next) => { setList(next); save(next); };

  // ไม่มีอะไรให้เซฟ = ปุ่มบันทึกถูกปิด
  const hasContent = meta.tags.length > 0 || meta.footer.trim() || meta.link.trim() || meta.description.trim();

  const saveTemplate = () => {
    const title = name.trim().slice(0, 30);
    if (!title) return;
    const tpl = {
      id: String(Date.now()),
      name: title,
      tags: [...meta.tags],
      footer: meta.footer,
      link: meta.link,
      description: meta.description,
      youtube: Object.fromEntries(YT_KEYS.filter((k) => k in (youtubeSettings || {})).map((k) => [k, youtubeSettings[k]])),
    };
    const existing = list.findIndex((t) => t.name === title);
    if (existing === -1 && list.length >= MAX) {
      toast?.error(`เก็บแม่แบบได้สูงสุด ${MAX} ชุด — ลบอันเก่าก่อน`);
      return;
    }
    const next = existing === -1 ? [...list, tpl] : list.map((t, i) => (i === existing ? { ...tpl, id: t.id } : t));
    commit(next);
    setNaming(false);
    setName('');
    toast?.success(existing === -1 ? `บันทึกแม่แบบ “${title}” แล้ว` : `อัปเดตแม่แบบ “${title}” แล้ว`);
  };

  const apply = (t) => {
    onMeta({
      tags: [...t.tags],
      footer: t.footer,
      link: t.link,
      // คำอธิบายหลักเติมเฉพาะเมื่อแม่แบบมีไว้ — ไม่ทับข้อความที่พิมพ์อยู่ด้วยค่าว่าง
      ...(t.description?.trim() ? { description: t.description } : {}),
    });
    if (t.youtube && Object.keys(t.youtube).length) onYoutubeSettings(t.youtube);
    setUsedId(t.id);
    toast?.success(`ใช้แม่แบบ “${t.name}” แล้ว`);
  };

  const remove = (t) => {
    commit(list.filter((x) => x.id !== t.id));
    if (usedId === t.id) setUsedId(null);
  };

  return (
    <div className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tag-mono mr-1 inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Layers size={13} /> แม่แบบ
        </span>

        {list.length === 0 && !naming && (
          <span className="text-xs text-zinc-500">ยังไม่มี — กรอกแฮชแท็ก/ข้อความท้ายโพสต์ แล้วกดบันทึกเป็นแม่แบบ</span>
        )}

        {list.map((t) => (
          <span
            key={t.id}
            className={`group inline-flex items-center overflow-hidden rounded-full border text-xs transition ${
              usedId === t.id ? 'border-lime-400/50 bg-lime-400/10 text-lime-300' : 'border-white/10 text-zinc-200 hover:border-lime-400/40'
            }`}
          >
            <button type="button" onClick={() => apply(t)} className="inline-flex items-center gap-1.5 py-1 pl-3 pr-2" title={`ใช้แม่แบบ “${t.name}” (${t.tags.length} แฮชแท็ก)`}>
              {usedId === t.id && <Check size={12} />} {t.name}
            </button>
            <button
              type="button"
              onClick={() => remove(t)}
              aria-label={`ลบแม่แบบ ${t.name}`}
              className="py-1 pl-0.5 pr-2 text-zinc-500 transition hover:text-rose-400"
            >
              <X size={12} />
            </button>
          </span>
        ))}

        <div className="ml-auto">
          {naming ? (
            <form
              onSubmit={(e) => { e.preventDefault(); saveTemplate(); }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                className="input w-40 py-1.5 text-xs"
                maxLength={30}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (setNaming(false), setName(''))}
                placeholder="ชื่อแม่แบบ"
                aria-label="ชื่อแม่แบบ"
              />
              <button type="submit" disabled={!name.trim()} className="btn btn-primary px-3 py-1.5 text-xs">บันทึก</button>
              <button type="button" onClick={() => { setNaming(false); setName(''); }} className="btn btn-ghost px-3 py-1.5 text-xs">ยกเลิก</button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setNaming(true)}
              disabled={!hasContent}
              title={hasContent ? 'เซฟแฮชแท็ก ข้อความท้ายโพสต์ ลิงก์ และตั้งค่า YouTube ที่กรอกอยู่' : 'กรอกแฮชแท็กหรือข้อความท้ายโพสต์ก่อน'}
              className="btn btn-ghost px-3 py-1.5 text-xs"
            >
              <BookmarkPlus size={14} /> บันทึกเป็นแม่แบบ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
