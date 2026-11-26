import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COUNTER, ROOM, WALKABLE, ZONES, boundsFor as boundsForLevel } from '../layout';
import { chamferBox, leafBlade } from './geometry';
import { material, practical, PALETTE, type MaterialFamily, type PracticalKind } from './materials';
import { posterAtlas, posterCellUV } from '../textures';

/**
 * The room's dressing.
 *
 * A shop is not a floor plan with four shelves in it: the difference between
 * "blockout" and "place" is two dozen objects nobody is required to interact with
 * — a mat, crates by the dock, a fan, a stool, price cards, a mop. They are
 * authored here, in one table, so density is a data change and a reviewer can see
 * the whole dressing list at once.
 *
 * Two rules keep this cheap and safe:
 *   1. Everything merges per material, so 24 props cost ~12 draw calls, not 24.
 *   2. Nothing here touches the walkable bounds or a trigger zone. Placement is
 *      validated by tests/arcade/dressing.test.ts, not by eye.
 */

export type DressingKind =
  | 'mat'
  | 'crate'
  | 'pallet'
  | 'plant'
  | 'dispenser'
  | 'bin'
  | 'stool'
  | 'fan'
  | 'pendant'
  | 'poster'
  | 'calendar'
  | 'priceCard'
  | 'grille'
  | 'generator'
  | 'extinguisher'
  | 'sanitizer'
  | 'mop'
  | 'carton'
  | 'cylinder';

/**
 * What holds the prop up. Floor props are validated against the walkable rect and
 * the trigger zones; counter props sit on the dispensing slab; ceiling props are
 * above head height and own no floor.
 */
export type PropSupport = 'floor' | 'counter' | 'ceiling';

export interface DressingPlacement {
  id: string;
  kind: DressingKind;
  /** Footprint centre on the floor. */
  x: number;
  z: number;
  /** Rotation about Y, radians. */
  rotY?: number;
  support?: PropSupport;
  /** Text painted on a poster. Ignored for other kinds. */
  text?: string;
  /** Poster plate colour. */
  color?: string;
  /** Base height above the floor (counter tops, stacked cartons). */
  lift?: number;
  /** Cell in the shared poster atlas; only wall paper uses it. */
  cell?: number;
  /** Plant size. Counter pots are small so they do not hide the till. */
  variant?: 'large' | 'small';
}

const DEG = Math.PI / 180;

/**
 * 31 placements. World-space; the room is 8.4 x 9.2 m with the walkable floor
 * inset 0.6 m from the side walls and 0.7 m from front/back.
 */
