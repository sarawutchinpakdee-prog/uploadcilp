/**
 * ============================================================================
 *  apiService.js — ชั้นเชื่อมต่อ API ทั้งหมดของแอป
 * ============================================================================
 *  โหมดปัจจุบัน: YouTube, Facebook และ TikTok ต่อ Backend จริง (server/), Instagram ยังจำลอง
 *  ควบคุมที่ CONFIG.REAL_PLATFORMS ด้านล่าง
 *
 *  วิธีต่อแพลตฟอร์มเพิ่ม:
 *   1) เพิ่ม endpoint ของแพลตฟอร์มนั้นใน server/index.js ตาม "Backend contract" ด้านล่าง
 *   2) เพิ่มชื่อแพลตฟอร์มใน CONFIG.REAL_PLATFORMS
 *   (ถ้า Backend ไม่ได้อยู่ที่ http://localhost:4000/api ให้ตั้ง VITE_API_BASE_URL)
 *
 *  ⚠️ กฎความปลอดภัย (สำคัญมาก)
 *   - CLIENT_SECRET / API Key / Refresh Token ห้ามอยู่ในโค้ดฝั่ง Frontend เด็ดขาด
 *     (โค้ด Vite ถูกส่งไปที่เบราว์เซอร์ ใครก็เปิดดูได้)
 *   - ฝั่ง Frontend เรียกเฉพาะ Backend ของคุณ แล้ว Backend ถือ Token และเรียก API
 *     ของแต่ละแพลตฟอร์มแทน  → ใส่ค่าจริงในไฟล์ .env ของ Backend เท่านั้น
 *
 *  Backend contract (ที่ฟังก์ชันด้านล่างเรียกใช้)
 *   GET    /accounts                         → { youtube:{connected,handle}, ... }
 *   GET    /auth/:platform/start             → redirect ไปหน้า OAuth2 ของแพลตฟอร์ม
 *   GET    /auth/:platform/callback          → รับ ?code= แลก token เก็บลง DB แล้ว redirect กลับเว็บ
 *   DELETE /accounts/:platform               → revoke + ลบ token
 *   POST   /ai/caption                       → { title, description, tags, perPlatform }
 *   POST   /publish/:platform  (multipart)   → สตรีมสถานะกลับ (SSE) หรือคืน { jobId } แล้ว poll
 * ============================================================================
 */

const CONFIG = {
  // แพลตฟอร์มที่เชื่อมกับ Backend จริงแล้ว (ที่เหลือยังจำลอง)
  // เมื่อทำ Backend ของแพลตฟอร์มไหนเสร็จ ให้เพิ่มชื่อเข้ามาที่นี่ เช่น ['youtube', 'facebook']
  REAL_PLATFORMS: ['youtube', 'facebook', 'tiktok'],
  // true = ให้ Backend เรียก LLM จริงสำหรับสร้างแคปชั่น (ยังไม่ได้ทำ endpoint นี้)
  REAL_AI: false,
  API_BASE_URL: import.meta.env?.VITE_API_BASE_URL || 'http://localhost:4000/api',
  // ปรับความเร็วของการจำลอง (1 = ปกติ, 0.5 = เร็วขึ้นเท่าตัว)
  MOCK_SPEED: 1,
};

const isReal = (platform) => CONFIG.REAL_PLATFORMS.includes(platform);
export const isRealPlatform = isReal; // ให้ UI ใช้แสดงป้าย "จำลอง"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * CONFIG.MOCK_SPEED));
const rand = (min, max) => Math.random() * (max - min) + min;

// Backend ตอบ error เป็น JSON { error } → ดึงข้อความออกมา
const errorText = (raw, fallback) => {
  try { return JSON.parse(raw).error || fallback; } catch { return raw || fallback; }
};

async function http(path, options = {}) {
  const res = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
    credentials: 'include', // ส่ง session cookie ของ Backend (ใช้ยืนยันตัวตนผู้ใช้)
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new Error(errorText(await res.text(), `HTTP ${res.status}`));
  return res.status === 204 ? null : res.json();
}

/* ============================================================================
 *  1) ACCOUNTS / OAuth2
 * ========================================================================== */

