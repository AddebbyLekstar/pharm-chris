/**
 * Android (WebView) gate over raw CDP: the same assertions as
 * scripts/check-mobile.mjs, run against a real Android browser.
 *
 * Playwright's connectOverCDP does not work against Android WebView (no Browser
 * domain), so this speaks the page-level DevTools protocol directly.
 *
 * Prerequisites inside the Android sandbox:
 *   adb reverse tcp:4173 tcp:4173
 *   adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
 *
 *   node scripts/check-android.mjs [--cdp http://127.0.0.1:9222] [--url http://localhost:4173/]
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const CDP = arg('--cdp', 'http://127.0.0.1:9222');
const URL_BASE = arg('--url', 'http://localhost:4173/');
const OUT = arg('--out', '/data/home/check-out');

const ZONES = [
  ['dock', 0, -6.5],
  ['shelf_antimalarial', -4.5, -4.5],
  ['shelf_analgesic', -4.5, 0.5],
  ['shelf_antibiotic', 4.5, -4.5],
  ['shelf_cold_chain', 4.5, 0.5],
  ['counter_cashier', 0, 0.2],
];
const MIN_PLAYER_PX = 38;

fs.mkdirSync(OUT, { recursive: true });

const targets = await (await fetch(`${CDP}/json`)).json();
const target =
  targets.find((t) => t.type === 'page' && t.url.includes('4173')) ??
  targets.find((t) => t.type === 'page');
if (!target) throw new Error('no page target on ' + CDP);

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const consoleErrors = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error)})`));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 200));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(`exception: ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description ?? ''}`.slice(0, 200));
  }
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 45000);
  });
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (res.exceptionDetails) {
    throw new Error(`eval failed: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description ?? ''}`);
  }
  return res.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForGame() {
  for (let i = 0; i < 60; i++) {
    if (await evaluate('!!window.pharmChris')) return true;
    await sleep(500);
  }
  return false;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: `${URL_BASE}?mode=arcade&debug=1&quality=low` });
await sleep(2500);
if (!(await waitForGame())) throw new Error('pharmChris never booted on the device');
await evaluate("localStorage.removeItem('pharm_chris_run_v2')");
await send('Page.reload');
await sleep(2500);
if (!(await waitForGame())) throw new Error('pharmChris did not boot after reload');
await sleep(2500);

const env = await evaluate(`({
  ua: navigator.userAgent,
  viewport: window.innerWidth + 'x' + window.innerHeight,
  dpr: window.devicePixelRatio,
  webgl: (() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'none';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
  })(),
})`);

const hud = await evaluate(`(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
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
    hint, invest, switcher, objective,
    badge: document.querySelector('#hud-invest-hint')?.textContent?.trim() ?? '',
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
})()`);

const camera = await evaluate(`(() => {
  const vp = window.pharmChris.director.viewport;
  return { contained: vp.contained, pan: [ +vp.panLimit.x.toFixed(2), +vp.panLimit.y.toFixed(2) ], dist: +vp.targetOffset.length().toFixed(1) };
})()`);

const playerPx = await evaluate(`(() => {
  const p = window.pharmChris;
  const cam = p.director.viewport.camera;
  cam.updateMatrixWorld(true);
  const v = p.director.player.position.clone();
  const feet = v.clone().set(v.x, 0, v.z).project(cam);
  const head = v.clone().set(v.x, 1.75, v.z).project(cam);
  return Math.round(Math.abs(((head.y - feet.y) / 2) * window.innerHeight));
})()`);

const reach = [];
for (const [id, x, z] of ZONES) {
  const res = await evaluate(`(async () => {
    const d = window.pharmChris.director;
    d.player.position.set(${x}, 0, ${z});
    // Settle, don't guess: the emulator renders at ~5 fps, so a flat 450 ms is two
    // frames and the follow camera is still in flight when we measure.
    await new Promise((r) => setTimeout(r, 450));
    {
      const cam0 = window.pharmChris.director.viewport.camera;
      let prev = cam0.position.clone();
      const until = performance.now() + 4000;
      while (performance.now() < until) {
        await new Promise((r) => setTimeout(r, 120));
        if (cam0.position.distanceToSquared(prev) < 1e-6) break;
        prev = cam0.position.clone();
      }
    }
    const cam = d.viewport.camera;
    cam.updateMatrixWorld(true);
    const v = d.player.position.clone().set(${x}, 0, ${z}).project(cam);
    return { id: '${id}', sx: Math.round(((v.x + 1) / 2) * window.innerWidth), sy: Math.round(((1 - v.y) / 2) * window.innerHeight) };
  })()`);
  reach.push(res);
}

// Real-device perf: no synthetic CPU throttle, whatever the device gives.
await evaluate("window.pharmChris.director.player.position.set(0, 0, -6.5)");
await sleep(800);
const perf = [];
for (let i = 0; i < 4; i++) {
  await sleep(700);
  perf.push(await evaluate('window.pharmChris.perf()'));
}
const frames = await evaluate('window.pharmChris.director.frameTimes.slice(-240).sort((a, b) => a - b)');
const pct = (arr, p) => (arr.length ? +(arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] * 1000).toFixed(1) : null);
const state = await evaluate('window.pharmChris.state()');

const shotPath = `${OUT}/android-${env.viewport.replace('x', '-')}.png`;
// Page.captureScreenshot on Android WebView returns the DOM layer only: the WebGL
// surface comes back black. The device framebuffer is the honest picture.
try {
  const png = execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 32 * 1024 * 1024 });
  fs.writeFileSync(shotPath, png);
} catch (err) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(shotPath.replace('.png', '-cdp.png'), Buffer.from(shot.data, 'base64'));
  console.error('adb screencap failed, wrote CDP screenshot instead (canvas may be blank):', err.message);
}

const report = {
  target: 'android',
  url: URL_BASE,
  env,
  hud,
  camera,
  playerPx,
  reach,
  perf: {
    drawCalls: perf.map((p) => p.drawCalls),
    maxDrawCalls: Math.max(...perf.map((p) => p.drawCalls)),
    triangles: Math.max(...perf.map((p) => p.triangles)),
    frameMs: { p50: pct(frames, 0.5), p95: pct(frames, 0.95) },
  },
  state: { day: state.day, cash: state.cash, served: state.served, queue: state.queue },
  errors: consoleErrors,
  screenshot: shotPath,
  failures: [],
};

const vw = Number(env.viewport.split('x')[0]);
const vh = Number(env.viewport.split('x')[1]);
for (const [k, px] of Object.entries(hud.overlaps)) if (px > 0) report.failures.push(`${k} overlap ${px}px`);
if (hud.overflowX > 1) report.failures.push(`horizontal overflow ${hud.overflowX}px`);
if (hud.offscreen) report.failures.push('a HUD element sits outside the viewport');
if (playerPx < MIN_PLAYER_PX) report.failures.push(`player only ${playerPx}px tall (min ${MIN_PLAYER_PX})`);
for (const z of reach) {
  if (z.sx < 8 || z.sx > vw - 8 || z.sy < 8 || z.sy > vh - 8) report.failures.push(`${z.id} not visible while standing in it (${z.sx},${z.sy})`);
}
if (consoleErrors.length) report.failures.push(`${consoleErrors.length} console/page errors`);
report.passed = report.failures.length === 0;

console.log(JSON.stringify(report, null, 2));
ws.close();
process.exit(report.passed ? 0 : 1);
