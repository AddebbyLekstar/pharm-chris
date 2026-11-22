import * as THREE from 'three';
import { characterSprite } from './charSprite';
import type { CharacterLook } from './look';
import type { ArcadeCustomer } from '../ArcadeCustomer';

/**
 * The crowd as one illustrated texture, not a pile of geometry.
 *
 * `charSprite` is the approved look, but as DOM it cannot depth-sort against a
 * shelf: every sprite is painted over the canvas. This module rasterises each
 * distinct `CharacterLook` once into a single atlas and draws every customer as a
 * camera-facing quad from one merged geometry — one draw call for the bodies and a
 * second for their contact shadows.
 *
 * Why a merged BufferGeometry rather than an InstancedMesh: an instanced mesh needs
 * a per-instance UV offset to pick a cell, which means a custom shader and an
 * instanced attribute that `MeshBasicMaterial` does not understand. Six quads are
 * 24 vertices; rewriting them each frame costs nothing and keeps the material
 * completely stock, which is what makes the alpha-test/depth behaviour predictable.
 *
 * The quads are alpha-tested, never blended. A blended quad is sorted by its
 * centre and would draw over a shelf it is standing behind; `alphaTest` writes
 * depth like any opaque surface, so the sprite occludes and is occluded correctly.
 */

export type CustomerArtMode = 'rig' | 'sprites';

/** `?art=sprites` opts the crowd into the atlas; anything else keeps the 3D rig. */
export function parseCustomerArtMode(search?: string): CustomerArtMode {
  const query = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const value = new URLSearchParams(query).get('art');
  return (value ?? '').toLowerCase() === 'sprites' ? 'sprites' : 'rig';
}

export function customerArtMode(): CustomerArtMode {
  return parseCustomerArtMode();
}

/**
 * 128 x 256, i.e. exactly 2x the 64 x 128 authoring box.
 *
 * A phone at DPR 2 shows an 80 CSS-px character as 160 device px, and the camera
 * can zoom in one notch on a wide screen; 256 px of height leaves headroom without
 * paying for the 512 px a 4x atlas would need. The cell is 1:2 rather than square
 * because the figure is 1:2 — a square cell either squashes the drawing or clips
 * the feet, and the spike's 128-square canvas did both.
 */
export const ATLAS_CELL_W = 128;
export const ATLAS_CELL_H = 256;
export const ATLAS_COLUMNS = 8;

/**
 * Fixed row count, allocated up front.
 *
 * This was the bug: UVs are derived from `rowCount`, and a canvas that grew from
 * one row to three left every earlier quad with a full-height UV. Each customer then
 * sampled a stretched slice across several cells — a solid colour patch where the
 * face should be. A fixed grid means a cell's UV never depends on when it was
 * painted.
 */
export const ATLAS_ROWS = 4;

/**
 * The grid is the budget: 32 cells, not an arbitrary 16.
 *
 * The old cap was half the texture and overflow silently returned cell 0, so the
 * seventeenth distinct person in a rush was drawn as the first — a queue of clones
 * with different names. Preloading the roster and holding a full queue is well
 * inside 32, so nothing is reused until every cell is genuinely taken.
 */
export const ATLAS_MAX_LOOKS = ATLAS_COLUMNS * ATLAS_ROWS;

/** The SVG's feet sit on y = 124 of a 128-tall box. */
const ART_BOX_H = 128;
const ART_FEET_Y = 124;
/** Eye-to-hair height of the rig, used by the symptom bubble too. */
export const SPRITE_WORLD_HEIGHT = 2.02;

export interface AtlasCell {
  key: string;
  index: number;
  column: number;
  row: number;
}

