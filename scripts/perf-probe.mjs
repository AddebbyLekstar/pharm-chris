/**
 * Low-end Android performance probe.
 *
 * Emulates: 360x800 @ DPR 2 (Tecno/Infinix class), 6x CPU throttling, Slow 4G.
 * Records draw calls, triangles, texture memory, frame time percentiles and heap
 * growth across a scripted 25s play session. Writes JSON for docs/PERF-BUDGET.md.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'C:/Users/hp/AppData/Local/hermes/cache/scratch/pharmchris';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 360, height: 800 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const client = await context.newCDPSession(page);

await client.send('Emulation.setCPUThrottlingRate', { rate: 6 });
await client.send('Network.enable');
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const quality = process.env.QUALITY ?? 'low';
await page.goto(`http://127.0.0.1:4173/?mode=arcade&debug=1&quality=${quality}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

// Fresh run so the measurement is comparable between builds.
await page.evaluate(() => {
  localStorage.removeItem('pharm_chris_run_v2');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

const samples = [];
const takeSample = async () => {
  const s = await page.evaluate(() => {
    const perf = window.pharmChris.perf();
    const scene = window.pharmChris.director.scene.scene;
    let texels = 0;
    let textures = 0;
    let meshes = 0;
    const counted = new Set();
    scene.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) meshes++;
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        for (const key of Object.keys(m)) {
          const v = m[key];
          if (v && v.isTexture && v.image) {
            // Count each texture once. A shared family material appears on dozens
            // of meshes and one atlas on every shelf; summing slots measures binds,
            // not bytes, and over-reported the boot by ~40 %.
            if (counted.has(v.uuid)) continue;
            counted.add(v.uuid);
            textures++;
            const w = v.image.width ?? 0;
            const h = v.image.height ?? 0;
            texels += w * h * 4;
          }
        }
      }
    });
    return {
      ...perf,
      meshes,
      sceneTextures: textures,
      textureMB: +(texels / (1024 * 1024)).toFixed(2),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : null,
      state: window.pharmChris.state(),
    };
  });
  samples.push(s);
};

await takeSample();

// Scripted session: dock -> shelf -> counter -> drawer, repeated.
for (let round = 0; round < 3; round++) {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2200);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(600);
  await takeSample();

  await page.evaluate(() => {
    const d = window.pharmChris.director;
    const box = window.pharmChris.run.state.carriedBoxes[0];
    const id = box?.productId ?? '';
    const cat = id.includes('malaguard') || id.includes('coughcalm') ? 'shelf_antimalarial'
      : id.includes('clavumed') || id.includes('bpsteady') ? 'shelf_antibiotic'
      : id.includes('chillvial') ? 'shelf_cold_chain'
      : 'shelf_analgesic';
    const z = d.zoneManager.getZone(cat);
    d.player.position.set(z.position.x, 0, z.position.z);
  });
  await page.waitForTimeout(1500);
  await takeSample();

  await page.evaluate(() => {
    const d = window.pharmChris.director;
    const z = d.zoneManager.getZone('counter_cashier');
    d.player.position.set(z.position.x, 0, z.position.z);
  });
  await page.waitForTimeout(4000);
  await takeSample();
}

await page.evaluate(() => window.pharmChris.director.stop());
await client.send('HeapProfiler.enable');
await client.send('HeapProfiler.collectGarbage');
await page.waitForTimeout(500);
const heapAfter = await page.evaluate(() => performance.memory ? +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : null);

const frameTimes = await page.evaluate(() => window.pharmChris.director['frameTimes'].slice().sort((a, b) => a - b));
const pct = (arr, p) => arr.length ? +(arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] * 1000).toFixed(1) : 0;

const drawCalls = samples.map((s) => s.drawCalls);
const triangles = samples.map((s) => s.triangles);
const avg = (arr) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);

const result = {
  device: `360x800 CSS px @ DPR2, 6x CPU throttle, 1.6Mbps/150ms, quality=${process.env.QUALITY ?? 'low'}`,
  samples: samples.length,
  drawCalls: { avg: +avg(drawCalls).toFixed(1), max: Math.max(...drawCalls) },
  triangles: { avg: Math.round(avg(triangles)), max: Math.max(...triangles) },
  meshes: Math.max(...samples.map((s) => s.meshes)),
  textures: { count: samples[samples.length - 1].sceneTextures, mb: Math.max(...samples.map((s) => s.textureMB)) },
  frameMs: { p50: pct(frameTimes, 0.5), p95: pct(frameTimes, 0.95), worst: pct(frameTimes, 0.999) },
  fps: { p50: +(1000 / Math.max(1, pct(frameTimes, 0.5))).toFixed(1), p5: +(1000 / Math.max(1, pct(frameTimes, 0.95))).toFixed(1) },
  heap: { last: samples[samples.length - 1].heapMB, afterGc: heapAfter },
  finalState: samples[samples.length - 1].state,
  errors,
};

fs.writeFileSync(`${OUT}/perf-${quality}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
