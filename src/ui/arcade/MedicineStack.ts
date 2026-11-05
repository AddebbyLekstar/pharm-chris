import * as THREE from 'three';
import { Product } from '../../sim/types';
import { BoxMeshPool } from './BoxMeshPool';
import { normalizeCategory } from './PharmacyShelves3D';

export interface MedicineStackOptions {
  anchor: THREE.Group;
  maxCapacity?: number;
  pool?: BoxMeshPool;
}

interface StackEntry {
  product: Product;
  mesh: THREE.Mesh;
}

export class MedicineStack {
  public anchor: THREE.Group;
  public maxCapacity: number;
  private pool: BoxMeshPool;
  private items: StackEntry[] = [];
  private readonly boxSpacing = 0.24;

  // Sway physics
  private currentSwayX: number = 0;
  private currentSwayZ: number = 0;
  private targetSwayX: number = 0;
  private targetSwayZ: number = 0;

  constructor(options: MedicineStackOptions) {
    this.anchor = options.anchor;
    this.maxCapacity = options.maxCapacity ?? 5;
    this.pool = options.pool ?? new BoxMeshPool(15);
  }

  public get count(): number {
    return this.items.length;
  }

  public push(product: Product): boolean {
    if (this.items.length >= this.maxCapacity) {
      return false;
    }

    const color = product.pixelColor || product.category;
    const mesh = this.pool.acquire(color);
    const index = this.items.length;

    mesh.position.set(0, index * this.boxSpacing, 0);
    mesh.rotation.set(0, 0, 0);
    this.anchor.add(mesh);

    this.items.push({ product, mesh });
    return true;
  }

  public pop(): Product | null {
    if (this.items.length === 0) {
      return null;
    }

    const entry = this.items.pop()!;
    this.pool.release(entry.mesh);
    return entry.product;
  }

  public popMatching(category: string): Product | null {
    const targetCat = normalizeCategory(category);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const entry = this.items[i];
      const prodCat = entry.product.isColdChain ? 'cold_chain' : normalizeCategory(entry.product.category);
      if (prodCat === targetCat) {
        this.items.splice(i, 1);
        this.pool.release(entry.mesh);
        this.repositionItems();
        return entry.product;
      }
    }
    return null;
  }

  private repositionItems(): void {
    for (let i = 0; i < this.items.length; i++) {
      this.items[i].mesh.position.set(0, i * this.boxSpacing, 0);
    }
  }

  public peek(): Product | null {
    if (this.items.length === 0) return null;
    return this.items[this.items.length - 1].product;
  }

  public getAllProducts(): Product[] {
    return this.items.map((entry) => entry.product);
  }

  public getMeshes(): THREE.Mesh[] {
    return this.items.map((entry) => entry.mesh);
  }

  public update(delta: number, moveVector?: THREE.Vector2): void {
    if (moveVector && moveVector.lengthSq() > 0.001) {
      this.targetSwayX = -moveVector.x * 0.22;
      this.targetSwayZ = -moveVector.y * 0.22;
    } else {
      this.targetSwayX = 0;
      this.targetSwayZ = 0;
    }

    // Spring lerp to target sway
    const lerpRate = Math.min(1, delta * 12);
    this.currentSwayX += (this.targetSwayX - this.currentSwayX) * lerpRate;
    this.currentSwayZ += (this.targetSwayZ - this.currentSwayZ) * lerpRate;

    for (let i = 0; i < this.items.length; i++) {
      const mesh = this.items[i].mesh;
      const heightFactor = (i + 1) * 0.35;
      mesh.rotation.z = this.currentSwayX * heightFactor;
      mesh.rotation.x = this.currentSwayZ * heightFactor;
      mesh.position.x = Math.sin(this.currentSwayX) * (i * 0.05);
      mesh.position.z = Math.sin(this.currentSwayZ) * (i * 0.05);
    }
  }

  public clear(): void {
    while (this.items.length > 0) {
      this.pop();
    }
  }
}