export interface AtlasUv {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Stable identity for a look: two customers with the same person share a cell. */
export function lookKey(look: CharacterLook): string {
  return [
    look.skin,
    look.top,
    look.bottom,
    look.accent,
    look.hairColor,
    look.outfit,
    look.hair,
    look.headpiece ?? '-',
    look.build,
    look.height,
    look.beard ? look.beardStyle : '-',
    look.glasses ? 1 : 0,
    look.bag ? 1 : 0,
    // The face and the stance are drawn, so they are part of the identity. Omitting
    // them let two customers who differed only in jaw, brows or lean share one cell —
    // which silently undid the individual-faces pass in sprite mode.
    look.face.headShape,
    look.face.eyeSpacing,
    look.face.browWeight,
    look.face.mouth,
    look.face.cheek,
    look.face.age,
    look.posture.shoulderTilt,
    look.posture.headTilt,
    look.posture.armOut,
  ].join('|');
}

/**
 * Cell allocation is pure and synchronous, so it is testable without a DOM.
 * Rasterisation is a separate, fire-and-forget step that only runs where a
 * canvas exists.
 */
export class SpriteAtlas {
  public readonly columns = ATLAS_COLUMNS;
  public readonly cellWidth = ATLAS_CELL_W;
  public readonly cellHeight = ATLAS_CELL_H;
  public readonly texture: THREE.Texture;

  private rowCount = ATLAS_ROWS;
  private readonly cellsByKey = new Map<string, AtlasCell>();
  private readonly ordered: AtlasCell[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly painting = new Set<string>();

  constructor() {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = this.columns * ATLAS_CELL_W;
      canvas.height = ATLAS_ROWS * ATLAS_CELL_H;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
      }
    }

    if (this.canvas) {
      const texture = new THREE.CanvasTexture(this.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      // No mipmaps: an atlas cell has no gutter, so a lower mip blends the
      // neighbouring customer's clothing into the edge of this one.
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      this.texture = texture;
    } else {
      // Node / no-DOM: the layout and geometry still exist, there is just nothing
      // to paint. Keeping the same class means the tests exercise the real object.
      const data = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      data.colorSpace = THREE.SRGBColorSpace;
      data.needsUpdate = true;
      this.texture = data;
    }
  }

  public get rows(): number {
    return this.rowCount;
  }

  public get cellCount(): number {
    return this.ordered.length;
  }

  public get cells(): readonly AtlasCell[] {
    return this.ordered;
  }

  public cell(key: string): AtlasCell | undefined {
    return this.cellsByKey.get(key);
  }

  public uv(cell: AtlasCell): AtlasUv {
    const u0 = cell.column / this.columns;
    const u1 = (cell.column + 1) / this.columns;
    const v1 = 1 - cell.row / this.rowCount;
    const v0 = 1 - (cell.row + 1) / this.rowCount;
    return { u0, v0, u1, v1 };
  }

  /** Register a look and start rasterising it. Idempotent by look key. */
  public register(key: string, look: CharacterLook): AtlasCell {
    const existing = this.cellsByKey.get(key);
    if (existing) return existing;

    if (this.ordered.length >= ATLAS_MAX_LOOKS && this.ordered.length > 0) {
      // Out of cells: reuse the first rather than resize the texture on a live
      // frame. The roster plus a featured queue is well under this cap.
      return this.ordered[0];
    }

    const index = this.ordered.length;
    const cell: AtlasCell = {
      key,
      index,
      column: index % this.columns,
      row: Math.floor(index / this.columns),
    };
    this.cellsByKey.set(key, cell);
    this.ordered.push(cell);
    this.ensureRows(cell.row + 1);
    this.paint(key, look, cell);
    return cell;
  }

  public preload(look: CharacterLook): AtlasCell {
    return this.register(lookKey(look), look);
  }

  private ensureRows(_rows: number): void {
    // Grid is preallocated at ATLAS_ROWS; kept as a no-op so callers stay simple.
  }

