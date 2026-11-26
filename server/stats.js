/**
 * สถิติ + ประวัติแนวโน้ม
 * - ดึงตัวเลขสดจาก API ของแต่ละแพลตฟอร์ม (แคช 5 นาที กันเปลือกโควตา)
 * - บันทึก snapshot ลงไฟล์ server/data/stats-history.json ไม่เกินวันละ 1 จุดต่อแพลตฟอร์ม (เก็บ 365 วัน)
 *   → กราฟแนวโน้มจะเริ่มมีเส้นหลังเปิดแอปหลายวัน (API ไม่ให้ย้อนหลังของผู้ติดตามฟรี)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'stats-history.json');
const TTL = 5 * 60 * 1000;
let cache = { at: 0, data: null };

const readHistory = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } };
const today = () => new Date().toISOString().slice(0, 10);

function record(history, id, snap) {
  const list = (history[id] ||= []);
  const point = { d: today(), followers: snap.followers ?? null, views: snap.views ?? null };
  const last = list[list.length - 1];
  if (last?.d === point.d) list[list.length - 1] = point; // วันเดียวกัน = เขียนทับด้วยค่าล่าสุด
  else list.push(point);
  if (list.length > 365) list.splice(0, list.length - 365);
}

export async function getStats(providers, force = false) {
  if (!force && cache.data && Date.now() - cache.at < TTL) return cache.data;
  const history = readHistory();
  const out = {};
  await Promise.all(
    Object.entries(providers).map(async ([id, p]) => {
      if (!p.configured || typeof p.stats !== 'function' || !p.account().connected) return;
      try {
        const snap = await p.stats();
        if (!snap) return;
        record(history, id, snap);
        out[id] = { ...snap, history: history[id] };
      } catch (e) {
        out[id] = { error: e?.errors?.[0]?.message || e.message, history: history[id] || [] };
      }
    }),
  );
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(history, null, 2));
  cache = { at: Date.now(), data: out };
  return out;
}
