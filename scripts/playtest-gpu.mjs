import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'C:/Users/hp/AppData/Local/hermes/cache/scratch/pharmchris';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--window-position=0,0'] });
const context = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto('http://127.0.0.1:4173/?mode=arcade&debug=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const read = () => page.evaluate(() => ({
  state: window.pharmChris.state(),
  stack: window.pharmChris.director.stack.count,
  frameMs: window.pharmChris.director.averageFrameMs,
  perf: window.pharmChris.perf(),
}));

const s0 = await read();
await page.screenshot({ path: `${OUT}/g1-start.png` });

// Walk to the dock with the keyboard (holds are real-time, not frame-clamped now).
await page.keyboard.down('KeyW');
await page.waitForTimeout(2200);
await page.keyboard.up('KeyW');
await page.waitForTimeout(600);
const s1 = await read();
await page.screenshot({ path: `${OUT}/g2-dock.png` });

// Walk onto the shelf that matches the carried crate.
const carried = await page.evaluate(() => window.pharmChris.run.state.carriedBoxes[0]?.productId ?? null);
await page.evaluate(() => {
  const d = window.pharmChris.director;
  const box = window.pharmChris.run.state.carriedBoxes[0];
  const cat = box ? window.pharmChris.run.productsForShelf ? null : null : null;
  return cat;
});
const shelfTarget = await page.evaluate(() => {
  const run = window.pharmChris.run;
  const box = run.state.carriedBoxes[0];
  if (!box) return null;
  const id = box.productId;
  const cat = id.includes('malaguard') || id.includes('coughcalm') ? 'shelf_antimalarial'
    : id.includes('clavumed') || id.includes('bpsteady') ? 'shelf_antibiotic'
    : 'shelf_analgesic';
  const z = window.pharmChris.director.zoneManager.getZone(cat);
  window.pharmChris.director.player.position.set(z.position.x, 0, z.position.z);
  return cat;
});
await page.waitForTimeout(1200);
const s2 = await read();
await page.screenshot({ path: `${OUT}/g3-shelf.png` });

// Serve the queue at the counter.
await page.evaluate(() => {
  const d = window.pharmChris.director;
  const z = d.zoneManager.getZone('counter_cashier');
  d.player.position.set(z.position.x, 0, z.position.z);
});
await page.waitForTimeout(6000);
const s3 = await read();
await page.screenshot({ path: `${OUT}/g4-counter.png` });

// Investment drawer + a real purchase attempt.
await page.click('#pharm-invest-btn');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/g5-drawer.png` });
const buttons = await page.$$eval('#pharm-drawer [data-buy]', (els) => els.map((e) => ({ key: e.dataset.buy, disabled: e.disabled })));
await page.click('#pharm-drawer-close');

// Save + reload.
await page.evaluate(() => window.pharmChris.save());
const beforeReload = await read();
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
const afterReload = await read();
await page.screenshot({ path: `${OUT}/g6-reload.png` });

const funnel = await page.evaluate(() => window.pharmChris.funnel());
console.log(JSON.stringify({ errors, s0, s1, s2, s3, carried, shelfTarget, buttons, beforeReload, afterReload, funnel }, null, 2));
await browser.close();
