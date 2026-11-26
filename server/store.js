import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// เก็บ token ลงไฟล์ (ใช้คนเดียวบนเครื่องตัวเอง) — ถ้าขึ้นเซิร์ฟเวอร์จริงให้เปลี่ยนเป็นฐานข้อมูลและเข้ารหัส token
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const STORE = path.join(DATA_DIR, 'tokens.json');

export const readStore = () => {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; }
};

export const writeStore = (s) => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(s, null, 2), { mode: 0o600 });
};
