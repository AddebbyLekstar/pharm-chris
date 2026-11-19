import { describe, it, expect } from 'vitest';
import { chamferBox, triCount } from '../../src/ui/arcade/kit/geometry';
import { MATERIALS, material } from '../../src/ui/arcade/kit/materials';

describe('kit geometry', () => {
  it('chamfers every exposed edge for 44 triangles instead of 12', () => {
    const g = chamferBox(1, 1, 1, 0.04);
    expect(triCount(g)).toBe(44);
    expect(g.getAttribute('position').count).toBe(132);
  });

  it('keeps the requested outer dimensions', () => {
    const g = chamferBox(2.4, 0.9, 0.6, 0.05);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.max.x - b.min.x).toBeCloseTo(2.4, 5);
    expect(b.max.y - b.min.y).toBeCloseTo(0.9, 5);
    expect(b.max.z - b.min.z).toBeCloseTo(0.6, 5);
  });

  it('clamps a chamfer that would eat the box and never emits NaN', () => {
    const g = chamferBox(0.05, 1, 1, 0.4);
    for (const v of g.getAttribute('position').array as Float32Array) expect(Number.isNaN(v)).toBe(false);
    expect(triCount(g)).toBe(44);
  });
});

describe('material families', () => {
  it('exposes exactly six families with spec roughness', () => {
    expect(Object.keys(MATERIALS)).toHaveLength(6);
    expect(MATERIALS.plaster.roughness).toBeCloseTo(0.86, 2);
    expect(MATERIALS.glass.roughness).toBeCloseTo(0.16, 2);
    expect(MATERIALS.paper.roughness).toBeCloseTo(0.9, 2);
  });

  it('returns a cached singleton per family so materials do not multiply draw state', () => {
    expect(material('plaster')).toBe(material('plaster'));
  });
});
