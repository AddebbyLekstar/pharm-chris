import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4173/?mode=arcade&debug=1&quality=low&art=sprites', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
await page.waitForTimeout(3000);
const out = await page.evaluate(() => {
  const d = window.pharmChris.director;
  const q = d.customerQueue;
  const layer = q.sprites ? q.sprites.group : null;
  const layers = [];
  if (layer) {
    layer.traverse((o) => {
      if (o.isMesh) layers.push({ name: o.name, count: o.geometry?.getAttribute('position')?.count ?? 0, visible: o.visible, mat: o.material?.type, uv: !!o.geometry?.getAttribute('uv') });
    });
  }
  return {
    artMode: new URLSearchParams(location.search).get('art'),
    hasBatch: !!q.sprites,
    customers: q.customers.length,
    customerMeshChildren: q.customers.map((c) => c.mesh.children.length),
    layerMeshes: layers,
    sceneMeshes: (() => { let n = 0; d.scene.scene.traverse((o) => { if (o.isMesh) n++; }); return n; })(),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
