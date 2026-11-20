import * as THREE from 'three';
import { boundsFor, SHELF_BAYS, COUNTER, WALKABLE, type Rect } from '../layout';
import { PropWriter, mergeBuckets, C, type Buckets } from './props';

/**
 * Expansion furniture, built as kit.
 *
 * What shipped first was a bolt-on: a cream plane laid over the old floor, a bench,
 * a second register. The room never actually grew — the walls stayed at the 8.4 x 9.2
 * footprint, the camera still treated the shop as one size, and the strip of floor
 * read as a rug. The shell is now parameterised by rectangle (see roomShell.ts), so
 * an expansion is a bigger room; this module supplies only what stands in the new
 * bays, placed from the same bounds the shell uses.
 *
 * Everything merges per material, so both levels together stay inside a handful of
 * draw calls.
 */

const WOOD = C.woodDark;
const WOOD_MID = C.woodMid;
const BRASS = C.brass;
const STEEL = C.steel;
const STEEL_DARK = C.steelDark;
const PLASTER = C.plaster;
const PAPER = C.paper;
const GREEN = C.deepGreen;

/* ------------------------------------------------------------------ */
/* Level 1 — the east aisle                                            */
/* ------------------------------------------------------------------ */

/**
 * A low gondola run against the new east wall: posts, three tiers, and packs laid
 * on them. Deliberately lower than the wall bays (1.55 m against 2.6 m) so the
 * bought space reads as a second, cheaper fixture line rather than more of the same.
 */
function eastAisle(room: Rect, buckets: Buckets): void {
  const wallX = room.maxX;
  const zStart = room.minZ + 1.6;
  const zEnd = room.maxZ - 1.6;
  const runLength = zEnd - zStart;
  const modules = Math.max(2, Math.round(runLength / 1.8));
  const moduleLength = runLength / modules;
  const H = 1.55;
  const D = 0.5;

  for (let m = 0; m < modules; m++) {
    const cz = zStart + moduleLength * (m + 0.5);
    const w = new PropWriter({ x: wallX - D / 2, z: cz }, buckets);

    // Uprights at the module ends plus a spine against the wall.
    w.box('steel', STEEL_DARK, 0.05, H, 0.05, 0, H / 2, -moduleLength / 2 + 0.05, 0, 0, 0.01);
    w.box('steel', STEEL_DARK, 0.05, H, 0.05, 0, H / 2, moduleLength / 2 - 0.05, 0, 0, 0.01);
    w.box('wood', WOOD, 0.06, H, moduleLength - 0.1, D / 2 - 0.03, H / 2, 0, 0, 0, 0.01);

    // Three tiers plus a plinth.
    for (let tier = 0; tier < 3; tier++) {
      const y = 0.38 + tier * 0.47;
      w.box('wood', WOOD_MID, D, 0.04, moduleLength - 0.06, -0.02, y, 0, 0, 0, 0.008);
      // Packs: 4 per tier, alternating carton colour so the run is not a stripe.
      for (let i = 0; i < 4; i++) {
        const lz = (i - 1.5) * (moduleLength / 4.6);
        const isGreen = (tier + i + m) % 3 === 0;
        w.box('paper', isGreen ? PAPER : BRASS, 0.26, 0.17 + ((i + tier) % 2) * 0.05, 0.2, -0.02, y + 0.105, lz, 0, 0, 0.01);
      }
    }
    // Price rail: a thin brass strip on the aisle face reads as retail at any size.
    w.box('wood', BRASS, 0.02, 0.05, moduleLength - 0.1, -D / 2, 0.42, 0, 0, 0, 0.006);
  }
}

/** Waiting bench in the new bay, against the front wall, clear of the doorway. */
function waitingBench(room: Rect, buckets: Buckets): void {
  const x = room.maxX - 1.05;
  const z = room.maxZ - 0.55;
  const w = new PropWriter({ x, z }, buckets);

  w.box('wood', WOOD, 0.55, 0.09, 1.9, 0, 0.45, 0, 0, 0, 0.02);
  w.box('wood', WOOD_MID, 0.06, 0.42, 1.7, 0.24, 0.21, 0, 0, 0, 0.01);
  for (const dz of [-0.8, 0.8]) {
    w.box('steel', STEEL_DARK, 0.46, 0.06, 0.06, 0, 0.13, dz, 0, 0, 0.01);
  }
}

