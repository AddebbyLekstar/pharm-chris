import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'C:/Users/hp/AppData/Local/hermes/cache/scratch/pharmchris/style';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:4188/';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const makeCustomer = (i) => ({
  id: `cust_showcase_${i}`,
  name: `Showcase ${i}`,
  title: 'x',
  avatarKey: 'x',
  initialQuote: '',
  symptoms: [],
  symptomLabel: '',
  matchedProductIds: ['artemether'],
  budget: 2000,
  mood: 'Patient',
  patienceMax: 30,
  preferredPayment: 'cash',
  dialogue: { fairPrice: [], overpriced: [], wrongProduct: [], exceedsBudget: [] },
});

for (const [w, h, quality, tag] of [[360, 800, 'low', 'phone'], [1280, 720, 'high', 'desktop']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}?mode=arcade&debug=1&quality=${quality}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
  await page.waitForTimeout(3000);

  const info = await page.evaluate((payload) => {
    const d = window.pharmChris.director;
    const q = d.customerQueue;
    q.autoSpawn = false;
    while (q.customers.length) {
      const c = q.customers.pop();
      c.mesh.removeFromParent();
    }
    for (const data of payload) q.injectCustomer(data, 'queued');
    // Stand Chris between counter and queue so both read in frame.
    d.player.position.set(-1.1, 0, 3.4);
    return {
      meshes: q.customers.length,
      perf: window.pharmChris.perf(),
      looks: q.customers.map((c) => ({ id: c.data.id, outfit: c.look.outfit, hair: c.look.hair, h: c.look.height, b: c.look.build })),
    };
  }, Array.from({ length: 8 }, (_, i) => makeCustomer(i)));

  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/${tag}-queue.png`, timeout: 60000, animations: 'disabled' });

  // Line the cast up in front of the follow camera, facing it, one metre apart.
  // Fighting the director for the camera is a losing game; standing them where the
  // camera already looks is honest and needs no private hooks.
  await page.evaluate(() => {
    const d = window.pharmChris.director;
    d.player.position.set(0, 0, 2.6);
    const q = d.customerQueue;
    q.customers.forEach((c, i) => {
      const x = -2.4 + i * 0.95;
      c.mesh.position.set(x, 0, 4.1);
      c.mesh.rotation.y = 0;
      c.targetPosition.set(x, 0, 4.1);
      c.state = 'queued';
    });
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${tag}-lineup.png`, timeout: 60000, animations: 'disabled' });

  const perf = await page.evaluate(() => window.pharmChris.perf());
  console.log(JSON.stringify({ tag, meshes: info.meshes, draws: perf, errors, looks: info.looks }, null, 1));
  await ctx.close();
}

await browser.close();
console.log('shots in', OUT);
