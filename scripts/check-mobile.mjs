/**
 * Mobile layout gate: proves the HUD does not overlap itself, the player stays
 * big enough to control, and every trigger zone is reachable on screen.
 *
 * Exit code 1 on any failure, so it can gate a build.
 *
 *   node scripts/check-mobile.mjs [--url http://127.0.0.1:4173/]
 */
import { chromium } from 'playwright';
import os from 'node:os';

const args = process.argv.slice(2);
const urlArgIndex = args.indexOf('--url');
const URL_BASE = urlArgIndex >= 0 ? args[urlArgIndex + 1] : process.env.URL_BASE || 'http://127.0.0.1:4173/';

const LAUNCH = {
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
if (os.platform() === 'linux') {
  LAUNCH.executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
}

const SIZES = [
  { w: 320, h: 640, mobile: true },
  { w: 360, h: 800, mobile: true },
  { w: 390, h: 844, mobile: true },
  { w: 414, h: 896, mobile: true },
  { w: 768, h: 1024, mobile: true },
  { w: 1280, h: 720, mobile: false },
  { w: 1920, h: 1080, mobile: false },
];

// P1 raised the floor from 38 px: below 46 px Chris cannot be steered by touch.
const MIN_PLAYER_PX = 80;

const browser = await chromium.launch(LAUNCH);
const report = { url: URL_BASE, viewports: [], failures: [] };

for (const size of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: 2,
    isMobile: size.mobile,
    hasTouch: size.mobile,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });

  const sep = URL_BASE.includes('?') ? '&' : '?';
  await page.goto(`${URL_BASE}${sep}mode=arcade&debug=1&quality=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
  await page.evaluate(() => localStorage.removeItem('pharm_chris_run_v2'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  // 1. HUD boxes must not intersect each other.
  const hud = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    };
    const overlap = (a, b) => {
      if (!a || !b) return 0;
      const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      return ox > 0.5 && oy > 0.5 ? Math.round(ox) : 0;
    };
    const hint = box('#pharm-hud .hint');
    const invest = box('#pharm-invest-btn');
    const switcher = box('#sim-mode-switcher');
    const objective = box('#pharm-objective');
    return {
      hint,
      invest,
      switcher,
      objective,
      overlaps: {
        hintInvest: overlap(hint, invest),
        hintSwitcher: overlap(hint, switcher),
        investSwitcher: overlap(invest, switcher),
      },
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      hintText: document.querySelector('#hud-hint')?.textContent?.trim() ?? '',
      offscreen: [hint, invest, switcher, objective].filter(Boolean).some(
        (b) => b.x < -1 || b.right > window.innerWidth + 1 || b.bottom > window.innerHeight + 1
      ),
    };
  });

  // 2. Camera mode, player size, per-zone reachability.
  const camera = await page.evaluate(() => {
    const vp = window.pharmChris.director.viewport;
    return {
      contained: vp.contained,
      pan: [+vp.panLimit.x.toFixed(2), +vp.panLimit.y.toFixed(2)],
      dist: +vp.targetOffset.length().toFixed(1),
    };
  });

  const playerPx = await page.evaluate(() => {
    const p = window.pharmChris;
    const cam = p.director.viewport.camera;
    cam.updateMatrixWorld(true);
    // Measure the character's actual projected bounding box, not a hardcoded
    // 1.75 m segment. Chris is scaled 1.35x against the architecture, so the old
    // constant under-reported him by a third and failed the 80 px floor while the
    // shot was already at 80 px.
    const ext = p.director.player.worldExtent();
    const v = p.director.player.position;
    const feet = v.clone().set(v.x, ext.minY, v.z).project(cam);
    const head = v.clone().set(v.x, ext.maxY, v.z).project(cam);
    return Math.round(Math.abs(((head.y - feet.y) / 2) * window.innerHeight));
  });

  const reach = [];
  // Positions come from the live zones, not a hardcoded table: the old list still
  // carried the 16 x 18 m coordinates after the shop shrank, so the gate teleported
  // the player through a wall and then judged that point "visible".
  const zoneList = await page.evaluate(() => window.pharmChris.director.zoneManager.list());
  for (const [id, x, z] of zoneList.map((zone) => [zone.id, zone.x, zone.z])) {
    const res = await page.evaluate(async ({ id, x, z }) => {
      const d = window.pharmChris.director;
      d.player.position.set(x, 0, z);
      await new Promise((r) => setTimeout(r, 500));
      const cam = d.viewport.camera;
      cam.updateMatrixWorld(true);
      const v = d.player.position.clone().set(x, 0, z).project(cam);
      return {
        id,
        sx: Math.round(((v.x + 1) / 2) * window.innerWidth),
        sy: Math.round(((1 - v.y) / 2) * window.innerHeight),
      };
    }, { id, x, z });
    reach.push(res);
  }

  const entry = { viewport: `${size.w}x${size.h}`, hud, camera, playerPx, reach, errors };
  report.viewports.push(entry);

  const tag = `${size.w}x${size.h}`;
  for (const [k, px] of Object.entries(hud.overlaps)) {
    if (px > 0) report.failures.push(`${tag}: ${k} overlap ${px}px`);
  }
  if (hud.overflowX > 1) report.failures.push(`${tag}: horizontal overflow ${hud.overflowX}px`);
  if (hud.offscreen) report.failures.push(`${tag}: a HUD element sits outside the viewport`);
  if (playerPx < MIN_PLAYER_PX) report.failures.push(`${tag}: player only ${playerPx}px tall (min ${MIN_PLAYER_PX})`);
  for (const z of reach) {
    if (z.sx < 8 || z.sx > size.w - 8 || z.sy < 8 || z.sy > size.h - 8) {
      report.failures.push(`${tag}: ${z.id} not visible while standing in it (${z.sx},${z.sy})`);
    }
  }
  if (errors.length) report.failures.push(`${tag}: ${errors.length} console/page errors`);

  await ctx.close();
}

report.passed = report.failures.length === 0;
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(report.passed ? 0 : 1);