/** Second till on the widened counter run. */
function secondTill(room: Rect, buckets: Buckets): void {
  const w = new PropWriter({ x: COUNTER.x + 1.28, z: COUNTER.z }, buckets);
  w.box('steel', STEEL_DARK, 0.42, 0.16, 0.34, 0, 1.35, 0, 0, 0, 0.02);
  w.box('steel', STEEL_DARK, 0.3, 0.24, 0.04, 0, 1.55, -0.12, 0, -0.35, 0.012);
  w.box('paper', GREEN, 0.26, 0.16, 0.006, 0, 1.56, -0.135, 0, -0.35, 0.004);
  void room;
}

/* ------------------------------------------------------------------ */
/* Level 2 — the consultation corner                                   */
/* ------------------------------------------------------------------ */

/**
 * Consultation bay in the new north wing.
 *
 * Against the north wall of the wing, on its east half: that corner is visible from
 * the fixed isometric camera, while the north-west corner sits behind the west shelf
 * bays on every viewport. Everything hugs a wall, with the curtain across the bay's
 * mouth, because furniture in the middle of a sales floor reads as clutter.
 */
function consultationCorner(room: Rect, buckets: Buckets): void {
  // Centred on the north wing, in the aisle sight line. The bay cannot sit behind
  // the shelf bays: at a 43 degree camera a 2.6 m fixture hides everything up to
  // 2.8 m behind it, which is the whole depth of a wing.
  const deskX = (room.minX + room.maxX) / 2;
  const deskZ = room.minZ + 0.36;

  // --- Desk against the north wall ---------------------------------------
  const desk = new PropWriter({ x: deskX, z: deskZ }, buckets);
  desk.box('plaster', PLASTER, 1.2, 0.06, 0.62, 0, 0.76, 0, 0, 0, 0.02);
  desk.box('steel', STEEL, 0.05, 0.73, 0.55, -0.52, 0.36, 0, 0, 0, 0.01);
  desk.box('steel', STEEL, 0.05, 0.73, 0.55, 0.52, 0.36, 0, 0, 0, 0.01);
  desk.box('wood', WOOD, 0.98, 0.28, 0.04, 0, 0.55, 0.28, 0, 0, 0.01);

  // Blood-pressure set: the one prop that says consultation, not office.
  desk.box('steel', STEEL_DARK, 0.13, 0.09, 0.09, 0.34, 0.84, 0.06, 0, 0, 0.01);
  desk.box('paper', PAPER, 0.16, 0.06, 0.12, 0.34, 0.795, -0.08, 0, 0, 0.008);
  desk.box('wood', BRASS, 0.03, 0.3, 0.03, -0.36, 0.92, 0.1, 0, 0, 0.006);
  desk.box('paper', PAPER, 0.12, 0.03, 0.05, -0.36, 1.08, 0.1, 0, 0, 0.006);

  // --- Stool in the walk band in front of the desk ------------------------
  const stool = new PropWriter({ x: deskX - 0.1, z: deskZ + 0.8 }, buckets);
  stool.cyl('wood', WOOD, 0.26, 0.26, 0.06, 0, 0.6, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    stool.box('wood', WOOD_MID, 0.05, 0.6, 0.05, Math.cos(a) * 0.16, 0.3, Math.sin(a) * 0.16, a, 0.12, 0.01);
  }

  // --- Curtain across the bay mouth, 0.7 m gap at the aisle end -----------
  const railZ = room.minZ + 1.55;
  const railX = deskX;
  const railLength = 2.4;
  const rail = new PropWriter({ x: railX, z: railZ }, buckets);
  // Rail at 2.08 m so the pharmacy cross on the wall above stays visible.
  rail.box('steel', STEEL, railLength, 0.05, 0.05, 0, 2.08, 0, 0, 0, 0.01);
  rail.box('steel', STEEL, 0.05, 0.14, 0.05, -railLength / 2, 2.14, 0, 0, 0, 0.01);
  rail.box('steel', STEEL, 0.05, 0.14, 0.05, railLength / 2, 2.14, 0, 0, 0, 0.01);
  for (let panel = 0; panel < 2; panel++) {
    const px = -0.55 + panel * 0.9;
    // Three thin slabs per panel: folds give the curtain a silhouette.
    for (let fold = 0; fold < 3; fold++) {
      const offset = (fold - 1) * 0.13;
      rail.box('plaster', 0x7d9c88, 0.11, 1.62, 0.05, px + offset, 1.24, 0, 0, 0, 0.015);
    }
  }
}

