import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, TrendingUp } from 'lucide-react';
import * as api from '../apiService.js';

const nf = new Intl.NumberFormat('th-TH');
const short = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : nf.format(n));
const dShort = (iso) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

// เส้นแนวโน้ม: ต้องมีอย่างน้อย 2 วันถึงจะวาดเส้น
function Trend({ points, color }) {
  const pts = points.filter((p) => p.followers != null);
  if (pts.length < 2) return <p className="text-xs text-zinc-500">เริ่มเก็บประวัติแล้ว — เส้นแนวโน้มจะปรากฏเมื่อมีข้อมูลตั้งแต่ 2 วันขึ้นไป</p>;
  const W = 300, H = 64;
  const vals = pts.map((p) => p.followers);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * W, H - 6 - ((p.followers - lo) / span) * (H - 12)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-full" preserveAspectRatio="none" role="img" aria-label="แนวโน้มผู้ติดตาม">
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={color} opacity=".12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Kpi({ label, value, delta }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value == null ? '—' : nf.format(value)}</span>
        {delta != null && delta !== 0 && (
          <span className={`tag-mono text-xs ${delta > 0 ? 'text-lime-300' : 'text-rose-300'}`}>{delta > 0 ? '+' : ''}{delta}</span>
        )}
      </div>
    </div>
  );
}

export default function StatsPanel({ accounts }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const anyConnected = Object.values(accounts).some((a) => a?.connected);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setErr('');
    try { setStats(await api.getStats(force)); } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (anyConnected) load(); }, [anyConnected, load]);

  if (!anyConnected) return null;
  const yt = stats?.youtube, fb = stats?.facebook;
  const delta = (s) => {
    const h = s?.history?.filter((p) => p.followers != null) || [];
    return h.length >= 2 ? h[h.length - 1].followers - h[0].followers : null;
  };
  const recent = [...(yt?.recent || [])].reverse(); // เก่า → ใหม่ (แกนเวลา)
  const maxV = Math.max(1, ...recent.map((r) => r.views));

  return (
    <div className="card relative overflow-hidden p-5 md:col-span-6">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-lime-400/10 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-400"><TrendingUp size={16} className="text-lime-300" /> ผู้ติดตามและยอดดู</h3>
          <button type="button" onClick={() => load(true)} disabled={loading} className="btn btn-ghost px-2.5 py-1.5 text-xs">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> รีเฟรช
          </button>
        </div>
        {err && <p className="mt-3 text-xs text-rose-300">{err}</p>}
        {!stats && !err && <p className="mt-4 text-sm text-zinc-500">กำลังโหลดสถิติ…</p>}

        {stats && (
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {yt && !yt.error && (
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs text-zinc-400"><span className="h-2 w-2 rounded-full bg-lime-300" /> YouTube</div>
                <div className="grid grid-cols-3 gap-4">
                  <Kpi label="ผู้ติดตาม" value={yt.followers} delta={delta(yt)} />
                  <Kpi label="ยอดดูรวม" value={yt.views} />
                  <Kpi label="คลิป" value={yt.videos} />
                </div>
                <div className="mt-3"><Trend points={yt.history} color="#bef264" /></div>
              </div>
            )}
            {fb && !fb.error && (
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs text-zinc-400"><span className="h-2 w-2 rounded-full bg-amber-300" /> Facebook</div>
                <div className="grid grid-cols-2 gap-4">
                  <Kpi label="ผู้ติดตามรวม" value={fb.followers} delta={delta(fb)} />
                  <Kpi label="จำนวน Page" value={fb.pages?.length} />
                </div>
                <ul className="mt-3 space-y-1 text-xs text-zinc-400">
                  {fb.pages?.map((p) => (
                    <li key={p.id} className="flex justify-between"><span className="truncate">{p.name}</span><span className="tag-mono text-zinc-200">{nf.format(p.followers)}</span></li>
                  ))}
                </ul>
                <div className="mt-3"><Trend points={fb.history} color="#fcd34d" /></div>
              </div>
            )}
          </div>
        )}

        {recent.length > 0 && (
          <div className="mt-5 border-t border-white/[0.07] pt-4">
            <div className="mb-3 text-xs text-zinc-500">ยอดดูของคลิปล่าสุดบน YouTube (เรียงตามวันที่โพสต์)</div>
            <div className="flex h-24 items-end gap-2">
              {recent.map((r) => (
                <a key={r.id} href={r.url} target="_blank" rel="noreferrer" title={`${r.title}\n${nf.format(r.views)} ครั้ง`} className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5">
                  <span className="tag-mono text-center text-[10px] text-zinc-400 opacity-0 transition group-hover:opacity-100">{short(r.views)}</span>
                  <div className="w-full rounded-t-md bg-gradient-to-t from-lime-500/60 to-lime-300 transition group-hover:brightness-125" style={{ height: `${Math.max(4, (r.views / maxV) * 78)}%` }} />
                  <span className="truncate text-center text-[10px] text-zinc-500">{dShort(r.publishedAt)}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
