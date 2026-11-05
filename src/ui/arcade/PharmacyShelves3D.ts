import * as THREE from 'three';
import { Product } from '../../sim/types';
import { ArcadeScene } from './ArcadeScene';

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
  private displayBoxMeshes: Map<string, THREE.Mesh[]> = new Map();

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
    const rackMat = new THREE.MeshStandardMaterial({
      color: 0x423832, // Dark walnut wood shelving
      roughness: 0.6,
    });
    const fridgeMat = new THREE.MeshStandardMaterial({
      color: 0xddeeff,
      metalness: 0.2,
      roughness: 0.3,
    });

    for (const conf of this.shelfConfigs) {
      const shelfBay = new THREE.Group();
      shelfBay.position.copy(conf.position);

      const isFridge = conf.category === 'cold_chain';
      const bodyGeo = new THREE.BoxGeometry(1.6, 2.6, 1.0);
      const bodyMesh = new THREE.Mesh(bodyGeo, isFridge ? fridgeMat : rackMat);
      bodyMesh.position.y = 1.3;
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      shelfBay.add(bodyMesh);

      // Grounded contact shadow beneath shelf bay
      const shelfShadow = ArcadeScene.createContactShadow(0.85, 0.35);
      shelfShadow.scale.set(1.15, 0.8, 1);
      shelfBay.add(shelfShadow);

      // Category Header Label plate
      const plateGeo = new THREE.BoxGeometry(1.5, 0.3, 0.15);
      const plateMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(conf.color),
        roughness: 0.4,
      });
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.set(0, 2.7, conf.position.x < 0 ? 0.5 : -0.5);
      shelfBay.add(plate);

      // Display boxes array
      const boxGeo = new THREE.BoxGeometry(0.35, 0.18, 0.24);
      const boxMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(conf.color),
        roughness: 0.4,
      });

      const boxList: THREE.Mesh[] = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const box = new THREE.Mesh(boxGeo, boxMat);
          const xOffset = (c - 1) * 0.42;
          const yOffset = 0.6 + r * 0.65;
          const zOffset = conf.position.x < 0 ? 0.35 : -0.35;
          box.position.set(xOffset, yOffset, zOffset);
          shelfBay.add(box);
          boxList.push(box);
        }
      }
      this.displayBoxMeshes.set(conf.category, boxList);
      this.group.add(shelfBay);
    }

    this.updateVisuals();
  }

  public getStock(category: string): number {
    const key = normalizeCategory(category);
    return this.stockLevels.get(key) ?? 0;
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
    for (const [cat, boxes] of this.displayBoxMeshes.entries()) {
      const stock = this.getStock(cat);
      const visibleCount = Math.min(boxes.length, Math.ceil((stock / 15) * boxes.length));
      for (let i = 0; i < boxes.length; i++) {
        boxes[i].visible = i < visibleCount;
      }
    }
  }
}
