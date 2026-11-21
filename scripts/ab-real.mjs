import { chromium } from 'playwright';
const OUT = 'C:/Users/hp/AppData/Local/hermes/cache/scratch/pharmchris/ab';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const mode of ['rig', 'sprites']) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:4173/?mode=arcade&debug=1&quality=low&art=${mode}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
  // Let the economy spawn its natural queue and settle near the counter.
  await page.waitForTimeout(14000);
  const state = await page.evaluate(() => {
    const q = window.pharmChris.director.customerQueue;
    return { customers: q.customers.length, art: new URLSearchParams(location.search).get('art'), perf: window.pharmChris.perf() };
  });
  await page.screenshot({ path: `${OUT}/real-${mode}.png`, timeout: 60000, animations: 'disabled' });
  console.log(JSON.stringify({ mode, state, errors }));
  await ctx.close();
}
await browser.close();
