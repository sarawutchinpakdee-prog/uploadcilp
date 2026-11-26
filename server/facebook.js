/**
 * Facebook Pages — Facebook Login (OAuth2) + โพสต์ Reels / วิดีโอลง Page ผ่าน Graph API
 *
 *  - คลิปแนวตั้ง 3–90 วินาที → Reels Publishing API  (POST /{page}/video_reels: start → อัปโหลดไป rupload → finish)
 *  - คลิปอื่น (แนวนอน/ยาว)    → POST /{page}/videos  (อัปโหลดแบบ multipart)
 *  - Page Access Token ที่ได้จาก long-lived user token จะไม่หมดอายุ
 *  - Reels API: จำกัด 30 โพสต์ต่อ 24 ชั่วโมงต่อ Page
 */
import fs from 'node:fs';
import { readStore, writeStore } from './store.js';
import { HttpError, hashtagText, isPlaceholder, sleep } from './util.js';

const { META_APP_ID, META_APP_SECRET, META_GRAPH_VERSION = 'v25.0', PORT = '4000' } = process.env;
const REDIRECT = process.env.META_REDIRECT_URI || `http://localhost:${PORT}/api/auth/facebook/callback`;
const G = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export const label = 'Facebook';
export const configured = !isPlaceholder(META_APP_ID) && !isPlaceholder(META_APP_SECRET);
export const missingEnv = 'META_APP_ID / META_APP_SECRET';

// business_management: จำเป็นเมื่อ Page อยู่ใน Business Portfolio (ไม่งั้น /me/accounts จะไม่ส่ง Page นั้นมา)
const SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'business_management'];

/* ---------------- Graph helpers ---------------- */
async function parse(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new HttpError(res.status >= 400 ? res.status : 502, e.error_user_msg || e.message || `Facebook HTTP ${res.status}`);
  }
  return json;
}

const get = (path, params) => fetch(`${G}${path}?${new URLSearchParams(params)}`).then(parse);

