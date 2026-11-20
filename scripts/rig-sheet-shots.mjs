/**
 * Screenshot the rig reference sheet.
 *
 *   npx vite --port 5199 --strictPort      (from the repo root, in another shell)
 *   node scripts/rig-sheet-shots.mjs
 *
 * Chromium headless + SwiftShader, deviceScaleFactor 2, PNGs and a metrics JSON
 * into the scratch folder. This script is evidence-gathering only: it is not part
 * of the build and touches nothing under src/.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT =
  process.env.OUT_DIR ||
  'C:/Users/hp/AppData/Local/hermes/cache/scratch/pharmchris/rig-sheet';
const URL_BASE = process.env.RIG_SHEET_URL || 'http://127.0.0.1:5199/rig-sheet.html';

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const context = await browser.newContext({
  viewport: { width: 3700, height: 1300 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 400)}`);
});

await page.goto(URL_BASE, { waitUntil: 'load', timeout: 30000 });

try {
  await page.waitForFunction(
    '() => window.__rigSheet?.ready === true || !!window.__rigSheetError',
    null,
    { timeout: 30000 }
  );
} catch {
  await browser.close();
  throw new Error(
    `rig sheet never became ready at ${URL_BASE}. Errors:\n${consoleErrors.join('\n') || '(none)'}`
  );
}

const failed = await page.evaluate('window.__rigSheetError || null');
if (failed) {
  await browser.close();
  throw new Error(`rig sheet threw during build:\n${failed}`);
}

const sheet = await page.evaluate('window.__rigSheet.report');
if (!sheet || !Array.isArray(sheet.characters) || sheet.characters.length === 0) {
  await browser.close();
  throw new Error('rig sheet report is empty');
}

await page.waitForTimeout(300);

// Non-blank check: sample the WebGL canvas through a 2D canvas. Paper (luma ~240)
// and floor (~189) are both bright; every rig colour (skin, teal, navy, hair) sits
// well below luma 145, so counting dark pixels is a clean "are there figures?" test.
const ink = await page.evaluate(() => {
  const source = document.getElementById('sheet');
  const w = 480;
  const h = Math.max(1, Math.round((w * source.height) / source.width));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d');
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let figurePixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (luma < 145) figurePixels++;
  }
  return {
    figureFraction: +(figurePixels / (w * h)).toFixed(4),
    sample: `${w}x${h}`,
  };
});

if (ink.figureFraction < 0.05) {
  await browser.close();
  throw new Error(
    `canvas looks blank: only ${(ink.figureFraction * 100).toFixed(1)}% figure pixels`
  );
}

const shots = {};

const fullPath = path.join(OUT, 'rig-sheet.png');
await page.screenshot({ path: fullPath, fullPage: true });
shots.full = fullPath;

const canvasBox = await page.locator('#canvas-host').boundingBox();
if (!canvasBox) throw new Error('canvas host has no box');

const canvasPath = path.join(OUT, 'rig-sheet-canvas.png');
await page.screenshot({
  path: canvasPath,
  clip: {
    x: Math.max(0, canvasBox.x),
    y: Math.max(0, canvasBox.y),
    width: canvasBox.width,
    height: canvasBox.height,
  },
});
shots.canvas = canvasPath;

// One crop per section, so a reviewer can look at a row at 2x without squinting.
const PAD = 16;
for (const group of sheet.groups) {
  const left = canvasBox.x + (group.startPct / 100) * canvasBox.width - PAD;
  const right = canvasBox.x + (group.endPct / 100) * canvasBox.width + PAD;
  const file = path.join(OUT, `rig-sheet-${group.key}.png`);
  await page.screenshot({
    path: file,
    clip: {
      x: Math.max(0, left),
      y: Math.max(0, canvasBox.y - PAD),
      width: Math.min(right, canvasBox.x + canvasBox.width) - Math.max(0, left),
      height: canvasBox.height + PAD * 2,
    },
  });
  shots[group.key] = file;
}

for (const [key, file] of Object.entries(shots)) {
  const stat = fs.statSync(file);
  if (stat.size < 10_000) throw new Error(`${key} screenshot is suspiciously small: ${stat.size} bytes`);
  shots[key] = { path: file, bytes: stat.size };
}

const report = {
  ...sheet,
  evidence: {
    url: URL_BASE,
    viewport: { width: 3700, height: 1300 },
    deviceScaleFactor: 2,
    figureCoverage: ink,
    shots,
    consoleErrors,
  },
};

const jsonPath = path.join(OUT, 'rig-sheet.json');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

await browser.close();

console.log(JSON.stringify(report, null, 2));
console.log(`\nJSON: ${jsonPath}`);
