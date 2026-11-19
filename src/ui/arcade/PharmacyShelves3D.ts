import * as THREE from 'three';
import { SHELF_BAYS } from './layout';
import { chamferBox } from './kit/geometry';
import { material } from './kit/materials';
import { mergeRig } from './mergeMeshes';
import { Product } from '../../sim/types';
import { artVersion } from './art';
import { textures, signage } from './textures';

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

    for (const conf of this.shelfConfigs) {
      const shelfBay = new THREE.Group();
      shelfBay.position.copy(conf.position);
      const isFridge = conf.category === 'cold_chain';
      const facing = conf.position.x < 0 ? 1 : -1; // +z is the aisle side

      // Open frame, not a solid block. A closed 1.6 x 2.6 x 0.85 box reads as a
      // painted slab from any angle; five 7 cm panels and four tiers read as a
      // shelf you could take a box off.
      const frame = new THREE.Group();
      const W = 1.6;
      const H = 2.6;
      const D = 0.85;
      const T = 0.07;
      const panelMat: THREE.Material = isFridge ? fridgeMat : tealSteelMat;
      const shelfMat: THREE.Material = isFridge ? material('glass') : woodShelfMat;
      const part = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): void => {
        const m = new THREE.Mesh(chamferBox(w, h, d, 0.02), mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        m.receiveShadow = true;
        frame.add(m);
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
        door.position.set(0, H / 2, facing * (D / 2 - 0.02));
        frame.add(door);
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(W - T * 3, H - 0.5),
          new THREE.MeshStandardMaterial({ color: 0x9fe8ef, emissive: 0x2e8b8b, emissiveIntensity: 0.9, roughness: 0.6 })
        );
        glow.position.set(0, H / 2, -facing * (D / 2 - T - 0.005));
        glow.rotation.y = facing > 0 ? 0 : Math.PI;
        frame.add(glow);
      }

      mergeRig(frame);
      shelfBay.add(frame);

      // Category header: a plate with the bay's colour and, when the surface pass is
      // on, real words. The eye finds labels before geometry.
      const plate = new THREE.Mesh(
        chamferBox(1.5, 0.3, 0.15, 0.02),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(conf.color), roughness: 0.4 })
      );
      plate.position.set(0, 2.72, facing * 0.45);
      shelfBay.add(plate);

      if (surf) {
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(1.46, 0.28),
          new THREE.MeshStandardMaterial({
            map: signage(conf.label, conf.color),
            roughness: 0.42,
            metalness: 0.0,
            emissive: new THREE.Color(conf.color).multiplyScalar(0.18),
          })
        );
        face.position.set(0, 2.72, facing * (0.45 + 0.079));
        if (facing < 0) face.rotation.y = Math.PI;
        shelfBay.add(face);
      }

      // Stock: one InstancedMesh per bay. Per-instance colour and height so a bay
      // reads as packs of medicine, not as a row of identical tiles.
      const boxGeo = chamferBox(0.42, 0.24, 0.3, 0.02);
      const boxMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.35,
        vertexColors: false,
      });
      const instanced = new THREE.InstancedMesh(boxGeo, boxMat, 12);
      const matrix = new THREE.Matrix4();
      const tint = new THREE.Color();
      const base = new THREE.Color(conf.color);
      let index = 0;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 3; c++) {
          const xOffset = (c - 1) * 0.44;
          const yOffset = 0.55 + r * 0.55;
          const zOffset = facing * 0.18;
          const scaleY = 0.75 + ((r * 3 + c) % 4) * 0.12;
          matrix.makeTranslation(xOffset, yOffset, zOffset);
          matrix.scale(new THREE.Vector3(0.92, scaleY, 0.9));
          instanced.setMatrixAt(index, matrix);
          tint.copy(base).lerp(new THREE.Color(0xffffff), 0.45 + ((r + c) % 3) * 0.12);
          instanced.setColorAt(index, tint);
          index++;
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
      const count = stock <= 0 ? 0 : Math.max(6, Math.min(12, Math.ceil(Math.sqrt(ratio) * 12)));
      instanced.count = count;
    }
  }
}