const post = (path, params) =>
  fetch(`${G}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])),
  }).then(parse);

/* ---------------- OAuth ---------------- */
export const authUrl = (state) =>
  `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?` +
  new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: REDIRECT,
    state,
    scope: SCOPES.join(','),
    response_type: 'code',
  });

export async function handleCallback(code) {
  const app = { client_id: META_APP_ID, client_secret: META_APP_SECRET };

  // 1) code → short-lived user token
  const short = await get('/oauth/access_token', { ...app, redirect_uri: REDIRECT, code });
  // 2) → long-lived user token (~60 วัน)
  const long = await get('/oauth/access_token', { ...app, grant_type: 'fb_exchange_token', fb_exchange_token: short.access_token });
  const userToken = long.access_token;

  const me = await get('/me', { fields: 'id,name', access_token: userToken });
  // 3) Page ที่ผู้ใช้เลือกอนุญาต + Page token (ไม่หมดอายุเมื่อมาจาก long-lived user token)
  const pagesRes = await get('/me/accounts', { fields: 'id,name,access_token,tasks', limit: 100, access_token: userToken });
  const all = pagesRes.data || [];
  // Page ที่อยู่ใน Business Portfolio อาจไม่โผล่ใน /me/accounts → ดึงจากพอร์ตโฟลิโอเพิ่มแล้วรวมกัน
  for (const p of await businessPages(userToken)) {
    if (!all.some((a) => a.id === p.id)) all.push(p);
  }
  const pages = all
    .filter((p) => !p.tasks || p.tasks.includes('CREATE_CONTENT'))
    .map(({ id, name, access_token }) => ({ id, name, access_token }));

  if (!pages.length) {
    // ช่วยวินิจฉัย: บอกว่า Facebook ส่ง Page มากี่แห่ง และผู้ใช้อนุญาตสิทธิ์อะไรไว้บ้าง (ไม่มี token ในข้อความ)
    const perms = await get('/me/permissions', { access_token: userToken }).catch(() => ({ data: [] }));
    const granted = (perms.data || []).filter((p) => p.status === 'granted').map((p) => p.permission);
    const missing = SCOPES.filter((s) => !granted.includes(s));
    console.error(
      `[facebook] Pages ที่ Facebook ส่งมา: ${all.length}; tasks: ${JSON.stringify(all.map((p) => ({ name: p.name, tasks: p.tasks })))}; สิทธิ์ที่ได้: ${granted.join(',')}`,
    );
    // ล้างการอนุญาตเดิม เพื่อให้ครั้งหน้า Facebook แสดงหน้า "เลือก Page" ใหม่ (ไม่งั้นมันจำค่าเดิมที่ไม่มี Page แล้วข้ามหน้านั้น)
    try { await fetch(`${G}/me/permissions?access_token=${userToken}`, { method: 'DELETE' }); } catch { /* ไม่เป็นไร */ }
    throw new Error(
      (all.length === 0 ? 'ครั้งนี้ไม่ได้เลือก Page ไว้ — ล้างการอนุญาตเดิมให้แล้ว กด Connect ใหม่ แล้วติ๊กเลือก Page ในหน้าอนุญาต\n\n' : '') +
      `ไม่พบ Page ที่โพสต์ได้ — Facebook ส่ง Page มา ${all.length} แห่ง` +
        (all.length ? ` แต่ไม่มีสิทธิ์สร้างเนื้อหา (tasks: ${all.map((p) => (p.tasks || []).join('/') || '-').join(' | ')})` : '') +
        ` · สิทธิ์ที่ได้รับ: ${granted.join(', ') || 'ไม่มี'}` +
        (missing.length ? ` · สิทธิ์ที่ขาด: ${missing.join(', ')}` : ''),
    );
  }

  const s = readStore();
  s.facebook = { user: me, userToken, pages };
  writeStore(s);
}

// Page ในทุก Business Portfolio ที่ผู้ใช้เข้าถึง (เป็นเจ้าของเอง หรือได้รับสิทธิ์จากลูกค้า)
async function businessPages(userToken) {
  const out = [];
  try {
    const biz = await get('/me/businesses', { fields: 'id,name', limit: 100, access_token: userToken });
    for (const b of biz.data || []) {
      for (const edge of ['owned_pages', 'client_pages']) {
        try {
          const r = await get(`/${b.id}/${edge}`, { fields: 'id,name,access_token,tasks', limit: 100, access_token: userToken });
          for (const p of r.data || []) {
            if (!p.access_token) {
              // บาง Page ไม่ส่ง token มาใน edge นี้ → ขอ Page token ตรงๆ (ได้ก็ต่อเมื่อผู้ใช้มีสิทธิ์ใน Page นั้น)
              try { p.access_token = (await get(`/${p.id}`, { fields: 'access_token', access_token: userToken })).access_token; } catch { /* ไม่มีสิทธิ์ */ }
            }
            if (p.access_token) out.push(p);
          }
        } catch { /* edge นี้ไม่มีสิทธิ์/ไม่มีข้อมูล */ }
      }
    }
  } catch { /* ไม่ได้ให้สิทธิ์ business_management หรือไม่มีพอร์ตโฟลิโอ */ }
  console.log(`[facebook] Page จาก Business Portfolio: ${out.length} แห่ง`);
  return out;
}

export function account() {
  const fb = readStore().facebook;
  if (!fb) return { connected: false, handle: null, pages: [] };
  const handle = fb.pages.length === 1 ? fb.pages[0].name : `${fb.user.name} (${fb.pages.length} Pages)`;
  // ห้ามส่ง access_token ออกไปหน้าเว็บ — ส่งเฉพาะ id/ชื่อ Page
  return { connected: true, handle, pages: fb.pages.map(({ id, name }) => ({ id, name })) };
}

export async function disconnect() {
  const s = readStore();
  if (s.facebook?.userToken) {
    try { await fetch(`${G}/me/permissions?access_token=${s.facebook.userToken}`, { method: 'DELETE' }); } catch { /* ไม่เป็นไร */ }
  }
  delete s.facebook;
  writeStore(s);
}

/* ---------------- Publish ---------------- */
export async function publish({ file, metadata, schedule }) {
  const fb = readStore().facebook;
  if (!fb) throw new HttpError(401, 'ยังไม่ได้เชื่อมต่อ Facebook');

  const { caption = '', settings = {}, video = {} } = metadata;
  const page = settings.pageId ? fb.pages.find((p) => p.id === settings.pageId) : fb.pages[0];
  if (!page) throw new HttpError(400, 'ไม่พบ Page ที่เลือก — ลองกด Disconnect แล้ว Connect ใหม่');

  const description = [caption, hashtagText(metadata.tags)].filter(Boolean).join('\n\n').slice(0, 2200);

  let publishAt = null;
  if (schedule.mode === 'later' && schedule.at) {
    publishAt = Math.floor(new Date(schedule.at).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    if (publishAt < now + 10 * 60 + 30) throw new HttpError(400, 'Facebook ต้องตั้งเวลาล่วงหน้าอย่างน้อย 10 นาที');
    if (publishAt > now + 30 * 86400) throw new HttpError(400, 'Facebook ตั้งเวลาล่วงหน้าได้ไม่เกิน 30 วัน');
  }

  const asReel = video.isVertical && video.duration >= 3 && video.duration <= 90;
  const args = { file, page, description, title: metadata.title, publishAt };
  return asReel ? publishReel(args) : publishVideo(args);
}

async function publishReel({ file, page, description, publishAt }) {
  const token = page.access_token;

  const start = await post(`/${page.id}/video_reels`, { upload_phase: 'start', access_token: token });
  const blob = await fs.openAsBlob(file.path);

  // อัปโหลดไฟล์ไปที่ rupload.facebook.com (ไม่ใช่ graph.facebook.com)
  const up = await fetch(start.upload_url, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(file.size) },
    body: blob,
  });
  const upJson = await up.json().catch(() => ({}));
  if (!up.ok || upJson.success === false) {
    throw new HttpError(502, upJson.debug_info?.message || upJson.error?.message || `อัปโหลดไป Facebook ไม่สำเร็จ (HTTP ${up.status})`);
  }

  await post(`/${page.id}/video_reels`, {
    upload_phase: 'finish',
    video_id: start.video_id,
    video_state: publishAt ? 'SCHEDULED' : 'PUBLISHED',
    description,
    ...(publishAt ? { scheduled_publish_time: publishAt } : {}),
    access_token: token,
  });

  await waitUntilProcessed(start.video_id, token);
  return { id: start.video_id, url: `https://www.facebook.com/reel/${start.video_id}`, kind: 'reel', scheduled: !!publishAt };
}