  private paint(key: string, look: CharacterLook, cell: AtlasCell): void {
    if (!this.ctx || this.images.has(key) || this.painting.has(key)) return;
    this.painting.add(key);
    const { svg } = characterSprite(look, { width: ATLAS_CELL_W, shadow: false });
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      this.painting.delete(key);
      this.images.set(key, image);
      this.drawCell(cell, image);
    };
    image.onerror = () => {
      this.painting.delete(key);
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  private drawCell(cell: AtlasCell, image: HTMLImageElement): void {
    if (!this.ctx) return;
    this.ctx.clearRect(cell.column * ATLAS_CELL_W, cell.row * ATLAS_CELL_H, ATLAS_CELL_W, ATLAS_CELL_H);
    this.ctx.drawImage(image, cell.column * ATLAS_CELL_W, cell.row * ATLAS_CELL_H, ATLAS_CELL_W, ATLAS_CELL_H);
    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    this.texture.dispose();
  }
}

interface BatchSlot {
  customer: ArcadeCustomer;
  cell: AtlasCell;
}

const right = new THREE.Vector3();
const up = new THREE.Vector3();
const back = new THREE.Vector3();
const upAxis = new THREE.Vector3();
const bottom = new THREE.Vector3();
const bl = new THREE.Vector3();
const br = new THREE.Vector3();
const tl = new THREE.Vector3();
const tr = new THREE.Vector3();

const shadowTexture = (): THREE.Texture => {
  if (typeof document === 'undefined') {
    const data = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    data.needsUpdate = true;
    return data;
  }
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,0.9)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.5)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export class SpriteBatch {
  public readonly group: THREE.Group;
  public readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  public readonly shadowMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  public readonly material: THREE.MeshBasicMaterial;
  public readonly shadowMaterial: THREE.MeshBasicMaterial;
  public readonly atlas: SpriteAtlas;

  private readonly capacity: number;
  private readonly slots: BatchSlot[] = [];
  private readonly indexGeometry: THREE.BufferGeometry;

  constructor(capacity = 16) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.atlas = new SpriteAtlas();
    this.group = new THREE.Group();
    this.group.name = 'customer-sprites';

    const quads = this.capacity;
    const positions = new Float32Array(quads * 4 * 3);
    const uvs = new Float32Array(quads * 4 * 2);
    const indices = new Uint16Array(quads * 6);
    for (let i = 0; i < quads; i++) {
      const v = i * 4;
      const o = i * 6;
      indices[o] = v;
      indices[o + 1] = v + 1;
      indices[o + 2] = v + 2;
      indices[o + 3] = v + 2;
      indices[o + 4] = v + 1;
      indices[o + 5] = v + 3;
    }

    this.indexGeometry = new THREE.BufferGeometry();
    this.indexGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.indexGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage));
    this.indexGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.indexGeometry.setDrawRange(0, 0);

    this.material = new THREE.MeshBasicMaterial({
      map: this.atlas.texture,
      alphaTest: 0.5,
      transparent: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
      // The SVG palette is the approved look; ACES would desaturate it against
      // the lit room it is standing in.
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(this.indexGeometry, this.material);
    this.mesh.name = 'customer-sprite-batch';
    // Vertex positions move every frame; three would cull against stale bounds.
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.group.add(this.mesh);

    const shadowPositions = new Float32Array(quads * 4 * 3);
    const shadowUvs = new Float32Array(quads * 4 * 2);
    for (let i = 0; i < quads; i++) {
      const v = i * 4;
      const uv = v * 2;
      shadowUvs[uv] = 0;
      shadowUvs[uv + 1] = 1;
      shadowUvs[uv + 2] = 1;
      shadowUvs[uv + 3] = 1;
      shadowUvs[uv + 4] = 0;
      shadowUvs[uv + 5] = 0;
      shadowUvs[uv + 6] = 1;
      shadowUvs[uv + 7] = 0;
    }
    const shadowGeometry = new THREE.BufferGeometry();
    shadowGeometry.setAttribute('position', new THREE.BufferAttribute(shadowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    shadowGeometry.setAttribute('uv', new THREE.BufferAttribute(shadowUvs, 2));
    shadowGeometry.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
    shadowGeometry.setDrawRange(0, 0);

    this.shadowMaterial = new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeometry, this.shadowMaterial);
    this.shadowMesh.name = 'customer-sprite-shadows';
    this.shadowMesh.frustumCulled = false;
    this.shadowMesh.renderOrder = 1;
    this.group.add(this.shadowMesh);
  }

  /** Quads currently drawn. One per customer, including ones walking out. */
  public get quadCount(): number {
    return this.slots.length;
  }

  /** One sprite mesh plus one shadow mesh — the crowd's whole draw cost. */
  public get meshCount(): number {
    return 2;
  }

  public preload(look: CharacterLook): void {
    this.atlas.preload(look);
  }

  /** Add, drop and re-cell from the live queue. Idempotent. */
  public sync(customers: readonly ArcadeCustomer[]): void {
    const live = new Set(customers);
    for (let i = this.slots.length - 1; i >= 0; i--) {
      if (!live.has(this.slots[i].customer)) this.slots.splice(i, 1);
    }
    const present = new Set(this.slots.map((slot) => slot.customer));
    for (const customer of customers) {
      if (present.has(customer)) continue;
      if (this.slots.length >= this.capacity) break;
      const cell = this.atlas.register(lookKey(customer.look), customer.look);
      this.slots.push({ customer, cell });
    }
  }

  /**
   * Place every quad for this camera.
   *
   * The quad's height is the rig height in world metres, and its bottom edge sits
   * `feetPad` below the customer's feet so the SVG's foot line (y = 124 of 128)
   * lands exactly on the floor. A billboard of world height H seen by a
   * perspective camera projects to the same pixels as a 3D figure of height H, so
   * distance scaling is the projection's, not an approximation.
   */
  public update(camera: THREE.Camera): void {
    const count = this.slots.length;
    this.mesh.geometry.setDrawRange(0, count * 6);
    this.shadowMesh.geometry.setDrawRange(0, count * 6);
    if (count === 0) return;

    camera.updateMatrixWorld();
    camera.matrixWorld.extractBasis(right, up, back);

    const position = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const uv = this.mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const shadowPosition = this.shadowMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = position.array as Float32Array;
    const uvs = uv.array as Float32Array;
    const shadowPositions = shadowPosition.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const { customer, cell } = this.slots[i];
      const height = SPRITE_WORLD_HEIGHT * customer.look.height;
      const halfWidth = height * (ATLAS_CELL_W / ATLAS_CELL_H) * 0.5;
      const feetPad = height * ((ART_BOX_H - ART_FEET_Y) / ART_BOX_H);

      // Walk sway: the rig body leans in the view plane, feet stay planted.
      const lean = customer.rig.body.rotation.z;
      upAxis.copy(up).multiplyScalar(Math.cos(lean)).addScaledVector(right, Math.sin(lean));

      bottom.copy(customer.mesh.position).addScaledVector(upAxis, -feetPad);
      bl.copy(bottom).addScaledVector(right, -halfWidth);
      br.copy(bottom).addScaledVector(right, halfWidth);
      tl.copy(bl).addScaledVector(upAxis, height);
      tr.copy(br).addScaledVector(upAxis, height);

      const p = i * 12;
      positions[p] = bl.x;
      positions[p + 1] = bl.y;
      positions[p + 2] = bl.z;
      positions[p + 3] = br.x;
      positions[p + 4] = br.y;
      positions[p + 5] = br.z;
      positions[p + 6] = tl.x;
      positions[p + 7] = tl.y;
      positions[p + 8] = tl.z;
      positions[p + 9] = tr.x;
      positions[p + 10] = tr.y;
      positions[p + 11] = tr.z;

      const bounds = this.atlas.uv(cell);
      const flipped = Math.abs(customer.mesh.rotation.y) > Math.PI / 2;
      const u0 = flipped ? bounds.u1 : bounds.u0;
      const u1 = flipped ? bounds.u0 : bounds.u1;
      const q = i * 8;
      uvs[q] = u0;
      uvs[q + 1] = bounds.v0;
      uvs[q + 2] = u1;
      uvs[q + 3] = bounds.v0;
      uvs[q + 4] = u0;
      uvs[q + 5] = bounds.v1;
      uvs[q + 6] = u1;
      uvs[q + 7] = bounds.v1;

      // Contact shadow: the same 0.48 m disc the rig used, softened by the walk bob.
      const bob = customer.rig.body.position.y;
      const radius = 0.48 * Math.max(0.7, 1 - bob * 0.25);
      const s = i * 12;
      const x = customer.mesh.position.x;
      const z = customer.mesh.position.z;
      const y = 0.006;
      shadowPositions[s] = x - radius;
      shadowPositions[s + 1] = y;
      shadowPositions[s + 2] = z - radius;
      shadowPositions[s + 3] = x + radius;
      shadowPositions[s + 4] = y;
      shadowPositions[s + 5] = z - radius;
      shadowPositions[s + 6] = x - radius;
      shadowPositions[s + 7] = y;
      shadowPositions[s + 8] = z + radius;
      shadowPositions[s + 9] = x + radius;
      shadowPositions[s + 10] = y;
      shadowPositions[s + 11] = z + radius;
    }

    position.needsUpdate = true;
    uv.needsUpdate = true;
    shadowPosition.needsUpdate = true;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.shadowMesh.geometry.dispose();
    this.material.dispose();
    this.shadowMaterial.dispose();
    this.atlas.dispose();
  }
}
