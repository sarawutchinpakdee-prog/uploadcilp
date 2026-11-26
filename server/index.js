/**
 * Backend (Express) — OAuth2 + อัปโหลดวิดีโอจริง
 *
 * รัน:  npm run server        (หรือ npm run dev:all เพื่อรันคู่กับหน้าเว็บ)
 * ค่าลับอ่านจากไฟล์ .env ที่รากโปรเจกต์ (ดู .env.example)
 *
 * แพลตฟอร์มที่ต่อจริง: YouTube (youtube.js), Facebook (facebook.js), TikTok (tiktok.js)
 * จะเพิ่มแพลตฟอร์มใหม่: สร้างไฟล์ที่ export { label, configured, missingEnv, authUrl, handleCallback, account, disconnect, publish }
 * แล้วเพิ่มใน `providers` ด้านล่าง
 *
 * ข้อจำกัด (ตั้งใจให้เรียบง่ายสำหรับใช้คนเดียวบนเครื่องตัวเอง):
 *  - เก็บ token ในไฟล์ server/data/tokens.json (ไม่มีระบบผู้ใช้หลายคน)
 *  - ฟังเฉพาะ 127.0.0.1 และรับคำสั่งเขียนเฉพาะจาก FRONTEND_ORIGIN
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import * as facebook from './facebook.js';
import * as tiktok from './tiktok.js';
import * as youtube from './youtube.js';
import { getStats } from './stats.js';

const { PORT = '4000', FRONTEND_ORIGIN = 'http://localhost:5173' } = process.env;

const providers = { youtube, facebook, tiktok };

const ready = Object.entries(providers).filter(([, p]) => p.configured);
if (!ready.length) {
  console.error('\n❌ ยังไม่ได้ตั้งค่าแพลตฟอร์มใดเลยในไฟล์ .env (ต้องมี GOOGLE_* หรือ META_*)\n');
  process.exit(1);
}
Object.entries(providers).forEach(([id, p]) => {
  if (!p.configured) console.warn(`⚠️  ${p.label}: ยังไม่ได้ตั้งค่า ${p.missingEnv} ใน .env — ข้ามแพลตฟอร์มนี้`);
});

const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());

// กันเว็บอื่นยิงคำสั่งเขียนมาที่ localhost (CSRF): รับเฉพาะ Origin ของหน้าเว็บเรา
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== FRONTEND_ORIGIN) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }
  next();
});

const api = express.Router();
const pendingStates = new Map(); // state (กัน CSRF) → { platform, expiry }

function withProvider(req, res, next) {
  const p = providers[req.params.platform];
  if (!p) return res.status(501).json({ error: `Backend ยังไม่รองรับ ${req.params.platform}` });
  if (!p.configured) return res.status(503).json({ error: `ยังไม่ได้ตั้งค่า ${p.missingEnv} ใน .env ของ Backend` });
  req.provider = p;
  next();
}

api.get('/accounts', (_req, res) => {
  res.json(
    Object.fromEntries(
      Object.entries(providers).map(([id, p]) => [id, p.configured ? p.account() : { connected: false, handle: null, pages: [] }]),
    ),
  );
});

api.get('/stats', async (req, res) => {
  try {
    res.json(await getStats(providers, req.query.refresh === '1'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

api.get('/youtube/playlists', async (_req, res) => {
  try {
    res.json(await youtube.playlists());
  } catch (e) {
    res.status(e.status || 500).json({ error: e?.errors?.[0]?.message || e.message });
  }
});

api.get('/auth/:platform/start', withProvider, (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { platform: req.params.platform, expiry: Date.now() + 10 * 60 * 1000 });
  res.redirect(req.provider.authUrl(state));
});

api.get('/auth/:platform/callback', withProvider, async (req, res) => {
  const { code, state, error, error_description: errDesc } = req.query;
  const pending = pendingStates.get(state);
  pendingStates.delete(state);

  // ล็อกอินเสร็จ/พลาด → เด้งกลับหน้าเว็บ (ใช้ redirect เพราะ Google ตั้ง COOP ทำให้ป๊อปอัปส่งข้อความกลับไม่ได้)
  const fail = (msg) => res.redirect(`${FRONTEND_ORIGIN}/?oauth_error=${encodeURIComponent(msg)}`);

  if (error) return fail(errDesc || `ผู้ให้บริการแจ้งว่า: ${error}`);
  if (!code || !pending || pending.platform !== req.params.platform || pending.expiry < Date.now()) {
    return fail('ลิงก์หมดอายุหรือไม่ถูกต้อง ลองกด Connect ใหม่');
  }

  try {
    await req.provider.handleCallback(String(code));
    res.redirect(`${FRONTEND_ORIGIN}/?oauth=${req.params.platform}`);
  } catch (e) {
    console.error(`[${req.params.platform}] OAuth callback error:`, e.message);
    fail(e.message);
  }
});

api.delete('/accounts/:platform', withProvider, async (req, res) => {
  await req.provider.disconnect();
  res.status(204).end();
});

const upload = multer({ dest: path.join(os.tmpdir(), 'video-uploader'), limits: { fileSize: 2 * 1024 ** 3 } });

api.post('/publish/:platform', withProvider, upload.single('video'), async (req, res) => {
  const file = req.file;
  try {
    if (!file) return res.status(400).json({ error: 'ไม่พบไฟล์วิดีโอ' });
    const metadata = JSON.parse(req.body.metadata || '{}');
    const schedule = JSON.parse(req.body.schedule || '{}');
    res.json(await req.provider.publish({ file, metadata, schedule }));
  } catch (e) {
    const msg = e?.errors?.[0]?.message || e.message;
    console.error(`[${req.params.platform}] Publish error:`, msg);
    const status = e.status || (Number.isInteger(e.code) && e.code >= 400 && e.code < 600 ? e.code : 500);
    res.status(status).json({ error: msg });
  } finally {
    if (file) fs.unlink(file.path, () => {});
  }
});

app.use('/api', api);

// จัดการ error ของ multer (เช่น ไฟล์ใหญ่เกิน)
app.use((err, _req, res, _next) => {
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ error: err.message });
});

app.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`✅ API พร้อมที่ http://localhost:${PORT}/api  (อนุญาตเฉพาะ ${FRONTEND_ORIGIN})`);
  console.log(`   แพลตฟอร์มที่พร้อม: ${ready.map(([, p]) => p.label).join(', ')}`);
});
