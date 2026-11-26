import { CalendarClock, CheckCircle2, Clock, ExternalLink, Inbox, ListVideo, Loader2, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { PLATFORM_MAP } from '../platforms.jsx';
import { formatBytes } from '../utils/video.js';

const STATUS = {
  pending: { label: 'รอคิว', cls: 'bg-zinc-700/60 text-zinc-300', bar: 'bg-zinc-500', Icon: Clock },
  uploading: { label: 'กำลังอัปโหลด', cls: 'bg-white/10 text-white', bar: 'bg-white', Icon: UploadCloud },
  processing: { label: 'กำลังประมวลผล', cls: 'bg-amber-500/15 text-amber-300', bar: 'bg-amber-500', Icon: Loader2, spin: true },
  published: { label: 'โพสต์แล้ว', cls: 'bg-lime-400/15 text-lime-300', bar: 'bg-lime-400', Icon: CheckCircle2 },
  scheduled: { label: 'ตั้งเวลาแล้ว', cls: 'bg-white/10 text-zinc-200', bar: 'bg-zinc-300', Icon: CalendarClock },
  failed: { label: 'ล้มเหลว', cls: 'bg-rose-500/15 text-rose-300', bar: 'bg-rose-500', Icon: XCircle },
};

const fmtTime = (iso) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

function summarize(job) {
  const rows = Object.values(job.platforms);
  const done = rows.filter((p) => p.status === 'published' || p.status === 'scheduled').length;
  const failed = rows.filter((p) => p.status === 'failed').length;
  const progress = rows.reduce((a, p) => a + (p.status === 'failed' ? 100 : p.progress), 0) / rows.length;
  const finished = done + failed === rows.length;
  let badge = { label: 'กำลังดำเนินการ', cls: 'text-white' };
  if (finished && !failed) badge = { label: 'เสร็จสมบูรณ์', cls: 'text-lime-300' };
  else if (finished) badge = { label: `ล้มเหลว ${failed} รายการ`, cls: 'text-rose-300' };
  return { total: rows.length, done, progress, finished, badge };
}

export default function QueueTable({ jobs, onClear }) {
  return (
    <section className="card p-5" aria-label="คิวอัปโหลด">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <ListVideo size={18} className="text-lime-300" /> ประวัติและคิวอัปโหลด
          {jobs.length > 0 && <span className="chip">{jobs.length}</span>}
        </h2>
        {jobs.length > 0 && (
          <button type="button" onClick={onClear} className="btn btn-ghost px-2.5 py-1.5 text-xs hover:!text-rose-300">
            <Trash2 size={14} /> ล้างประวัติ
          </button>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/10 py-10 text-center">
          <Inbox size={28} className="mb-2 text-zinc-600" />
          <p className="text-sm text-zinc-400">ยังไม่มีงานอัปโหลด</p>
          <p className="mt-1 text-xs text-zinc-600">เลือกวิดีโอ เลือกแพลตฟอร์ม แล้วกดโพสต์ — ความคืบหน้าจะแสดงที่นี่</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {jobs.map((job) => {
            const sum = summarize(job);
            return (
              <li key={job.id} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium" title={job.title}>{job.title || job.fileName}</div>
                    <div className="truncate text-xs text-zinc-500">
                      {job.fileName} · {formatBytes(job.size)} · {fmtTime(job.createdAt)}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className={`font-medium ${sum.badge.cls}`}>{sum.badge.label}</div>
                    <div className="text-zinc-500">
                      {sum.done}/{sum.total} แพลตฟอร์ม · {job.mode === 'later' ? `ตั้งเวลา ${fmtTime(job.scheduledAt)}` : 'โพสต์ทันที'}
                    </div>
                  </div>
                </div>
                <div className="h-0.5 bg-zinc-800">
                  <div className={`h-full transition-[width] duration-300 ${sum.finished ? 'bg-lime-400' : 'bg-white'}`} style={{ width: `${sum.progress}%` }} />
                </div>

                <div className="divide-y divide-white/[0.05]">
                  {Object.entries(job.platforms).map(([pid, st]) => {
                    const p = PLATFORM_MAP[pid];
                    const s = STATUS[st.status];
                    return (
                      <div key={pid} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[130px_1fr_140px_130px]">
                        <div className="flex items-center gap-2">
                          <p.Icon size={18} className="text-white" />
                          <span className="text-sm font-medium">{p.name}</span>
                        </div>

                        <div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow={Math.round(st.progress)} aria-valuemin={0} aria-valuemax={100}>
                            <div
                              className={`h-full rounded-full transition-[width] duration-200 ${s.bar} ${st.status === 'processing' ? 'bar-stripes' : ''}`}
                              style={{ width: `${st.progress}%` }}
                            />
                          </div>
                          {st.error && <div className="mt-1 text-xs text-rose-400">{st.error}</div>}
                          {st.note && <div className="mt-1 text-xs text-amber-300/90">{st.note}</div>}
                        </div>

                        <div className="flex items-center gap-2 md:justify-end">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>
                            <s.Icon size={12} className={s.spin ? 'animate-spin' : ''} /> {s.label}
                          </span>
                          <span className="w-9 text-right text-xs tabular-nums text-zinc-500 md:hidden">{Math.round(st.progress)}%</span>
                        </div>

                        <div className="col-span-2 md:col-span-1 md:text-right">
                          {(st.status === 'published' || st.status === 'scheduled') && st.url ? (
                            <a href={st.url} target="_blank" rel="noreferrer" className="btn btn-ghost px-2.5 py-1.5 text-xs">
                              <ExternalLink size={13} /> เปิดโพสต์
                            </a>
                          ) : (
                            <span className="hidden text-xs tabular-nums text-zinc-500 md:inline">{Math.round(st.progress)}%</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
