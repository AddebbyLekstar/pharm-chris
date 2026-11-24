import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
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

  it('carries an index and uvs so it can merge with three primitives', async () => {
    // mergeMeshes() threw "failed with geometry at index 1" on every page boot
    // because a chamfered box had no uv and no index, and BoxGeometry has both.
    const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
    const chamfered = chamferBox(1.2, 0.8, 0.6, 0.04);
    expect(chamfered.getIndex()).not.toBeNull();
    expect(chamfered.getAttribute('uv').count).toBe(chamfered.getAttribute('position').count);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const merged = mergeGeometries([chamfered, box], false);
    expect(merged).not.toBeNull();
    expect(triCount(merged!)).toBe(44 + 12);
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
    expect(MATERIALS.glass.roughness).toBeCloseTo(0.06, 2);
    expect(MATERIALS.paper.roughness).toBeCloseTo(0.9, 2);
  });

  it('returns a cached singleton per family so materials do not multiply draw state', () => {
    expect(material('plaster')).toBe(material('plaster'));
  });
});
