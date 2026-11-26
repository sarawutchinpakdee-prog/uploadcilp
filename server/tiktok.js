/**
 * TikTok Content Posting API (Direct Post) — Login Kit (OAuth2) + อัปโหลดวิดีโอแบบแบ่งชิ้น
 *
 *  Flow โพสต์: creator_info/query → video/init (FILE_UPLOAD) → PUT ไฟล์ไปที่ upload_url ทีละชิ้น → poll status/fetch
 *
 *  ข้อจำกัดของ TikTok ที่ควรรู้:
 *   - แอปที่ยังไม่ผ่าน Audit: โพสต์ได้เฉพาะ privacy = SELF_ONLY (Only me) และบัญชีที่โพสต์ต้องตั้งเป็น Private
 *     (ไม่งั้นจะได้ error unaudited_client_can_only_post_to_private_accounts)
 *   - ไม่มี API ตั้งเวลาโพสต์ → Backend ปฏิเสธ schedule.mode === 'later'
 *   - access token อายุ ~24 ชม. (เราต่ออายุอัตโนมัติด้วย refresh token ซึ่งอายุ ~365 วัน)
 */
import fs from 'node:fs';
import { readStore, writeStore } from './store.js';
import { HttpError, hashtagText, isPlaceholder, sleep } from './util.js';

const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, PORT = '4000' } = process.env;
const REDIRECT = process.env.TIKTOK_REDIRECT_URI || `http://localhost:${PORT}/api/auth/tiktok/callback`;
const API = 'https://open.tiktokapis.com/v2';

export const label = 'TikTok';
export const configured = !isPlaceholder(TIKTOK_CLIENT_KEY) && !isPlaceholder(TIKTOK_CLIENT_SECRET);
export const missingEnv = 'TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET';

const SCOPES = ['user.info.basic', 'video.publish'];
const PRIVACY = { public: 'PUBLIC_TO_EVERYONE', friends: 'MUTUAL_FOLLOW_FRIENDS', private: 'SELF_ONLY' };

/* ---------------- HTTP helpers ---------------- */
async function tokenRequest(params) {
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, ...params }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error_description || json.error || `TikTok token HTTP ${res.status}`);
  return json;
}

// endpoint ส่วนใหญ่ของ TikTok ตอบ HTTP 200 เสมอ แล้วบอกผลใน error.code ('ok' = สำเร็จ)
async function call(path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.error?.code && json.error.code !== 'ok')) {
    const e = json.error || {};
    throw new HttpError(res.status >= 400 ? res.status : 502, `TikTok: ${e.message || e.code || `HTTP ${res.status}`}`);
  }
  return json.data || {};
}

const toRecord = (t) => ({
  access_token: t.access_token,
  refresh_token: t.refresh_token,
  open_id: t.open_id,
  expires_at: Date.now() + (t.expires_in || 86400) * 1000,
});

async function accessToken() {
  const s = readStore();
  const saved = s.tiktok;
  if (!saved) throw new HttpError(401, 'ยังไม่ได้เชื่อมต่อ TikTok');
  if (saved.tokens.expires_at - 60_000 > Date.now()) return saved.tokens.access_token;

  // ต่ออายุ token อัตโนมัติ
  const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: saved.tokens.refresh_token });
  s.tiktok.tokens = toRecord(fresh);
  writeStore(s);
  return s.tiktok.tokens.access_token;
}

/* ---------------- OAuth ---------------- */
export const authUrl = (state) =>
  'https://www.tiktok.com/v2/auth/authorize/?' +
  new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    scope: SCOPES.join(','),
    response_type: 'code',
    redirect_uri: REDIRECT,
    state,
  });

export async function handleCallback(code) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT });
  const tokens = toRecord(t);
  const info = await call('/post/publish/creator_info/query/', tokens.access_token);
  const s = readStore();
  s.tiktok = { tokens, handle: `@${info.creator_username}`, nickname: info.creator_nickname };
  writeStore(s);
}

export function account() {
  const t = readStore().tiktok;
  return t ? { connected: true, handle: t.handle } : { connected: false, handle: null };
}

