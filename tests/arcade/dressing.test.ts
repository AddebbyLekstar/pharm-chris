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
import { ROOM } from '../../src/ui/arcade/layout';

describe('shop dressing', () => {
  it('has 24 authored placements with unique ids', () => {
    expect(DRESSING).toHaveLength(24);
    expect(new Set(DRESSING.map((p) => p.id)).size).toBe(24);
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

  it('merges into a handful of draw calls at a small triangle count', () => {
    const group = buildDressing();
    // 24 props; the ceiling is generous on purpose, but it is a ceiling: an
    // unmerged prop kit would be 24+ meshes and 24+ draw calls on a phone.
    expect(dressingDrawCalls(group)).toBeLessThanOrEqual(14);
    expect(dressingTriangles(group)).toBeLessThan(9000);
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
