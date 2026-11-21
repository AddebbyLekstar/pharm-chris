import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] || '.';
const base = process.argv[3] || 'http://127.0.0.1:4180/';
const tag = process.argv[4] || 'shot';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, h] of [[360, 800], [1280, 720]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
  const page = await ctx.newPage();
  await page.goto(`${base}?mode=arcade&debug=1&quality=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/${tag}-${w}x${h}.png` });
  await page.click('#pharm-invest-btn');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${tag}-${w}x${h}-drawer.png` });
  await ctx.close();
}
await browser.close();
console.log('ok');