export const DRESSING: DressingPlacement[] = [
  // --- Entrance -----------------------------------------------------------
  { id: 'mat-entrance', kind: 'mat', x: 0, z: 4.08 },
  { id: 'poster-hours', kind: 'poster', x: -2.55, z: ROOM.minZ + 0.05, cell: 0, text: 'OPEN 8AM - 9PM', color: '#1f4b3f' },
  { id: 'poster-malaria', kind: 'poster', x: 2.55, z: ROOM.minZ + 0.05, cell: 1, text: 'MALARIA TEST 2,000', color: '#c0453b' },
  { id: 'grille-roll', kind: 'grille', x: 0, z: ROOM.maxZ + 0.1, support: 'ceiling' },

  // --- Delivery dock: crates against the back wall, clear of the dock ring ---
  { id: 'crate-a', kind: 'crate', x: -1.72, z: ROOM.minZ + 0.48, rotY: 4 * DEG },
  { id: 'crate-b', kind: 'crate', x: -1.02, z: ROOM.minZ + 0.42, rotY: -7 * DEG },
  { id: 'crate-c', kind: 'crate', x: 1.62, z: ROOM.minZ + 0.46, rotY: 11 * DEG },
  { id: 'pallet-flat', kind: 'pallet', x: 0.95, z: ROOM.minZ + 0.4, rotY: -3 * DEG },
  { id: 'bin-bags', kind: 'bin', x: -2.6, z: ROOM.minZ + 0.42 },

  // --- West wall: the gaps between and past the two bays --------------------
  { id: 'poster-price-list', kind: 'poster', x: ROOM.minX + 0.05, z: -1.45, rotY: 90 * DEG, cell: 2, text: 'PRICE LIST', color: '#b08a4a' },
  { id: 'stool-west', kind: 'stool', x: -3.86, z: 2.3, rotY: 12 * DEG },
  { id: 'plant-west', kind: 'plant', x: -3.88, z: 3.72, variant: 'large' },
  { id: 'mop-set', kind: 'mop', x: -3.92, z: -3.55, rotY: -8 * DEG },

  // --- East wall -----------------------------------------------------------
  { id: 'dispenser-east', kind: 'dispenser', x: 3.94, z: 3.88, rotY: -90 * DEG },
  { id: 'extinguisher', kind: 'extinguisher', x: ROOM.maxX - 0.14, z: -3.55, rotY: -90 * DEG },
  { id: 'poster-deworm', kind: 'poster', x: ROOM.maxX - 0.05, z: -0.9, rotY: -90 * DEG, cell: 3, text: 'DEWORMING 500', color: '#2e6f6b' },
  { id: 'calendar-wall', kind: 'calendar', x: ROOM.maxX - 0.05, z: 2.2, rotY: -90 * DEG, cell: 4 },
  { id: 'plant-east', kind: 'plant', x: 3.86, z: 2.55, variant: 'large' },

  // --- Counter top ---------------------------------------------------------
  { id: 'card-1', kind: 'priceCard', x: COUNTER.x - 1.28, z: COUNTER.z + 0.36, rotY: -6 * DEG, support: 'counter' },
  { id: 'card-2', kind: 'priceCard', x: COUNTER.x - 0.42, z: COUNTER.z + 0.38, rotY: 3 * DEG, support: 'counter' },
  { id: 'card-3', kind: 'priceCard', x: COUNTER.x + 0.44, z: COUNTER.z + 0.36, rotY: -2 * DEG, support: 'counter' },
  { id: 'card-4', kind: 'priceCard', x: COUNTER.x + 1.3, z: COUNTER.z + 0.37, rotY: 7 * DEG, support: 'counter' },
  { id: 'sanitizer', kind: 'sanitizer', x: COUNTER.x - 1.06, z: COUNTER.z - 0.16, support: 'counter' },
  { id: 'plant-counter', kind: 'plant', x: COUNTER.x - 1.44, z: COUNTER.z + 0.04, support: 'counter', lift: 1.27, variant: 'small' },

  // --- Overhead ------------------------------------------------------------
  { id: 'fan-ceiling', kind: 'fan', x: 0, z: -0.85, support: 'ceiling' },
  { id: 'pendant-counter', kind: 'pendant', x: COUNTER.x, z: COUNTER.z, support: 'ceiling' },
  { id: 'pendant-front', kind: 'pendant', x: -2.35, z: 3.15, support: 'ceiling' },

  // --- Outside: stock waiting to be carried in, and the cooking-gas cylinder -
  { id: 'generator', kind: 'generator', x: 2.85, z: ROOM.maxZ + 1.15, rotY: -18 * DEG },
  { id: 'carton-a', kind: 'carton', x: -1.68, z: ROOM.maxZ + 0.55, rotY: 7 * DEG },
  { id: 'carton-b', kind: 'carton', x: -1.64, z: ROOM.maxZ + 0.54, rotY: -5 * DEG, lift: 0.48 },
  { id: 'cylinder-gas', kind: 'cylinder', x: 1.62, z: ROOM.maxZ + 0.62, rotY: -12 * DEG },
];

/**
 * Dressing palette. Deliberately tiny: every extra colour is another material and
 * therefore another draw call. Six families, eleven colour buckets for 24 props.
 */
export interface PropAnchor {
  x: number;
  z: number;
  rotY?: number;
}

export const C = {
  woodDark: 0x6d472c,
  woodMid: 0x8a5a3b,
  brass: PALETTE.brass,
  leaf: 0x2f6b46,
  leafLight: 0x3f7d52,
  steelDark: 0x2b3238,
  steel: 0xc9ced2,
  red: 0xc0453b,
  plaster: 0xefe6d6,
  terracotta: PALETTE.terracotta,
  deepGreen: PALETTE.deepGreen,
  paper: 0xf6f1e6,
  glassWater: 0xbfe6ef,
  bottleBlue: 0x3d86b8,
  cylinder: 0xd08a3e,
} as const;