export async function getAccounts() {
  if (!CONFIG.REAL_PLATFORMS.length) return null; // ให้ App ใช้ state เริ่มต้น
  const all = await http('/accounts');
  // เอาเฉพาะแพลตฟอร์มที่เชื่อมจริง ส่วนที่เหลือยังเป็นข้อมูลจำลองใน App
  return Object.fromEntries(Object.entries(all).filter(([p]) => isReal(p)));
}

/**
 * เชื่อมต่อบัญชี (OAuth2 Authorization Code flow)
 *
 * ของจริง: เปิด popup ไปที่ `${API_BASE_URL}/auth/${platform}/start` แล้ว Backend จะ redirect ไปหน้า
 * ยินยอมของแพลตฟอร์ม → callback → Backend เก็บ access/refresh token → popup ส่ง postMessage กลับมา
 *
 * ── สิ่งที่ต้องสมัคร/ตั้งค่าที่ฝั่ง Backend (.env) ───────────────────────────
 *  YouTube  : Google Cloud Console → เปิด "YouTube Data API v3" → OAuth consent screen
 *             + OAuth Client ID (Web).  Scope: https://www.googleapis.com/auth/youtube.upload
 *             ENV: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 *             หมายเหตุ: โปรเจกต์ที่ยังไม่ผ่านการ Audit จะอัปโหลดได้แค่แบบ Private
 *
 *  Facebook / Instagram : developers.facebook.com → สร้าง App (Business) + เพิ่ม Facebook Login
 *             Permissions: pages_show_list, pages_read_engagement, pages_manage_posts,
 *             instagram_basic, instagram_content_publish  (ต้องผ่าน App Review สำหรับผู้ใช้ทั่วไป)
 *             ENV: META_APP_ID, META_APP_SECRET, META_REDIRECT_URI
 *             Instagram ต้องเป็นบัญชี Business/Creator ที่ผูกกับ Facebook Page
 *
 *  TikTok   : developers.tiktok.com → สร้าง App + เพิ่มผลิตภัณฑ์ "Content Posting API"
 *             Scope: video.publish (หรือ video.upload สำหรับส่งเป็น draft)
 *             ENV: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI
 *             หมายเหตุ: แอปที่ยังไม่ผ่าน Audit โพสต์ได้เฉพาะโหมด Private (SELF_ONLY)
 */
export async function connectAccount(platform) {
  if (!isReal(platform)) {
    await sleep(1200); // จำลองหน้าต่าง OAuth + แลก token
    const handles = {
      youtube: '@my-channel',
      facebook: 'My Brand Official',
      tiktok: '@mybrand',
      instagram: '@mybrand.reels',
    };
    return { connected: true, handle: handles[platform] };
  }

  // ใช้ redirect เต็มหน้า (ไม่ใช้ป๊อปอัป) เพราะ Google ตั้ง COOP ทำให้ป๊อปอัปส่งผลกลับมาไม่ได้
  // Backend จะเด้งกลับมาที่ /?oauth=<platform> (หรือ ?oauth_error=...) แล้ว App โหลดสถานะบัญชีใหม่เอง
  window.location.href = `${CONFIG.API_BASE_URL}/auth/${platform}/start`;
  return new Promise(() => {}); // หน้ากำลังจะถูกพาออกไป จึงไม่ resolve
}

export async function disconnectAccount(platform) {
  if (!isReal(platform)) {
    await sleep(400);
    return { connected: false, handle: null };
  }
  await http(`/accounts/${platform}`, { method: 'DELETE' });
  return { connected: false, handle: null };
}

/* ============================================================================
 *  2) AI caption / hashtag
 * ========================================================================== */

/**
 * ของจริง: ให้ Backend เรียก LLM (เช่น Claude API) โดยส่ง title/description + ชื่อแพลตฟอร์ม
 * แล้วคืน caption/tags ที่ปรับน้ำเสียงต่อแพลตฟอร์ม.  ใส่ ANTHROPIC_API_KEY ที่ Backend เท่านั้น
 *
 * @param {{platforms:string[], title:string, description:string, tags:string[], fileName:string}} input
 * @returns {Promise<{title:string, description:string, tags:string[], perPlatform:Record<string,{caption:string,tags:string[]}>}>}
 */
