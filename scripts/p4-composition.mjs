/**
 * P4 task 5 — the phone composition gate.
 *
 * The claim to prove: at every phone width, the opening frame carries a pharmacy cue
 * that stands at least +40 luminance above its immediate surround, so a first-time
 * player knows what they are looking at before they read a single HUD label.
 *
 * The cue is `pharm-cross-plate`, the enamel plate with the green cross behind the
 * dispensing counter. It is the candidate measurement chose: a counter fascia plate
 * was built first and measured +6 / +1 at 390 / 414 px, because the spawn camera
 * sees the counter almost edge-on, while this one holds ~+90 at every width.
 * `scripts/cue-probe.mjs` ranks every signage mesh and is how that comparison
 * was made — if the camera or the room changes, re-run it before trusting this gate.
 *
 * Method: for each width, hide the overlays, project the plate's box to screen,
 * screenshot, then decode that PNG back inside the page and average pixels inside
 * the plate against a ring around it. Doing the sampling in the page means the
 * numbers come from the same paint the player sees, with no image library in the
 * repo.
 *
 *   node scripts/p4-composition.mjs            # 320/360/390/414
 *   node scripts/p4-composition.mjs 390        # one width
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.P4_URL ?? 'http://127.0.0.1:4173/';
const OUT = 'docs/art';
const CUE = 'pharm-cross-plate';
const WIDTHS = process.argv[2] ? [Number(process.argv[2])] : [320, 360, 390, 414];
const HEIGHT = 844;
const TARGET = 40;

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const results = [];
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: HEIGHT }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${BASE}?mode=arcade&debug=1&quality=high`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('pharm_chris_run_v2'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.pharmChris', null, { timeout: 40000 });
  await page.waitForTimeout(4000);

  await page.evaluate(() => {
    for (const id of ['pharm-hud', 'sim-mode-switcher']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
  });

  const shot = await page.screenshot({ path: `${OUT}/p4-comp-${width}.png` });

  const measured = await page.evaluate(async ({ b64, cue, target }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const dpr = img.width / innerWidth;

    // Project the cue: 8 box corners, not 4, so the rect is right even though the
    // camera is pitched — the plate is a box, not a screen-aligned quad.
    const p = window.pharmChris;
    const scene = p.director.scene.scene;
    const cam = p.director.viewport.camera;
    let mesh = null;
    scene.traverse((o) => { if (o.name === cue) mesh = o; });
    if (!mesh) return { error: `${cue} not found in scene` };
    mesh.updateWorldMatrix(true, false);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const v = cam.position.clone();
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          v.set(x, y, z).applyMatrix4(mesh.matrixWorld).project(cam);
          const sx = ((v.x + 1) / 2) * innerWidth;
          const sy = ((1 - v.y) / 2) * innerHeight;
          minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
          minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
        }
      }
    }
    const screen = {
      x: Math.round(minX),
      y: Math.round(minY),
      w: Math.round(maxX - minX),
      h: Math.round(maxY - minY),
    };
    if (screen.w < 8 || screen.h < 6) return { error: 'cue too small on screen', rect: screen };
    // A cue half out of frame is not a first-second cue, so clipping fails the gate
    // instead of quietly shrinking the sample.
    if (minX < 1 || minY < 1 || maxX > innerWidth - 1 || maxY > innerHeight - 1) {
      return { error: 'cue clipped by the frame edge', rect: screen };
    }
    const rect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

    const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const px = (x, y) => {
      const d = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const mean = (points) => {
      let sum = 0;
      for (const [x, y] of points) sum += luma(...px(x, y));
      return sum / points.length;
    };

    // Inside: the middle 60 %, so the enamel bevel and the antialiased edge do not
    // drag the mean.
    const insetX = rect.x + rect.w * 0.2;
    const insetY = rect.y + rect.h * 0.2;
    const inW = rect.w * 0.6;
    const inH = rect.h * 0.6;
    const inside = [];
    for (let y = insetY; y < insetY + inH; y += Math.max(1, inH / 12)) {
      for (let x = insetX; x < insetX + inW; x += Math.max(1, inW / 24)) inside.push([x, y]);
    }

    // Surround: a ring 5–30 px out from the plate edge. Whatever the cue is bolted
    // to — wall, tile, drop shadow — is fair game, because that is the comparison
    // the player's eye makes.
    const outside = [];
    for (let band = 5; band <= 30; band += 5) {
      for (let t = 0; t <= 1; t += 0.05) {
        outside.push([rect.x + t * rect.w, rect.y - band]);
        outside.push([rect.x + t * rect.w, rect.y + rect.h + band]);
        outside.push([rect.x - band, rect.y + t * rect.h]);
        outside.push([rect.x + rect.w + band, rect.y + t * rect.h]);
      }
    }

    const plate = mean(inside);
    const surround = mean(outside);
    return { rect, plate: +plate.toFixed(1), surround: +surround.toFixed(1), delta: +(plate - surround).toFixed(1), target };
  }, { b64: shot.toString('base64'), cue: CUE, target: TARGET });

  results.push({ width, ...measured, errors });
  console.log(JSON.stringify({ width, ...measured, errors }, null, 1));
  await page.close();
}

await browser.close();
await writeFile(`${OUT}/p4-composition.json`, JSON.stringify(results, null, 2));

const failed = results.filter((r) => r.error || r.delta < TARGET || r.errors.length > 0);
console.log(failed.length === 0 ? 'COMPOSITION_PASS' : `COMPOSITION_FAIL ${failed.map((f) => f.width).join(',')}`);
