import { describe, it, expect } from 'vitest';
import {
  DRESSING,
  NO_GO_CENTRES,
  blocksWalkable,
  buildDressing,
  dressingDrawCalls,
  dressingTriangles,
  floorPlacements,
} from '../../src/ui/arcade/kit/props';
import { ROOM, WALKABLE } from '../../src/ui/arcade/layout';
import { TEXTURE_MANIFEST, textureMemoryMB } from '../../src/ui/arcade/textures';

interface Aabb {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

function overlapsWalkable(box: Aabb): boolean {
  return (
    box.max.x > WALKABLE.minX &&
    box.min.x < WALKABLE.maxX &&
    box.max.z > WALKABLE.minZ &&
    box.min.z < WALKABLE.maxZ
  );
}

function insideRoomXZ(box: Aabb, pad = 0.001): boolean {
  return (
    box.min.x >= ROOM.minX - pad &&
    box.max.x <= ROOM.maxX + pad &&
    box.min.z >= ROOM.minZ - pad &&
    box.max.z <= ROOM.maxZ + pad
  );
}

describe('shop dressing', () => {
  it('has 31 authored placements with unique ids', () => {
    expect(DRESSING).toHaveLength(31);
    expect(new Set(DRESSING.map((p) => p.id)).size).toBe(31);
  });

  it('keeps every floor prop clear of the walkable floor', () => {
    // Decoration must never become an invisible obstacle the player walks through.
    for (const p of floorPlacements()) {
      expect(blocksWalkable(p), `${p.id} sits on the walkable floor`).toBe(false);
    }
  });

  it('keeps every floor prop out of the trigger zones', () => {
    for (const p of floorPlacements()) {
      for (const zone of NO_GO_CENTRES) {
        const d = Math.hypot(p.x - zone.x, p.z - zone.z);
        expect(d, `${p.id} overlaps ${zone.id}`).toBeGreaterThan(zone.radius);
      }
    }
  });

  it('puts every prop inside the room or on the street outside the door', () => {
    for (const p of DRESSING) {
      const inRoom = p.x > ROOM.minX && p.x < ROOM.maxX && p.z > ROOM.minZ && p.z < ROOM.maxZ;
      const onStreet = p.z >= ROOM.maxZ && Math.abs(p.x) < ROOM.maxX;
      expect(inRoom || onStreet, `${p.id} is at ${p.x},${p.z}`).toBe(true);
    }
  });

  it('registers every authored prop by name with finite world bounds', () => {
    const group = buildDressing();
    for (const p of DRESSING) {
      const marker = group.getObjectByName(`prop-${p.id}`);
      expect(marker, `prop-${p.id} is missing from the scene graph`).toBeTruthy();
      expect(marker!.userData.kind).toBe(p.kind);

      const box = marker!.userData.aabb as Aabb;
      for (const v of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(box.max.x).toBeGreaterThan(box.min.x);
      expect(box.max.y).toBeGreaterThan(box.min.y);
      expect(box.max.z).toBeGreaterThan(box.min.z);
    }
  });

  it('keeps each bounding box inside the room, or in the street strip', () => {
    const group = buildDressing();
    for (const p of DRESSING) {
      const marker = group.getObjectByName(`prop-${p.id}`)!;
      const box = marker.userData.aabb as Aabb;
      const support = marker.userData.support as string;

      if (support === 'floor' && p.z >= ROOM.maxZ) {
        // Outdoor dressing: on the pavement, in front of the shopfront.
        expect(box.min.z).toBeGreaterThanOrEqual(ROOM.maxZ - 0.01);
        expect(box.max.z).toBeLessThanOrEqual(ROOM.maxZ + 2.2);
        expect(box.min.x).toBeGreaterThan(ROOM.minX);
        expect(box.max.x).toBeLessThan(ROOM.maxX);
      } else {
        // The security grille is mounted over the doorway, so a ceiling prop may
        // straddle the front wall by its housing depth.
        const pad = support === 'ceiling' ? 0.45 : 0.001;
        expect(insideRoomXZ(box, pad), `${p.id} pokes through a wall`).toBe(true);
      }

      if (support === 'counter') {
        // Sits on the 1.27 m slab, not embedded in it.
        expect(box.min.y).toBeGreaterThanOrEqual(1.26);
      }
      if (support === 'ceiling') {
        expect(box.min.y).toBeGreaterThan(2.0);
        expect(box.max.y).toBeLessThanOrEqual(3.2);
      }
    }
  });

  it('keeps the new pot, carton and cylinder bases off the walkable floor', () => {
    const group = buildDressing();
    const solid = new Set(['plant', 'carton', 'cylinder', 'dispenser']);
    for (const p of DRESSING) {
      if (!solid.has(p.kind) || (p.support ?? 'floor') !== 'floor') continue;
      const marker = group.getObjectByName(`prop-${p.id}`)!;
      const base = marker.userData.base as Aabb;
      expect(overlapsWalkable(base), `${p.id} base blocks the player`).toBe(false);
    }
  });

  it('authors three leafy plants, a four-blade fan and five pieces of wall paper', () => {
    const group = buildDressing();
    const plants = DRESSING.filter((p) => p.kind === 'plant');
    expect(plants).toHaveLength(3);
    for (const p of plants) {
      const leaves = group.getObjectByName(`prop-${p.id}`)!.userData.leaves as number;
      expect(leaves).toBeGreaterThanOrEqual(8);
      expect(leaves).toBeLessThanOrEqual(12);
    }

    const fan = DRESSING.find((p) => p.kind === 'fan')!;
    expect(group.getObjectByName(`prop-${fan.id}`)!.userData.blades).toBe(4);

    const posters = DRESSING.filter((p) => p.kind === 'poster');
    const calendars = DRESSING.filter((p) => p.kind === 'calendar');
    expect(posters).toHaveLength(4);
    expect(calendars).toHaveLength(1);
    // Every piece of wall paper samples a different cell, so the atlas is shared
    // without two posters printing the same artwork.
    const cells = [...posters, ...calendars].map((p) => p.cell);
    expect(new Set(cells).size).toBe(5);

    const cartons = DRESSING.filter((p) => p.kind === 'carton');
    const cylinders = DRESSING.filter((p) => p.kind === 'cylinder');
    expect(cartons).toHaveLength(2);
    expect(cylinders).toHaveLength(1);
    // The two cartons are a stack, not duplicates in the same spot.
    expect(cartons[1].lift).toBeGreaterThan(0.4);
  });

  it('merges into 17 draw calls at a small triangle count', () => {
    const group = buildDressing();
    // 31 props; an unmerged kit would be 31+ meshes and 31+ draws. 17 is the
    // material-bucket ceiling (six families, sixteen colour pairs, one atlas).
    expect(dressingDrawCalls(group)).toBeLessThanOrEqual(17);
    expect(dressingTriangles(group)).toBeLessThan(14000);
  });

  it('keeps the boot texture set under 20 MB', () => {
    expect(textureMemoryMB()).toBeLessThanOrEqual(20);
    // The poster atlas is the reason five pieces of wall paper fit: assert it is
    // declared once, at cell-bearing size, and that no per-poster sheet exists.
    const atlas = TEXTURE_MANIFEST.filter((t) => t.name === 'poster-atlas');
    expect(atlas).toHaveLength(1);
    expect(atlas[0].width).toBe(384);
    expect(atlas[0].height).toBe(768);
    expect(TEXTURE_MANIFEST.some((t) => t.name.startsWith('poster-') && t.name !== 'poster-atlas')).toBe(false);
  });

  it('emits no NaN vertices', () => {
    const group = buildDressing();
    group.traverse((child) => {
      const mesh = child as { isMesh?: boolean; geometry?: { getAttribute: (n: string) => { array: ArrayLike<number> } } };
      if (!mesh.isMesh || !mesh.geometry) return;
      const pos = mesh.geometry.getAttribute('position');
      for (let i = 0; i < pos.array.length; i++) {
        expect(Number.isFinite(pos.array[i])).toBe(true);
      }
    });
  });
});
