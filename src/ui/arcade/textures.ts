/**
 * Procedural surface textures for the arcade scene.
 *
 * Every prop in this game is an untextured primitive with a flat albedo, and that
 * — more than the lighting — is why the frame reads as a blockout. Lighting can
 * only describe form if the surface has something for the light to catch.
 *
 * These are generated in a canvas at boot: no asset downloads, no texture atlas
 * to maintain, deterministic (seeded), and free at draw-call level because they
 * are just maps on materials that already exist.
 */
import * as THREE from 'three';

/** Deterministic PRNG so two boots produce identical textures. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Canvas2D = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

function sheet(size: number): Canvas2D {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable; procedural textures cannot be built');
  return { canvas, ctx };
}

function finish(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1, srgb = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const TEXTURE_SIZE = 512;

/**
 * Terracotta: warm clay tiles, 1 m grid of grout lines, aggregate speckle and a
 * faint directional mottle so the floor does not read as a single flat plane.
 * One texture covers 4 x 4 tiles; the caller sets repeat per surface.
 *
 * The reference floor is fired clay, not poured terrazzo: a brick-red base with
 * cream grout and per-tile tone drift. The old near-white base made every warm
 * light in the room look like a grey shadow.
 */
export function terrazzo(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(TEXTURE_SIZE);
  const rand = mulberry32(0x7e44a1);
  const tiles = 4;
  const tile = TEXTURE_SIZE / tiles;

  ctx.fillStyle = '#b4715a';
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  // Per-tile tone drift: four clay batches, not one. 4 % is enough to break the
  // grid without turning the floor into a checkerboard.
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const warm = rand() > 0.5;
      ctx.fillStyle = warm ? 'rgba(206,132,96,0.10)' : 'rgba(120,66,46,0.09)';
      ctx.fillRect(tx * tile, ty * tile, tile, tile);
    }
  }

  // Aggregate chips, varied warmth so the floor is not one colour.
  const chips = ['#9c5c42', '#c9825d', '#8a4e36', '#d79a76', '#a8654a', '#e0b08c'];
  for (let i = 0; i < 2600; i++) {
    const x = rand() * TEXTURE_SIZE;
    const y = rand() * TEXTURE_SIZE;
    const r = 0.7 + rand() * 2.6;
    ctx.fillStyle = chips[Math.floor(rand() * chips.length)];
    ctx.globalAlpha = 0.22 + rand() * 0.42;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rand() * 0.7), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Grout: a 2 px line at every tile boundary, slightly darker with a soft edge
  // so it reads as a recess rather than a drawn grid.
  for (let i = 0; i <= tiles; i++) {
    const p = i * tile;
    ctx.fillStyle = 'rgba(86,56,42,0.7)';
    ctx.fillRect(p - 1.5, 0, 3, TEXTURE_SIZE);
    ctx.fillRect(0, p - 1.5, TEXTURE_SIZE, 3);
    ctx.fillStyle = 'rgba(236,196,160,0.28)';
    ctx.fillRect(p + 1.5, 0, 1.5, TEXTURE_SIZE);
    ctx.fillRect(0, p + 1.5, TEXTURE_SIZE, 1.5);
  }

  return finish(canvas, 4, 4.5);
}

/** Roughness map for the floor: glossier inside tiles, rougher at the grout. */
export function terrazzoRoughness(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(256);
  const tiles = 4;
  const tile = 256 / tiles;
  ctx.fillStyle = '#8c8c8c';
  ctx.fillRect(0, 0, 256, 256);
  const rand = mulberry32(0x1188ff);
  for (let i = 0; i < 900; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 1 + rand() * 5;
    ctx.fillStyle = rand() > 0.5 ? '#7a7a7a' : '#9d9d9d';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i <= tiles; i++) {
    const p = i * tile;
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(p - 2, 0, 4, 256);
    ctx.fillRect(0, p - 2, 256, 4);
  }
  return finish(canvas, 4, 4.5, false);
}