/**
 * All furniture the current expansion level adds.
 *
 * Level 0 returns an empty group so callers can add it unconditionally.
 */
export function buildExpansion(level: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'expansion';
  if (level <= 0) return group;

  const buckets: Buckets = new Map();
  const room = boundsFor(level).room;

  if (level >= 1) {
    eastAisle(room, buckets);
    waitingBench(room, buckets);
    secondTill(room, buckets);
  }
  if (level >= 2) {
    consultationCorner(room, buckets);
  }

  for (const mesh of mergeBuckets(buckets)) {
    mesh.name = 'expansion-part';
    group.add(mesh);
  }
  return group;
}

/**
 * Is the expansion furniture clear of the walkable floor and the trigger rings?
 *
 * The hook for tests: level 0 has nothing, level 2 must not put a desk on a spot
 * the player can stand in or a bay's trigger circle can fire from.
 */
export interface ExpansionFootprint {
  id: string;
  x: number;
  z: number;
  radius: number;
  /** Furthest this fixture may sit from the nearest outer wall. */
  maxInset: number;
  /** On the counter rather than the floor. */
  onFixture?: boolean;
}

export function expansionFootprints(level: number): ExpansionFootprint[] {
  if (level <= 0) return [];
  const room = boundsFor(level).room;
  const spots: ExpansionFootprint[] = [
    { id: 'aisle-run', x: room.maxX - 0.28, z: (room.minZ + room.maxZ) / 2, radius: 0.8, maxInset: 0.6 },
    { id: 'bench', x: room.maxX - 0.6, z: room.maxZ - 0.6, radius: 0.8, maxInset: 1.0 },
    { id: 'till-2', x: COUNTER.x + 1.28, z: COUNTER.z, radius: 0.3, maxInset: 99, onFixture: true },
  ];
  if (level >= 2) {
    spots.push(
      { id: 'consult-desk', x: (room.minX + room.maxX) / 2, z: room.minZ + 0.36, radius: 0.7, maxInset: 0.7 },
      // A curtain hangs across the bay mouth, not against a wall: 1.55 m in is correct.
      { id: 'consult-curtain', x: (room.minX + room.maxX) / 2, z: room.minZ + 1.55, radius: 0.9, maxInset: 1.6 }
    );
  }
  return spots;
}

/** True when a footprint sits inside the walkable rect for that level. */
export function expansionOnWalkable(level: number): string[] {
  const walk = boundsFor(level).walkable;
  return expansionFootprints(level)
    .filter((s) => s.x > walk.minX && s.x < walk.maxX && s.z > walk.minZ && s.z < walk.maxZ)
    .map((s) => s.id);
}

/** Zones a footprint must not overlap, for the placement test. */
export const EXPANSION_NO_GO = (): Array<{ id: string; x: number; z: number; radius: number }> => [
  { id: 'dock', x: 0, z: -3.4, radius: 1.1 },
  ...SHELF_BAYS.filter((bay) => bay.x > 0).map((bay) => ({
    id: bay.id,
    x: bay.x,
    z: bay.z,
    radius: bay.triggerRadius,
  })),
  { id: 'counter', x: COUNTER.x, z: COUNTER.z, radius: COUNTER.radius },
];

// Referenced so the module keeps a single import surface for callers that want
// the base walkable rect when checking level-0 geometry.
export const BASE_WALKABLE = WALKABLE;
