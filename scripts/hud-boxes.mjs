import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:4180/';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, h] of [[320, 640], [360, 800], [390, 844], [414, 896], [1280, 720]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
  const page = await ctx.newPage();
  await page.goto(`${base}?mode=arcade&debug=1&quality=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const data = await page.evaluate(() => {
    const sels = ['#pharm-hud .topbar', '#pharm-hud .topbar .row:nth-child(1)', '#pharm-hud .topbar .row:nth-child(2)',
      '#hud-cash', '#hud-day', '#hud-stack', '#hud-trust', '#hud-staff', '#hud-debt',
      '#pharm-objective', '#pharm-invest-btn', '#pharm-hud .hint', '#sim-mode-switcher'];
    const out = {};
    for (const s of sels) {
      const el = document.querySelector(s);
      if (!el) { out[s] = null; continue; }
      const r = el.getBoundingClientRect();
      out[s] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    }
    out.scrollW = document.documentElement.scrollWidth;
    out.innerW = window.innerWidth;
    out.chipBoxes = [...document.querySelectorAll('#pharm-hud .chip')].map((el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), el.querySelector('.k').textContent];
    });
    return out;
  });
  console.log(`${w}x${h}`, JSON.stringify(data));
  await ctx.close();
}
await browser.close();
