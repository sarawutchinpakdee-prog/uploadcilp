export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(sec) {
  if (!Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const KNOWN_RATIOS = [
  [9, 16], [16, 9], [1, 1], [4, 5], [3, 4], [4, 3], [21, 9],
];

export function aspectLabel(w, h) {
  if (!w || !h) return '—';
  const r = w / h;
  const hit = KNOWN_RATIOS.find(([a, b]) => Math.abs(r - a / b) < 0.03);
  return hit ? `${hit[0]}:${hit[1]}` : `${r.toFixed(2)}:1`;
}

// อ่าน metadata ของวิดีโอ (ความยาว/ขนาดภาพ) ด้วย <video> ที่ไม่ได้แสดงผล
export function readVideoMeta(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => {
      resolve({
        file,
        url,
        name: file.name,
        size: file.size,
        duration: el.duration,
        width: el.videoWidth,
        height: el.videoHeight,
        ratio: aspectLabel(el.videoWidth, el.videoHeight),
        isVertical: el.videoHeight > el.videoWidth,
      });
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('ไม่สามารถอ่านไฟล์วิดีโอนี้ได้ (อาจเป็นโคเดกที่เบราว์เซอร์ไม่รองรับ)'));
    };
    el.src = url;
  });
}

export function isSupportedVideo(file) {
  return /\.(mp4|mov)$/i.test(file.name) || ['video/mp4', 'video/quicktime'].includes(file.type);
}

// คำเตือนทั่วไปของคลิป { level: 'warn'|'info', text } — แสดงในการ์ดวิดีโอ
export function getVideoWarnings(video, platforms) {
  if (!video) return [];
  const out = [];
  // คำเตือนรวมที่ 60 วินาที ใช้เฉพาะตอนยังไม่ได้เลือกแพลตฟอร์ม (เมื่อเลือกแล้วจะเตือนรายแพลตฟอร์มในแผงด้านขวา)
  if (!platforms.length && video.duration > 60) {
    out.push({
      level: 'warn',
      text: `คลิปยาว ${formatDuration(video.duration)} (เกิน 60 วินาที) — อาจไม่รองรับ Shorts/Reels บางแพลตฟอร์ม`,
    });
  }
  if (!video.isVertical && platforms.length) {
    out.push({ level: 'info', text: 'คลิปเป็นแนวนอน — Shorts / Reels / TikTok แนะนำอัตราส่วน 9:16' });
  }
  return out;
}

// คำเตือนรายแพลตฟอร์ม { pid: [ข้อความ] } — แสดงใต้การ์ดแพลตฟอร์มที่เลือกอยู่
export function getPlatformWarnings(video, platforms) {
  const out = {};
  if (!video) return out;
  platforms.forEach((p) => {
    const w = [];
    if (p.id === 'youtube') {
      // Shorts = แนวตั้ง/จัตุรัส และไม่เกิน 3 นาที ถ้าไม่เข้าเงื่อนไขจะอัปเป็นวิดีโอปกติ (ยังโพสต์ได้)
      if (video.width > video.height || video.duration > p.shortLimit) w.push('จะถูกอัปเป็นวิดีโอปกติ ไม่ใช่ Shorts');
    } else {
      if (video.duration > p.shortLimit) w.push(`ยาวเกิน ${p.shortLimit} วินาที ของ ${p.sub}`);
      if (!video.isVertical) w.push('แนะนำคลิปแนวตั้ง 9:16');
    }
    if (w.length) out[p.id] = w;
  });
  return out;
}

export const normalizeTag = (t) => t.trim().replace(/^#+/, '').replace(/\s+/g, '');
