import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHELF_BAYS } from './layout';
import { chamferBox } from './kit/geometry';
import { material, practical } from './kit/materials';
import { mergeRig } from './mergeMeshes';
import { Product } from '../../sim/types';
import { artVersion } from './art';
import { textures, shelfLabelAtlas, shelfLabelUV, medicineAtlas } from './textures';

export function normalizeCategory(cat: string): string {
  const c = (cat || '').toLowerCase().replace(/[^a-z]/g, '');
  if (c.includes('malar')) return 'antimalarial';
  if (c.includes('analges') || c.includes('pyret') || c.includes('pain')) return 'analgesic';
  if (c.includes('biotic')) return 'antibiotic';
  if (c.includes('cold') || c.includes('insul') || c.includes('bio')) return 'cold_chain';
  return 'analgesic';
}

export interface ShelfUnitConfig {
  category: string;
  label: string;
  color: string;
  position: THREE.Vector3;
  capacity: number;
}

export class PharmacyShelves3D {
  public group: THREE.Group;
  private stockLevels: Map<string, number> = new Map();
  // Positions come from the layout module: four bays, two per side wall.
  private shelfConfigs: ShelfUnitConfig[] = SHELF_BAYS.map((bay) => ({
    category: bay.category,
    label: bay.label,
    color: bay.color,
    position: new THREE.Vector3(bay.x, 0, bay.z),
    capacity: bay.category === 'cold_chain' ? 20 : 30,
  }));
  private displayBoxMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private capacity: number = 30;

  constructor(initialProducts?: Product[]) {
    this.group = new THREE.Group();
    void initialProducts; // the simulation owns stock; this class renders it

    const version = artVersion();
    const surf = version === 'v3' || version === 'v4' ? textures() : null;

    // Darker than the wall on purpose: at 0x1b4d3e the bays dissolved into a wall
    // of the same green and the room lost its only mid-ground layer.
    const tealSteelMat = new THREE.MeshStandardMaterial({
      color: surf ? 0x7c9b90 : 0x1b4d3e,
      roughness: surf ? 0.55 : 0.4,
      map: surf ? surf.steelTeal : null,
    });
    const woodShelfMat = new THREE.MeshStandardMaterial({
      color: surf ? 0xffffff : 0x5d4037,
      roughness: 0.7,
      map: surf ? surf.teak : null,
    });
    const fridgeMat = new THREE.MeshStandardMaterial({
      color: 0xddeeff,
      metalness: 0.25,
      roughness: 0.25,
    });
    for (const conf of this.shelfConfigs) this.stockLevels.set(conf.category, 5);

    // Every bay's frame goes into one root and is merged across bays: four separate
    // merges cost ~12 draw calls (and again in the shadow pass), one merge costs 3.
    const framesRoot = new THREE.Group();
    framesRoot.name = 'shelf-frames';
    // Shared so the four cold-chain glow panels merge with each other. The practical
    // material is the single definition of the fridge panel's emissive value: this
    // file used to carry its own 0.9 literal, which made the panel the brightest
    // thing in the room and disagreed with the lighting record.
    const fridgeGlowMat = practical('fridgePanel');

    // One atlas and one material for all four bay labels: per-bay canvases were
    // 4 MB of the boot and four separate texture binds for four lines of type.
    const labelAtlas = surf
      ? shelfLabelAtlas(this.shelfConfigs.map((c) => ({ text: c.label, background: c.color })))
      : null;
    const labelMat = labelAtlas
      ? new THREE.MeshStandardMaterial({
          map: labelAtlas,
          emissiveMap: labelAtlas,
          emissive: 0xffffff,
          emissiveIntensity: 0.18,
          roughness: 0.42,
          metalness: 0,
        })
      : null;

    const labelGeos: THREE.BufferGeometry[] = [];
    for (const conf of this.shelfConfigs) {
      const shelfBay = new THREE.Group();
      shelfBay.position.copy(conf.position);
      const isFridge = conf.category === 'cold_chain';
      // Every bay opens toward +z, the checkout side. This used to be inferred from
      // the bay's x sign ("left-hand units open right"), which built the two right
      // bays — antibiotics and the cold-chain unit — backwards: the solid back panel
      // and the label plate faced the aisle while the glass door, the glow panel and
      // the stock faced the wall. From the game camera the fridge showed its open
      // back and none of its light.
      const facing = 1;

      // Open frame, not a solid block. A closed 1.6 x 2.6 x 0.85 box reads as a
      // painted slab from any angle; five 7 cm panels and four tiers read as a
      // shelf you could take a box off.
      const W = 1.6;
      const H = 2.6;
      const D = 0.85;
      const T = 0.07;
      const panelMat: THREE.Material = isFridge ? fridgeMat : tealSteelMat;
      const shelfMat: THREE.Material = isFridge ? material('glass') : woodShelfMat;
      const part = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): void => {
        const m = new THREE.Mesh(chamferBox(w, h, d, 0.02), mat);
        // World position, not bay-local: the frame is merged with the other three.
        m.position.set(conf.position.x + x, y, conf.position.z + z);
        m.castShadow = true;
        m.receiveShadow = true;
        framesRoot.add(m);
      };
      part(T, H, D, -(W / 2 - T / 2), H / 2, 0, panelMat);
      part(T, H, D, W / 2 - T / 2, H / 2, 0, panelMat);
      part(W, H, T, 0, H / 2, -(D / 2 - T / 2), panelMat);
      part(W, T, D, 0, H - T / 2, 0, panelMat);
      part(W, 0.16, D, 0, 0.08, 0, panelMat);
      for (let tier = 0; tier < 4; tier++) {
        part(W - T * 2, 0.045, D - T, 0, 0.42 + tier * 0.55, 0, shelfMat);
      }

      // Cold chain: glass door on the aisle face and an emissive back panel instead
      // of a fifth point light. A point light per fridge would break the two-light
      // practical budget the whole phase is measured against.
      if (isFridge) {
        const door = new THREE.Mesh(chamferBox(W - T * 2, H - 0.35, 0.03, 0.01), material('glass'));
        door.position.set(conf.position.x, H / 2, conf.position.z + facing * (D / 2 - 0.02));
        framesRoot.add(door);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(W - T * 3, H - 0.5), fridgeGlowMat);
        // 2 cm clear of the solid back panel's inner face. The old offset put the
        // plane 5 mm inside the 7 cm panel, so the teal was drawn inside the cabinet
        // and the fridge read as a white box with stock in it.
        glow.position.set(conf.position.x, H / 2, conf.position.z - facing * (D / 2 - T - 0.02));
        glow.rotation.y = facing > 0 ? 0 : Math.PI;
        framesRoot.add(glow);
      }


