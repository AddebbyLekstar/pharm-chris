import { describe, it, expect } from 'vitest';
import {
  SHELF_LABEL_ATLAS,
  shelfLabelUV,
  TEXTURE_MANIFEST,
  textureMemoryMB,
} from '../../src/ui/arcade/textures';

/**
 * The four bay labels were four 512 x 512 canvases — 4 MB of the boot for four
 * lines of type on four 1.46 x 0.28 m plates. One sheet, cells addressed by UV,
 * is the same picture at a quarter of the memory.
 */
describe('shelf label atlas', () => {
  it('packs four labels into one sheet', () => {
    expect(SHELF_LABEL_ATLAS.cols * SHELF_LABEL_ATLAS.rows).toBe(4);
    const rects = [0, 1, 2, 3].map((cell) => shelfLabelUV(cell));
    for (const rect of rects) {
      expect(rect.u0).toBeGreaterThanOrEqual(0);
      expect(rect.v0).toBeGreaterThanOrEqual(0);
      expect(rect.u1).toBeLessThanOrEqual(1);
      expect(rect.v1).toBeLessThanOrEqual(1);
      expect(rect.u1).toBeGreaterThan(rect.u0);
      expect(rect.v1).toBeGreaterThan(rect.v0);
    }
    expect(new Set(rects.map((r) => `${r.u0},${r.v0}`)).size).toBe(4);
  });

  it('declares the atlas once and no per-bay 512 sheet', () => {
    const atlas = TEXTURE_MANIFEST.filter((t) => t.name === 'shelf-label-atlas');
    expect(atlas).toHaveLength(1);
    expect(atlas[0]).toMatchObject({
      width: SHELF_LABEL_ATLAS.width,
      height: SHELF_LABEL_ATLAS.height,
    });
    expect(atlas[0].count ?? 1).toBe(1);
    expect(TEXTURE_MANIFEST.some((t) => t.name === 'shelf-label')).toBe(false);
  });

  it('keeps the boot texture set under 11 MB', () => {
    expect(textureMemoryMB()).toBeLessThanOrEqual(11);
  });
});
