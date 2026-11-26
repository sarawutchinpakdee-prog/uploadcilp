import { useEffect, useRef } from 'react';

// พื้นหลัง "ลำแสงเส้นบิดเกลียว": เส้นบางๆ จำนวนมากพันกันเป็นลำ พุ่งโค้งจากซ้ายล่างขึ้นขวาบน
// มีจุดรวมแสงสว่าง + แสงฟุ้ง (ตามแนวภาพอ้างอิง) — วาดด้วย Canvas 2D คำนวณมุมมองเอง ไม่ใช้ไลบรารีเพิ่ม
// เบาเครื่อง: DPR ≤ 1.5, ~30fps, หยุดเมื่อซ่อนแท็บ, ภาพนิ่งเมื่อผู้ใช้ตั้งลดการเคลื่อนไหว
const LINES = 120;
const SEGS = 70; // จุดต่อเส้น
const CHUNK = 3; // แบ่งเส้นเป็นช่วงสั้นๆ เพื่อให้ความโปร่งใสจางตามความยาว
const KNOT = 0.22; // ตำแหน่งจุดรวมแสงตลอดความยาวลำ (0–1)

// โทนสี: เขียวมะนาวสว่าง → เหลืองอมเขียว → เขียวมรกตนิดๆ → อำพันประปราย
const PAL = {
  dark: [[217, 249, 157], [190, 242, 100], [163, 230, 53], [132, 230, 80], [250, 204, 21], [52, 211, 153]],
  light: [[77, 124, 15], [101, 163, 13], [63, 98, 18], [22, 163, 74], [202, 138, 4], [5, 150, 105]],
};

const bez = (a, b, c, d, s) => {
  const m = 1 - s;
  return m * m * m * a + 3 * m * m * s * b + 3 * m * s * s * c + s * s * s * d;
};
const dbez = (a, b, c, d, s) => {
  const m = 1 - s;
  return 3 * m * m * (b - a) + 6 * m * s * (c - b) + 3 * s * s * (d - c);
};

// ค่าคงที่ต่อเส้น (สุ่มแบบคงที่ ไม่กระพริบทุกเฟรม)
const seeded = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const LINE = Array.from({ length: LINES }, (_, j) => ({
  phase: (j / LINES) * Math.PI * 2,
  rad: 0.35 + seeded(j) * 0.65,
  col: Math.floor(seeded(j + 91) * 6),
  w: 0.5 + seeded(j + 17) * 0.9,
  a: 0.55 + seeded(j + 53) * 0.45,
}));

export default function LineBackground() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = 0;
    const pts = new Array(SEGS + 1);

    const glow = (x, y, rad, stops) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    };

    const render = (ms) => {
      const t = ms / 1000;
      const light = document.documentElement.dataset.theme === 'light';
      const pal = light ? PAL.light : PAL.dark;
      ctx.clearRect(0, 0, w, h);

      // เส้นกลางของลำแสง (Bezier) ขยับช้าๆ
      const dr = Math.sin(t * 0.18) * 0.03;
      const P = [
        [-0.08 * w, 1.02 * h],
        [(0.28 + dr) * w, 0.98 * h],
        [(0.34 - dr) * w, 0.22 * h],
        [1.08 * w, (0.28 + dr) * h],
      ];
      const R = Math.min(w, h) * (light ? 0.15 : 0.18); // รัศมีลำแสง
      const at = (s) => [bez(P[0][0], P[1][0], P[2][0], P[3][0], s), bez(P[0][1], P[1][1], P[2][1], P[3][1], s)];

      // 1) แสงฟุ้งตามแนวลำ (เฉพาะโหมดมืด ใช้ additive)
      if (!light) {
        ctx.globalCompositeOperation = 'lighter';
        for (let g = 0; g < 7; g++) {
          const s = 0.12 + g * 0.12;
          const [gx, gy] = at(s);
          glow(gx, gy, R * (1.6 + Math.sin(s * Math.PI) * 1.4), [
            [0, 'rgba(163,230,53,0.07)'],
            [0.5, 'rgba(52,211,100,0.025)'],
            [1, 'rgba(0,0,0,0)'],
          ]);
        }
      }

      // 2) เส้นบิดเกลียว
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
      ctx.lineCap = 'butt';
      const twist = 3.6; // จำนวนรอบบิดตลอดความยาว
      const spin = t * 0.35; // หมุนช้าๆ

      for (let j = 0; j < LINES; j++) {
        const L = LINE[j];
        const [r, g, b] = pal[L.col];
        for (let p = 0; p <= SEGS; p++) {
          const s = p / SEGS;
          const [cx, cy] = at(s);
          let tx = dbez(P[0][0], P[1][0], P[2][0], P[3][0], s);
          let ty = dbez(P[0][1], P[1][1], P[2][1], P[3][1], s);
          const tl = Math.hypot(tx, ty) || 1;
          tx /= tl;
          ty /= tl;
          // ซองรัศมี: บีบรวมที่จุดสว่าง แล้วกางออกเป็นลำ
          const pinch = 0.12 + 0.88 * Math.min(1, Math.abs(s - KNOT) * 2.4);
          const env = (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, s * 0.95 + 0.04))) * pinch;
          const th = L.phase + s * twist * Math.PI + spin + Math.sin(s * 6 + t * 0.4 + j) * 0.15;
          const off = Math.cos(th) * R * env * L.rad;
          const depth = Math.sin(th); // -1 ไกล … +1 ใกล้
          const persp = 1 + depth * 0.18; // เส้นใกล้กางออกเล็กน้อย
          pts[p] = [cx - ty * off * persp, cy + tx * off * persp, depth];
        }

        for (let p = 0; p < SEGS; p += CHUNK) {
          const e = Math.min(p + CHUNK, SEGS);
          const sm = (p + e) / 2 / SEGS;
          const fade = Math.sin(Math.PI * sm) ** 0.7; // จางที่หัว-ท้ายลำ
          const near = (pts[p][2] + pts[e][2]) * 0.25 + 0.5; // เส้นใกล้สว่างกว่า
          const knot = 1 + 1.2 * Math.max(0, 1 - Math.abs(sm - KNOT) * 6); // สว่างขึ้นที่จุดรวมแสง
          const a = Math.min(1, L.a * fade * (0.25 + 0.75 * near) * knot * (light ? 0.34 : 0.34));
          if (a < 0.01) continue;
          ctx.beginPath();
          ctx.moveTo(pts[p][0], pts[p][1]);
          for (let q = p + 1; q <= e; q++) ctx.lineTo(pts[q][0], pts[q][1]);
          ctx.strokeStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
          ctx.lineWidth = L.w * (0.6 + near * 0.8);
          ctx.stroke();
        }
      }

      // 3) จุดรวมแสงสว่าง (เฉพาะโหมดมืด)
      if (!light) {
        const [gx, gy] = at(KNOT);
        glow(gx, gy, R * 1.3, [
          [0, 'rgba(236,252,203,0.30)'],
          [0.35, 'rgba(190,242,100,0.12)'],
          [1, 'rgba(0,0,0,0)'],
        ]);
      }
    };

    const loop = (now) => {
      if (now - last >= 33) {
        last = now;
        render(now);
      }
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still) raf = requestAnimationFrame(loop);
    };
    document.addEventListener('visibilitychange', onVis);
    const mo = new MutationObserver(() => render(performance.now()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    if (still) render(performance.now());
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      mo.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" style={{ zIndex: -3 }} />;
}
