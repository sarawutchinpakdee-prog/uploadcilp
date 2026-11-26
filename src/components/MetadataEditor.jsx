import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import * as api from '../apiService.js';
import { PLATFORM_MAP } from '../platforms.jsx';
import StepHeader from './StepHeader.jsx';
import TagInput from './TagInput.jsx';
import TemplateBar from './TemplateBar.jsx';
import Toggle from './Toggle.jsx';

export default function MetadataEditor({
  meta, onMeta, overrides, onOverride, selectedIds, onGenerate, generating, canGenerate, fbPages = [], done,
}) {
  const [active, setActive] = useState('main');
  const tab = active === 'main' || selectedIds.includes(active) ? active : 'main';
  // ขีดจำกัดตัวอักษรของ caption หลัก = ค่าที่เข้มที่สุดในบรรดาแพลตฟอร์มที่เลือก
  const captionLimit = selectedIds.length ? Math.min(...selectedIds.map((id) => PLATFORM_MAP[id].captionLimit)) : 2200;

  return (
    <section className="card p-5" aria-label="ข้อมูลโพสต์">
      <StepHeader
        n={2}
        title="ข้อมูลโพสต์"
        hint="ชื่อ คำอธิบาย และแฮชแท็ก — ปรับเฉพาะแต่ละแพลตฟอร์มได้ในแท็บ"
        done={done}
        right={
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || !canGenerate}
            title={canGenerate ? 'ให้ AI ช่วยคิดแคปชั่นและแฮชแท็กให้เข้ากับแต่ละแพลตฟอร์ม' : 'เลือกแพลตฟอร์มอย่างน้อย 1 แห่งก่อน'}
            className="btn btn-ai shrink-0 px-3 py-1.5 text-xs"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {generating ? 'AI กำลังคิด…' : 'ให้ AI ช่วยเขียน'}
          </button>
        }
      />

      <TemplateBar
        meta={meta}
        onMeta={onMeta}
        youtubeSettings={overrides.youtube?.settings}
        onYoutubeSettings={(patch) => onOverride('youtube', { settings: { ...overrides.youtube.settings, ...patch } })}
      />

      <div role="tablist" className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-white/[0.07] px-1">
        <TabBtn active={tab === 'main'} onClick={() => setActive('main')}>ทั่วไป</TabBtn>
        {selectedIds.map((id) => {
          const { name, Icon, accent } = PLATFORM_MAP[id];
          return (
            <TabBtn key={id} active={tab === id} onClick={() => setActive(id)}>
              <Icon size={14} className="text-white" /> {name}
              {overrides[id].custom && <span className="h-1.5 w-1.5 rounded-full bg-lime-400" title="ปรับแต่งเฉพาะแพลตฟอร์มนี้" />}
            </TabBtn>
          );
        })}
      </div>

      {tab === 'main' ? (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="title">ชื่อคลิป (Title)</label>
            <input
              id="title"
              className="input"
              maxLength={100}
              value={meta.title}
              onChange={(e) => onMeta({ title: e.target.value })}
              placeholder="เช่น 3 เทคนิคถ่ายคลิปให้ปัง"
            />
            <Counter value={meta.title.length} max={100} />
          </div>
          <div>
            <label className="label" htmlFor="desc">คำอธิบาย / แคปชั่นหลัก</label>
            <textarea
              id="desc"
              rows={5}
              className="input resize-y"
              value={meta.description}
              onChange={(e) => onMeta({ description: e.target.value })}
              placeholder="เขียนคำอธิบายหรือแคปชั่น ใช้ร่วมกันทุกแพลตฟอร์ม…"
            />
            <Counter value={meta.description.length} max={captionLimit} />
          </div>
          <div>
            <span className="label">แฮชแท็ก</span>
            <TagInput tags={meta.tags} onChange={(tags) => onMeta({ tags })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="footer">ข้อความท้ายโพสต์ (ไม่บังคับ)</label>
              <textarea
                id="footer"
                rows={2}
                className="input resize-y"
                value={meta.footer}
                onChange={(e) => onMeta({ footer: e.target.value })}
                placeholder="เช่น ติดตามตอนต่อไปทุกวัน 20:00 · เครดิตเพลง/ภาพ"
              />
            </div>
            <div>
              <label className="label" htmlFor="link">ลิงก์แนบ (ไม่บังคับ)</label>
              <input
                id="link"
                type="url"
                inputMode="url"
                className="input"
                value={meta.link}
                onChange={(e) => onMeta({ link: e.target.value })}
                placeholder="https://…"
              />
              <p className="mt-1 text-[11px] text-zinc-500">ต่อท้ายคำอธิบายของทุกแพลตฟอร์มที่เลือก</p>
            </div>
          </div>
        </div>
      ) : (
        <PlatformTab pid={tab} ov={overrides[tab]} meta={meta} fbPages={fbPages} onChange={(patch) => onOverride(tab, patch)} />
      )}
    </section>
  );
}

