import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ArcadeScene } from '../../src/ui/arcade/ArcadeScene';
import { ArcadeViewport } from '../../src/ui/arcade/ArcadeViewport';
import { boundsFor, ROOM, WALL_T } from '../../src/ui/arcade/layout';
import { buildExpansion, expansionFootprints } from '../../src/ui/arcade/kit/expansion';
import { placementsFor, DRESSING, floorPlacements, blocksWalkable } from '../../src/ui/arcade/kit/props';
import { triCount } from '../../src/ui/arcade/kit/geometry';

const boxOf = (o: THREE.Object3D): THREE.Box3 => new THREE.Box3().setFromObject(o);

describe('expansions', () => {
  it('rebuilds the walls around the bought floor, not just the floor', () => {
    const scene = new ArcadeScene();
    const baseEast = boxOf(scene.group.getObjectByName('pharm-wall-east')!).max.x;
    scene.applyExpansion(1);
    const room = boundsFor(1).room;

    expect(scene.getRoomBounds()).toEqual(room);
    const east = boxOf(scene.group.getObjectByName('pharm-wall-east')!).max.x;
    expect(east).toBeCloseTo(room.maxX + WALL_T, 2);
    expect(east).toBeGreaterThan(baseEast + 1.5);

    // The shell itself must span the new width: one floor plane, no patch.
    const floor = scene.group.getObjectByName('pharm-floor') as THREE.Mesh;
    const floorBox = boxOf(floor);
    expect(floorBox.max.x - floorBox.min.x).toBeCloseTo(room.maxX - room.minX, 2);
  });

  it('grows west and north at level 2 as well', () => {
    const scene = new ArcadeScene();
    scene.applyExpansion(2);
    const room = boundsFor(2).room;
    expect(scene.getRoomBounds()).toEqual(room);
    const west = boxOf(scene.group.getObjectByName('pharm-wall-west')!).min.x;
    const back = boxOf(scene.group.getObjectByName('pharm-wall-back')!).min.z;
    expect(west).toBeCloseTo(room.minX - WALL_T, 2);
    expect(back).toBeCloseTo(room.minZ - WALL_T, 2);
  });

  it('adds nothing at level 0 and merges the furniture cheaply when it does', () => {
    const empty = buildExpansion(0);
    expect(empty.children).toHaveLength(0);

    const level1 = buildExpansion(1);
    expect(level1.children.length).toBeGreaterThan(0);
    expect(level1.children.length).toBeLessThanOrEqual(10);

    const level2 = buildExpansion(2);
    expect(level2.children.length).toBeLessThanOrEqual(12);
    let tris = 0;
    level2.traverse((o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) tris += triCount(mesh.geometry);
    });
    expect(tris).toBeLessThan(6000);
  });

  it('does not leak geometry when the same level is applied twice', () => {
    const scene = new ArcadeScene();
    scene.applyExpansion(1);
    const count = scene.group.children.length;
    scene.applyExpansion(1);
    expect(scene.group.children.length).toBe(count);
  });

  it('moves wall-mounted dressing with the wall it was attached to', () => {
    // The extinguisher and the water dispenser sit on the east wall at level 0; if
    // they stayed at x = 4.06 after a 1.6 m extension they would hang in mid-air.
    const level1 = placementsFor(1);
    const eastProp = level1.find((p) => p.id === 'extinguisher')!;
    expect(eastProp.x).toBeGreaterThan(ROOM.maxX + 1.2);
    const level2 = placementsFor(2);
    const backProp = level2.find((p) => p.id === 'poster-hours')!;
    expect(backProp.z).toBeLessThan(ROOM.minZ - 0.9);
    // A west-wall prop stays where it was: level 2 grows north, not west.
    const baseMop = DRESSING.find((p) => p.id === 'mop-set')!;
    const westProp = level2.find((p) => p.id === 'mop-set')!;
    expect(westProp.x).toBeCloseTo(baseMop.x, 6);
  });

  it('keeps every expanded prop off the expanded walkable floor', () => {
    for (const level of [1, 2]) {
      const walk = boundsFor(level).walkable;
      for (const p of floorPlacements(placementsFor(level))) {
        const inside = p.x > walk.minX && p.x < walk.maxX && p.z > walk.minZ && p.z < walk.maxZ;
        expect(inside, `${p.id} blocks the level ${level} floor`).toBe(false);
      }
    }
    // Sanity: at level 0 the same helper flags props the test above excludes.
    expect(floorPlacements(DRESSING).some((p) => blocksWalkable(p))).toBe(false);
  });

  it('steps the camera back one notch per level', () => {
    const scene = new ArcadeScene();
    const viewport = new ArcadeViewport({ scene: scene.group });
    viewport.resize(390, 844);
    const d0 = viewport.targetOffset.length();

    scene.applyExpansion(1);
    viewport.setRoomBounds(scene.getRoomBounds());
    viewport.setExpansionLevel(1);
    viewport.setPlayableBounds(scene.getWalkableBounds());
    const d1 = viewport.targetOffset.length();

    scene.applyExpansion(2);
    viewport.setRoomBounds(scene.getRoomBounds());
    viewport.setExpansionLevel(2);
    viewport.setPlayableBounds(scene.getWalkableBounds());
    const d2 = viewport.targetOffset.length();

    expect(d1).toBeGreaterThan(d0);
    expect(d2).toBeGreaterThan(d1);
    // Still a controllable character in the widest shop.
    expect(viewport.playerPixels(0, 0)).toBeGreaterThanOrEqual(56);
  });
});

describe('expansion placement', () => {
  it('keeps every expansion fixture hugging a wall band', () => {
    // Furniture in the middle of a sales floor reads as clutter, and at a 43 degree
    // camera a 2.6 m shelf hides anything up to 2.8 m behind it. Both rules reduce to:
    // every fixture sits within 1.4 m of an outer wall.
    for (const level of [1, 2]) {
      const room = boundsFor(level).room;
      for (const spot of expansionFootprints(level)) {
        if (spot.onFixture) continue; // on the counter, not the floor
        const inset = Math.min(
          spot.x - room.minX,
          room.maxX - spot.x,
          spot.z - room.minZ,
          room.maxZ - spot.z
        );
        expect(inset, `${spot.id} at level ${level} is ${inset.toFixed(2)} m from a wall`).toBeLessThanOrEqual(spot.maxInset);
      }
    }
  });
});
