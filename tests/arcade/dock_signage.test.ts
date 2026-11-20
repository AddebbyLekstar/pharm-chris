import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildDockMarkings, dockMarkingDrawCalls } from '../../src/ui/arcade/kit/dockMarkings';
import { DOCK, DOCK_MARKINGS, DOCK_PAD, WALKABLE } from '../../src/ui/arcade/layout';
import { material, PALETTE } from '../../src/ui/arcade/kit/materials';
import { ArcadeScene } from '../../src/ui/arcade/ArcadeScene';

const footprint = (group: THREE.Group): THREE.Box3 => {
  group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(group);
};

const meshCount = (root: THREE.Object3D): number => {
  let count = 0;
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) count++;
  });
  return count;
};

describe('dock floor signage', () => {
  it('builds a named marking group with the paint and stencil meshes', () => {
    const group = buildDockMarkings();
    expect(group.name).toBe('dock-markings');
    expect(group.getObjectByName('dock-markings-paint')).toBeDefined();
    expect(group.getObjectByName('dock-markings-stencil')).toBeDefined();
  });

  it('is wired into the live arcade scene', () => {
    const scene = new ArcadeScene();
    const group = scene.group.getObjectByName('dock-markings');
    expect(group).toBeDefined();
    expect(group!.children.length).toBe(2);
  });

  it('keeps the whole footprint inside the walkable floor', () => {
    const box = footprint(buildDockMarkings());
    expect(box.min.x).toBeGreaterThanOrEqual(WALKABLE.minX);
    expect(box.max.x).toBeLessThanOrEqual(WALKABLE.maxX);
    expect(box.min.z).toBeGreaterThanOrEqual(WALKABLE.minZ);
    expect(box.max.z).toBeLessThanOrEqual(WALKABLE.maxZ);
  });

  it('overlaps the dock trigger instead of pointing at empty floor', () => {
    const box = footprint(buildDockMarkings());
    const nearestX = Math.min(Math.max(DOCK.x, box.min.x), box.max.x);
    const nearestZ = Math.min(Math.max(DOCK.z, box.min.z), box.max.z);
    expect(Math.hypot(nearestX - DOCK.x, nearestZ - DOCK.z)).toBeLessThanOrEqual(DOCK.radius);

    // Stronger than a grazing overlap: the trigger centre is inside the painted pad.
    expect(DOCK.x).toBeGreaterThan(DOCK_PAD.minX);
    expect(DOCK.x).toBeLessThan(DOCK_PAD.maxX);
    expect(DOCK.z).toBeGreaterThan(DOCK_PAD.minZ);
    expect(DOCK.z).toBeLessThan(DOCK_PAD.maxZ);
    expect(box.min.z).toBeLessThan(DOCK.z - 0.2);
  });

  it('paints every stroke a few millimetres above the floor, paint below stencil', () => {
    const group = buildDockMarkings();
    const paint = group.getObjectByName('dock-markings-paint')!;
    const stencil = group.getObjectByName('dock-markings-stencil')!;
    const paintBox = new THREE.Box3().setFromObject(paint);
    const stencilBox = new THREE.Box3().setFromObject(stencil);
    expect(paintBox.min.y).toBeGreaterThanOrEqual(0.003);
    expect(stencilBox.min.y).toBeGreaterThanOrEqual(0.005);
    expect(stencilBox.max.y).toBeLessThan(0.02);
    expect(stencilBox.min.y).toBeGreaterThan(paintBox.max.y);
  });

  it('uses the existing paper family for the paint', () => {
    const paint = buildDockMarkings().getObjectByName('dock-markings-paint') as THREE.Mesh;
    expect(paint.material).toBe(material('paper', PALETTE.inkNavy));
  });

  it('adds at most 2 draw calls, and 2 meshes against the live scene', () => {
    const group = buildDockMarkings();
    expect(dockMarkingDrawCalls(group)).toBe(2);
    expect(dockMarkingDrawCalls(group)).toBeLessThanOrEqual(2);

    let triangles = 0;
    group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.getAttribute('position').count / 3;
    });
    expect(triangles).toBeLessThan(200);

    const scene = new ArcadeScene();
    const before = meshCount(scene.group);
    const markings = scene.group.getObjectByName('dock-markings')!;
    scene.group.remove(markings);
    const without = meshCount(scene.group);
    expect(before - without).toBe(2);
  });

  it('emits upward-facing paint with no NaN vertices', () => {
    const paint = buildDockMarkings().getObjectByName('dock-markings-paint') as THREE.Mesh;
    const geometry = paint.geometry;
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) {
      expect(normal.getY(i)).toBeCloseTo(1, 5);
    }
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.array.length; i++) {
      expect(Number.isFinite(position.array[i])).toBe(true);
    }
  });

  it('runs the approach lane from open floor to the pad mouth', () => {
    // South is +Z, so the lane must start nearer the player than the pad and
    // finish on its near edge; otherwise the chevrons point at bare tile.
    expect(DOCK_MARKINGS.laneStartZ).toBeGreaterThan(DOCK_PAD.maxZ);
    expect(DOCK_MARKINGS.laneEndZ).toBeLessThanOrEqual(DOCK_PAD.maxZ + 0.02);
    expect(DOCK_MARKINGS.laneEndZ).toBeGreaterThan(DOCK_PAD.maxZ - 0.1);
  });

  it('points every chevron north, into the dock trigger', () => {
    const zs = [...DOCK_MARKINGS.chevronZs];
    for (const apex of zs) {
      // Chevrons sit south of the pad and their arms trail further south, so
      // the caret opens toward the player and points at the pad.
      expect(apex).toBeGreaterThan(DOCK_PAD.maxZ);
      expect(apex + DOCK_MARKINGS.chevronDepth).toBeGreaterThan(apex);
    }
    // Ordered south-to-north, so walking the lane meets them in sequence.
    expect(zs).toEqual([...zs].sort((a, b) => b - a));
    expect(zs[zs.length - 1]).toBeLessThan(zs[0]);
  });

  it('spans the full cue in depth: from the lane mouth to the far pad edge', () => {
    const box = footprint(buildDockMarkings());
    expect(box.max.z).toBeGreaterThan(DOCK_MARKINGS.laneStartZ - 0.1);
    expect(box.min.z).toBeLessThan(DOCK_PAD.minZ);
    expect(box.max.z - box.min.z).toBeGreaterThan(2.2);
  });

  it('keeps the stencil word inside the pad, centred on the dock', () => {
    const s = DOCK_MARKINGS.stencil;
    expect(s.z - s.height / 2).toBeGreaterThan(DOCK_PAD.minZ);
    expect(s.z + s.height / 2).toBeLessThan(DOCK_PAD.maxZ);
    expect(s.width).toBeLessThan(DOCK_PAD.maxX - DOCK_PAD.minX - DOCK_MARKINGS.outline * 2);
    expect(DOCK.x).toBe(0);
    const stencil = buildDockMarkings().getObjectByName('dock-markings-stencil') as THREE.Mesh;
    stencil.geometry.computeBoundingBox();
    const b = stencil.geometry.boundingBox!;
    expect(b.min.x).toBeCloseTo(-s.width / 2, 5);
    expect(b.max.x).toBeCloseTo(s.width / 2, 5);
  });

  it('is sized for a 360 px screen, not for a desktop close-up', () => {
    // At the solved portrait framing a 1.06 m pad half-width lands at ~33 px;
    // any smaller and the word collapses under the mip chain.
    const padWidth = DOCK_PAD.maxX - DOCK_PAD.minX;
    expect(padWidth).toBeGreaterThanOrEqual(2.0);
    expect(DOCK_MARKINGS.stencil.width).toBeGreaterThanOrEqual(1.8);
    expect(DOCK_MARKINGS.laneLineWidth).toBeGreaterThan(0.07);
    expect(DOCK_MARKINGS.chevronStroke).toBeGreaterThan(0.1);
  });

  it('draws the stencil after the paint and never writes depth', () => {
    const group = buildDockMarkings();
    const paint = group.getObjectByName('dock-markings-paint') as THREE.Mesh;
    const stencil = group.getObjectByName('dock-markings-stencil') as THREE.Mesh;
    expect(paint.renderOrder).toBe(0);
    expect(stencil.renderOrder).toBeGreaterThan(paint.renderOrder);
    expect(stencil.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((stencil.material as THREE.MeshStandardMaterial).depthWrite).toBe(false);
  });

  it('casts no shadows from either decal', () => {
    const group = buildDockMarkings();
    for (const name of ['dock-markings-paint', 'dock-markings-stencil']) {
      const mesh = group.getObjectByName(name) as THREE.Mesh;
      expect(mesh.castShadow).toBe(false);
    }
  });

  it('keeps indexed geometry whose UVs match its vertex count', () => {
    const paint = buildDockMarkings().getObjectByName('dock-markings-paint') as THREE.Mesh;
    const geometry = paint.geometry as THREE.BufferGeometry;
    expect(geometry.getIndex()).not.toBeNull();
    const count = geometry.getAttribute('position').count;
    expect(geometry.getAttribute('uv').count).toBe(count);
    expect(geometry.getAttribute('normal').count).toBe(count);
    expect(count % 4).toBe(0); // every part is a quad
  });

  it('survives buying expansions without moving or duplicating', () => {
    const scene = new ArcadeScene();
    const before = footprint(scene.group.getObjectByName('dock-markings') as THREE.Group);
    scene.applyExpansion(2);
    const group = scene.group.getObjectByName('dock-markings') as THREE.Group | undefined;
    expect(group).toBeDefined();
    expect(scene.group.getObjectsByProperty('name', 'dock-markings')).toHaveLength(1);
    expect(Array.from(group!.children).map((c) => c.name)).toEqual([
      'dock-markings-paint',
      'dock-markings-stencil',
    ]);
    const after = footprint(group!);
    expect(after.min.z).toBeCloseTo(before.min.z, 5);
    expect(after.max.z).toBeCloseTo(before.max.z, 5);
  });

  it('still costs 2 meshes after an expansion rebuild', () => {
    const scene = new ArcadeScene();
    scene.applyExpansion(2);
    const before = meshCount(scene.group);
    const group = scene.group.getObjectByName('dock-markings')!;
    expect(dockMarkingDrawCalls(group as THREE.Group)).toBe(2);
    scene.group.remove(group);
    expect(before - meshCount(scene.group)).toBe(2);
  });
});