const Counter = ({ value, max }) => (
  <div className={`mt-1 text-right text-[11px] ${value > max ? 'text-rose-400' : 'text-zinc-500'}`}>{value}/{max}</div>
);

function TabBtn({ active, children, ...rest }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
        active ? 'border-lime-400 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

function PlatformTab({ pid, ov, meta, onChange, fbPages }) {
  const p = PLATFORM_MAP[pid];
  const set = (key, value) => onChange({ settings: { ...ov.settings, [key]: value } });

  const toggleCustom = (on) =>
    onChange({
      custom: on,
      // ครั้งแรกที่เปิด: คัดลอกค่าหลักมาเป็นจุดเริ่มต้น
      ...(on && !ov.caption && !ov.tags.length ? { caption: meta.description, tags: [...meta.tags] } : {}),
    });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
        <div>
          <div className="text-sm font-medium">เขียนแคปชั่น/แฮชแท็กเฉพาะ {p.name}</div>
          <div className="text-xs text-zinc-500">ปิดอยู่ = ใช้ข้อความหลักจากแท็บ “ทั่วไป”</div>
        </div>
        <Toggle checked={ov.custom} onChange={toggleCustom} label="Override caption" />
      </div>

      {ov.custom && (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor={`cap-${pid}`}>แคปชั่น ({p.name})</label>
            <textarea id={`cap-${pid}`} rows={5} className="input resize-y" value={ov.caption} onChange={(e) => onChange({ caption: e.target.value })} />
            <Counter value={ov.caption.length} max={p.captionLimit} />
          </div>
          <div>
            <span className="label">แฮชแท็ก ({p.name})</span>
            <TagInput tags={ov.tags} onChange={(tags) => onChange({ tags })} />
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-xs font-semibold text-zinc-400">ตั้งค่าเฉพาะ {p.name}</h3>
        <div className="space-y-4">
          {pid === 'youtube' && (
            <>
              <Field label="การมองเห็น (Visibility)">
                <Seg value={ov.settings.visibility} onChange={(v) => set('visibility', v)} options={[['public', 'Public'], ['unlisted', 'Unlisted'], ['private', 'Private']]} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="หมวดหมู่">
                  <select className="input" value={ov.settings.category} onChange={(e) => set('category', e.target.value)}>
                    {YT_CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </Field>
                <Field label="ภาษาของคลิป">
                  <select className="input" value={ov.settings.language} onChange={(e) => set('language', e.target.value)}>
                    {YT_LANGS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </Field>
              </div>
              <PlaylistPicker value={ov.settings.playlistId} onChange={(v) => set('playlistId', v)} />
              <Row label="สำหรับเด็ก (Made for Kids)" hint="ระบุว่าเนื้อหานี้ทำสำหรับเด็ก ตามข้อกำหนด COPPA">
                <Toggle checked={ov.settings.madeForKids} onChange={(v) => set('madeForKids', v)} label="Made for kids" />
              </Row>
              <Row label="แจ้งเตือนผู้ติดตาม" hint="ส่งแจ้งเตือนเมื่อคลิปเผยแพร่ (ไม่มีผลกับคลิปที่ตั้งเป็น Private)">
                <Toggle checked={ov.settings.notifySubscribers} onChange={(v) => set('notifySubscribers', v)} label="Notify subscribers" />
              </Row>
              <Row label="อนุญาตให้ฝังบนเว็บอื่น">
                <Toggle checked={ov.settings.embeddable} onChange={(v) => set('embeddable', v)} label="Embeddable" />
              </Row>
              <Row label="แสดงยอดดูต่อสาธารณะ">
                <Toggle checked={ov.settings.publicStats} onChange={(v) => set('publicStats', v)} label="Public stats" />
              </Row>
            </>
          )}

          {pid === 'facebook' && (
            <Field label="โพสต์ลง Page">
              <select className="input" value={ov.settings.pageId} onChange={(e) => set('pageId', e.target.value)}>
                {fbPages.map((pg) => <option key={pg.id} value={pg.id}>{pg.name}</option>)}
              </select>
            </Field>
          )}

          {pid === 'tiktok' && (
            <>
              <Field label="ใครดูได้">
                <Seg value={ov.settings.privacy} onChange={(v) => set('privacy', v)} options={[['public', 'Public'], ['friends', 'Friends'], ['private', 'Only me']]} />
              </Field>
              <Row label="อนุญาตคอมเมนต์"><Toggle checked={ov.settings.allowComments} onChange={(v) => set('allowComments', v)} label="Comments" /></Row>
              <Row label="อนุญาต Duet"><Toggle checked={ov.settings.allowDuet} onChange={(v) => set('allowDuet', v)} label="Duet" /></Row>
              <Row label="อนุญาต Stitch"><Toggle checked={ov.settings.allowStitch} onChange={(v) => set('allowStitch', v)} label="Stitch" /></Row>
            </>
          )}

          {pid === 'instagram' && (
            <Row label="แชร์ไปยัง Feed ด้วย" hint="แสดง Reels นี้ในหน้าโปรไฟล์/ฟีดหลัก">
              <Toggle checked={ov.settings.shareToFeed} onChange={(v) => set('shareToFeed', v)} label="Share to feed" />
            </Row>
          )}
        </div>
      </div>
    </div>
  );
}

// เลือกเพลย์ลิสต์ของช่อง (โหลดจาก Backend) — ถ้าสิทธิ์เก่าไม่พอ ให้เชื่อมต่อ YouTube ใหม่
function PlaylistPicker({ value, onChange }) {
  const [state, setState] = useState({ status: 'loading', playlists: [], error: '' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let off = false;
    setState((s) => ({ ...s, status: 'loading' }));
    api.getYoutubePlaylists()
      .then((r) => !off && setState({ status: r.needsReconnect ? 'reconnect' : 'ok', playlists: r.playlists, error: '' }))
      .catch((e) => !off && setState({ status: 'error', playlists: [], error: e.message }));
    return () => { off = true; };
  }, [nonce]);

  return (
    <Field label="เพิ่มเข้าเพลย์ลิสต์">
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={state.status !== 'ok'}>
        <option value="">
          {state.status === 'loading' ? 'กำลังโหลดเพลย์ลิสต์…' : state.status === 'ok' ? '— ไม่เพิ่ม —' : 'โหลดเพลย์ลิสต์ไม่ได้'}
        </option>
        {state.playlists.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.count})</option>)}
      </select>
      {state.status === 'reconnect' && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-300/90">
          ต้องขอสิทธิ์จัดการเพลย์ลิสต์เพิ่ม — กด “ตัดการเชื่อมต่อ” แล้ว “เชื่อมต่อ” YouTube ใหม่ที่การ์ดแพลตฟอร์ม
          <button type="button" onClick={() => setNonce((n) => n + 1)} className="ml-2 underline underline-offset-2">ลองใหม่</button>
        </p>
      )}
      {state.status === 'error' && (
        <p className="mt-1.5 text-[11px] text-rose-400">
          {state.error} <button type="button" onClick={() => setNonce((n) => n + 1)} className="ml-1 underline underline-offset-2">ลองใหม่</button>
        </p>
      )}
    </Field>
  );
}