interface Bucket {
  mat: THREE.MeshStandardMaterial;
  geos: THREE.BufferGeometry[];
}

export type Buckets = Map<string, Bucket>;

/** Merge every bucket into one mesh per material. Shared across all props. */
export function mergeBuckets(buckets: Buckets): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  for (const bucket of buckets.values()) {
    if (!bucket.geos.length) continue;
    const merged = bucket.geos.length === 1 ? bucket.geos[0] : mergeGeometries(bucket.geos, false);
    if (!merged) {
      // Fall back to individual meshes rather than losing the prop.
      for (const geo of bucket.geos) {
        const mesh = new THREE.Mesh(geo, bucket.mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        meshes.push(mesh);
      }
      continue;
    }
    if (merged !== bucket.geos[0]) for (const geo of bucket.geos) geo.dispose();
    const mesh = new THREE.Mesh(merged, bucket.mat);
    mesh.castShadow = !bucket.mat.transparent;
    mesh.receiveShadow = !bucket.mat.transparent;
    meshes.push(mesh);
  }
  return meshes;
}

/** Writes a prop's parts in its own local frame, then merges everything by material. */
export class PropWriter {
  public readonly x: number;
  public readonly z: number;
  public readonly rotY: number;
  public readonly lift: number;
  /** Authoring metadata the marker carries into the scene graph (leaf count, blades). */
  public readonly meta: Record<string, number> = {};
  private readonly extent = new THREE.Box3();
  private readonly base = new THREE.Box3();

  /**
   * Buckets are shared by every prop in the room: merging per prop would give 24
   * props x 3 materials = ~49 draw calls, which is the whole problem this module
   * exists to avoid.
   */
  constructor(placement: PropAnchor & { lift?: number }, private shared: Buckets) {
    this.x = placement.x;
    this.z = placement.z;
    this.rotY = placement.rotY ?? 0;
    this.lift = placement.lift ?? 0;
  }

  /** World position of a local offset, rotated about the prop's own Y axis. */
  public world(lx: number, ly: number, lz: number): THREE.Vector3 {
    const c = Math.cos(this.rotY);
    const s = Math.sin(this.rotY);
    return new THREE.Vector3(this.x + lx * c + lz * s, this.lift + ly, this.z - lx * s + lz * c);
  }

  /** Union an externally built geometry (a poster face) into this prop's bounds. */
  public include(geo: THREE.BufferGeometry): void {
    geo.computeBoundingBox();
    if (geo.boundingBox) this.extent.union(geo.boundingBox);
  }

  /** World-space bounds of everything this prop wrote. */
  public aabb(): THREE.Box3 {
    if (this.extent.isEmpty()) this.extent.setFromCenterAndSize(new THREE.Vector3(this.x, this.lift, this.z), new THREE.Vector3(0.02, 0.02, 0.02));
    return this.extent.clone();
  }

  /**
   * Bounds of the part of the prop within 18 cm of its own base — the pot, carton
   * or cylinder body the player would actually collide with. Leaves overhang this
   * on purpose and must not fail a walkable-path check.
   */
  public baseAabb(): THREE.Box3 {
    if (this.base.isEmpty()) return this.aabb();
    return this.base.clone();
  }

  private push(geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial): void {
    geo.computeBoundingBox();
    if (geo.boundingBox) {
      this.extent.union(geo.boundingBox);
      if (geo.boundingBox.min.y <= this.lift + 0.18) this.base.union(geo.boundingBox);
    }
    const key = mat.uuid;
    const bucket = this.shared.get(key) ?? { mat, geos: [] };
    bucket.geos.push(geo);
    this.shared.set(key, bucket);
  }

