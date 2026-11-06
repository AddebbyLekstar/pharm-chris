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
  thetaX: number;
  omegaX: number;
  thetaZ: number;
  omegaZ: number;
  compression: number;
  omegaComp: number;
}

export class MedicineStack {
  public anchor: THREE.Group;
  public maxCapacity: number;
  private pool: BoxMeshPool;
  private items: StackEntry[] = [];
  private readonly boxSpacing = 0.24;

  // Spec 3.2 Spring-Damper parameters
  private readonly kSpring = 38.0;
  private readonly damping = 12.33; // 2 * sqrt(38.0)
  private lastVel = new THREE.Vector2(0, 0);

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

    this.items.push({
      product,
      mesh,
      thetaX: 0,
      omegaX: 0,
      thetaZ: 0,
      omegaZ: 0,
      compression: 0,
      omegaComp: 0,
    });
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

  /**
   * Spec 3.2 Critically Damped 2nd-Order Harmonic Spring Physics
   */
  public update(delta: number, moveVector?: THREE.Vector2): void {
    const dt = Math.max(0.001, Math.min(0.05, delta));
    const currentVel = moveVector ? moveVector.clone() : new THREE.Vector2(0, 0);

    // Acceleration: a = (v(t) - v(t - dt)) / dt
    const accel = new THREE.Vector2(
      (currentVel.x - this.lastVel.x) / dt,
      (currentVel.y - this.lastVel.y) / dt
    );
    this.lastVel.copy(currentVel);

    const speed = currentVel.length();
    const isMoving = speed > 0.001;

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      // Height multiplier: (1.0 + i * 0.35)
      const heightMult = 1.0 + i * 0.35;

      // Spec 3.2 Target angular deflection driven by negative acceleration & velocity lag
      // theta*_x driven by Z motion (dir.y in Vector2)
      // theta*_z driven by X motion (dir.x in Vector2)
      const driveZ = isMoving ? (currentVel.y * 0.22 + accel.y * 0.02) : (accel.y * 0.02);
      const driveX = isMoving ? (currentVel.x * 0.22 + accel.x * 0.02) : (accel.x * 0.02);

      const targetThetaX = -Math.max(-0.45, Math.min(0.45, driveZ)) * heightMult;
      const targetThetaZ = -Math.max(-0.45, Math.min(0.45, driveX)) * heightMult;

      // Harmonic Spring step for X tilt (pitch)
      const deltaThetaX = targetThetaX - item.thetaX;
      const accX = this.kSpring * deltaThetaX - this.damping * item.omegaX;
      item.omegaX += accX * dt;
      item.thetaX += item.omegaX * dt;

      // Harmonic Spring step for Z tilt (roll / sway)
      const deltaThetaZ = targetThetaZ - item.thetaZ;
      const accZ = this.kSpring * deltaThetaZ - this.damping * item.omegaZ;
      item.omegaZ += accZ * dt;
      item.thetaZ += item.omegaZ * dt;

      // Vertical compression under motion / acceleration
      const targetComp = isMoving ? Math.min(0.04, speed * 0.015 * (i / Math.max(1, this.items.length))) : 0;
      const deltaComp = targetComp - item.compression;
      const accComp = 45.0 * deltaComp - 13.4 * item.omegaComp;
      item.omegaComp += accComp * dt;
      item.compression += item.omegaComp * dt;

      // Apply rotations
      item.mesh.rotation.x = item.thetaX;
      item.mesh.rotation.z = item.thetaZ;

      // Spec 3.2 Lateral Offset Displacement (Curved Spine Effect)
      item.mesh.position.x = Math.sin(item.thetaZ) * (i * 0.08);
      item.mesh.position.z = -Math.sin(item.thetaX) * (i * 0.08);
      item.mesh.position.y = i * this.boxSpacing - Math.max(0, item.compression);
    }
  }

  public clear(): void {
    while (this.items.length > 0) {
      this.pop();
    }
  }
}