async function publishVideo({ file, page, description, title, publishAt }) {
  if (file.size > 1024 ** 3) throw new HttpError(400, 'วิดีโอปกติบน Facebook รองรับไม่เกิน 1 GB ในเวอร์ชันนี้');

  const form = new FormData();
  form.set('access_token', page.access_token);
  form.set('description', description);
  form.set('title', String(title || '').slice(0, 255));
  form.set('source', await fs.openAsBlob(file.path), file.originalname || 'video.mp4');
  if (publishAt) {
    form.set('published', 'false');
    form.set('unpublished_content_type', 'SCHEDULED');
    form.set('scheduled_publish_time', String(publishAt));
  }

  // อัปโหลดวิดีโอใช้โฮสต์ graph-video
  const r = await fetch(`https://graph-video.facebook.com/${META_GRAPH_VERSION}/${page.id}/videos`, { method: 'POST', body: form }).then(parse);
  return { id: r.id, url: `https://www.facebook.com/watch/?v=${r.id}`, kind: 'video', scheduled: !!publishAt };
}

// รอให้ Facebook ประมวลผลเสร็จ (สูงสุด ~60 วินาที) — ถ้าเช็คสถานะไม่ได้ก็ไม่ถือว่าพลาด เพราะคำสั่ง finish สำเร็จแล้ว
async function waitUntilProcessed(videoId, token) {
  for (let i = 0; i < 20; i++) {
    try {
      const { status = {} } = await get(`/${videoId}`, { fields: 'status', access_token: token });
      if (status.video_status === 'error') {
        throw new HttpError(502, `Facebook ประมวลผลวิดีโอไม่สำเร็จ: ${JSON.stringify(status).slice(0, 200)}`);
      }
      if (status.video_status === 'ready' || status.publishing_phase?.status === 'complete') return;
    } catch (e) {
      if (e instanceof HttpError && e.message.startsWith('Facebook ประมวลผล')) throw e;
    }
    await sleep(3000);
  }
}

/** สถิติ Page: ผู้ติดตามรวมของทุก Page ที่เชื่อม (ใช้สิทธิ์ pages_read_engagement ที่ขอไว้แล้ว) */
export async function stats() {
  const fb = readStore().facebook;
  if (!fb) return null;
  const pages = [];
  for (const p of fb.pages) {
    try {
      const r = await get(`/${p.id}`, { fields: 'name,followers_count,fan_count', access_token: p.access_token });
      pages.push({ id: p.id, name: r.name || p.name, followers: Number(r.followers_count ?? r.fan_count ?? 0) });
    } catch (e) {
      console.warn(`[facebook] อ่านสถิติ Page ${p.name} ไม่ได้:`, e.message);
    }
  }
  if (!pages.length) return null;
  return { followers: pages.reduce((a, p) => a + p.followers, 0), pages };
}