export async function generateAICaption(input) {
  if (CONFIG.REAL_AI) {
    return http('/ai/caption', { method: 'POST', body: JSON.stringify(input) });
  }

  await sleep(1400);
  const topic =
    input.title?.trim() ||
    input.fileName?.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() ||
    'คลิปใหม่';
  const base = topic.split(/\s+/).slice(0, 2).join('');
  const commonTags = [base, 'คลิปสั้น', 'viral', 'ไอเดียใหม่'].filter(Boolean);

  const templates = {
    youtube: {
      caption: `${topic} ✨\n\nดูให้จบแล้วจะรู้ว่าทำไมคลิปนี้ถึงน่าสนใจ! อย่าลืมกด Subscribe และกดกระดิ่ง 🔔 เพื่อไม่พลาดคลิปถัดไป`,
      tags: [...commonTags, 'Shorts', 'YouTubeShorts'],
    },
    facebook: {
      caption: `${topic} 🎬\nแชร์ให้เพื่อนๆ ดูกันหน่อย! คิดยังไงกับคลิปนี้ คอมเมนต์บอกกันได้เลย 👇`,
      tags: [...commonTags, 'Reels', 'FacebookReels'],
    },
    tiktok: {
      caption: `${topic} 🔥 รอดูตอนจบ! #fyp`,
      tags: [...commonTags, 'fyp', 'foryou', 'tiktokthailand'],
    },
    instagram: {
      caption: `${topic} 💫\n\nเซฟไว้ดูทีหลังได้เลย 📌 แล้วแท็กเพื่อนที่ต้องเห็นคลิปนี้!`,
      tags: [...commonTags, 'Reels', 'InstagramReels', 'explore'],
    },
  };

  const perPlatform = {};
  input.platforms.forEach((p) => {
    if (templates[p]) perPlatform[p] = templates[p];
  });

  return {
    title: input.title?.trim() || topic,
    description: `${topic}\n\nติดตามเพื่อดูคอนเทนต์ใหม่ๆ ทุกสัปดาห์`,
    tags: commonTags,
    perPlatform,
  };
}

/* ============================================================================
 *  3) PUBLISH — อัปโหลด + กระจายลงแต่ละแพลตฟอร์ม
 * ========================================================================== */

/**
 * @typedef {Object} PublishParams
 * @property {'youtube'|'facebook'|'tiktok'|'instagram'} platform
 * @property {File}   file        ไฟล์วิดีโอ
 * @property {{title:string, caption:string, tags:string[], settings:object}} metadata  (ผ่านการ merge override แล้ว)
 * @property {{mode:'now'|'later', at:string|null}} schedule   at = ISO 8601 (UTC)
 * @property {(u:{status:string, progress:number, url?:string, error?:string})=>void} onUpdate
 * @property {AbortSignal} [signal]
 *
 * สถานะที่ onUpdate ส่งออกมา: 'pending' → 'uploading' → 'processing' → 'published' | 'scheduled' | 'failed'
 */
export async function publishToPlatform(params) {
  if (!isReal(params.platform)) return mockPublish(params);

  // ของจริง: ส่งไฟล์ให้ Backend ของคุณ แล้วให้ Backend เรียก API แพลตฟอร์มต่อ
  return uploadViaBackend(params);
}