/** Emulsion paint: fine roller mottle, faint brush streaks, no visible tiling. */
export function paintedWall(tint = '#22493d'): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(TEXTURE_SIZE);
  const rand = mulberry32(0x22cc31);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  for (let i = 0; i < 90; i++) {
    const y = rand() * TEXTURE_SIZE;
    const h = 2 + rand() * 26;
    ctx.fillStyle = `rgba(255,255,255,${0.012 + rand() * 0.022})`;
    ctx.fillRect(0, y, TEXTURE_SIZE, h);
  }
  for (let i = 0; i < 900; i++) {
    const x = rand() * TEXTURE_SIZE;
    const y = rand() * TEXTURE_SIZE;
    const r = 3 + rand() * 22;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fine grain: at 3x1.5 a 16 m wall showed each 512px tile across 5 m, which read
  // as marbled streaks rather than paint.
  return finish(canvas, 7, 3.5);
}

/** Nigerian teak: warm brown with cathedral grain and a satin sheen band. */
export function teak(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(TEXTURE_SIZE);
  const rand = mulberry32(0x5104aa);
  ctx.fillStyle = '#4e342e';
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  for (let i = 0; i < 260; i++) {
    const y = rand() * TEXTURE_SIZE;
    const amp = 2 + rand() * 10;
    const freq = 0.008 + rand() * 0.02;
    ctx.strokeStyle = rand() > 0.45 ? 'rgba(36,20,16,0.55)' : 'rgba(122,86,68,0.4)';
    ctx.lineWidth = 0.6 + rand() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= TEXTURE_SIZE; x += 8) {
      const yy = y + Math.sin(x * freq + rand() * 0.4) * amp;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Knots
  for (let i = 0; i < 6; i++) {
    const x = rand() * TEXTURE_SIZE;
    const y = rand() * TEXTURE_SIZE;
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = `rgba(28,15,12,${0.35 - k * 0.07})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, 5 + k * 4, 3 + k * 2.4, rand() * Math.PI, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return finish(canvas, 2, 1);
}

/** Ivory laminate: near-white with a whisper of speckle, keeps the gloss clean. */
export function laminate(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(256);
  const rand = mulberry32(0xa77c12);
  ctx.fillStyle = '#f7fafc';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(196,205,212,0.35)' : 'rgba(255,255,255,0.6)';
    ctx.fillRect(x, y, 1 + rand() * 1.6, 1 + rand() * 1.6);
  }
  return finish(canvas, 3, 1);
}

/** Powder-coated steel: fine horizontal brush, used for shelf frames and fridge. */
export function brushedSteel(tint = '#1b4d3e'): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(256);
  const rand = mulberry32(0x99ee01);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const y = rand() * 256;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, y, 256, 0.8 + rand() * 1.4);
  }
  return finish(canvas, 1.5, 1.5);
}

/** Corrugated carton board for dock crates and carried stock. */
export function cardboard(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(256);
  const rand = mulberry32(0x3311ee);
  ctx.fillStyle = '#b98a52';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i++) {
    const y = rand() * 256;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(90,62,34,0.18)' : 'rgba(226,196,155,0.2)';
    ctx.fillRect(0, y, 256, 2 + rand() * 5);
  }
  // Tape band down the middle + a printed handling stripe.
  ctx.fillStyle = 'rgba(214,178,120,0.55)';
  ctx.fillRect(112, 0, 32, 256);
  ctx.fillStyle = 'rgba(60,40,22,0.5)';
  ctx.fillRect(0, 118, 70, 10);
  ctx.fillRect(186, 118, 70, 10);
  return finish(canvas, 1, 1);
}

/**
 * Stock label atlas: four medicine cartons in a 2 x 2 grid.
 *
 * The shelf packs were plain coloured boxes, which is why a stocked bay still read
 * as placeholder geometry. A real label — brand band, drug name, strength, small
 * print and a barcode — is what the eye uses to decide "those are medicines". One
 * atlas serves every bay: each bay samples a different quadrant, so a shelf shows
 * four designs while the whole shop still costs one draw call per bay.
 */
let atlasCache: THREE.CanvasTexture | null = null;

export function medicineAtlas(): THREE.CanvasTexture {
  // One canvas for the whole shop; each bay clones the texture and samples a
  // quadrant, which shares the GPU upload.
  if (atlasCache) return atlasCache;
  // 512, so each carton face is 256 px: enough for a legible drug name at arm's
  // length, and 4x cheaper than 1024 on a 2 GB phone.
  const size = 512;
  const cell = size / 2;
  const { canvas, ctx } = sheet(size);
  const rand = mulberry32(0x2b17c9);

  const designs: Array<{ band: string; name: string; dose: string; ink: string }> = [
    { band: '#c0453b', name: 'COARTEM', dose: '20/120 mg', ink: '#fdf6ec' },
    { band: '#1f6b4f', name: 'PARACETAMOL', dose: '500 mg', ink: '#f4f8f2' },
    { band: '#1e5f8a', name: 'AMOXICILLIN', dose: '250 mg', ink: '#f2f7fb' },
    { band: '#b08a4a', name: 'INSULIN', dose: '100 IU/mL', ink: '#221a10' },
  ];

  designs.forEach((design, i) => {
    const ox = (i % 2) * cell;
    const oy = Math.floor(i / 2) * cell;

    // Carton body: warm white with a faint fibre texture, so the pack is not flat.
    ctx.fillStyle = '#f7f3e8';
    ctx.fillRect(ox, oy, cell, cell);
    for (let n = 0; n < 900; n++) {
      ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#e8e2d2';
      ctx.globalAlpha = 0.25;
      ctx.fillRect(ox + rand() * cell, oy + rand() * cell, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Brand band across the upper third.
    ctx.fillStyle = design.band;
    ctx.fillRect(ox, oy, cell, cell * 0.34);
    ctx.fillStyle = design.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(cell * 0.13)}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(design.name, ox + cell / 2, oy + cell * 0.17, cell * 0.92);

    // Strength, then the small print a real carton carries.
    ctx.fillStyle = '#2a2320';
    ctx.font = `600 ${Math.round(cell * 0.1)}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(design.dose, ox + cell / 2, oy + cell * 0.46, cell * 0.8);

    ctx.fillStyle = '#6f675c';
    for (let line = 0; line < 4; line++) {
      const w = cell * (0.5 + rand() * 0.3);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(ox + (cell - w) / 2, oy + cell * (0.57 + line * 0.06), w, cell * 0.018);
    }
    ctx.globalAlpha = 1;

    // Barcode block: bars of random width in the lower strip.
    const bx = ox + cell * 0.18;
    const by = oy + cell * 0.83;
    const bh = cell * 0.09;
    let x = bx;
    while (x < ox + cell * 0.82) {
      const w = 1 + rand() * 5;
      ctx.fillStyle = rand() > 0.35 ? '#201c18' : '#f7f3e8';
      ctx.fillRect(x, by, w, bh);
      x += w + 1 + rand() * 3;
    }

    // Cell border, so a mis-set repeat is visible instead of silently bleeding.
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + 1, oy + 1, cell - 2, cell - 2);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  atlasCache = texture;
  return texture;
}

/**
 * Wall-paper atlas: four posters and a calendar in one 384 x 768 sheet.
 *
 * Each poster used to call signage() and own a 512 x 512 texture and its own
 * draw call. At five pieces of wall paper that was 5 MB and five draws for
 * decoration, and the fifth one would have pushed the boot past the texture
 * budget. One atlas cell is 192 x 256, close to the 0.66 x 0.86 m poster the
 * kit draws, so nothing is visibly stretched; the whole wall costs one upload
 * and one merged draw.
 */
export const POSTER_ATLAS = { width: 384, height: 768, cols: 2, rows: 3, cellW: 192, cellH: 256 } as const;

/** UV rectangle of an atlas cell, in three.js's bottom-left texture space. */
export function posterCellUV(cell: number): { u0: number; v0: number; u1: number; v1: number } {
  const col = cell % POSTER_ATLAS.cols;
  const row = Math.floor(cell / POSTER_ATLAS.cols) % POSTER_ATLAS.rows;
  const { width, height, cellW, cellH } = POSTER_ATLAS;
  return {
    u0: (col * cellW) / width,
    u1: ((col + 1) * cellW) / width,
    v0: 1 - ((row + 1) * cellH) / height,
    v1: 1 - (row * cellH) / height,
  };
}

let posterAtlasCache: THREE.CanvasTexture | null = null;

export function posterAtlas(): THREE.CanvasTexture {
  if (posterAtlasCache) return posterAtlasCache;
  const { width, height, cellW, cellH } = POSTER_ATLAS;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable; poster atlas cannot be built');
  const rand = mulberry32(0x9a17e3);

  const font = (weight: number, size: number) =>
    `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;

  // Deterministic paper grain over the whole sheet: photocopied stock, not vinyl.
  const grain = (ox: number, oy: number): void => {
    for (let i = 0; i < 420; i++) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(60,40,24,0.06)';
      ctx.fillRect(ox + rand() * cellW, oy + rand() * cellH, 1 + rand() * 1.6, 1 + rand() * 1.6);
    }
  };

  const plate = (cell: number, bg: string): number[] => {
    const ox = (cell % POSTER_ATLAS.cols) * cellW;
    const oy = Math.floor(cell / POSTER_ATLAS.cols) * cellH;
    ctx.fillStyle = bg;
    ctx.fillRect(ox, oy, cellW, cellH);
    return [ox, oy];
  };

  const centred = (text: string, x: number, y: number, weight: number, size: number, ink: string, max = cellW - 24): void => {
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(weight, size);
    ctx.fillText(text, x, y, max);
  };

  const ruledRow = (x: number, y: number, w: number, ink: string, strong = false): void => {
    ctx.fillStyle = ink;
    ctx.globalAlpha = strong ? 0.55 : 0.28;
    ctx.fillRect(x, y, w, strong ? 1.6 : 1);
    ctx.globalAlpha = 1;
  };

  // --- 0. Opening hours, deep green -------------------------------------
  {
    const [ox, oy] = plate(0, '#1f4b3f');
    ctx.strokeStyle = '#e9dcc3';
    ctx.lineWidth = 5;
    ctx.strokeRect(ox + 8, oy + 8, cellW - 16, cellH - 16);

    // Sun: an arc rising over a rule, drawn rather than an emoji so it keeps the
    // same weight as the type at 46 px on a phone.
    const cx = ox + cellW / 2;
    const cy = oy + 76;
    ctx.strokeStyle = '#e4b45c';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, 24, Math.PI, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 31, cy + Math.sin(a) * 31);
      ctx.lineTo(cx + Math.cos(a) * 39, cy + Math.sin(a) * 39);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - 44, cy + 2);
    ctx.lineTo(cx + 44, cy + 2);
    ctx.stroke();

    centred('OPEN', cx, oy + 136, 700, 42, '#f6f1e6');
    centred('8AM - 9PM', cx, oy + 177, 600, 24, '#f6f1e6');
    ruledRow(ox + 44, oy + 197, cellW - 88, '#e9dcc3', true);
    centred('MON - SAT', cx, oy + 215, 500, 15, '#cfdcd2');
    grain(ox, oy);
  }

  // --- 1. Malaria test, brick red ---------------------------------------
  {
    const [ox, oy] = plate(1, '#b8433a');
    ctx.fillStyle = '#f1e2c9';
    ctx.fillRect(ox, oy, cellW, 26);
    centred('TEST TODAY', ox + cellW / 2, oy + 13, 700, 12, '#7d2a24');

    // A drop, the one pictogram everybody reads as "blood test".
    ctx.fillStyle = '#f1e2c9';
    ctx.beginPath();
    ctx.moveTo(ox + cellW / 2, oy + 44);
    ctx.bezierCurveTo(ox + cellW / 2 - 20, oy + 70, ox + cellW / 2 - 14, oy + 92, ox + cellW / 2, oy + 92);
    ctx.bezierCurveTo(ox + cellW / 2 + 14, oy + 92, ox + cellW / 2 + 20, oy + 70, ox + cellW / 2, oy + 44);
    ctx.fill();

    centred('MALARIA', ox + cellW / 2, oy + 116, 700, 28, '#f6f1e6');
    centred('RAPID TEST', ox + cellW / 2, oy + 141, 600, 16, '#f0cbb8');
    centred('₦2,000', ox + cellW / 2, oy + 186, 700, 44, '#f6f1e6');
    centred('RESULTS IN 15 MIN', ox + cellW / 2, oy + 224, 500, 11, '#f0cbb8');
    grain(ox, oy);
  }

  // --- 2. Price list, cream ledger --------------------------------------
  {
    const [ox, oy] = plate(2, '#f6f1e6');
    ctx.fillStyle = '#b08a4a';
    ctx.fillRect(ox, oy, cellW, 40);
    centred('PRICE LIST', ox + cellW / 2, oy + 20, 700, 21, '#2a2014');

    const rows = ['PARACETAMOL', 'COARTEM', 'AMOXICILLIN', 'VITAMIN C', 'BANDAGE'];
    rows.forEach((label, i) => {
      const y = oy + 62 + i * 30;
      centred(label, ox + 96, y, 600, 12, '#3a2c22', cellW - 40);
      ruledRow(ox + 18, y + 11, cellW - 36, '#8a6a45');
      ctx.fillStyle = '#b08a4a';
      ctx.fillRect(ox + 18, y + 8, 3, 3);
    });
    centred('ASK THE CHEMIST', ox + cellW / 2, oy + 226, 600, 10, '#7a5a38');
    grain(ox, oy);
  }

  // --- 3. Deworming, teal ------------------------------------------------
  {
    const [ox, oy] = plate(3, '#2e6f6b');
    ctx.strokeStyle = '#e9dcc3';
    ctx.lineWidth = 4;
    ctx.strokeRect(ox + 9, oy + 9, cellW - 18, cellH - 18);

    // Capsule, tilted, with a seam: reads at thumbnail size.
    ctx.save();
    ctx.translate(ox + cellW / 2, oy + 74);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#f6f1e6';
    ctx.beginPath();
    ctx.roundRect(-34, -13, 68, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#d9a441';
    ctx.beginPath();
    ctx.roundRect(-34, -13, 34, 26, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,20,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 12);
    ctx.stroke();
    ctx.restore();

    centred('DEWORMING', ox + cellW / 2, oy + 122, 700, 24, '#f6f1e6');
    centred('FOR THE FAMILY', ox + cellW / 2, oy + 146, 500, 11, '#cfe3da');
    centred('₦500', ox + cellW / 2, oy + 186, 700, 44, '#f0c45c');
    centred('ONE DOSE · ALL AGES', ox + cellW / 2, oy + 220, 500, 10, '#cfe3da');
    grain(ox, oy);
  }

  // --- 4. Wall calendar, November ---------------------------------------
  {
    const [ox, oy] = plate(4, '#f6f1e6');
    ctx.fillStyle = '#1f4b3f';
    ctx.fillRect(ox, oy, cellW, 46);
    centred('NOVEMBER', ox + cellW / 2, oy + 20, 700, 19, '#f6f1e6');
    centred('2026', ox + cellW / 2, oy + 36, 500, 10, '#c9d8cc');

    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const left = ox + 14;
    const top = oy + 56;
    const cw = (cellW - 28) / 7;
    const ch = 30;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(600, 9);
    ctx.fillStyle = '#8a6a45';
    days.forEach((d, i) => ctx.fillText(d, left + cw * (i + 0.5), top + 6));

    // November 2026 starts on a Sunday: one leading blank cell in a Mon-first grid.
    ctx.font = font(500, 10);
    for (let day = 1; day <= 30; day++) {
      const index = day; // 1st lands in the second column
      const col = index % 7;
      const row = Math.floor(index / 7);
      const x = left + cw * (col + 0.5);
      const y = top + 22 + row * ch;
      if (day === 21) {
        ctx.fillStyle = '#c0453b';
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f6f1e6';
      } else {
        ctx.fillStyle = col >= 5 ? '#a8865c' : '#3a2c22';
      }
      ctx.fillText(String(day), x, y);
    }
    ctx.fillStyle = '#c0453b';
    ctx.font = font(600, 9);
    ctx.textAlign = 'center';
    ctx.fillText('STOCK COUNT', ox + cellW / 2, oy + cellH - 12);
    grain(ox, oy);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  posterAtlasCache = texture;
  return texture;
}

export function signage(text: string, background: string, ink = '#ffffff'): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(512);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 512);
  // Subtle vertical sheen so the plate is not a flat rectangle of colour.
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.02)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = text.toUpperCase().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > 440 && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);

  let size = 96;
  ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`;
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
  if (widest > 420) size = Math.max(34, Math.floor(size * (420 / widest)));
  ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`;

  const lineHeight = size * 1.12;
  const startY = 256 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, 256, startY + i * lineHeight));

  return finish(canvas, 1, 1);
}

/**
 * Dock stencil: one word of sprayed floor paint on a transparent sheet.
 *
 * Kept at 512 x 146 rather than a square atlas: it is an alpha mask for a single
 * 1.9 x 0.54 m line of type, so a square 512 would spend three quarters of the
 * upload on empty pixels. With mips this is ~0.4 MB, against the 16.75 MB boot
 * budget.
 */
export function dockStencil(): THREE.CanvasTexture {
  const w = 512;
  const h = 146;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable; dock stencil cannot be built');

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Arial Black, not a decorative stencil face: at 13 px per letter the only
  // thing that survives minification is stroke weight. The spray nicks below
  // keep it reading as painted rather than typeset.
  ctx.font = '900 130px "Arial Black", "Segoe UI", sans-serif';
  ctx.fillText('CRATE', w / 2, h * 0.53, 492);

  // Spray wear: a handful of nicks through the glyphs, so the word reads as
  // paint on a floor rather than a clean UI label. Seeded, so two boots match.
  const rand = mulberry32(0x0d0c4a);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 46; i++) {
    const x = 18 + rand() * (w - 36);
    const y = 18 + rand() * (h - 36);
    ctx.globalAlpha = 0.35 + rand() * 0.5;
    ctx.fillRect(x, y, 1 + rand() * 3, 1 + rand() * 2.5);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  const texture = finish(canvas, 1, 1);
  texture.premultiplyAlpha = false;
  return texture;
}

/** Soft radial ring for interaction zones — replaces a hard saturated hoop. */
export function zoneRing(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(256);
  ctx.clearRect(0, 0, 256, 256);
  const grad = ctx.createRadialGradient(128, 128, 60, 128, 128, 126);
  // A coloured wash over bright terrazzo always reads washed out, so the band
  // itself is opaque and only the interior is faint. Legibility comes from the
  // edge, not from tinting the whole disc.
  grad.addColorStop(0, 'rgba(255,255,255,0.08)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  grad.addColorStop(0.88, 'rgba(255,255,255,1)');
  grad.addColorStop(0.94, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.fill();
  return finish(canvas, 1, 1);
}

/**
 * Backdrop: the room floats on pure black today, which reads as an unfinished
 * viewport. A warm vertical gradient with a vignette gives the diorama a stage.
 */
export function backdrop(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable; backdrop cannot be built');

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0b1512');
  grad.addColorStop(0.55, '#12201b');
  grad.addColorStop(1, '#060b09');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.5, h * 0.42, 10, w * 0.5, h * 0.42, w * 0.95);
  glow.addColorStop(0, 'rgba(0,230,118,0.20)');
  glow.addColorStop(0.45, 'rgba(0,180,120,0.07)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Vertical alpha ramp for ground planes that must die into the backdrop instead
 * of ending on a hard edge. Opaque at v=1 (the shop side), fully clear at v=0.
 */
export function groundFade(): THREE.CanvasTexture {
  const w = 4;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable; ground fade cannot be built');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return finish(canvas, 1, 1, false);
}

let cache: ReturnType<typeof buildCache> | null = null;

/**
 * Every texture the boot creates, with its dimensions.
 *
 * Kept as data rather than measured from the GPU so a node test can enforce the
 * 20 MB ceiling without a WebGL context. `count` covers textures generated per
 * call site (four shelf labels), which the rest of the game builds from signage().
 */
export const TEXTURE_MANIFEST: ReadonlyArray<{ name: string; width: number; height: number; count?: number }> = [
  { name: 'terracotta-floor', width: 512, height: 512 },
  { name: 'floor-roughness', width: 256, height: 256 },
  { name: 'painted-wall', width: 512, height: 512 },
  { name: 'teak', width: 512, height: 512 },
  { name: 'laminate', width: 256, height: 256 },
  { name: 'steel-teal', width: 256, height: 256 },
  { name: 'steel-green', width: 256, height: 256 },
  { name: 'cardboard', width: 256, height: 256 },
  { name: 'dock-stencil', width: 512, height: 146 },
  { name: 'zone-ring', width: 256, height: 256 },
  { name: 'backdrop', width: 256, height: 512 },
  { name: 'ground-fade', width: 4, height: 256 },
  { name: 'medicine-atlas', width: 512, height: 512 },
  { name: 'poster-atlas', width: POSTER_ATLAS.width, height: POSTER_ATLAS.height },
  { name: 'shelf-label', width: 512, height: 512, count: 4 },
];

/** Base-level RGBA bytes, the same accounting as scripts/perf-probe.mjs. */
export function textureMemoryMB(manifest = TEXTURE_MANIFEST): number {
  let bytes = 0;
  for (const entry of manifest) bytes += entry.width * entry.height * 4 * (entry.count ?? 1);
  return bytes / 1048576;
}

function buildCache() {
  return {
    terrazzo: terrazzo(),
    terrazzoRoughness: terrazzoRoughness(),
    wall: paintedWall(),
    teak: teak(),
    laminate: laminate(),
    steelTeal: brushedSteel('#1b4d3e'),
    steelGreen: brushedSteel('#24483c'),
    cardboard: cardboard(),
    dockStencil: dockStencil(),
    zoneRing: zoneRing(),
    backdrop: backdrop(),
    groundFade: groundFade(),
  };
}

/**
 * Built once per page load; canvases are cheap but not free.
 *
 * Returns null when there is no DOM (vitest constructs the scene in node), so
 * callers must treat the whole surface set as optional rather than assume maps.
 */
export function textures() {
  if (typeof document === 'undefined') return null;
  if (!cache) cache = buildCache();
  return cache;
}

/** Dispose every generated texture (used by tests that build several scenes). */
export function disposeTextures(): void {
  if (atlasCache) {
    atlasCache.dispose();
    atlasCache = null;
  }
  if (posterAtlasCache) {
    posterAtlasCache.dispose();
    posterAtlasCache = null;
  }
  if (!cache) return;
  for (const value of Object.values(cache)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  cache = null;
}