// หมวดหมู่ของ YouTube (categoryId ตามที่ API กำหนด)
const YT_CATEGORIES = [
  ['22', 'ผู้คนและบล็อก'], ['24', 'บันเทิง'], ['1', 'ภาพยนตร์และแอนิเมชัน'], ['23', 'ตลก'], ['10', 'เพลง'],
  ['20', 'เกม'], ['26', 'สอนทำ/สไตล์'], ['27', 'การศึกษา'], ['28', 'วิทยาศาสตร์และเทคโนโลยี'],
  ['25', 'ข่าวและการเมือง'], ['17', 'กีฬา'], ['19', 'ท่องเที่ยว'], ['15', 'สัตว์เลี้ยง'], ['2', 'ยานยนต์'],
];
const YT_LANGS = [['th', 'ไทย'], ['en', 'English'], ['zh', '中文'], ['ja', '日本語'], ['ko', '한국어']];

const Field = ({ label, children }) => (
  <div>
    <span className="label">{label}</span>
    {children}
  </div>
);

const Row = ({ label, hint, children }) => (
  <div className="flex items-center justify-between gap-4">
    <div>
      <div className="text-sm">{label}</div>
      {hint && <div className="text-xs text-zinc-500">{hint}</div>}
    </div>
    {children}
  </div>
);

function Seg({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-full border border-white/[0.08] bg-black/40 p-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1.5 text-sm transition ${value === v ? 'bg-lime-300 font-medium text-black' : 'text-zinc-400 hover:text-white'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