/** ส่ง multipart ไป Backend พร้อม progress จริง (fetch ยังไม่รองรับ upload progress จึงใช้ XHR) */
function uploadViaBackend({ platform, file, metadata, schedule, onUpdate }) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('video', file);
    form.append('metadata', JSON.stringify(metadata));
    form.append('schedule', JSON.stringify(schedule));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${CONFIG.API_BASE_URL}/publish/${platform}`);
    xhr.withCredentials = true;
    onUpdate({ status: 'uploading', progress: 0 });

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onUpdate({ status: 'uploading', progress: Math.round((e.loaded / e.total) * 100) });
    };
    xhr.upload.onload = () => onUpdate({ status: 'processing', progress: 100 });
    xhr.onerror = () => {
      onUpdate({ status: 'failed', progress: 0, error: 'เชื่อมต่อ Backend ไม่ได้' });
      reject(new Error('network'));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Backend คืน { url } เมื่อเสร็จ (หรือ { jobId } ถ้าประมวลผลต่อเบื้องหลัง → ให้ poll GET /jobs/:id)
        const { url, note } = JSON.parse(xhr.responseText || '{}');
        onUpdate({ status: schedule.mode === 'later' ? 'scheduled' : 'published', progress: 100, url, note });
        resolve({ url });
      } else {
        const msg = errorText(xhr.responseText, `HTTP ${xhr.status}`);
        onUpdate({ status: 'failed', progress: 0, error: msg });
        reject(new Error(msg));
      }
    };
    xhr.send(form);
  });
}

/* ----------------------------------------------------------------------------
 *  ตัวอย่างโค้ดฝั่ง BACKEND (Node.js) — ย้ายไปไว้ใน server ของคุณ ไม่ใช่ในไฟล์นี้
 *  ถือ token จาก DB ของผู้ใช้ แล้วเรียก API จริงของแต่ละแพลตฟอร์ม
 * ----------------------------------------------------------------------------
 *
 * ── YouTube Data API v3  (npm i googleapis) ─────────────────────────────────
 *  import { google } from 'googleapis';
 *  const oauth2 = new google.auth.OAuth2(
 *    process.env.GOOGLE_CLIENT_ID,        // <-- ใส่ Client ID จริง
 *    process.env.GOOGLE_CLIENT_SECRET,    // <-- ใส่ Client Secret จริง
 *    process.env.GOOGLE_REDIRECT_URI);
 *  oauth2.setCredentials({ refresh_token: user.youtubeRefreshToken });   // <-- token ของผู้ใช้จาก DB
 *  const youtube = google.youtube({ version: 'v3', auth: oauth2 });
 *  const r = await youtube.videos.insert({
 *    part: ['snippet', 'status'],
 *    requestBody: {
 *      snippet: { title, description: caption + '\n' + tags.map(t => '#' + t).join(' '),
 *                 tags, categoryId: '22' },
 *      status: {
 *        privacyStatus: schedule.mode === 'later' ? 'private' : settings.visibility, // public|unlisted|private
 *        publishAt: schedule.mode === 'later' ? schedule.at : undefined,             // ตั้งเวลา: ต้องเป็น private + publishAt
 *        selfDeclaredMadeForKids: settings.madeForKids,
 *      },
 *    },
 *    media: { body: fs.createReadStream(filePath) },   // googleapis ทำ resumable upload ให้
 *  });
 *  // url = `https://youtube.com/watch?v=${r.data.id}`  (วิดีโอแนวตั้ง/จัตุรัส ≤ 3 นาที จะถูกจัดเป็น Shorts เอง)
 *  // ⚠️ โควตา videos.insert = 1,600 หน่วย/ครั้ง (ฟรี 10,000/วัน) ขอเพิ่มได้ผ่านแบบฟอร์มของ Google
 *
 * ── Meta Graph API: Facebook Reels (Page) ──────────────────────────────────
 *  const G = 'https://graph.facebook.com/v21.0';
 *  const pageToken = user.fbPages[settings.pageId].access_token;     // <-- Page Access Token (จาก GET /me/accounts)
 *  // 1) start
 *  const { video_id, upload_url } = await post(`${G}/${pageId}/video_reels`,
 *       { upload_phase: 'start', access_token: pageToken });
 *  // 2) อัปโหลดไฟล์ไปที่ upload_url (rupload.facebook.com)
 *  //    headers: { Authorization: `OAuth ${pageToken}`, offset: 0, file_size: size }  body: ไฟล์ binary
 *  // 3) finish + publish / ตั้งเวลา
 *  await post(`${G}/${pageId}/video_reels`, {
 *    upload_phase: 'finish', video_id, description: caption + hashtags,
 *    video_state: schedule.mode === 'later' ? 'SCHEDULED' : 'PUBLISHED',
 *    scheduled_publish_time: schedule.mode === 'later' ? unixSeconds : undefined,
 *    access_token: pageToken });
 *
 * ── Meta Graph API: Instagram Reels ────────────────────────────────────────
 *  // Instagram ต้องให้ video_url เป็น URL สาธารณะ → Backend อัปไฟล์ขึ้น storage (S3/GCS) ก่อน
 *  const igId = user.instagramBusinessAccountId;                     // <-- IG User ID
 *  const { id: creationId } = await post(`${G}/${igId}/media`, {
 *    media_type: 'REELS', video_url: publicUrl, caption: caption + hashtags,
 *    share_to_feed: settings.shareToFeed, access_token: userToken });
 *  // poll GET /{creationId}?fields=status_code จนได้ FINISHED
 *  await post(`${G}/${igId}/media_publish`, { creation_id: creationId, access_token: userToken });
 *  // ⚠️ Instagram API ไม่รองรับตั้งเวลาโพสต์ Reels โดยตรง → ให้ Backend เก็บงานแล้วยิง media_publish ตอนถึงเวลา (cron/queue)
 *
 * ── TikTok Content Posting API ─────────────────────────────────────────────
 *  const init = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
 *    method: 'POST',
 *    headers: { Authorization: `Bearer ${user.tiktokAccessToken}`,    // <-- access token ของผู้ใช้
 *               'Content-Type': 'application/json; charset=UTF-8' },
 *    body: JSON.stringify({
 *      post_info: { title: caption + hashtags, privacy_level: 'PUBLIC_TO_EVERYONE', // แอปที่ยังไม่ audit ใช้ได้แค่ 'SELF_ONLY'
 *                   disable_comment: !settings.allowComments,
 *                   disable_duet: !settings.allowDuet, disable_stitch: !settings.allowStitch },
 *      source_info: { source: 'FILE_UPLOAD', video_size: size,
 *                     chunk_size: chunk, total_chunk_count: n },
 *    }) }).then(r => r.json());
 *  // จากนั้น PUT ไฟล์เป็นก้อนๆ ไปที่ init.data.upload_url (header Content-Range) แล้ว poll
 *  // POST /v2/post/publish/status/fetch/ ด้วย publish_id จนได้ PUBLISH_COMPLETE
 *  // ⚠️ TikTok API ไม่มีฟังก์ชันตั้งเวลา → ให้ Backend ถือคิวเองแล้วเรียก init ตอนถึงเวลา
 * -------------------------------------------------------------------------- */