  public box(
    family: MaterialFamily,
    color: number,
    w: number,
    h: number,
    d: number,
    lx: number,
    ly: number,
    lz: number,
    localRotY = 0,
    localRotX = 0,
    bevel = 0.015
  ): void {
    const geo = chamferBox(w, h, d, bevel);
    const m = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(localRotX, this.rotY + localRotY, 0, 'YXZ')
    );
    m.setPosition(this.world(lx, ly, lz));
    geo.applyMatrix4(m);
    this.push(geo, material(family, color));
  }

  public cyl(
    family: MaterialFamily,
    color: number,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    lx: number,
    ly: number,
    lz: number,
    segments = 12
  ): void {
    const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
    const m = new THREE.Matrix4().makeTranslation(this.world(lx, ly, lz));
    geo.applyMatrix4(m);
    this.push(geo, material(family, color));
  }

  /** Anything the primitive helpers cannot express (a fan cage, a folded leaf). */
  public shape(geo: THREE.BufferGeometry, family: MaterialFamily, color: number): void {
    this.push(geo, material(family, color));
  }

  /** A leaf blade growing from a point, yawed around the pot and tilted outward. */
  public leaf(
    length: number,
    width: number,
    lx: number,
    ly: number,
    lz: number,
    yaw: number,
    tilt: number,
    droop = 0.18,
    color: number = C.leaf
  ): void {
    const geo = leafBlade(length, width, droop);
    const m = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(tilt, this.rotY + yaw, 0, 'YXZ')
    );
    m.setPosition(this.world(lx, ly, lz));
    geo.applyMatrix4(m);
    this.push(geo, material('wood', color));
  }

  /** A disc facing down (lamp underside) or out of a wall (vent). */
  public disc(
    family: MaterialFamily,
    color: number,
    radius: number,
    lx: number,
    ly: number,
    lz: number,
    rotX: number
  ): void {
    const geo = new THREE.CircleGeometry(radius, 16);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotX, this.rotY, 0, 'YXZ'));
    m.setPosition(this.world(lx, ly, lz));
    geo.applyMatrix4(m);
    this.push(geo, material(family, color));
  }

  /**
   * A self-lit disc: the pendant's underside. Separate from `disc` because the
   * material is the point — a lamp underside painted in the paper family catches
   * light but never appears to emit it, and every lamp merged into one practical
   * bucket still costs a single draw for the whole dressing.
   */
  public practicalDisc(
    kind: PracticalKind,
    radius: number,
    lx: number,
    ly: number,
    lz: number,
    rotX: number
  ): void {
    const geo = new THREE.CircleGeometry(radius, 20);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotX, this.rotY, 0, 'YXZ'));
    m.setPosition(this.world(lx, ly, lz));
    geo.applyMatrix4(m);
    this.push(geo, practical(kind));
  }

}

