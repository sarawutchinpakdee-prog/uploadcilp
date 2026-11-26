import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, LayoutDashboard, RefreshCw, ServerOff, UploadCloud } from 'lucide-react';
import * as api from './apiService.js';
import { INITIAL_ACCOUNTS, PLATFORMS, PLATFORM_MAP, UNAUDITED_NOTES, makeOverride } from './platforms.jsx';
import { getPlatformWarnings, isSupportedVideo, readVideoMeta } from './utils/video.js';
import { useToast } from './components/Toast.jsx';
import VideoDropzone from './components/VideoDropzone.jsx';
import MetadataEditor from './components/MetadataEditor.jsx';
import PlatformPanel from './components/PlatformPanel.jsx';
import PublishPanel, { toLocalInput } from './components/PublishPanel.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import LineBackground from './components/LineBackground.jsx';
import Overview from './components/Overview.jsx';
import QueueTable from './components/QueueTable.jsx';

const DRAFT_KEY = 'uploader-draft-v1';

// ร่างข้อความ (ชื่อ/คำอธิบาย/แท็ก/การตั้งค่าแต่ละแพลตฟอร์ม) บันทึกในเบราว์เซอร์ — กันหายตอนรีเฟรชหรือกลับจากหน้าล็อกอิน
const loadDraft = () => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null; } catch { return null; }
};

const buildOverrides = (draft) =>
  Object.fromEntries(
    PLATFORMS.map((p) => {
      const base = makeOverride(p.id);
      const saved = draft?.overrides?.[p.id] || {};
      return [p.id, { ...base, ...saved, settings: { ...base.settings, ...(saved.settings || {}) } }];
    }),
  );

const defaultSchedule = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d);
};

// ต่อท้ายแคปชั่นด้วย "ข้อความท้ายโพสต์" และ "ลิงก์แนบ" (ถ้ากรอกไว้) — ใช้กับทุกแพลตฟอร์ม
const withExtras = (text, m) =>
  [text, m.footer?.trim(), m.link?.trim()].filter(Boolean).join('\n\n');

const VIS = { public: 'Public', unlisted: 'Unlisted', private: 'Private' };
const TT_PRIVACY = { public: 'Public', friends: 'Friends', private: 'Only me' };

