import { Youtube, Facebook, Instagram } from 'lucide-react';

// lucide ไม่มีไอคอน TikTok จึงวาดเป็น SVG เอง
export function TikTokIcon({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.6 3c.3 2.4 1.7 3.9 4 4v3.2c-1.5.1-2.9-.4-4-1.2v6.2c0 3.2-2.5 5.8-5.7 5.8S5 18.4 5 15.2s2.6-5.8 5.8-5.7v3.3c-1.4-.2-2.5.9-2.5 2.4 0 1.3 1 2.4 2.4 2.4 1.4 0 2.4-1 2.4-2.5V3h3.5z" />
    </svg>
  );
}

// shortLimit = ความยาวสูงสุด (วินาที) ของรูปแบบคลิปสั้นของแต่ละแพลตฟอร์ม
export const PLATFORMS = [
  { id: 'youtube', name: 'YouTube', sub: 'Shorts / Video', Icon: Youtube, accent: '#ffffff', shortLimit: 180, captionLimit: 5000 },
  { id: 'facebook', name: 'Facebook', sub: 'Reels / Page', Icon: Facebook, accent: '#ffffff', shortLimit: 90, captionLimit: 2200 },
  { id: 'tiktok', name: 'TikTok', sub: 'Video', Icon: TikTokIcon, accent: '#ffffff', shortLimit: 180, captionLimit: 2200 },
  { id: 'instagram', name: 'Instagram', sub: 'Reels', Icon: Instagram, accent: '#ffffff', shortLimit: 90, captionLimit: 2200 },
];

// หมายเหตุที่แสดงในหน้าต่างยืนยันก่อนโพสต์ ขณะแอปของเรายังไม่ผ่านการ Audit ของแพลตฟอร์ม
// (ลบออกได้เมื่อ Audit ผ่านแล้ว)
export const UNAUDITED_NOTES = {
  youtube: 'แอปยังไม่ผ่าน Audit ของ Google — คลิปจะถูกตั้งเป็น Private (ดูได้ใน YouTube Studio)',
  tiktok: 'แอปยังไม่ผ่าน Audit ของ TikTok — จะโพสต์ได้เฉพาะ Only me และบัญชีต้องตั้งเป็น Private',
};

export const PLATFORM_MAP = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));

export const DEFAULT_SETTINGS = {
  youtube: { visibility: 'public', madeForKids: false, category: '22', language: 'th', playlistId: '', embeddable: true, notifySubscribers: true, publicStats: true },
  facebook: { pageId: '' }, // ถูกตั้งเป็น Page แรกอัตโนมัติเมื่อโหลดรายชื่อ Page จาก Backend
  tiktok: { privacy: 'public', allowComments: true, allowDuet: true, allowStitch: true },
  instagram: { shareToFeed: true },
};

export const makeOverride = (pid) => ({
  custom: false, // true = ใช้ caption/tags เฉพาะแพลตฟอร์มนี้แทนค่าหลัก
  caption: '',
  tags: [],
  settings: { ...DEFAULT_SETTINGS[pid] },
});

export const INITIAL_ACCOUNTS = {
  youtube: { connected: false, handle: null }, // เชื่อมจริง: สถานะจริงโหลดจาก Backend ตอนเปิดหน้า
  facebook: { connected: false, handle: null, pages: [] }, // เชื่อมจริง: โหลดสถานะจาก Backend ตอนเปิดหน้า
  tiktok: { connected: false, handle: null }, // เชื่อมจริง: โหลดสถานะจาก Backend ตอนเปิดหน้า
  instagram: { connected: false, handle: null },
};
