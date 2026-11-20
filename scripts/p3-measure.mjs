import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'C:/Users/hp/AppData/Local/hermes/cache/scratch/pharmchris/p3';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:4173/';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${BASE}?mode=arcade&debug=1&quality=low`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
await page.waitForTimeout(3000);

const data = (i) => ({
  id: `cust_showcase_${i}`, name: `S${i}`, title: 'x', avatarKey: 'x', initialQuote: '',
  symptoms: [], symptomLabel: '', matchedProductIds: ['artemether'], budget: 2000,
  mood: 'Patient', patienceMax: 30, preferredPayment: 'cash',
  dialogue: { fairPrice: [], overpriced: [], wrongProduct: [], exceedsBudget: [] },
});

const result = await page.evaluate((payload) => {
  const d = window.pharmChris.director;
  const q = d.customerQueue;
  q.autoSpawn = false;
  while (q.customers.length) {
    const c = q.customers.pop();
    c.mesh.removeFromParent();
  }
  for (const p of payload) q.injectCustomer(p, 'queued');
  d.player.position.set(0, 0, 2.4);

  q.customers.forEach((c, i) => {
    const x = -2.4 + i * 0.95;
    c.mesh.position.set(x, 0, 4.2);
    c.mesh.rotation.y = 0;
    c.targetPosition.set(x, 0, 4.2);
    c.state = 'queued';
  });

  const cam = d.viewport.camera;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const project = (c, y) => {
    const v = c.mesh.position.clone();
    v.y = y;
    v.project(cam);
    return { x: ((v.x + 1) / 2) * vw, y: ((1 - v.y) / 2) * vh };
  };
  return q.customers.map((c) => {
    const feet = project(c, 0);
    const head = project(c, 2.0);
    return {
      id: c.data.id,
      outfit: c.look.outfit,
      hair: c.look.hair,
      build: c.look.build,
      height: c.look.height,
      top: c.look.top,
      box: {
        x0: Math.round(Math.min(feet.x, head.x)) - 26,
        x1: Math.round(Math.max(feet.x, head.x)) + 26,
        y0: Math.round(head.y) - 10,
        y1: Math.round(feet.y) + 10,
      },
    };
  });
}, Array.from({ length: 8 }, (_, i) => data(i)));

await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/measure-lineup.png`, timeout: 60000, animations: 'disabled' });
fs.writeFileSync(`${OUT}/measure.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result.map((r) => ({ id: r.id, outfit: r.outfit, hair: r.hair, h: r.height, b: r.build, box: r.box })), null, 0));
await ctx.close();
await browser.close();