/* ============================================================================
 *  MOCK implementation
 * ========================================================================== */

const MOCK_URLS = {
  youtube: (id) => `https://www.youtube.com/shorts/${id}`,
  facebook: (id) => `https://www.facebook.com/reel/${id}`,
  tiktok: (id) => `https://www.tiktok.com/@mybrand/video/${id}`,
  instagram: (id) => `https://www.instagram.com/reel/${id}/`,
};

async function mockPublish({ platform, schedule, onUpdate, signal }) {
  const aborted = () => signal?.aborted;
  onUpdate({ status: 'pending', progress: 0 });
  await sleep(rand(400, 1200));

  // Uploading: เพิ่ม progress ทีละนิดแบบสุ่มความเร็ว (แต่ละแพลตฟอร์มไม่เท่ากัน)
  let p = 0;
  while (p < 100) {
    if (aborted()) return onUpdate({ status: 'failed', progress: p, error: 'ยกเลิกแล้ว' });
    p = Math.min(100, p + rand(3, 11));
    onUpdate({ status: 'uploading', progress: Math.round(p) });
    await sleep(rand(120, 320));
  }

  onUpdate({ status: 'processing', progress: 100 });
  await sleep(rand(1500, 3200));

  if (schedule.mode === 'later') {
    onUpdate({ status: 'scheduled', progress: 100 });
    return { scheduled: true };
  }
  const url = MOCK_URLS[platform](Math.random().toString(36).slice(2, 10));
  onUpdate({ status: 'published', progress: 100, url });
  return { url };
}

/** เพลย์ลิสต์ของช่อง YouTube → { needsReconnect, playlists:[{id,title,count}] } */
export async function getYoutubePlaylists() {
  return http('/youtube/playlists');
}

/** สถิติผู้ติดตาม/ยอดดู + ประวัติรายวัน (Backend แคช 5 นาที; refresh=true เพื่อดึงใหม่) */
export async function getStats(refresh = false) {
  return http(`/stats${refresh ? '?refresh=1' : ''}`);
}
