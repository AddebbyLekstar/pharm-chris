import { characterSprite } from '../src/ui/arcade/kit/charSprite';
import { customerLook, staffLook, type CharacterLook } from '../src/ui/arcade/kit/look';

/**
 * Atlas spike: prove that the vector cast can be rasterised once into a single
 * texture, which is how the crowd becomes one draw call inside WebGL instead of a
 * DOM layer that cannot depth-sort against shelves.
 */

const CHRIS: CharacterLook = {
  skin: 0x3e2312,
  top: 0x1b4a3c,
  bottom: 0xe8dcc4,
  accent: 0xb08a4a,
  hairColor: 0x1b1512,
  outfit: 'tunic',
  hair: 'fade',
  headpiece: null,
  build: 1,
  height: 1,
  beard: false,
  glasses: true,
  bag: false,
  // Chris is the fixed point of the cast: long face, level brows, closed mouth.
  face: { headShape: 'long', eyeSpacing: 'close', browWeight: 'medium', mouth: 'flat', cheek: 'cut', age: 'middle' },
  posture: { shoulderTilt: 0.6, headTilt: -1.2, armOut: 1 },
};

const CELL = 128;
const COLUMNS = 6;

const eligible: Array<{ key: string; look: CharacterLook }> = [
  ...['cust_mama_ngozi', 'cust_emeka', 'cust_bayo', 'cust_danjuma', 'cust_a1', 'cust_b2', 'cust_c3', 'cust_d4'].map(
    (id) => ({ key: id.replace('cust_', ''), look: customerLook({ id } as never) })
  ),
  { key: 'chris', look: CHRIS },
  { key: 'stocker', look: staffLook('stocker') },
  { key: 'cashier', look: staffLook('cashier') },
  { key: 'cleaner', look: staffLook('cleaner') },
];

const loadSvg = (markup: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('sprite failed to rasterise'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });

async function main(): Promise<void> {
  const host = document.getElementById('atlas');
  if (!host) return;

  const rows = Math.ceil(eligible.length / COLUMNS);
  const canvas = document.createElement('canvas');
  canvas.width = COLUMNS * CELL;
  canvas.height = rows * CELL;
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  canvas.style.background = 'rgba(0,0,0,0.12)';
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const started = performance.now();
  const entries: Array<{ key: string; x: number; y: number; w: number; h: number }> = [];

  for (let i = 0; i < eligible.length; i++) {
    const { key, look } = eligible[i];
    const { svg } = characterSprite(look, { width: CELL });
    const img = await loadSvg(svg);
    const x = (i % COLUMNS) * CELL;
    const y = Math.floor(i / COLUMNS) * CELL;
    ctx.drawImage(img, x, y + CELL * 0.05, CELL, CELL * 1.9);
    entries.push({ key, x, y, w: CELL, h: CELL });
  }

  const ms = performance.now() - started;
  host.append(canvas);

  const report = document.getElementById('report');
  if (report) {
    const bytes = canvas.toDataURL('image/png').length;
    report.textContent = `atlas ${canvas.width}x${canvas.height}, ${eligible.length} sprites, rasterised in ${ms.toFixed(0)} ms, PNG ≈ ${Math.round(bytes / 1024)} KB`;
  }

  (window as unknown as Record<string, unknown>).atlasReport = {
    width: canvas.width,
    height: canvas.height,
    sprites: eligible.length,
    rasterMs: Math.round(ms),
    entries,
  };
}

void main();
