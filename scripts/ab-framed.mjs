import { chromium } from 'playwright';
const OUT = 'C:/Users/hp/AppData/Local/hermes/cache/scratch/pharmchris/ab';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const mode of ['rig', 'sprites']) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:4173/?mode=arcade&debug=1&quality=low&art=${mode}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
  await page.waitForTimeout(14000);
  const info = await page.evaluate(() => {
    const d = window.pharmChris.director;
    const q = d.customerQueue;
    // Stand behind the queue so the follow camera frames the customers.
    const front = q.customers[0];
    if (front) d.player.position.set(front.mesh.position.x, 0, front.mesh.position.z + 2.6);
    return { customers: q.customers.length, at: q.customers.map((c) => [c.mesh.position.x.toFixed(2), c.mesh.position.z.toFixed(2)]) };
  });
  await page.waitForTimeout(2500);
  const perf = await page.evaluate(() => window.pharmChris.perf());
  await page.screenshot({ path: `${OUT}/framed-${mode}.png`, timeout: 60000, animations: 'disabled' });
  console.log(JSON.stringify({ mode, info, perf }));
  await ctx.close();
}
await browser.close();
