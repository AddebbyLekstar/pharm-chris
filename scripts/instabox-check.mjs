/**
 * Instabox build check for Pharm Chris (cloud box, headless Chromium).
 * Verifies: boot, console errors, real gameplay loop, persistence round-trip,
 * low-tier perf at 360x800 @DPR2 with 6x CPU throttle, screenshots.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/data/home/check-out';
const URL_BASE = process.env.URL_BASE ?? 'http://127.0.0.1:4173/';
fs.mkdirSync(OUT, { recursive: true });

const report = { url: URL_BASE, startedAt: new Date().toISOString(), passes: {}, errors: [], warnings: [] };

const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function newPage(viewport, dpr, mobile) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: dpr,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 300)}`); });
  return { ctx, page, errs };
}

const sample = (page) => page.evaluate(() => {
  const p = window.pharmChris;
  const scene = p.director.scene.scene;
  let meshes = 0, textures = 0, texels = 0;
  scene.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh) meshes++;
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) for (const k of Object.keys(m)) {
      const v = m[k];
      if (v && v.isTexture && v.image) {
        textures++;
        texels += (v.image.width ?? 0) * (v.image.height ?? 0) * 4;
      }
    }
  });
  return {
    state: p.state(),
    perf: p.perf(),
    meshes,
    textures,
    textureMB: +(texels / (1024 * 1024)).toFixed(2),
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : null,
    stack: p.director.stack.count,
  };
});

// ---------- Pass 1: desktop boot + scripted gameplay ----------
{
  const { ctx, page, errs } = await newPage({ width: 1280, height: 720 }, 1, false);
  const t0 = Date.now();
  await page.goto(`${URL_BASE}?mode=arcade&debug=1&quality=high`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
  const bootMs = Date.now() - t0;
  await page.evaluate(() => localStorage.removeItem('pharm_chris_run_v2'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
  await page.waitForTimeout(4000);

  const samples = [await sample(page)];
  await page.screenshot({ path: `${OUT}/desktop-boot.png` });

  const startState = samples[0].state;

  for (let round = 0; round < 3; round++) {
    // walk to the dock
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2200);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(600);
    samples.push(await sample(page));

    // carry the box to the matching shelf
    await page.evaluate(() => {
      const p = window.pharmChris;
      const d = p.director;
      const box = p.run.state.carriedBoxes[0];
      const id = box?.productId ?? '';
      const cat = id.includes('malaguard') || id.includes('coughcalm') ? 'shelf_antimalarial'
        : id.includes('clavumed') || id.includes('bpsteady') ? 'shelf_antibiotic'
        : id.includes('chillvial') ? 'shelf_cold_chain'
        : 'shelf_analgesic';
      const z = d.zoneManager.getZone(cat);
      if (z) d.player.position.set(z.position.x, 0, z.position.z);
    });
    await page.waitForTimeout(1500);
    samples.push(await sample(page));

    if (round === 0) await page.screenshot({ path: `${OUT}/desktop-shelf.png` });

    // serve at the counter
    await page.evaluate(() => {
      const d = window.pharmChris.director;
      const z = d.zoneManager.getZone('counter_cashier');
      if (z) d.player.position.set(z.position.x, 0, z.position.z);
    });
    await page.waitForTimeout(4000);
    samples.push(await sample(page));
    if (round === 0) await page.screenshot({ path: `${OUT}/desktop-counter.png` });
  }

  // ---------- persistence round-trip ----------
  const before = await page.evaluate(() => {
    window.pharmChris.save();
    const raw = localStorage.getItem('pharm_chris_run_v2') || '';
    return { len: raw.length, version: (() => { try { return JSON.parse(raw).version; } catch { return null; } })(), state: window.pharmChris.state() };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => window.pharmChris.state());

  report.passes.desktop = {
    bootMs,
    samples: samples.length,
    drawCalls: samples.map((s) => s.perf.drawCalls),
    maxDrawCalls: Math.max(...samples.map((s) => s.perf.drawCalls)),
    maxMeshes: Math.max(...samples.map((s) => s.meshes)),
    textureMB: samples[samples.length - 1].textureMB,
    heapMB: { first: samples[0].heapMB, last: samples[samples.length - 1].heapMB },
    start: { day: startState.day, cash: startState.cash, served: startState.served, debt: startState.debt },
    end: (() => { const s = samples[samples.length - 1].state; return { day: s.day, cash: s.cash, served: s.served, debt: s.debt, queue: s.queue, trust: s.trust, staff: s.staff.length }; })(),
    earnedCash: samples[samples.length - 1].state.cash - startState.cash,
    servedDelta: samples[samples.length - 1].state.served - startState.served,
    persistence: {
      saveBytes: before.len,
      saveVersion: before.version,
      cashBefore: before.state.cash,
      cashAfter: after.cash,
      dayBefore: before.state.day,
      dayAfter: after.day,
      servedBefore: before.state.served,
      servedAfter: after.served,
      restored: before.state.cash === after.cash && before.state.day === after.day && before.state.served === after.served,
    },
    errors: errs,
  };
  report.errors.push(...errs.map((e) => `desktop: ${e}`));
  await ctx.close();
}

// ---------- Pass 2: low-tier phone probe ----------
{
  const { ctx, page, errs } = await newPage({ width: 360, height: 800 }, 2, true);
  const client = await ctx.newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await page.goto(`${URL_BASE}?mode=arcade&debug=1&quality=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 60000 });
  await page.evaluate(() => localStorage.removeItem('pharm_chris_run_v2'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 60000 });
  await page.waitForTimeout(5000);

  const samples = [await sample(page)];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2200);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(800);
    samples.push(await sample(page));
  }
  const frameTimes = await page.evaluate(() => window.pharmChris.director.frameTimes.slice().sort((a, b) => a - b));
  const pct = (arr, p) => (arr.length ? +(arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] * 1000).toFixed(1) : 0);
  await page.screenshot({ path: `${OUT}/phone-boot.png` });

  report.passes.phone = {
    drawCalls: samples.map((s) => s.perf.drawCalls),
    maxDrawCalls: Math.max(...samples.map((s) => s.perf.drawCalls)),
    avgDrawCalls: +(samples.reduce((a, s) => a + s.perf.drawCalls, 0) / samples.length).toFixed(1),
    triangles: Math.max(...samples.map((s) => s.perf.triangles)),
    meshes: Math.max(...samples.map((s) => s.meshes)),
    textureMB: samples[samples.length - 1].textureMB,
    frameMs: { p50: pct(frameTimes, 0.5), p95: pct(frameTimes, 0.95), worst: pct(frameTimes, 0.999) },
    heapMB: { first: samples[0].heapMB, last: samples[samples.length - 1].heapMB },
    state: (() => { const s = samples[samples.length - 1].state; return { day: s.day, cash: s.cash, served: s.served, queue: s.queue }; })(),
    errors: errs,
  };
  report.errors.push(...errs.map((e) => `phone: ${e}`));
  await ctx.close();
}

report.finishedAt = new Date().toISOString();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
