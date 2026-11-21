import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ArcadeCustomer } from '../../src/ui/arcade/ArcadeCustomer';
import { CHARACTER_MATERIAL } from '../../src/ui/arcade/kit/rigMerge';
import { customerLook } from '../../src/ui/arcade/kit/look';

const data = (id: string) =>
  ({
    id,
    name: id,
    title: 'x',
    avatarKey: id,
    initialQuote: '',
    symptoms: [],
    symptomLabel: '',
    matchedProductIds: [],
    budget: 1000,
    mood: 'Patient',
    patienceMax: 3,
    preferredPayment: 'cash',
    dialogue: { fairPrice: [], overpriced: [], wrongProduct: [], exceedsBudget: [] },
  }) as never;

const triangles = (obj: THREE.Object3D): number => {
  let n = 0;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    n += geo.index ? geo.index.count / 3 : (geo.getAttribute('position')?.count ?? 0) / 3;
  });
  return n;
};

describe('illustrated style', () => {
  it('shades characters in bands, not a smooth gradient', () => {
    expect((CHARACTER_MATERIAL as THREE.MeshToonMaterial).isMeshToonMaterial).toBe(true);
    const ramp = (CHARACTER_MATERIAL as THREE.MeshToonMaterial).gradientMap;
    expect(ramp).toBeTruthy();
    // Nearest-filtered multi-step ramp: the quantisation is the look.
    expect(ramp!.magFilter).toBe(THREE.NearestFilter);
    expect(ramp!.image.width).toBeGreaterThanOrEqual(3);
  });

  it('cuts every character edge instead of leaving bare cuboids', () => {
    // A bare-box customer was ~120 triangles. A chamfered one is ~400+; the floor here
    // is what fails if someone reintroduces BoxGeometry for a limb.
    const c = new ArcadeCustomer(data('cust_cut'), 0);
    expect(triangles(c.mesh)).toBeGreaterThan(380);
    // and it must stay inside the per-customer share of the 45k scene budget
    expect(triangles(c.mesh)).toBeLessThan(1500);
  });

  it('keeps the cloth palette muted enough to read as dyed fabric', () => {
    for (let i = 0; i < 40; i++) {
      const look = customerLook(data(`cust_palette_${i}`));
      // Raw sRGB channels: THREE.Color colour-manages hex input into linear space,
      // which makes HSL lightness meaningless here.
      const r = (look.top >> 16) & 0xff;
      const g = (look.top >> 8) & 0xff;
      const b = look.top & 0xff;
      // Chroma, not HSL saturation: terracotta is HSL-saturated but perceptually mute.
      // The neon palette this replaced ran 0.8+ chroma (0x00e676, 0x0288d1, 0xfdd835).
      const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      expect(chroma, `top ${look.top.toString(16)} is neon`).toBeLessThanOrEqual(0.55);
      const light = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
      expect(light).toBeGreaterThan(0.15);
      expect(light).toBeLessThan(0.95);
    }
  });
});
