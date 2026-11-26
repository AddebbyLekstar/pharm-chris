/**
 * Throwaway probe: which pharmacy-cue candidates actually read at phone width?
 * Projects every named mesh whose name looks like signage, then measures the plate
 * against its surround using the same sampler as p4-composition.mjs.
 */
import { chromium } from 'playwright';

const width = Number(process.argv[2] ?? 390);
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:4173/?mode=arcade&debug=1&quality=high', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.removeItem('pharm_chris_run_v2'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.pharmChris', null, { timeout: 40000 });
await page.waitForTimeout(4000);
await page.evaluate(() => {
  for (const id of ['pharm-hud', 'sim-mode-switcher']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
const shot = await page.screenshot({ path: `docs/art/probe-cues-${width}.png` });

const out = await page.evaluate(async ({ b64 }) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const dpr = img.width / innerWidth;
  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  const p = window.pharmChris;
  const scene = p.director.scene.scene;
  const cam = p.director.viewport.camera;

  const candidates = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const n = (o.name || '').toLowerCase();
    const m = (o.material?.name || '').toLowerCase();
    if (!/sign|cross|fascia|label|plate|header|poster|mat/.test(n + ' ' + m)) return;
    candidates.push(o);
  });

  const rectOf = (mesh) => {
    mesh.updateWorldMatrix(true, false);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (!box) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const v = cam.position.clone();
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          v.set(x, y, z).applyMatrix4(mesh.matrixWorld).project(cam);
          const sx = ((v.x + 1) / 2) * innerWidth;
          const sy = ((1 - v.y) / 2) * innerHeight;
          minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
          minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
        }
    const x0 = Math.max(0, minX), y0 = Math.max(0, minY);
    const x1 = Math.min(innerWidth, maxX), y1 = Math.min(innerHeight, maxY);
    if (x1 - x0 < 6 || y1 - y0 < 4) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  const measure = (rect) => {
    const px = (x, y) => {
      const d = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const inside = [];
    for (let y = rect.y + rect.h * 0.25; y < rect.y + rect.h * 0.75; y += Math.max(1, rect.h * 0.08))
      for (let x = rect.x + rect.w * 0.15; x < rect.x + rect.w * 0.85; x += Math.max(1, rect.w * 0.05))
        inside.push([x, y]);
    const outside = [];
    for (let band = 4; band <= 24; band += 4)
      for (let t = 0; t <= 1; t += 0.1) {
        outside.push([rect.x + t * rect.w, rect.y - band]);
        outside.push([rect.x + t * rect.w, rect.y + rect.h + band]);
        outside.push([rect.x - band, rect.y + t * rect.h]);
        outside.push([rect.x + rect.w + band, rect.y + t * rect.h]);
      }
    const mean = (pts) => pts.reduce((s, [x, y]) => s + luma(...px(x, y)), 0) / pts.length;
    const plate = mean(inside);
    const surround = mean(outside);
    return { plate: +plate.toFixed(1), surround: +surround.toFixed(1), delta: +(plate - surround).toFixed(1) };
  };

  const rows = [];
  for (const mesh of candidates) {
    const rect = rectOf(mesh);
    if (!rect) continue;
    const stats = measure(rect);
    rows.push({
      name: mesh.name || '(unnamed)',
      material: mesh.material?.name || '',
      rect: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h)],
      ...stats,
    });
  }
  rows.sort((a, b) => b.delta - a.delta);
  return rows;
}, { b64: shot.toString('base64') });

console.log(JSON.stringify(out, null, 1));
await browser.close();
