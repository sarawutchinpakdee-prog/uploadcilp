/**
 * YouTube Data API v3 — OAuth2 + อัปโหลดวิดีโอ
 * (วิดีโอแนวตั้ง/จัตุรัส ≤ 3 นาที YouTube จะจัดเป็น Shorts ให้เอง)
 */
import fs from 'node:fs';
import { google } from 'googleapis';
import { readStore, writeStore } from './store.js';
import { HttpError, hashtagText, isPlaceholder } from './util.js';

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PORT = '4000' } = process.env;
const REDIRECT = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/auth/youtube/callback`;

export const label = 'YouTube';
export const configured = !isPlaceholder(GOOGLE_CLIENT_ID) && !isPlaceholder(GOOGLE_CLIENT_SECRET);
export const missingEnv = 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly', // อ่านชื่อช่องมาแสดงบนการ์ด
  'https://www.googleapis.com/auth/youtube', // จัดการเพลย์ลิสต์ (ดึงรายการ + เพิ่มคลิปเข้าเพลย์ลิสต์)
];
const PLAYLIST_SCOPE = 'https://www.googleapis.com/auth/youtube';

const newOAuth = () => new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT);

function authClient() {
  const saved = readStore().youtube;
  if (!saved) return null;
  const auth = newOAuth();
  auth.setCredentials(saved.tokens);
  // Google ออก access token ใหม่อัตโนมัติ → บันทึกกลับลงไฟล์
  auth.on('tokens', (t) => {
    const s = readStore();
    if (s.youtube) { s.youtube.tokens = { ...s.youtube.tokens, ...t }; writeStore(s); }
  });
  return auth;
}

export const authUrl = (state) =>
  newOAuth().generateAuthUrl({
    access_type: 'offline', // ขอ refresh token
    prompt: 'consent', // บังคับให้ได้ refresh token ทุกครั้งที่เชื่อมต่อ
    scope: SCOPES,
    state,
  });

export async function handleCallback(code) {
  const auth = newOAuth();
  const { tokens } = await auth.getToken(code);
  auth.setCredentials(tokens);
  const ch = await google.youtube({ version: 'v3', auth }).channels.list({ part: ['snippet'], mine: true });
  const sn = ch.data.items?.[0]?.snippet;
  if (!sn) throw new Error('บัญชี Google นี้ยังไม่มีช่อง YouTube');
  const s = readStore();
  s.youtube = { tokens, handle: sn.customUrl || sn.title };
  writeStore(s);
}

/** เพลย์ลิสต์ของช่อง — ถ้าเชื่อมต่อไว้ก่อนมีสิทธิ์จัดการเพลย์ลิสต์ จะบอกให้เชื่อมต่อใหม่ */
export async function playlists() {
  const saved = readStore().youtube;
  if (!saved) throw new HttpError(401, 'ยังไม่ได้เชื่อมต่อ YouTube');
  if (!String(saved.tokens?.scope || '').split(' ').includes(PLAYLIST_SCOPE)) return { needsReconnect: true, playlists: [] };
  const yt = google.youtube({ version: 'v3', auth: authClient() });
  const out = [];
  let pageToken;
  do {
    const r = await yt.playlists.list({ part: ['snippet', 'contentDetails'], mine: true, maxResults: 50, pageToken });
    for (const p of r.data.items || []) out.push({ id: p.id, title: p.snippet.title, count: p.contentDetails?.itemCount ?? 0 });
    pageToken = r.data.nextPageToken;
  } while (pageToken && out.length < 200);
  return { needsReconnect: false, playlists: out };
}

export function account() {
  const y = readStore().youtube;
  return y ? { connected: true, handle: y.handle } : { connected: false, handle: null };
}

export async function disconnect() {
  const s = readStore();
  const t = s.youtube?.tokens;
  if (t) {
    try { await newOAuth().revokeToken(t.refresh_token || t.access_token); } catch { /* token อาจหมดอายุอยู่แล้ว */ }
  }
  delete s.youtube;
  writeStore(s);
}

export async function publish({ file, metadata, schedule }) {
  const auth = authClient();
  if (!auth) throw new HttpError(401, 'ยังไม่ได้เชื่อมต่อ YouTube');

  const { caption = '', settings = {} } = metadata;
  const title = String(metadata.title || '').replace(/[<>]/g, '').trim().slice(0, 100);
  if (!title) throw new HttpError(400, 'ต้องมี Title');

  const description = [caption, hashtagText(metadata.tags)].filter(Boolean).join('\n\n').replace(/[<>]/g, '').slice(0, 4900);

  // tags ของ YouTube รวมกันไม่เกิน ~500 ตัวอักษร
  const tags = [];
  let len = 0;
  for (const t of metadata.tags || []) {
    if (t.includes(',') || len + t.length + 1 > 450) continue;
    tags.push(t);
    len += t.length + 1;
  }

  const scheduled = schedule.mode === 'later' && schedule.at;
  if (scheduled && new Date(schedule.at).getTime() <= Date.now() + 60_000) {
    throw new HttpError(400, 'เวลาตั้งโพสต์ต้องอยู่ในอนาคต');
  }

  const r = await google.youtube({ version: 'v3', auth }).videos.insert({
    part: ['snippet', 'status'],
    notifySubscribers: settings.notifySubscribers !== false,
    requestBody: {
      snippet: {
        title,
        description,
        tags,
        categoryId: /^\d{1,2}$/.test(String(settings.category)) ? String(settings.category) : '22',
        ...(/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(settings.language || '') ? { defaultLanguage: settings.language, defaultAudioLanguage: settings.language } : {}),
      },
      status: {
        // ตั้งเวลา = ต้องเป็น private + publishAt  (YouTube จะเปิดเป็นสาธารณะเองตอนถึงเวลา)
        privacyStatus: scheduled ? 'private' : settings.visibility || 'private',
        ...(scheduled ? { publishAt: new Date(schedule.at).toISOString() } : {}),
        selfDeclaredMadeForKids: !!settings.madeForKids,
        embeddable: settings.embeddable !== false,
        publicStatsViewable: settings.publicStats !== false,
      },
    },
    media: { body: fs.createReadStream(file.path) },
  });

  // เพิ่มเข้าเพลย์ลิสต์ (ถ้าเลือก) — พลาดไม่ทำให้การอัปโหลดล้มเหลว แค่แจ้งเตือนในผลลัพธ์
  let note;
  if (settings.playlistId) {
    try {
      await google.youtube({ version: 'v3', auth }).playlistItems.insert({
        part: ['snippet'],
        requestBody: { snippet: { playlistId: String(settings.playlistId), resourceId: { kind: 'youtube#video', videoId: r.data.id } } },
      });
    } catch (e) {
      const msg = e?.errors?.[0]?.message || e.message;
      console.error('[youtube] เพิ่มเข้าเพลย์ลิสต์ไม่สำเร็จ:', msg);
      note = `อัปโหลดสำเร็จ แต่เพิ่มเข้าเพลย์ลิสต์ไม่ได้: ${msg}`;
    }
  }

  return {
    id: r.data.id,
    url: `https://www.youtube.com/watch?v=${r.data.id}`,
    privacy: r.data.status?.privacyStatus,
    scheduled: !!scheduled,
    ...(note ? { note } : {}),
  };
}

