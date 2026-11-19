import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildRoomShell } from '../../src/ui/arcade/kit/roomShell';
import { ROOM, WALL_T } from '../../src/ui/arcade/layout';
import { triCount } from '../../src/ui/arcade/kit/geometry';

const boxOf = (o: THREE.Object3D): THREE.Box3 => new THREE.Box3().setFromObject(o);

describe('room shell', () => {
  const shell = buildRoomShell();

  it('stays inside the room box — nothing leaks through a wall', () => {
    const limit = new THREE.Box3(
      new THREE.Vector3(ROOM.minX - WALL_T - 0.01, -0.05, ROOM.minZ - WALL_T - 0.01),
      new THREE.Vector3(ROOM.maxX + WALL_T + 0.01, 3.6, ROOM.maxZ + WALL_T + 0.01)
    );
    shell.traverse((o: THREE.Object3D) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const b = boxOf(o);
      expect(limit.containsBox(b), `${o.name} escapes the room box`).toBe(true);
    });
  });

  it('leaves a 2.2 m doorway in the front wall', () => {
    const left = shell.getObjectByName('pharm-wall-front-l')!;
    const right = shell.getObjectByName('pharm-wall-front-r')!;
    const gap = boxOf(right).min.x - boxOf(left).max.x;
    expect(gap).toBeCloseTo(2.2, 2);
    // A header sits above the opening so the front reads as a wall, not a hole.
    const header = shell.getObjectByName('pharm-wall-front-header')!;
    // Float tolerance: the header's underside is the door head at exactly 2.2 m.
    expect(boxOf(header).min.y).toBeGreaterThanOrEqual(2.2 - 1e-6);
  });

  it('builds thick walls with a visible cut face', () => {
    const back = shell.getObjectByName('pharm-wall-back')!;
    const b = boxOf(back);
    expect(b.max.z - b.min.z).toBeCloseTo(WALL_T, 2);
    expect(b.max.y).toBeGreaterThan(2.4);
    const cap = shell.getObjectByName('shell-cut-trim-back')!;
    expect(boxOf(cap).min.y).toBeGreaterThanOrEqual(2.4);
  });

  it('costs less than 3000 triangles', () => {
    let total = 0;
    shell.traverse((o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) total += triCount(m.geometry);
    });
    expect(total).toBeLessThan(3000);
    expect(total).toBeGreaterThan(0);
  });
});
