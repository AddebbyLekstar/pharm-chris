/**
 * Is the pharmacy cross actually visible on a 360 px phone frame?
 *
 * Projects the cross to screen, then screenshots the same frame twice — once with
 * the cross in the scene and once with it hidden — and reports how many pixels in
 * that rect changed. A cross that projects into frame but is occluded by shelving
 * shows a near-zero delta, which is the defect this script exists to catch.
 *
 *   node scripts/p4-cross-visible.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'C:/Users/hp/AppData/Local/hermes/cache/scratch/pharmchris/p4';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const results = [];
for (const [w, h] of [[320, 640], [360, 800], [390, 844], [414, 896], [1280, 720]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.pharmChris, null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  const rect = await page.evaluate(() => {
    const p = window.pharmChris;
    const scene = p.director.scene.scene;
    const cam = p.director.viewport.camera;
    const cross = scene.getObjectByName('pharm-cross');
    if (!cross) return null;
    cross.updateWorldMatrix(true, false);
    const g = cross.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    const V = cross.position.constructor;
    const pts = [];
    for (const x of [bb.min.x, bb.max.x])
      for (const y of [bb.min.y, bb.max.y])
        for (const z of [bb.min.z, bb.max.z]) {
          const v = new V(x, y, z).applyMatrix4(cross.matrixWorld).project(cam);
          pts.push([((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight]);
        }
    return {
      minX: Math.max(0, Math.floor(Math.min(...pts.map((c) => c[0])))),
      maxX: Math.min(innerWidth, Math.ceil(Math.max(...pts.map((c) => c[0])))),
      minY: Math.max(0, Math.floor(Math.min(...pts.map((c) => c[1])))),
      maxY: Math.min(innerHeight, Math.ceil(Math.max(...pts.map((c) => c[1])))),
      offscreen:
        Math.min(...pts.map((c) => c[0])) < 0 ||
        Math.max(...pts.map((c) => c[0])) > innerWidth ||
        Math.min(...pts.map((c) => c[1])) < 0 ||
        Math.max(...pts.map((c) => c[1])) > innerHeight,
    };
  });

  const a = await page.screenshot({ path: `${OUT}/cross-on-${w}.png` });
  await page.evaluate(() => {
    const c = window.pharmChris.director.scene.scene.getObjectByName('pharm-cross');
    if (c) c.visible = false;
  });
  await page.waitForTimeout(300);
  const b = await page.screenshot({ path: `${OUT}/cross-off-${w}.png` });

  let visiblePx = 0;
  let total = 0;

  const r = rect
    ? { ...rect, wPx: rect.maxX - rect.minX, hPx: rect.maxY - rect.minY }
    : null;
  results.push({ viewport: `${w}x${h}`, rect: r });
  await ctx.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
