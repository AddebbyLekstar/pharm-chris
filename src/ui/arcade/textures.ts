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
 * Terrazzo: warm cement base, 1 m grid of grout lines, aggregate chips, and a
 * faint directional mottle so the tile does not read as a single flat plane.
 * One texture covers 4 x 4 tiles; the caller sets repeat per surface.
 */
export function terrazzo(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(TEXTURE_SIZE);
  const rand = mulberry32(0x7e44a1);
  const tiles = 4;
  const tile = TEXTURE_SIZE / tiles;

  ctx.fillStyle = '#e8e2d4';
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  // Aggregate chips, varied warmth so the floor is not one colour.
  const chips = ['#cfc7b4', '#b9ae98', '#f3efe4', '#a9a08c', '#d9d2c0', '#8e8674'];
  for (let i = 0; i < 2600; i++) {
    const x = rand() * TEXTURE_SIZE;
    const y = rand() * TEXTURE_SIZE;
    const r = 0.7 + rand() * 2.6;
    ctx.fillStyle = chips[Math.floor(rand() * chips.length)];
    ctx.globalAlpha = 0.35 + rand() * 0.5;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rand() * 0.7), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Grout: a 2 px line at every tile boundary, slightly darker with a soft edge
  // so it reads as a recess rather than a drawn grid.
  for (let i = 0; i <= tiles; i++) {
    const p = i * tile;
    ctx.fillStyle = 'rgba(120,110,95,0.55)';
    ctx.fillRect(p - 1.5, 0, 3, TEXTURE_SIZE);
    ctx.fillRect(0, p - 1.5, TEXTURE_SIZE, 3);
    ctx.fillStyle = 'rgba(255,252,244,0.35)';
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
 * Category header plate. Real signage is the cheapest way to make a room read as
 * a business instead of a diorama: the eye finds words before it finds geometry.
 */
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

/** Soft radial ring for interaction zones — replaces a hard saturated hoop. */
export function zoneRing(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(256);
  ctx.clearRect(0, 0, 256, 256);
  const grad = ctx.createRadialGradient(128, 128, 60, 128, 128, 126);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.10)');
  grad.addColorStop(0.9, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.97, 'rgba(255,255,255,0.40)');
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
  if (!cache) return;
  for (const value of Object.values(cache)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  cache = null;
}