export async function disconnect() {
  const s = readStore();
  if (s.tiktok) {
    try {
      await fetch(`${API}/oauth/revoke/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, token: s.tiktok.tokens.access_token }),
      });
    } catch { /* ไม่เป็นไร */ }
  }
  delete s.tiktok;
  writeStore(s);
}

/* ---------------- Publish ---------------- */
const MB = 1024 * 1024;

export async function publish({ file, metadata, schedule }) {
  if (schedule.mode === 'later') {
    throw new HttpError(400, 'TikTok API ไม่รองรับการตั้งเวลาโพสต์ — เลือก "โพสต์ทันที" หรือปิด TikTok');
  }
  const token = await accessToken();
  const { caption = '', settings = {}, video = {} } = metadata;

  // 1) ถามสิทธิ์/ตัวเลือกของบัญชีนี้ก่อน (TikTok บังคับให้เรียกก่อนโพสต์)
  const creator = await call('/post/publish/creator_info/query/', token);
  if (video.duration > creator.max_video_post_duration_sec) {
    throw new HttpError(400, `วิดีโอยาวเกิน ${creator.max_video_post_duration_sec} วินาทีที่ TikTok อนุญาตสำหรับบัญชีนี้`);
  }

  const wanted = PRIVACY[settings.privacy] || 'SELF_ONLY';
  const options = creator.privacy_level_options || [];
  let privacy = wanted;
  let note;
  if (!options.includes(wanted)) {
    // ปลอดภัยไว้ก่อน: ถ้าระดับที่ขอไม่อนุญาต (เช่น แอปยังไม่ Audit) ให้ลดเป็น Only me
    if (!options.includes('SELF_ONLY')) throw new HttpError(400, `บัญชีนี้ไม่อนุญาตระดับ ${wanted} (ตัวเลือก: ${options.join(', ') || 'ไม่มี'})`);
    privacy = 'SELF_ONLY';
    note = 'โพสต์เป็น Only me เพราะ TikTok ยังไม่อนุญาตระดับที่เลือก (แอปยังไม่ผ่านการ Audit)';
  }

  // 2) แบ่งชิ้น: ≤64MB ส่งชิ้นเดียว, ใหญ่กว่านั้นชิ้นละ 32MB (ชิ้นสุดท้ายรวมเศษ)
  const size = file.size;
  const chunk = size <= 64 * MB ? size : 32 * MB;
  const total = Math.max(1, Math.floor(size / chunk));

  const title = [caption, hashtagText(metadata.tags)].filter(Boolean).join(' ').slice(0, 2200);
  const init = await call('/post/publish/video/init/', token, {
    post_info: {
      title,
      privacy_level: privacy,
      disable_comment: settings.allowComments === false,
      disable_duet: settings.allowDuet === false,
      disable_stitch: settings.allowStitch === false,
    },
    source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: total },
  });

  // 3) อัปโหลดทีละชิ้น (ต้องเรียงลำดับ)
  const blob = await fs.openAsBlob(file.path);
  const mime = /\.mov$/i.test(file.originalname || '') ? 'video/quicktime' : 'video/mp4';
  for (let i = 0; i < total; i++) {
    const start = i * chunk;
    const end = i === total - 1 ? size - 1 : start + chunk - 1;
    const res = await fetch(init.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': mime, 'Content-Range': `bytes ${start}-${end}/${size}` },
      body: blob.slice(start, end + 1),
    });
    if (![200, 201, 206].includes(res.status)) {
      throw new HttpError(502, `อัปโหลดชิ้นที่ ${i + 1}/${total} ไปยัง TikTok ไม่สำเร็จ (HTTP ${res.status})`);
    }
  }

  // 4) รอผลการประมวลผล (สูงสุด ~90 วินาที)
  let postId = null;
  let done = false;
  for (let i = 0; i < 30 && !done; i++) {
    await sleep(3000);
    const st = await call('/post/publish/status/fetch/', token, { publish_id: init.publish_id });
    if (st.status === 'FAILED') throw new HttpError(502, `TikTok ปฏิเสธวิดีโอ: ${st.fail_reason || 'ไม่ระบุเหตุผล'}`);
    if (st.status === 'PUBLISH_COMPLETE') {
      postId = st.publicaly_available_post_id?.[0] || null; // (สะกดตามที่ TikTok ใช้จริง) มีค่าเมื่อโพสต์เป็นสาธารณะ
      done = true;
    }
  }
  if (!done) note = [note, 'TikTok ยังประมวลผลอยู่ — เช็คผลในแอป TikTok อีกสักครู่'].filter(Boolean).join(' · ');

  const user = (readStore().tiktok?.handle || '').replace(/^@/, '');
  return {
    id: init.publish_id,
    url: postId ? `https://www.tiktok.com/@${user}/video/${postId}` : `https://www.tiktok.com/@${user}`,
    privacy,
    note,
  };
}