function buildProp(p: DressingPlacement, buckets: Buckets): PropWriter {
  const w = new PropWriter(p, buckets);

  switch (p.kind) {
    case 'mat': {
      // Floor mat: a green rubber rectangle with a brass edge, 3 cm thick so it
      // casts a line instead of z-fighting the terrazzo.
      w.box('plaster', C.deepGreen, 2.4, 0.03, 0.95, 0, 0.016, 0, 0, 0, 0.008);
      w.box('wood', C.brass, 2.46, 0.014, 1.0, 0, 0.006, 0, 0, 0, 0.006);
      break;
    }

    case 'crate': {
      const s = 0.62;
      w.box('wood', C.woodDark, s, s, s, 0, s / 2, 0, 0, 0, 0.02);
      // Two lighter bands read as planks at the scale these render.
      w.box('wood', C.woodMid, s + 0.01, 0.06, s + 0.01, 0, s * 0.62, 0, 0, 0, 0.01);
      w.box('wood', C.woodMid, s + 0.01, 0.06, s + 0.01, 0, s * 0.24, 0, 0, 0, 0.01);
      break;
    }

    case 'pallet': {
      // Flat-packed cartons stacked on the dock floor. One slab read as a loose
      // plank of wood lying in the aisle; three offset cartons read as stock.
      for (let i = 0; i < 3; i++) {
        w.box(
          'paper',
          i === 1 ? C.paper : C.brass,
          0.98 - i * 0.04,
          0.11,
          0.7 - i * 0.03,
          0,
          0.055 + i * 0.115,
          i * 0.02,
          (i - 1) * 0.04,
          0,
          0.012
        );
      }
      break;
    }

    case 'plant': {
      const small = p.variant === 'small';
      const potR = small ? 0.115 : 0.23;
      const potH = small ? 0.19 : 0.42;
      const rimH = small ? 0.025 : 0.05;
      w.cyl('plaster', C.terracotta, potR, potR * 0.78, potH, 0, potH / 2, 0, 14);
      w.cyl('plaster', C.terracotta, potR * 1.09, potR * 1.09, rimH, 0, potH, 0, 14);
      // Soil, inset so the pot rim still catches a highlight.
      w.cyl('wood', C.woodDark, potR * 0.9, potR * 0.9, 0.02, 0, potH + 0.008, 0, 12);

      // 12 blades on a floor pot, 10 on a counter pot: two yaw rings so the
      // crown is a plant rather than a pinwheel, with three tilt bands for depth.
      const leaves = small ? 10 : 12;
      w.meta.leaves = leaves;
      const crown = potH + 0.02;
      for (let i = 0; i < leaves; i++) {
        const yaw = (i / leaves) * Math.PI * 2 + (i % 2) * 0.38;
        const tilt = (small ? 0.58 : 0.65) + (i % 3) * 0.075;
        const length = (small ? 0.27 : 0.58) * (0.85 + ((i * 37) % 19) / 126);
        const reach = small ? 0.012 : 0.025;
        w.leaf(
          length,
          small ? 0.075 : 0.15,
          Math.cos(yaw) * reach,
          crown + (i % 2) * 0.018,
          Math.sin(yaw) * reach,
          yaw,
          tilt,
          0.3
        );
      }
      break;
    }

    case 'dispenser': {
      // Blue 19 L bottle inverted into the top, the way every chemist's waiting
      // room in the reference has one. The bottle is the tile family (glossy
      // painted plastic), not glass: at 0.28 opacity glass read as a ghost.
      w.box('plaster', C.plaster, 0.46, 0.96, 0.44, 0, 0.48, 0);
      w.box('plaster', C.plaster, 0.5, 0.07, 0.48, 0, 0.985, 0);
      w.box('steel', C.steelDark, 0.3, 0.3, 0.02, 0, 0.6, 0.23, 0, 0, 0.008);
      w.cyl('tile', C.bottleBlue, 0.19, 0.16, 0.44, 0, 1.32, 0, 16);
      w.cyl('tile', C.bottleBlue, 0.12, 0.19, 0.1, 0, 1.59, 0, 16);
      w.cyl('tile', C.bottleBlue, 0.06, 0.06, 0.12, 0, 1.04, 0, 10);
      w.cyl('steel', C.steel, 0.09, 0.09, 0.04, 0, 1.66, 0, 12);
      for (const dx of [-0.08, 0.08]) {
        w.box('steel', C.steelDark, 0.06, 0.1, 0.06, dx, 0.8, 0.24);
        w.box('steel', C.steelDark, 0.04, 0.04, 0.09, dx, 0.76, 0.3);
      }
      w.box('steel', C.steel, 0.3, 0.035, 0.12, 0, 0.68, 0.2);
      break;
    }

    case 'carton': {
      // Stock waiting by the door: a taped carton with a printed handling label.
      const s = 0.5;
      w.box('paper', C.brass, s, s, s, 0, s / 2, 0, 0, 0, 0.02);
      w.box('paper', C.paper, 0.09, s + 0.004, s + 0.004, 0, s / 2, 0, 0, 0, 0.004);
      w.box('wood', C.woodDark, 0.22, 0.11, 0.006, 0, s * 0.54, s / 2 + 0.003, 0, 0, 0.002);
      break;
    }

    case 'cylinder': {
      // Cooking gas, not medical oxygen: mustard body, dark collar, brass valve.
      w.cyl('steel', C.cylinder, 0.2, 0.22, 0.68, 0, 0.37, 0, 14);
      w.cyl('steel', C.cylinder, 0.11, 0.2, 0.12, 0, 0.77, 0, 14);
      w.cyl('steel', C.steelDark, 0.075, 0.075, 0.1, 0, 0.87, 0, 10);
      w.box('steel', C.steelDark, 0.14, 0.05, 0.14, 0, 0.92, 0, 0, 0, 0.008);
      w.box('steel', C.steelDark, 0.05, 0.12, 0.05, 0.05, 0.96, 0, 0, 0, 0.006);
      w.cyl('steel', C.steelDark, 0.225, 0.225, 0.05, 0, 0.03, 0, 14);
      break;
    }

    case 'bin': {
      w.cyl('steel', C.steelDark, 0.2, 0.17, 0.52, 0, 0.26, 0);
      w.cyl('steel', C.steel, 0.21, 0.21, 0.05, 0, 0.54, 0);
      break;
    }

    case 'stool': {
      // 1.3x a real stool: Chris is scaled 1.35 against the architecture, so 1:1
      // furniture next to him reads as doll furniture.
      w.cyl('wood', C.woodDark, 0.27, 0.27, 0.06, 0, 0.6, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        w.box('wood', C.woodMid, 0.06, 0.6, 0.06, Math.cos(a) * 0.17, 0.3, Math.sin(a) * 0.17, a, 0.12, 0.01);
      }
      break;
    }

    case 'fan': {
      const y = 2.62;
      // Downrod up to the implied slab, a housing with a brass band, four pitched
      // blades and a thin safety cage. Four is what the reference fan has; three
      // read as a desk fan hung from the ceiling.
      w.box('steel', C.steelDark, 0.055, 0.42, 0.055, 0, y + 0.3, 0, 0, 0, 0.008);
      w.cyl('steel', C.steel, 0.14, 0.16, 0.12, 0, y + 0.06, 0, 14);
      w.cyl('wood', C.brass, 0.145, 0.145, 0.025, 0, y + 0.13, 0, 14);
      const blades = 4;
      w.meta.blades = blades;
      for (let i = 0; i < blades; i++) {
        const a = (i / blades) * Math.PI * 2;
        w.box('wood', C.woodMid, 0.88, 0.02, 0.2, Math.cos(a) * 0.47, y, Math.sin(a) * 0.47, a, 0.16, 0.006);
      }
      const cage = new THREE.TorusGeometry(0.64, 0.012, 4, 28);
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2, w.rotY, 0, 'YXZ'));
      m.setPosition(w.world(0, y, 0));
      cage.applyMatrix4(m);
      w.shape(cage, 'steel', C.steelDark);
      break;
    }

    case 'pendant': {
      const y = 2.45;
      // Cord up to a ceiling rose at the wall head. Without the rose the shade is a
      // cone hanging in mid-air, which is the clearest "this is a model" tell in an
      // open-roof cutaway.
      w.box('steel', C.steelDark, 0.014, 0.34, 0.014, 0, y + 0.17, 0, 0, 0, 0.004);
      w.cyl('plaster', C.plaster, 0.16, 0.18, 0.05, 0, 2.78, 0, 16);
      w.cyl('steel', C.steelDark, 0.06, 0.27, 0.2, 0, y, 0, 14);
      // The one warm surface in the dressing: it explains the counter light. 0.32 m
      // is deliberately wider than the shade's 0.27 m mouth so the diffuser's rim is
      // visible from the game's above-the-room camera, and it sits 4 cm under the rim
      // instead of on it: at y - 0.1 the disc was coplanar with the shade's bottom cap
      // and the steel won the depth test.
      w.practicalDisc('lampShade', 0.32, 0, y - 0.14, 0, Math.PI / 2);
      break;
    }

    case 'priceCard': {
      // Two paper planes in a shallow V, the way a chemist's price card is folded.
      w.box('paper', C.paper, 0.16, 0.19, 0.006, 0, 1.375, 0, 0, -0.12, 0.003);
      w.box('paper', C.red, 0.16, 0.035, 0.007, 0, 1.29, 0.006, 0, -0.12, 0.002);
      break;
    }

    case 'grille': {
      // Retracted security grille: housing over the doorway plus a rolled shutter.
      // Left open, because a closed grille would wall off the street the shell was
      // cut to reveal.
      w.box('steel', C.steel, 2.5, 0.22, 0.24, 0, 2.46, 0);
      // The roll lies along X. A vertical cylinder here used to drop a 2.3 m pole
      // to the floor behind the counter and poke out of the cutaway roof.
      const roll = new THREE.CylinderGeometry(0.11, 0.11, 2.3, 12);
      roll.rotateZ(Math.PI / 2);
      const m = new THREE.Matrix4().makeRotationY(w.rotY);
      m.setPosition(w.world(0, 2.32, 0));
      roll.applyMatrix4(m);
      w.shape(roll, 'steel', C.steelDark);
      for (let i = -4; i <= 4; i++) {
        w.box('steel', C.steelDark, 0.03, 0.3, 0.03, i * 0.26, 2.2, 0, 0, 0, 0.006);
      }
      break;
    }

    case 'generator': {
      w.box('steel', C.steelDark, 0.92, 0.5, 0.58, 0, 0.31, 0, 0, 0, 0.03);
      w.box('steel', C.steelDark, 0.86, 0.1, 0.52, 0, 0.58, 0, 0, 0, 0.02);
      w.cyl('steel', C.steelDark, 0.05, 0.05, 0.3, 0.36, 0.72, 0);
      for (const dx of [-0.34, 0.34]) {
        w.box('steel', C.steelDark, 0.08, 0.12, 0.56, dx, 0.06, 0, 0, 0, 0.01);
      }
      break;
    }

    case 'extinguisher': {
      w.cyl('steel', C.red, 0.09, 0.09, 0.42, 0, 0.75, 0.02);
      w.box('steel', C.steelDark, 0.03, 0.12, 0.03, 0, 0.9, 0.05, 0, 0, 0.005);
      w.box('steel', C.steelDark, 0.05, 0.05, 0.1, 0, 0.97, 0.02, 0, 0, 0.005);
      break;
    }

    case 'sanitizer': {
      w.cyl('glass', C.glassWater, 0.045, 0.045, 0.16, 0, 1.35, 0);
      w.box('steel', C.steel, 0.03, 0.05, 0.03, 0, 1.45, 0, 0, 0, 0.004);
      w.box('steel', C.steel, 0.09, 0.02, 0.02, 0.03, 1.47, 0, 0, 0, 0.004);
      break;
    }

    case 'mop': {
      w.cyl('plaster', C.deepGreen, 0.2, 0.17, 0.34, 0, 0.17, 0);
      w.cyl('wood', C.woodMid, 0.018, 0.018, 1.25, 0.02, 0.66, 0, 8);
      w.box('paper', C.paper, 0.16, 0.1, 0.08, 0.02, 0.06, 0, 0, 0, 0.01);
      break;
    }

    case 'poster':
      // A brass frame plate; the printed face is merged into the shared atlas mesh
      // in buildDressing(), so five pieces of wall paper cost one draw.
      w.box('wood', C.brass, 0.74, 0.94, 0.04, 0, 1.78, 0.02, 0, 0, 0.01);
      break;

    case 'calendar':
      w.box('wood', C.brass, 0.54, 0.68, 0.04, 0, 1.86, 0.02, 0, 0, 0.01);
      break;

    default:
      break;
  }

  return w;
}