/** สถิติช่อง: ผู้ติดตาม/ยอดดูรวม/จำนวนคลิป + คลิปล่าสุดพร้อมยอดดู (ใช้โควตาน้อย: channels.list + playlistItems + videos.list) */
export async function stats() {
  const auth = authClient();
  if (!auth) return null;
  const yt = google.youtube({ version: 'v3', auth });
  const ch = await yt.channels.list({ part: ['statistics', 'contentDetails'], mine: true });
  const c = ch.data.items?.[0];
  if (!c) return null;
  const st = c.statistics || {};
  let recent = [];
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  if (uploads) {
    const pl = await yt.playlistItems.list({ part: ['contentDetails'], playlistId: uploads, maxResults: 8 });
    const ids = (pl.data.items || []).map((i) => i.contentDetails.videoId);
    if (ids.length) {
      const v = await yt.videos.list({ part: ['snippet', 'statistics'], id: ids });
      recent = (v.data.items || []).map((x) => ({
        id: x.id,
        title: x.snippet.title,
        publishedAt: x.snippet.publishedAt,
        views: Number(x.statistics?.viewCount || 0),
        url: `https://www.youtube.com/watch?v=${x.id}`,
      }));
    }
  }
  return {
    followers: st.hiddenSubscriberCount ? null : Number(st.subscriberCount || 0),
    views: Number(st.viewCount || 0),
    videos: Number(st.videoCount || 0),
    recent,
  };
}
