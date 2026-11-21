import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'C:/Users/hp/AppData/Local/hermes/cache/scratch/pharmchris/char-svg';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:5199/char-svg.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/char-sheet.png`, fullPage: true });
const counts = await page.evaluate(() => ({
  phone: document.querySelectorAll('#phone svg').length,
  large: document.querySelectorAll('#large svg').length,
  cast: document.querySelectorAll('#cast svg').length,
}));
console.log(JSON.stringify({ counts, errors }));
await browser.close();