/**
 * One poster / calendar face, UV-mapped to its cell in the shared atlas.
 *
 * PlaneGeometry faces +Z. Rotating by the placement's yaw turns the normal into
 * the room for both side walls (±90°), and the 5 cm offset keeps the paper proud
 * of the brass frame instead of z-fighting it.
 */
function wallPaperFace(p: DressingPlacement, width: number, height: number, y: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, height);
  const { u0, v0, u1, v1 } = posterCellUV(p.cell ?? 0);
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;

  const rotY = p.rotY ?? 0;
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, rotY, 0));
  m.setPosition(p.x + Math.sin(rotY) * 0.05, (p.lift ?? 0) + y, p.z + Math.cos(rotY) * 0.05);
  geo.applyMatrix4(m);
  geo.computeBoundingBox();
  return geo;
}

/**
 * A named, geometry-free marker per prop.
 *
 * Everything solid is merged by material, so there is no per-prop mesh left to
 * find in the scene graph. The marker restores the authored identity — id, kind,
 * support, world AABB, leaf/blade counts — for tests and for future interaction,
 * at zero draw-call cost.
 */
function addPropMarker(group: THREE.Group, p: DressingPlacement, writer: PropWriter): void {
  const marker = new THREE.Object3D();
  marker.name = `prop-${p.id}`;
  marker.position.set(p.x, p.lift ?? 0, p.z);
  const b = writer.aabb();
  const base = writer.baseAabb();
  marker.userData = {
    kind: p.kind,
    support: p.support ?? 'floor',
    aabb: {
      min: { x: b.min.x, y: b.min.y, z: b.min.z },
      max: { x: b.max.x, y: b.max.y, z: b.max.z },
    },
    base: {
      min: { x: base.min.x, y: base.min.y, z: base.min.z },
      max: { x: base.max.x, y: base.max.y, z: base.max.z },
    },
    ...writer.meta,
  };
  group.add(marker);
}

