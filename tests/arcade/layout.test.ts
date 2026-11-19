import { describe, it, expect } from 'vitest';
import {
  WALKABLE, ROOM, DOCK, COUNTER, SHELF_BAYS, QUEUE_SLOTS, WALL_T, ZONES, clampToWalkable, EXPANSION_BOUNDS,
} from '../../src/ui/arcade/layout';

describe('shop layout', () => {
  it('keeps every walkable point clear of the interior wall face', () => {
    expect(WALKABLE.minX - ROOM.minX).toBeGreaterThanOrEqual(WALL_T + 0.25);
    expect(ROOM.maxX - WALKABLE.maxX).toBeGreaterThanOrEqual(WALL_T + 0.25);
    expect(WALKABLE.minZ - ROOM.minZ).toBeGreaterThanOrEqual(WALL_T + 0.25);
    expect(ROOM.maxZ - WALKABLE.maxZ).toBeGreaterThanOrEqual(WALL_T + 0.25);
  });

  it('has four shelf bays, each inside the room and overlapping no other zone', () => {
    expect(SHELF_BAYS).toHaveLength(4);
    for (const z of ZONES) {
      expect(z.x - z.radius).toBeGreaterThan(ROOM.minX);
      expect(z.x + z.radius).toBeLessThan(ROOM.maxX);
      expect(z.z - z.radius).toBeGreaterThan(ROOM.minZ);
      expect(z.z + z.radius).toBeLessThan(ROOM.maxZ);
    }
    for (let i = 0; i < ZONES.length; i++) {
      for (let j = i + 1; j < ZONES.length; j++) {
        const d = Math.hypot(ZONES[i].x - ZONES[j].x, ZONES[i].z - ZONES[j].z);
        expect(d, `${ZONES[i].id} vs ${ZONES[j].id}`).toBeGreaterThan(ZONES[i].radius + ZONES[j].radius);
      }
    }
  });

  it('places dock, counter and queue slots inside the walkable floor', () => {
    for (const p of [DOCK, COUNTER, ...QUEUE_SLOTS]) {
      expect(p.x).toBeGreaterThan(WALKABLE.minX);
      expect(p.x).toBeLessThan(WALKABLE.maxX);
      expect(p.z).toBeGreaterThan(WALKABLE.minZ);
      expect(p.z).toBeLessThan(WALKABLE.maxZ);
    }
  });

  it('clamps a player position saved against the old 16x18m layout', () => {
    expect(clampToWalkable({ x: -6, z: -6.5 })).toEqual({ x: WALKABLE.minX, z: WALKABLE.minZ });
    expect(clampToWalkable({ x: 0.5, z: 0.25 })).toEqual({ x: 0.5, z: 0.25 });
  });

  it('grows the room outward at each expansion level', () => {
    expect(EXPANSION_BOUNDS[1].room.maxX).toBeGreaterThan(EXPANSION_BOUNDS[0].room.maxX);
    expect(EXPANSION_BOUNDS[2].room.minX).toBeLessThan(EXPANSION_BOUNDS[1].room.minX);
  });
});
