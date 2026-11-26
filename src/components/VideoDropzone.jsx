import { useRef, useState } from 'react';
import { AlertTriangle, Clock, Film, HardDrive, Info, MonitorPlay, RectangleVertical, Trash2, UploadCloud } from 'lucide-react';
import { formatBytes, formatDuration, getVideoWarnings } from '../utils/video.js';
import StepHeader from './StepHeader.jsx';

export default function VideoDropzone({ video, platforms, error, onFile, onClear }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const warnings = getVideoWarnings(video, platforms);

  return (
    <section className="card p-5" aria-label="วิดีโอ">
      <StepHeader
        n={1}
        title="เลือกวิดีโอ"
        hint="ลากไฟล์มาวาง หรือคลิกเพื่อเลือก"
        done={!!video}
        right={
          video && (
            <button type="button" onClick={onClear} className="btn btn-ghost px-2.5 py-1.5 text-xs hover:!text-rose-300">
              <Trash2 size={14} /> เปลี่ยนไฟล์
            </button>
          )
        }
      />

      {!video ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`group flex relative min-h-[260px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-8 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-lime-400/60 ${
            dragging ? 'border-lime-400 bg-lime-500/10' : 'border-white/10 hover:border-lime-400/40 hover:bg-lime-400/[0.03]'
          }`}
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-lime-400/20 bg-lime-400/10 text-lime-300 shadow-[0_0_40px_-8px_rgba(190,242,100,.5)] transition group-hover:scale-105">
            <UploadCloud size={28} />
          </div>
          <p className="font-medium">{dragging ? 'ปล่อยไฟล์ได้เลย' : 'ลากวิดีโอมาวางที่นี่'}</p>
          <p className="mt-1 text-sm text-zinc-400">หรือ <span className="text-lime-300 underline-offset-2 group-hover:underline">เลือกไฟล์จากเครื่อง</span></p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <span className="chip tag-mono">.mp4</span>
            <span className="chip tag-mono">.mov</span>
            <span className="chip">แนะนำแนวตั้ง 9:16</span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".mp4,.mov,video/mp4,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,300px)_1fr]">
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black">
            <video key={video.url} src={video.url} controls playsInline className="max-h-[420px] w-full object-contain" />
          </div>

          <div className="min-w-0">
            <div className="flex items-start gap-2">
              <Film size={16} className="mt-0.5 shrink-0 text-lime-300" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium" title={video.name}>{video.name}</div>
                <div className="text-xs text-zinc-500">พร้อมใช้งาน</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`chip ${video.duration > 60 ? '!bg-amber-500/15 !text-amber-300' : ''}`}><Clock size={12} /> {formatDuration(video.duration)}</span>
              <span className="chip"><RectangleVertical size={12} /> {video.ratio} · {video.isVertical ? 'แนวตั้ง' : 'แนวนอน'}</span>
              <span className="chip"><MonitorPlay size={12} /> {video.width}×{video.height}</span>
              <span className="chip"><HardDrive size={12} /> {formatBytes(video.size)}</span>
            </div>

            {warnings.length > 0 && (
              <ul className="mt-3 space-y-2">
                {warnings.map((w) => (
                  <li
                    key={w.text}
                    className={`flex items-start gap-2 rounded-lg p-2.5 text-xs leading-relaxed ${
                      w.level === 'warn' ? 'bg-amber-500/10 text-amber-300' : 'bg-white/[0.06] text-zinc-300'
                    }`}
                  >
                    {w.level === 'warn' ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <Info size={14} className="mt-0.5 shrink-0" />}
                    {w.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
    </section>
  );
}
