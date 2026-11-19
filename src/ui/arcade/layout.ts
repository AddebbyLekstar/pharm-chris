/**
 * The shop's floor plan — the single source of truth for every coordinate.
 *
 * The room was 16 x 18 m with a camera 34 m away, so the shop overflowed the
 * phone and Chris was a pawn. This module shrinks it to a Sims-scale 8.4 x 9.2 m
 * so the room fills the frame *and* the character stays controllable, and it puts
 * bounds, bays, zones, queue slots and expansion extents in one place. Changing
 * the shop is now a data change, not a hunt through seven files.
 *
 * Axes: +x east, +z south (toward the street). Origin is the middle of the floor.
 */

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Point2 {
  x: number;
  z: number;
}

/** Interior width (x) and depth (z) of the starting shop, in metres. */
export const SHOP_W = 8.4;
export const SHOP_D = 9.2;
/** Wall thickness. The cutaway walls read as slabs at this depth. */
export const WALL_T = 0.3;

/** Interior faces of the walls. Geometry sits ON these, never inside them. */
export const ROOM: Rect = { minX: -SHOP_W / 2, maxX: SHOP_W / 2, minZ: -SHOP_D / 2, maxZ: SHOP_D / 2 };

/** Floor the player may stand on, inset from the walls. */
export const WALKABLE: Rect = { minX: -3.6, maxX: 3.6, minZ: -3.9, maxZ: 3.9 };

/** Crate pad at the back of the shop, where stock is collected. */
export const DOCK = { x: 0, z: -3.4, radius: 1.1, width: 1.6, depth: 1.2 };

/** Dispensing counter, centred, in front of the shelves. */
export const COUNTER = { x: 0, z: 1.6, width: 3.2, depth: 0.95, radius: 1.2 };

/**
 * Four shelf bays against the side walls.
 *
 * Ruling (P1 Task 1): the spec placed bays at |x| = 3.3 with a 1.0 m trigger.
 * At that size a bay's trigger circle pokes 0.1 m through the wall, so bays sit
 * at 3.2 with a 0.9 m trigger. Costs nothing visually; keeps every zone inside
 * the room by construction.
 */
export interface ShelfBay {
  id: string;
  category: string;
  label: string;
  color: string;
  x: number;
  z: number;
  triggerRadius: number;
  width: number;
  depth: number;
}

const BAY_W = 1.6;
const BAY_D = 0.85;

export const SHELF_BAYS: ShelfBay[] = [
  { id: 'shelf_antimalarial', category: 'antimalarial', label: 'ANTIMALARIALS', color: '#E53935', x: -3.2, z: -2.4, triggerRadius: 0.9, width: BAY_W, depth: BAY_D },
  { id: 'shelf_analgesic', category: 'analgesic', label: 'ANALGESICS', color: '#43A047', x: -3.2, z: 0.6, triggerRadius: 0.9, width: BAY_W, depth: BAY_D },
  { id: 'shelf_antibiotic', category: 'antibiotic', label: 'ANTIBIOTICS', color: '#1E88E5', x: 3.2, z: -2.4, triggerRadius: 0.9, width: BAY_W, depth: BAY_D },
  { id: 'shelf_cold_chain', category: 'cold_chain', label: 'COLD CHAIN / INSULIN', color: '#00ACC1', x: 3.2, z: 0.6, triggerRadius: 0.9, width: BAY_W, depth: BAY_D },
];

/**
 * Where customers stand. Ruling (P1 Task 1): the spec's fourth slot sat exactly
 * on the walkable edge at z = 3.9; slots moved back 0.3 m so nobody renders
 * half way through the front wall.
 */
export const QUEUE_SLOTS: Point2[] = [
  { x: 0, z: 2.9 },
  { x: 0, z: 3.6 },
  { x: -0.9, z: 2.9 },
  { x: 0.9, z: 2.9 },
];

export interface TriggerZoneSpec {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  color: string;
}

/** Every place the player must be able to stand and act. */
export const ZONES: TriggerZoneSpec[] = [
  { id: 'dock', name: 'Delivery Unboxing Dock', x: DOCK.x, z: DOCK.z, radius: DOCK.radius, color: '#FFD54F' },
  ...SHELF_BAYS.map((bay) => ({
    id: bay.id,
    name: `${bay.label} Shelf`,
    x: bay.x,
    z: bay.z,
    radius: bay.triggerRadius,
    color: bay.color,
  })),
  { id: 'counter_cashier', name: 'Dispensing & Cashier Counter', x: COUNTER.x, z: COUNTER.z, radius: COUNTER.radius, color: '#00E676' },
];

/** Player position from a save written against an older, larger shop. */
export function clampToWalkable(p: Point2): Point2 {
  return {
    x: Math.min(WALKABLE.maxX, Math.max(WALKABLE.minX, p.x)),
    z: Math.min(WALKABLE.maxZ, Math.max(WALKABLE.minZ, p.z)),
  };
}

export interface ExpansionBounds {
  room: Rect;
  walkable: Rect;
}

/**
 * Level 1 knocks the east partition down and widens the room 1.6 m; level 2 adds
 * the consultation corner on the north-west. The camera steps back one notch per
 * level, so buying space visibly widens the shot.
 */
export const EXPANSION_BOUNDS: Record<0 | 1 | 2, ExpansionBounds> = {
  0: { room: { ...ROOM }, walkable: { ...WALKABLE } },
  1: {
    room: { ...ROOM, maxX: ROOM.maxX + 1.6 },
    walkable: { ...WALKABLE, maxX: WALKABLE.maxX + 1.6 },
  },
  2: {
    room: { ...ROOM, maxX: ROOM.maxX + 1.6, minX: ROOM.minX - 1.2, minZ: ROOM.minZ - 1.2 },
    walkable: { ...WALKABLE, maxX: WALKABLE.maxX + 1.6, minX: WALKABLE.minX - 1.2, minZ: WALKABLE.minZ - 1.2 },
  },
};

/** Bounds for a given expansion level (0 = starting shop). */
export function boundsFor(level: number): ExpansionBounds {
  const clamped = Math.max(0, Math.min(2, Math.floor(level))) as 0 | 1 | 2;
  return EXPANSION_BOUNDS[clamped];
}
