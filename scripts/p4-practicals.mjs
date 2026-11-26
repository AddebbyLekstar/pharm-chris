/**
 * P4 task 3 evidence: where the pendant and the fridge panel land on a 390 px phone
 * frame, and a cropped still of each. Read-only.
 *
 *   node scripts/p4-practicals.mjs [--url http://127.0.0.1:4173/]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const i = args.indexOf('--url');
const URL_BASE = i >= 0 ? args[i + 1] : 'http://127.0.0.1:4173/';
const vi = args.indexOf('--viewport');
const [VW, VH] = vi >= 0 ? args[vi + 1].split('x').map(Number) : [390, 844];
const ti = args.indexOf('--tag');
const TAG = ti >= 0 ? `-${args[ti + 1]}` : '';
const out = './docs/art';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 2,
  isMobile: VW < 600,
  hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

await page.goto(`${URL_BASE}?mode=arcade&debug=1&quality=high`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.removeItem('pharm_chris_run_v2'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.pharmChris', null, { timeout: 40000 });
await page.waitForTimeout(4000);

// HUD off, so the crop is the room and not a button.
await page.evaluate(() => {
  for (const el of document.querySelectorAll('body > div, body > section')) {
    const text = (el.textContent || '').slice(0, 40);
    if (/CASH|DAY 1|PICK UP/i.test(text)) el.setAttribute('style', 'display:none !important');
  }
});

const rects = await page.evaluate(() => {
  const p = window.pharmChris;
  const scene = p.director.scene.scene;
  const cam = p.director.viewport.camera;
  const toScreen = (v) => {
    const q = v.clone().project(cam);
    return [Math.round(((q.x + 1) / 2) * innerWidth), Math.round(((1 - q.y) / 2) * innerHeight)];
  };
  const source = cam.position.clone();

  let marker = null;
  scene.traverse((o) => { if (o.name === 'prop-pendant-counter') marker = o; });
  const lampPt = marker ? toScreen(source.clone().set(marker.position.x, 2.35, marker.position.z)) : null;

  let panel = null;
  scene.traverse((o) => { if (o.isMesh && o.material?.name === 'practical-fridge') panel = o; });
  let panelPt = null;
  let panelWorld = null;
  if (panel) {
    panel.geometry.computeBoundingBox();
    const c = panel.geometry.boundingBox.getCenter(source.clone());
    c.applyMatrix4(panel.matrixWorld);
    panelWorld = [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)];
    panelPt = toScreen(c);
  }
  return { lampPt, panelPt, panelWorld };
});

const clip = (pt, width, height) =>
  pt
    ? {
        x: Math.max(0, Math.min(VW - width, Math.round(pt[0] - width / 2))),
        y: Math.max(0, Math.min(VH - height, Math.round(pt[1] - height / 2))),
        width,
        height,
      }
    : null;

await page.screenshot({ path: `${out}/p4-${VW}-frame${TAG}.png` });
const lampClip = clip(rects.lampPt, 300, 300);
const panelClip = clip(rects.panelPt, 300, 340);
if (lampClip) await page.screenshot({ path: `${out}/p4-pendant${TAG}.png`, clip: lampClip });
if (panelClip) await page.screenshot({ path: `${out}/p4-fridge${TAG}.png`, clip: panelClip });

console.log(JSON.stringify({ ...rects, errors, lampClip, panelClip }, null, 2));
await browser.close();
