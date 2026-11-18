import * as THREE from 'three';
import { Product } from '../../sim/types';

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
  private shelfConfigs: ShelfUnitConfig[] = [
    {
      category: 'antimalarial',
      label: 'ANTIMALARIALS',
      color: '#E53935',
      position: new THREE.Vector3(-6.2, 0, -4.5),
      capacity: 30,
    },
    {
      category: 'analgesic',
      label: 'ANALGESICS',
      color: '#43A047',
      position: new THREE.Vector3(-6.2, 0, 0.5),
      capacity: 30,
    },
    {
      category: 'antibiotic',
      label: 'ANTIBIOTICS',
      color: '#1E88E5',
      position: new THREE.Vector3(6.2, 0, -4.5),
      capacity: 30,
    },
    {
      category: 'cold_chain',
      label: 'COLD CHAIN / INSULIN',
      color: '#00ACC1',
      position: new THREE.Vector3(6.2, 0, 0.5),
      capacity: 20,
    },
  ];
  private displayBoxMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private capacity: number = 30;

  constructor(initialProducts?: Product[]) {
    this.group = new THREE.Group();

    for (const conf of this.shelfConfigs) {
      this.stockLevels.set(conf.category, 5);
    }

    if (initialProducts) {
      for (const p of initialProducts) {
        const cat = p.isColdChain ? 'cold_chain' : normalizeCategory(p.category);
        const current = this.stockLevels.get(cat) ?? 0;
        this.stockLevels.set(cat, current + Math.min(4, p.defaultStock));
      }
    }

    this.buildShelvingUnits();
  }

  private buildShelvingUnits(): void {
    // Spec 2.3: Powder-coated forest teal steel uprights + warm wood shelves
    const tealSteelMat = new THREE.MeshStandardMaterial({
      color: 0x1b4d3e,
      roughness: 0.40,
    });
    const woodShelfMat = new THREE.MeshStandardMaterial({
      color: 0x5d4037,
      roughness: 0.70,
    });
    // Spec 2.3: Cold Chain Refrigerator Bay (0xDDEEFF, metalness 0.25, roughness 0.25)
    const fridgeMat = new THREE.MeshStandardMaterial({
      color: 0xddeeff,
      metalness: 0.25,
      roughness: 0.25,
    });

    for (const conf of this.shelfConfigs) {
      const shelfBay = new THREE.Group();
      shelfBay.position.copy(conf.position);

      const isFridge = conf.category === 'cold_chain';
      const bodyGeo = new THREE.BoxGeometry(1.6, 2.6, 0.85);
      const bodyMesh = new THREE.Mesh(bodyGeo, isFridge ? fridgeMat : tealSteelMat);
      bodyMesh.position.y = 1.3;
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      shelfBay.add(bodyMesh);

      // Add warm wood tiers if not fridge
      if (!isFridge) {
        for (let tier = 0; tier < 4; tier++) {
          const tierGeo = new THREE.BoxGeometry(1.5, 0.05, 0.8);
          const tierMesh = new THREE.Mesh(tierGeo, woodShelfMat);
          tierMesh.position.set(0, 0.45 + tier * 0.55, 0);
          shelfBay.add(tierMesh);
        }
      } else {
        // Spec 2.3: Cold chain internal blue LED backlight
        const fridgeLight = new THREE.PointLight(0x00e5ff, 0.8, 4.0, 1.2);
        fridgeLight.position.set(0, 1.4, conf.position.x < 0 ? 0.4 : -0.4);
        shelfBay.add(fridgeLight);
      }


      // Category Header Label plate
      const plateGeo = new THREE.BoxGeometry(1.5, 0.3, 0.15);
      const plateMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(conf.color),
        roughness: 0.4,
      });
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.set(0, 2.7, conf.position.x < 0 ? 0.5 : -0.5);
      shelfBay.add(plate);

      // Display boxes: one InstancedMesh per bay (9 draws -> 1 draw per bay).
      const boxGeo = new THREE.BoxGeometry(0.42, 0.24, 0.3);
      // Product packs are a lighter tint of the bay colour so they read as stock
      // against the dark steel, not as part of the fixture.
      const boxMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(conf.color).lerp(new THREE.Color(0xffffff), 0.55),
        roughness: 0.35,
        emissive: new THREE.Color(conf.color).multiplyScalar(0.12),
      });
      const instanced = new THREE.InstancedMesh(boxGeo, boxMat, 12);
      const matrix = new THREE.Matrix4();
      let index = 0;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 3; c++) {
          const xOffset = (c - 1) * 0.42;
          const yOffset = 0.55 + r * 0.55;
          // Sit the packs proud of the body face, otherwise they are inside the box.
          const zOffset = conf.position.x < 0 ? 0.56 : -0.56;
          matrix.makeTranslation(xOffset, yOffset, zOffset);
          instanced.setMatrixAt(index++, matrix);
        }
      }
      instanced.instanceMatrix.needsUpdate = true;
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