export default function App() {
  const toast = useToast();
  const [draft] = useState(loadDraft);

  const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS);
  const [accountsState, setAccountsState] = useState('loading'); // loading | ok | offline
  const [selected, setSelected] = useState([]);
  const [connecting, setConnecting] = useState(null);

  const [video, setVideo] = useState(null);
  const [videoError, setVideoError] = useState('');

  const [meta, setMeta] = useState(() => ({ title: '', description: '', tags: [], link: '', footer: '', ...(draft?.meta || {}) }));
  const [overrides, setOverrides] = useState(() => buildOverrides(draft));
  const [generating, setGenerating] = useState(false);

  const [mode, setMode] = useState('now');
  const [dateTime, setDateTime] = useState(defaultSchedule);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const queueRef = useRef(null);
  // มุมมองหลัก: upload = ขั้นตอนอัปโหลด, dashboard = ภาพรวมบัญชี/สถิติ/สถานะงาน (จำค่าที่เลือกไว้)
  const [view, setView] = useState(() => {
    const q = new URLSearchParams(window.location.search).get('view');
    try { return (q || localStorage.getItem('uploader-view')) === 'dashboard' ? 'dashboard' : 'upload'; } catch { return q === 'dashboard' ? 'dashboard' : 'upload'; }
  });
  useEffect(() => {
    try { localStorage.setItem('uploader-view', view); } catch { /* ไม่เป็นไร */ }
  }, [view]);

  /* ---------------- ร่าง + กันปิดหน้าระหว่างอัปโหลด ---------------- */
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ meta, overrides })); } catch { /* ไม่เป็นไร */ }
  }, [meta, overrides]);

  const busy = jobs.some((j) =>
    Object.values(j.platforms).some((p) => ['pending', 'uploading', 'processing'].includes(p.status)),
  );
  useEffect(() => {
    if (!busy) return undefined;
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [busy]);

  /* ---------------- กลับมาจากหน้าล็อกอิน OAuth ---------------- */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.has('oauth') && !q.has('oauth_error')) return;
    const err = q.get('oauth_error');
    const ok = q.get('oauth');
    window.history.replaceState({}, '', window.location.pathname);
    if (err) toast.error(err, { title: 'เชื่อมต่อไม่สำเร็จ' });
    else if (ok) toast.success(`เชื่อมต่อ ${PLATFORM_MAP[ok]?.name ?? ok} สำเร็จ`);
  }, [toast]);

  /* ---------------- โหลดสถานะบัญชีจาก Backend ---------------- */
  const loadAccounts = useCallback(() => {
    setAccountsState('loading');
    return api
      .getAccounts()
      .then((real) => {
        if (real) {
          setAccounts((a) => ({ ...a, ...real }));
          // เลือกแพลตฟอร์มที่เชื่อมต่อแล้วไว้ให้เลย
          setSelected((s) => {
            const next = s.filter((id) => !(id in real) || real[id].connected);
            Object.entries(real).forEach(([id, v]) => v.connected && !next.includes(id) && next.push(id));
            return next;
          });
          // ตั้ง Page แรกของ Facebook เป็นค่าเริ่มต้น
          const pages = real.facebook?.pages;
          if (pages?.length) {
            setOverrides((o) => {
              const cur = o.facebook.settings.pageId;
              if (pages.some((p) => p.id === cur)) return o;
              return { ...o, facebook: { ...o.facebook, settings: { ...o.facebook.settings, pageId: pages[0].id } } };
            });
          }
        }
        setAccountsState('ok');
      })
      .catch(() => setAccountsState('offline'));
  }, []);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const selectedPlatforms = useMemo(() => selected.map((id) => PLATFORM_MAP[id]), [selected]);
  const warnings = useMemo(() => getPlatformWarnings(video, selectedPlatforms), [video, selectedPlatforms]);
  const fbPages = accounts.facebook.pages || [];

  /* ---------------- accounts ---------------- */
  const handleToggle = (id, on) =>
    setSelected((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)));

  const handleConnect = async (id) => {
    setConnecting(id);
    try {
      const acc = await api.connectAccount(id);
      setAccounts((a) => ({ ...a, [id]: acc }));
      setSelected((s) => [...new Set([...s, id])]);
      toast.success(`เชื่อมต่อ ${PLATFORM_MAP[id].name} สำเร็จ`);
    } catch (e) {
      toast.error(e.message, { title: `เชื่อมต่อ ${PLATFORM_MAP[id].name} ไม่สำเร็จ` });
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (id) => {
    try {
      const acc = await api.disconnectAccount(id);
      setAccounts((a) => ({ ...a, [id]: acc }));
      setSelected((s) => s.filter((x) => x !== id));
      toast.info(`ตัดการเชื่อมต่อ ${PLATFORM_MAP[id].name} แล้ว`);
    } catch (e) {
      toast.error(e.message, { title: 'ตัดการเชื่อมต่อไม่สำเร็จ' });
    }
  };

  /* ---------------- video ---------------- */
  const lastUrl = useRef(null);
  useEffect(() => () => lastUrl.current && URL.revokeObjectURL(lastUrl.current), []);

  const clearVideo = useCallback(() => {
    if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    lastUrl.current = null;
    setVideo(null);
    setVideoError('');
  }, []);

  const handleFile = async (file) => {
    if (!isSupportedVideo(file)) {
      setVideoError('รองรับเฉพาะไฟล์ .mp4 และ .mov เท่านั้น');
      return;
    }
    try {
      const info = await readVideoMeta(file);
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      lastUrl.current = info.url;
      setVideo(info);
      setVideoError('');
      // เติมชื่อคลิปให้อัตโนมัติถ้ายังว่าง
      setMeta((m) => (m.title ? m : { ...m, title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') }));
    } catch (e) {
      setVideoError(e.message);
    }
  };

  /* ---------------- metadata ---------------- */
  const patchMeta = (patch) => setMeta((m) => ({ ...m, ...patch }));
  const patchOverride = (pid, patch) => setOverrides((o) => ({ ...o, [pid]: { ...o[pid], ...patch } }));

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await api.generateAICaption({
        platforms: selected,
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
        fileName: video?.name,
      });
      setMeta((m) => ({ ...m, title: res.title, description: res.description, tags: res.tags }));
      setOverrides((o) => {
        const next = { ...o };
        Object.entries(res.perPlatform).forEach(([pid, v]) => {
          next[pid] = { ...next[pid], custom: true, caption: v.caption, tags: v.tags };
        });
        return next;
      });
      toast.success('AI เขียนแคปชั่นและแฮชแท็กให้แล้ว — ดูและแก้ไขได้ในแต่ละแท็บ');
    } catch (e) {
      toast.error(e.message, { title: 'AI สร้างแคปชั่นไม่สำเร็จ' });
    } finally {
      setGenerating(false);
    }
  };

  /* ---------------- เงื่อนไขก่อนโพสต์ ---------------- */
  const checklist = [
    { label: 'เลือกวิดีโอ', ok: !!video },
    { label: 'ใส่ชื่อคลิป (Title)', ok: !!meta.title.trim() },
    { label: 'เลือกแพลตฟอร์มอย่างน้อย 1 แห่ง', ok: selected.length > 0 },
  ];

  const blocker = useMemo(() => {
    const missing = checklist.find((c) => !c.ok);
    if (missing) return `ยังขาด: ${missing.label}`;
    if (mode === 'later' && selected.includes('tiktok')) {
      return 'TikTok ไม่รองรับตั้งเวลาโพสต์ — ปิดสวิตช์ TikTok หรือเลือก “โพสต์ทันที”';
    }
    if (mode === 'later' && (!dateTime || new Date(dateTime).getTime() <= Date.now())) {
      return 'กรุณาเลือกเวลาโพสต์ที่ยังไม่ผ่านมา';
    }
    return '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, selected, meta.title, mode, dateTime]);

  // สรุปปลายทางที่แสดงในหน้าต่างยืนยัน
  const describe = (pid) => {
    const s = overrides[pid].settings;
    const reel = video && video.isVertical && video.duration >= 3 && video.duration <= 90;
    switch (pid) {
      case 'youtube': return [`ความเป็นส่วนตัว: ${VIS[s.visibility]}`, s.madeForKids ? 'ทำสำหรับเด็ก' : null];
      case 'facebook': return [`Page: ${fbPages.find((p) => p.id === s.pageId)?.name ?? '—'}`, `รูปแบบ: ${reel ? 'Reels' : 'วิดีโอปกติ'}`];
      case 'tiktok': return [`ความเป็นส่วนตัว: ${TT_PRIVACY[s.privacy]}`];
      default: return [s.shareToFeed ? 'แชร์ลง Feed ด้วย' : 'Reels อย่างเดียว'];
    }
  };

  const targets = selected.map((pid) => ({
    pid,
    lines: describe(pid),
    note: UNAUDITED_NOTES[pid],
    real: api.isRealPlatform(pid),
  }));

  /* ---------------- ส่งงาน ---------------- */
  const startPublish = () => {
    setConfirmOpen(false);
    const jobId = crypto.randomUUID();
    const schedule = { mode, at: mode === 'later' ? new Date(dateTime).toISOString() : null };

    setJobs((j) => [
      {
        id: jobId,
        title: meta.title.trim(),
        fileName: video.name,
        size: video.size,
        createdAt: new Date().toISOString(),
        mode,
        scheduledAt: schedule.at,
        platforms: Object.fromEntries(selected.map((pid) => [pid, { status: 'pending', progress: 0 }])),
      },
      ...j,
    ]);

    const update = (pid) => (u) => {
      setJobs((list) =>
        list.map((job) =>
          job.id === jobId ? { ...job, platforms: { ...job.platforms, [pid]: { ...job.platforms[pid], ...u } } } : job,
        ),
      );
      const name = PLATFORM_MAP[pid].name;
      if (u.status === 'published') toast.success(`${name}: โพสต์สำเร็จ`);
      else if (u.status === 'scheduled') toast.success(`${name}: ตั้งเวลาโพสต์แล้ว`);
      else if (u.status === 'failed') toast.error(u.error || 'ไม่ทราบสาเหตุ', { title: `${name}: ล้มเหลว` });
    };

    selected.forEach((pid) => {
      const ov = overrides[pid];
      api
        .publishToPlatform({
          platform: pid,
          file: video.file,
          metadata: {
            title: meta.title.trim(),
            caption: withExtras(ov.custom ? ov.caption : meta.description, meta),
            tags: ov.custom ? ov.tags : meta.tags,
            settings: ov.settings,
            // ข้อมูลคลิป: Backend ใช้เลือกว่า Facebook จะโพสต์เป็น Reels หรือวิดีโอปกติ
            video: { duration: video.duration, isVertical: video.isVertical },
          },
          schedule,
          onUpdate: update(pid),
        })
        .catch(() => {}); // สถานะ failed ถูกส่งผ่าน onUpdate แล้ว
    });

    toast.info('เริ่มอัปโหลดแล้ว — ดูความคืบหน้าด้านล่าง');
    setTimeout(() => queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const whenText = dateTime ? new Date(dateTime).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' }) : '';

  return (
    <div className="min-h-screen">
      <LineBackground />
      <header className="border-b border-white/[0.06] bg-midnight/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-400 text-black shadow-lg shadow-lime-500/20">
            <Clapperboard size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight">Multi-Platform <span className="accent text-xl">Video Uploader</span></h1>
            <p className="text-xs text-zinc-400">อัปโหลดครั้งเดียว กระจายลงทุกแพลตฟอร์ม</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <nav aria-label="มุมมอง" className="inline-flex rounded-full border border-white/[0.08] bg-black/40 p-1">
              {[['upload', 'อัปโหลด', UploadCloud], ['dashboard', 'แดชบอร์ด', LayoutDashboard]].map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  aria-current={view === id ? 'page' : undefined}
                  onClick={() => setView(id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${view === id ? 'bg-lime-300 text-black shadow-[0_6px_20px_-6px_rgba(190,242,100,.6)]' : 'text-zinc-400 hover:text-white'}`}
                >
                  <Icon size={15} /> <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {accountsState === 'offline' && (
        <div className="border-b border-amber-400/20 bg-amber-500/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5 text-sm text-amber-200 sm:px-6">
            <ServerOff size={16} className="shrink-0" />
            <span className="flex-1">
              เชื่อมต่อ Backend ไม่ได้ — เปิดด้วยคำสั่ง <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">npm run server</code> แล้วกดลองใหม่
            </span>
            <button type="button" onClick={loadAccounts} className="btn btn-ghost px-3 py-1 text-xs">
              <RefreshCw size={13} /> ลองใหม่
            </button>
          </div>
        </div>
      )}

      {view === 'upload' ? (
        <section className="mx-auto max-w-7xl px-4 pt-8 pb-1 sm:px-6">
          <h2 className="max-w-3xl text-3xl font-bold leading-[1.15] tracking-tight sm:text-5xl">
            อัปโหลดครั้งเดียว <span className="accent text-4xl sm:text-6xl">ลงทุกแพลตฟอร์ม.</span>
          </h2>
          <p className="mt-3 max-w-xl text-sm text-zinc-400">เลือกวิดีโอ กรอกข้อมูลโพสต์ แล้วเลือกแพลตฟอร์มที่จะลง</p>
        </section>
      ) : (
        <section className="mx-auto max-w-7xl px-4 pt-8 pb-5 sm:px-6">
          <span className="tag-mono inline-flex items-center gap-2 rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1 text-[11px] text-lime-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-400" /> all systems normal
          </span>
          <h2 className="mt-4 text-3xl font-bold leading-[1.15] tracking-tight sm:text-5xl">
            ภาพรวม<span className="accent text-4xl sm:text-6xl">บัญชีของคุณ.</span>
          </h2>
        </section>
      )}

      {view === 'dashboard' && <Overview accounts={accounts} jobs={jobs} selected={selected} />}

      <main hidden={view !== 'upload'} className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">
          <div className="min-w-0 space-y-6">
            <VideoDropzone video={video} platforms={selectedPlatforms} error={videoError} onFile={handleFile} onClear={clearVideo} />
            <MetadataEditor
              meta={meta}
              onMeta={patchMeta}
              overrides={overrides}
              onOverride={patchOverride}
              selectedIds={selected}
              onGenerate={handleGenerate}
              generating={generating}
              canGenerate={selected.length > 0}
              fbPages={fbPages}
              done={!!meta.title.trim()}
            />
          </div>

          <aside className="space-y-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1">
            <PlatformPanel
              accounts={accounts}
              selected={selected}
              loading={accountsState === 'loading'}
              connecting={connecting}
              warnings={warnings}
              fbPageId={overrides.facebook.settings.pageId}
              onToggle={handleToggle}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onFbPage={(pageId) => patchOverride('facebook', { settings: { ...overrides.facebook.settings, pageId } })}
            />
            <PublishPanel
              mode={mode}
              onMode={setMode}
              dateTime={dateTime}
              onDateTime={setDateTime}
              onSubmit={() => setConfirmOpen(true)}
              checklist={checklist}
              blocker={blocker}
              selectedCount={selected.length}
            />
          </aside>
        </div>

        <div ref={queueRef} className="mt-6 scroll-mt-6">
          <QueueTable jobs={jobs} onClear={() => setJobs([])} />
        </div>
      </main>

      <footer className="px-4 pb-8 text-center text-xs text-zinc-600">
        แพลตฟอร์มที่มีป้าย “จำลอง” ยังไม่ได้ต่อ API จริง — ดู <code className="text-zinc-400">src/apiService.js</code>
      </footer>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={startPublish}
        title={meta.title.trim()}
        fileName={video?.name ?? ''}
        mode={mode}
        whenText={whenText}
        targets={targets}
      />
    </div>
  );
}
