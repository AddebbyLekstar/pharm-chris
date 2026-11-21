import { chromium } from 'playwright';
const OUT = 'C:/Users/hp/AppData/Local/hermes/cache/scratch/pharmchris/ab';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const data = (i) => ({ id: `cust_ab_${i}`, name: `A${i}`, title: 'x', avatarKey: 'x', initialQuote: '', symptoms: [], symptomLabel: '', matchedProductIds: ['artemether'], budget: 2000, mood: 'Patient', patienceMax: 30, preferredPayment: 'cash', dialogue: { fairPrice: [], overpriced: [], wrongProduct: [], exceedsBudget: [] } });
for (const mode of ['rig', 'sprites']) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:4173/?mode=arcade&debug=1&quality=low&art=${mode}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const info = await page.evaluate((payload) => {
    const d = window.pharmChris.director;
    const q = d.customerQueue;
    q.autoSpawn = false;
    while (q.customers.length) { const c = q.customers.pop(); c.mesh?.removeFromParent(); }
    for (const p of payload) q.injectCustomer(p, 'queued');
    d.player.position.set(0, 0, 2.4);
    q.customers.forEach((c, i) => {
      const x = -2.0 + i * 0.8;
      if (c.mesh) { c.mesh.position.set(x, 0, 4.0); c.mesh.rotation.y = 0; }
      c.targetPosition.set(x, 0, 4.0);
      c.state = 'queued';
    });
    return { perf: window.pharmChris.perf(), count: q.customers.length };
  }, Array.from({ length: 6 }, (_, i) => data(i)));
  await page.waitForTimeout(1800);
  const perf = await page.evaluate(() => window.pharmChris.perf());
  await page.screenshot({ path: `${OUT}/queue-${mode}.png`, timeout: 60000, animations: 'disabled' });
  console.log(JSON.stringify({ mode, after: perf, errors }));
  await ctx.close();
}
await browser.close();