/**
 * All dressing, merged per material.
 *
 * Direct children are merged meshes (one per material bucket) plus one merged
 * atlas mesh for every poster and the calendar. The atlas is the difference
 * between five draws and one for the wall paper; everything else was already
 * sharing buckets.
 */
export function buildDressing(placements: DressingPlacement[] = DRESSING): THREE.Group {
  const group = new THREE.Group();
  group.name = 'dressing';

  const canPaint = typeof document !== 'undefined';
  const buckets: Buckets = new Map();
  const faces: THREE.BufferGeometry[] = [];

  for (const p of placements) {
    const writer = buildProp(p, buckets);

    if ((p.kind === 'poster' || p.kind === 'calendar') && canPaint) {
      const face =
        p.kind === 'calendar'
          ? wallPaperFace(p, 0.46, 0.6, 1.86)
          : wallPaperFace(p, 0.66, 0.86, 1.78);
      faces.push(face);
      writer.include(face);
    }

    addPropMarker(group, p, writer);
  }

  // One atlas, one material, one mesh for every piece of wall paper.
  if (faces.length) {
    const merged = faces.length === 1 ? faces[0] : mergeGeometries(faces, false);
    if (merged) {
      if (merged !== faces[0]) for (const geo of faces) geo.dispose();
      const mesh = new THREE.Mesh(
        merged,
        new THREE.MeshStandardMaterial({ map: posterAtlas(), roughness: 0.72, metalness: 0 })
      );
      mesh.name = 'dressing-wallpaper';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  for (const mesh of mergeBuckets(buckets)) group.add(mesh);
  return group;
}

/**
 * The dressing list for a given expansion level.
 *
 * Props are authored against the starting shop, but three of the four walls move
 * when space is bought. Anything mounted on a wall that moved goes with it — an
 * extinguisher left on the old east wall would hang in mid-air over the new aisle.
 */
export function placementsFor(level: number, placements: DressingPlacement[] = DRESSING): DressingPlacement[] {
  const bounds = boundsForLevel(level).room;
  const dxEast = bounds.maxX - ROOM.maxX;
  const dxWest = bounds.minX - ROOM.minX;
  const dzBack = bounds.minZ - ROOM.minZ;
  if (dxEast === 0 && dxWest === 0 && dzBack === 0) return placements.map((p) => ({ ...p }));

  return placements.map((p) => {
    const onEastWall = p.x > ROOM.maxX - 0.7;
    const onWestWall = p.x < ROOM.minX + 0.7;
    const onBackWall = p.z < ROOM.minZ + 0.7;
    return {
      ...p,
      // East wins if a prop somehow sits in two corners: that wall moves furthest.
      x: p.x + (onEastWall ? dxEast : onWestWall ? dxWest : 0),
      z: p.z + (onBackWall ? dzBack : 0),
    };
  });
}

/** Merged mesh count, so the budget test can assert the draw-call ceiling. */
export function dressingDrawCalls(group: THREE.Group): number {
  let count = 0;
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) count++;
  });
  return count;
}

/** Triangle count of the merged dressing. */
export function dressingTriangles(group: THREE.Group): number {
  let tris = 0;
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry;
    tris += geo.index ? geo.index.count / 3 : geo.getAttribute('position').count / 3;
  });
  return Math.round(tris);
}

/** Every placement that owns floor space (i.e. is not on the counter or ceiling). */
export function floorPlacements(placements: DressingPlacement[] = DRESSING): DressingPlacement[] {
  return placements.filter((p) => (p.support ?? 'floor') === 'floor');
}

/** True when a placement's footprint sits inside the walkable floor. */
export function blocksWalkable(p: DressingPlacement): boolean {
  return p.x > WALKABLE.minX && p.x < WALKABLE.maxX && p.z > WALKABLE.minZ && p.z < WALKABLE.maxZ;
}

/** Trigger-zone centres, exported so the placement test reads one source. */
export const NO_GO_CENTRES: Array<{ id: string; x: number; z: number; radius: number }> = ZONES.map(
  (zone) => ({ id: zone.id, x: zone.x, z: zone.z, radius: zone.radius })
);
