/**
 * A/B capture for the art direction pass: same camera, same save, same scene,
 * only ?art=v1|v2 differs.
 *
 *   node scripts/art-ab.mjs [--url http://127.0.0.1:4173/]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';

const args = process.argv.slice(2);
const i = args.indexOf('--url');
const URL_BASE = i >= 0 ? args[i + 1] : process.env.URL_BASE || 'http://127.0.0.1:4173/';
const o = args.indexOf('--out');
const OUT = o >= 0 ? args[o + 1] : './art-ab';
fs.mkdirSync(OUT, { recursive: true });

const launch = {
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
if (os.platform() === 'linux') launch.executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

const browser = await chromium.launch(launch);
const out = { url: URL_BASE, runs: [] };

for (const [w, h, quality] of [[360, 800, 'low'], [1280, 720, 'high']]) {
  for (const art of ['v1', 'v2', 'v3']) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 2,
      isMobile: w < 500,
      hasTouch: w < 500,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    await page.goto(`${URL_BASE}?mode=arcade&debug=1&quality=${quality}&art=${art}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('!!window.pharmChris', null, { timeout: 40000 });
    await page.evaluate(() => localStorage.removeItem('pharm_chris_run_v2'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction('!!window.pharmChris', null, { timeout: 40000 });
    await page.waitForTimeout(5000);

    const stats = await page.evaluate(async () => {
      const p = window.pharmChris;
      const samples = [];
      for (let n = 0; n < 4; n++) {
        await new Promise((r) => setTimeout(r, 600));
        samples.push(p.perf());
      }
      const frames = p.director.frameTimes.slice(-240).sort((a, b) => a - b);
      const pct = (q) => (frames.length ? +(frames[Math.min(frames.length - 1, Math.floor(frames.length * q))] * 1000).toFixed(1) : null);
      const scene = p.director.scene.scene;
      return {
        drawCalls: Math.max(...samples.map((s) => s.drawCalls)),
        triangles: Math.max(...samples.map((s) => s.triangles)),
        frameMs: { p50: pct(0.5), p95: pct(0.95) },
        envMap: !!scene.environment,
        exposure: p.director.viewport.renderer?.toneMappingExposure ?? null,
        lights: (() => {
          let n = 0;
          scene.traverse((o) => { if (o.isLight) n++; });
          return n;
        })(),
      };
    });

    const file = `${OUT}/${art}-${w}x${h}.png`;
    await page.screenshot({ path: file });
    out.runs.push({ art, viewport: `${w}x${h}`, quality, ...stats, errors, file });
    await ctx.close();
  }
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
