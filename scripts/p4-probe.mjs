/**
 * Per-texture breakdown of the live scene at 360x800, plus the projected screen
 * rect of the pharmacy cross. Read-only probe; nothing is modified.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.pharmChris, null, { timeout: 30000 });
await page.waitForTimeout(2500);

const out = await page.evaluate(() => {
  const p = window.pharmChris;
  const scene = p.director.scene.scene;
  const cam = p.director.viewport.camera;
  const seen = new Map();
  let texels = 0;
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      for (const k of Object.keys(m)) {
        const v = m[k];
        if (v && v.isTexture && v.image) {
          const w = v.image.width ?? 0;
          const h = v.image.height ?? 0;
          const key = `${w}x${h}`;
          const prev = seen.get(key) ?? { w, h, count: 0, bytes: 0 };
          prev.count += 1;
          prev.bytes = w * h * 4;
          seen.set(key, prev);
          texels += w * h * 4;
        }
      }
    }
  });

  const textures = [...seen.entries()]
    .map(([key, t]) => ({ size: key, ...t, mb: +(t.bytes / (1024 * 1024)).toFixed(3) }))
    .sort((a, b) => b.w * b.h - a.w * a.h);

  // Which materials use the big textures — names make the memory report actionable.
  const big = new Map();
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      for (const k of Object.keys(m)) {
        const v = m[k];
        if (v && v.isTexture && v.image && v.image.width >= 512) {
          const key = `${v.image.width}x${v.image.height}`;
          const list = big.get(key) ?? new Set();
          list.add(`${m.name || m.type}.${k}`);
          big.set(key, list);
        }
      }
    }
  });

  const cross = scene.getObjectByName('pharm-cross');
  let crossRect = null;
  if (cross && cam) {
    cross.updateWorldMatrix(true, false);
    // compute a screen rect from the geometry's bounding box corners
    const geomBox = cross.geometry.boundingBox ?? (cross.geometry.computeBoundingBox(), cross.geometry.boundingBox);
    const corners = [];
    for (const x of [geomBox.min.x, geomBox.max.x])
      for (const y of [geomBox.min.y, geomBox.max.y])
        for (const z of [geomBox.min.z, geomBox.max.z]) {
          const v = new cross.position.constructor(x, y, z);
          v.applyMatrix4(cross.matrixWorld);
          v.project(cam);
          corners.push([((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight]);
        }
    crossRect = {
      minX: Math.round(Math.min(...corners.map((c) => c[0]))),
      maxX: Math.round(Math.max(...corners.map((c) => c[0]))),
      minY: Math.round(Math.min(...corners.map((c) => c[1]))),
      maxY: Math.round(Math.max(...corners.map((c) => c[1]))),
      visible: cross.visible,
    };
  }

  return {
    viewport: [innerWidth, innerHeight],
    textureMB: +(texels / (1024 * 1024)).toFixed(2),
    textures,
    bigTextures: Object.fromEntries([...big.entries()].map(([k, v]) => [k, [...v]])),
    crossRect,
  };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