      // Category header: a plate with the bay's colour and, when the surface pass is
      // on, real words. The eye finds labels before geometry.
      const plate = new THREE.Mesh(
        chamferBox(1.5, 0.3, 0.15, 0.02),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(conf.color), roughness: 0.4 })
      );
      plate.position.set(0, 2.72, facing * 0.45);
      shelfBay.add(plate);

      if (surf && labelAtlas && labelMat) {
        const cell = shelfLabelUV(Math.max(0, this.shelfConfigs.findIndex((c) => c.category === conf.category)));
        const geo = new THREE.PlaneGeometry(1.46, 0.28);
        const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(
            i,
            cell.u0 + uv.getX(i) * (cell.u1 - cell.u0),
            cell.v0 + uv.getY(i) * (cell.v1 - cell.v0)
          );
        }
        uv.needsUpdate = true;
        if (facing < 0) geo.rotateY(Math.PI);
        geo.translate(conf.position.x, 2.72, conf.position.z + facing * (0.45 + 0.079));
        labelGeos.push(geo);
      }

      // Stock: one InstancedMesh per bay, two rows deep and four tiers high.
      //
      // Three packs across on one shallow row read as a display model, not a shop
      // that has been stocked: 32 packs per bay, with per-instance tint and height,
      // is what makes the shelf read full from across the room while staying ONE
      // draw call. The front row is written first so updateVisuals() trims the back
      // row first as stock sells down.
      const COLS = 4;
      const TIERS = 4;
      const ROWS = 2;
      const total = COLS * TIERS * ROWS;
      const boxGeo = chamferBox(0.33, 0.2, 0.26, 0.015);
      // Each bay samples its own quadrant of ONE label atlas. The quadrant is baked
      // into this bay's UVs, not into a cloned texture: four texture clones meant
      // four GPU uploads of the same 1 MB image (5.3 MB each at 1024 with mips),
      // which alone put the phone 16 MB over its texture budget.
      const atlas = surf ? medicineAtlas() : null;
      const bayIndex = Math.max(0, this.shelfConfigs.findIndex((c) => c.category === conf.category));
      if (atlas) {
        const uv = boxGeo.getAttribute('uv') as THREE.BufferAttribute;
        const ou = (bayIndex % 2) * 0.5;
        const ov = bayIndex < 2 ? 0.5 : 0;
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, uv.getX(i) * 0.5 + ou, uv.getY(i) * 0.5 + ov);
        }
        uv.needsUpdate = true;
      }
      const boxMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.38,
        vertexColors: false,
        map: atlas,
      });
      const instanced = new THREE.InstancedMesh(boxGeo, boxMat, total);
      const matrix = new THREE.Matrix4();
      const tint = new THREE.Color();
      const white = new THREE.Color(0xffffff);
      const base = new THREE.Color(conf.color);
      let index = 0;
      for (let row = 0; row < ROWS; row++) {
        for (let tier = 0; tier < TIERS; tier++) {
          for (let col = 0; col < COLS; col++) {
            const xOffset = (col - (COLS - 1) / 2) * 0.36;
            const yOffset = 0.56 + tier * 0.55;
            const zOffset = facing * (0.17 - row * 0.34);
            const scaleY = 0.8 + ((tier * COLS + col + row) % 4) * 0.12;
            matrix.makeTranslation(xOffset, yOffset, zOffset);
            matrix.scale(new THREE.Vector3(0.94, scaleY, 0.92));
            instanced.setMatrixAt(index, matrix);
            // Bays read as their category colour, but never as a solid block of it.
            tint.copy(base).lerp(white, 0.52 + ((tier + col) % 3) * 0.14);
            instanced.setColorAt(index, tint);
            index++;
          }
        }
      }
      instanced.instanceMatrix.needsUpdate = true;
      if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
      instanced.castShadow = true;
      instanced.frustumCulled = false;
      shelfBay.add(instanced);
      this.displayBoxMeshes.set(conf.category, instanced);
      this.group.add(shelfBay);
    }

    mergeRig(framesRoot);
    this.group.add(framesRoot);

    // Four label quads, one draw: same geometry, same material, different UV cell.
    if (labelGeos.length && labelMat) {
      const merged = mergeGeometries(labelGeos, false);
      for (const geo of labelGeos) geo.dispose();
      if (merged) {
        const labels = new THREE.Mesh(merged, labelMat);
        labels.name = 'shelf-labels';
        this.group.add(labels);
      }
    }

    this.updateVisuals();
  }

  public getStock(category: string): number {
    const key = normalizeCategory(category);
    return this.stockLevels.get(key) ?? 0;
  }

  public getTotalStock(): number {
    let total = 0;
    for (const val of this.stockLevels.values()) {
      total += val;
    }
    return total;
  }

  /** View-only sync from the simulation (the economy owns the numbers). */
  public setStock(category: string, amount: number): void {
    const key = normalizeCategory(category);
    this.stockLevels.set(key, Math.max(0, amount));
    this.updateVisuals();
  }

  public setCapacity(capacity: number): void {
    this.capacity = Math.max(1, capacity);
    this.updateVisuals();
  }

  public addStock(category: string, amount: number = 1): void {
    const key = normalizeCategory(category);
    const current = this.getStock(key);
    this.stockLevels.set(key, current + amount);
    this.updateVisuals();
  }

  public consumeStock(category: string, amount: number = 1): boolean {
    const key = normalizeCategory(category);
    const current = this.getStock(key);
    if (current >= amount) {
      this.stockLevels.set(key, current - amount);
      this.updateVisuals();
      return true;
    }
    return false;
  }

  public getShelfPosition(category: string): THREE.Vector3 {
    const key = normalizeCategory(category);
    const conf = this.shelfConfigs.find((c) => c.category === key);
    return conf ? conf.position.clone() : new THREE.Vector3();
  }

  public updateVisuals(): void {
    for (const [cat, instanced] of this.displayBoxMeshes.entries()) {
      const stock = this.getStock(cat);
      // Any stock on the bay should read as stock. Stock is visualised on a square
      // root curve so a half-full shelf looks half full, and a working shelf never
      // looks bare.
      const ratio = Math.min(1, stock / Math.max(6, this.capacity));
      const packed = instanced.instanceMatrix.count;
      // A glass fridge with nothing behind the door reads as broken, not as sold out,
      // so the cold-chain bay never drops below a quarter of its facings.
      const floor = cat === 'cold_chain' ? Math.round(packed / 4) : 0;
      const count = stock <= 0 ? floor : Math.max(Math.round(packed / 2), Math.ceil(Math.sqrt(ratio) * packed), floor);
      instanced.count = Math.min(packed, count);
    }
  }
}
