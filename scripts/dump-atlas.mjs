import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'C:/Users/hp/AppData/Local/hermes/cache/scratch/pharmchris/ab';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4173/?mode=arcade&debug=1&quality=low&art=sprites', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
await page.waitForTimeout(9000);
const data = await page.evaluate(() => {
  const b = window.pharmChris.director.customerQueue.sprites;
  const tex = b.atlas.texture;
  const img = tex.image;
  if (!img || !img.toDataURL) return { error: 'no canvas image', type: typeof img };
  return { url: img.toDataURL('image/png'), w: img.width, h: img.height, cells: b.atlas.cellCount };
});
if (data.url) {
  fs.writeFileSync(`${OUT}/atlas-live.png`, Buffer.from(data.url.split(',')[1], 'base64'));
  console.log(JSON.stringify({ w: data.w, h: data.h, cells: data.cells, path: `${OUT}/atlas-live.png` }));
} else {
  console.log(JSON.stringify(data));
}
await browser.close();
