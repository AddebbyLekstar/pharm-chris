import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ArcadeScene } from '../../src/ui/arcade/ArcadeScene';
import { LIGHTS, artVersion } from '../../src/ui/arcade/art';
import { COUNTER, SHELF_BAYS } from '../../src/ui/arcade/layout';

describe('light rig v4', () => {
  const scene = new ArcadeScene();

  it('is the default art version', () => {
    expect(artVersion('')).toBe('v4');
  });

  it('spends at most one directional and two point lights', () => {
    const counts = { dir: 0, point: 0, ambient: 0 };
    scene.group.traverse((o: THREE.Object3D) => {
      if ((o as THREE.DirectionalLight).isDirectionalLight) counts.dir++;
      if ((o as THREE.PointLight).isPointLight) counts.point++;
      if ((o as THREE.AmbientLight).isAmbientLight) counts.ambient++;
    });
    expect(counts.dir).toBe(1);
    expect(counts.point).toBeLessThanOrEqual(2);
    expect(counts.ambient).toBeLessThanOrEqual(1);
  });

  it('keeps ambient fill under 0.12 so form survives', () => {
    expect(LIGHTS.v4.ambient.intensity).toBeLessThanOrEqual(0.12);
  });

  it('hangs the pendant over the counter and the cool light on the cold chain', () => {
    const points: THREE.PointLight[] = [];
    scene.group.traverse((o: THREE.Object3D) => {
      if ((o as THREE.PointLight).isPointLight) points.push(o as THREE.PointLight);
    });
    const pendant = points.find((p) => p.position.y > 2);
    const fridge = points.find((p) => p.position.y <= 2);
    expect(pendant?.position.x).toBeCloseTo(COUNTER.x, 1);
    expect(pendant?.position.z).toBeCloseTo(COUNTER.z, 1);
    const cold = SHELF_BAYS.find((b) => b.category === 'cold_chain')!;
    expect(fridge?.position.x).toBeCloseTo(cold.x, 1);
    expect(fridge?.position.z).toBeCloseTo(cold.z, 1);
  });

  it('does not go black when shadows are off on the low tier', () => {
    expect(LIGHTS.v4.sun.intensity).toBeGreaterThanOrEqual(1.5);
    expect(LIGHTS.v4.hemisphere.intensity).toBeGreaterThanOrEqual(0.08);
    expect(LIGHTS.v4.ambient.intensity).toBeGreaterThanOrEqual(0.05);
  });
});
