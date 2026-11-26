import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ArcadeScene } from '../../src/ui/arcade/ArcadeScene';
import { PharmacyShelves3D } from '../../src/ui/arcade/PharmacyShelves3D';
import { LIGHTS, GRADE, artVersion } from '../../src/ui/arcade/art';
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

  it('grades v4 with exposure and environment only, ambient untouched', () => {
    // P4 task 4: the permitted knobs are exposure, key intensity and environment
    // intensity. These numbers are the A/B against docs/art/references/ref-B, so they
    // are pinned: a later tweak has to say so in the diff rather than drift the look.
    expect(GRADE.v4.exposure).toBeCloseTo(1.12, 3);
    expect(GRADE.v4.environment).toBeCloseTo(0.26, 3);
    expect(LIGHTS.v4.sun.intensity).toBeCloseTo(2.6, 3);
    expect(LIGHTS.v4.ambient.intensity).toBeCloseTo(0.08, 3);
    // Older passes stay at their own grade so a regression still screenshots honestly.
    expect(GRADE.v2.exposure).toBeCloseTo(1.0, 3);
    expect(GRADE.v3.environment).toBeCloseTo(0.14, 3);
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

  /**
   * P4 task 3. The practicals have to sit on the geometry they claim to light: a
   * warm disc under the pendant shade, a teal panel inside the cold-chain bay. A
   * light with no visible source is the trick that reads as "unlit room at night".
   */
  it('pins the fridge light to the cold-chain bay, within 0.6 m of its origin', () => {
    const cold = SHELF_BAYS.find((b) => b.category === 'cold_chain')!;
    const points: THREE.PointLight[] = [];
    scene.group.traverse((o: THREE.Object3D) => {
      if ((o as THREE.PointLight).isPointLight) points.push(o as THREE.PointLight);
    });
    const fridge = points.find((p) => p.position.y <= 2)!;
    expect(fridge).toBeTruthy();
    expect(Math.hypot(fridge.position.x - cold.x, fridge.position.z - cold.z)).toBeLessThanOrEqual(0.6);
    expect(fridge.intensity).toBeCloseTo(LIGHTS.v4.fridgeGlow!.intensity, 2);
  });

  it('stands a lit surface under the pendant shade at 0.9', () => {
    const lamp = emissiveMaterials().find((m) => m.name === 'practical-lamp');
    expect(lamp).toBeTruthy();
    expect(lamp!.emissiveIntensity).toBeCloseTo(0.9, 2);
    // The camera sits above the room and can never see a shade's underside, so the
    // diffuser has to be double-sided and wider than the shade to read at all.
    expect(lamp!.side).toBe(THREE.DoubleSide);
    const mesh = meshesWith('practical-lamp')[0];
    expect(mesh).toBeTruthy();
    const box = new THREE.Box3().setFromObject(mesh);
    expect(box.max.y).toBeGreaterThan(2.0);
    expect(box.getCenter(new THREE.Vector3()).y).toBeCloseTo(2.35, 1);
  });

  it('lights the cold-chain bay from inside at 0.55, not from a fifth light', () => {
    const cold = SHELF_BAYS.find((b) => b.category === 'cold_chain')!;
    // The fridge is built by PharmacyShelves3D, not by ArcadeScene: the panel lives
    // with the geometry it belongs to. Ruling: assert on the shelves' own group
    // rather than pull the shelves into the scene class for a test's convenience.
    const shelves = new PharmacyShelves3D();
    const panel = emissiveMaterials(shelves.group).find((m) => m.name === 'practical-fridge');
    expect(panel).toBeTruthy();
    expect(panel!.emissiveIntensity).toBeCloseTo(0.55, 2);
    const mesh = meshesWith('practical-fridge', shelves.group)[0];
    const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    expect(Math.hypot(center.x - cold.x, center.z - cold.z)).toBeLessThanOrEqual(0.6);
    expect(center.y).toBeGreaterThan(0.5);
    expect(center.y).toBeLessThan(2.6);
    // The panel is the cabinet's back wall, so it sits behind the bay's centre; and
    // its emissive face must point at the aisle (+z). A flipped bay pointed the panel
    // into the back wall and put the glass door on the far side: from the game camera
    // the fridge was a white box with no light in it.
    expect(center.z).toBeLessThan(cold.z);
    const normal = new THREE.Vector3()
      .fromBufferAttribute(mesh.geometry.getAttribute('normal') as THREE.BufferAttribute, 0)
      .transformDirection(mesh.matrixWorld);
    expect(normal.z).toBeGreaterThan(0.9);
  });
});

function emissiveMaterials(root: THREE.Object3D = new ArcadeScene().group): THREE.MeshStandardMaterial[] {
  const seen = new Map<string, THREE.MeshStandardMaterial>();
  root.traverse((o: THREE.Object3D) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat?.isMeshStandardMaterial && mat.emissiveIntensity > 0.2) seen.set(mat.uuid, mat);
  });
  return [...seen.values()];
}

function meshesWith(materialName: string, root: THREE.Object3D = new ArcadeScene().group): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((o: THREE.Object3D) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat?.isMeshStandardMaterial && mat.name === materialName) found.push(mesh);
  });
  return found;
}
