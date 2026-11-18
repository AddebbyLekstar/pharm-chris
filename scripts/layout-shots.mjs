import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = process.env.OUT_DIR || './layout-shots';
fs.mkdirSync(OUT, { recursive: true });
const URL_BASE = process.env.URL_BASE || 'http://127.0.0.1:4173/';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

for (const [w, h, mobile] of [[360, 800, true], [320, 640, true], [1280, 720, false]]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await ctx.newPage();
  await page.goto(`${URL_BASE}?mode=arcade&debug=1&quality=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/boot-${w}.png` });
  // walk to the antibiotic shelf and shoot again, so the follow-clamp is visible
  await page.evaluate(() => {
    const d = window.pharmChris.director;
    const z = d.zoneManager.getZone('shelf_antibiotic');
    d.player.position.set(z.position.x, 0, z.position.z);
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/shelf-${w}.png` });
  await ctx.close();
}
console.log('shots in', OUT);
await browser.close();
