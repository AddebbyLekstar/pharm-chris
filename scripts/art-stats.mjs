/**
 * Luminance statistics for the art A/B, read from a real screenshot.
 *
 * Reading the WebGL canvas in-page returns black after the frame is presented
 * (no preserveDrawingBuffer), so this decodes the PNG Playwright captured instead.
 *
 *   node scripts/art-stats.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import zlib from 'node:zlib';

const URL_BASE = process.env.URL_BASE || 'http://127.0.0.1:4173/';
const launch = { headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
if (os.platform() === 'linux') launch.executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

/** Minimal PNG decoder: 8-bit RGB/RGBA, non-interlaced. Enough for Playwright output. */
function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
      if (data[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : null;
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

function luminanceStats(png, crop) {
  const { width, height, channels, data } = png;
  const x0 = crop ? Math.floor(width * crop[0]) : 0;
  const x1 = crop ? Math.floor(width * crop[1]) : width;
  const y0 = crop ? Math.floor(height * crop[2]) : 0;
  const y1 = crop ? Math.floor(height * crop[3]) : height;
  const n = (x1 - x0) * (y1 - y0);
  let sum = 0;
  let sumSq = 0;
  let dark = 0;
  const hist = new Array(256).fill(0);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * width + x) * channels;
      const l = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
      sum += l;
      sumSq += l * l;
      if (l < 12) dark++;
      hist[Math.min(255, Math.max(0, Math.round(l)))]++;
    }
  }
  const pct = (q) => {
    const target = q * n;
    let acc = 0;
    for (let b = 0; b < 256; b++) {
      acc += hist[b];
      if (acc >= target) return b;
    }
    return 255;
  };
  const mean = sum / n;
  return {
    mean: +mean.toFixed(1),
    std: +Math.sqrt(Math.max(0, sumSq / n - mean * mean)).toFixed(1),
    p5: pct(0.05),
    p50: pct(0.5),
    p95: pct(0.95),
    range: pct(0.95) - pct(0.05),
    blackShare: +(dark / n).toFixed(3),
  };
}

const browser = await chromium.launch(launch);
const rows = [];

for (const [w, h, quality] of [[360, 800, 'low'], [1280, 720, 'high']]) {
  for (const art of ['v1', 'v2']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
    const page = await ctx.newPage();
    await page.goto(`${URL_BASE}?mode=arcade&debug=1&quality=${quality}&art=${art}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('!!window.pharmChris', null, { timeout: 40000 });
    await page.waitForTimeout(4500);

    const buffer = await page.screenshot();
    fs.writeFileSync(`./art-ab/stats-${art}-${w}x${h}.png`, buffer);
    const png = decodePng(buffer);
    // Whole frame, plus the play area only: the dark void around the diorama
    // dominates a full-frame histogram and hides what changed in the room.
    const whole = luminanceStats(png);
    const room = luminanceStats(png, [0.2, 0.8, 0.2, 0.8]);

    rows.push({ art, viewport: `${w}x${h}`, whole, room });
    await ctx.close();
  }
}

fs.writeFileSync('./art-ab/stats.json', JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows, null, 2));
await browser.close();
