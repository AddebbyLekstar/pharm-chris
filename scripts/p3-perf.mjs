import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = {};
for (const [w, h, quality, tag] of [[360, 800, 'low', 'phone'], [1280, 720, 'high', 'desktop']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?mode=arcade&debug=1&quality=${quality}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  for (const n of [0, 4, 6, 8]) {
    const perf = await page.evaluate((count) => {
      const d = window.pharmChris.director;
      const q = d.customerQueue;
      q.autoSpawn = false;
      while (q.customers.length) { const c = q.customers.pop(); c.mesh.removeFromParent(); }
      const mood = ['Patient', 'Hurried'];
      for (let i = 0; i < count; i++) {
        q.injectCustomer({
          id: `cust_perf_${i}`, name: `P${i}`, title: 'x', avatarKey: 'x', initialQuote: '', symptoms: [],
          symptomLabel: '', matchedProductIds: ['artemether'], budget: 2000, mood: mood[i % 2],
          patienceMax: 30, preferredPayment: 'cash',
          dialogue: { fairPrice: [], overpriced: [], wrongProduct: [], exceedsBudget: [] },
        }, 'queued');
      }
      return null;
    }, n);
    await page.waitForTimeout(900);
    const p = await page.evaluate(() => window.pharmChris.perf());
    out[`${tag}-${n}`] = p;
  }
  out[`${tag}-errors`] = errors;
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
