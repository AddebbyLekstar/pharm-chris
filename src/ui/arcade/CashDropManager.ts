import * as THREE from 'three';

export interface CashDrop {
  mesh: THREE.Mesh;
  amount: number;
  position: THREE.Vector3;
  rotationSpeed: number;
  floatOffset: number;
}

export class CashDropManager {
  public group: THREE.Group;
  private drops: CashDrop[] = [];
  private bundleGeo: THREE.BoxGeometry;
  private bundleMat: THREE.MeshStandardMaterial;
  private pickupRadius: number = 2.2;

  constructor() {
    this.group = new THREE.Group();
    // Thick Nigerian Naira bundle (green stack with strap)
    this.bundleGeo = new THREE.BoxGeometry(0.45, 0.15, 0.28);
    this.bundleMat = new THREE.MeshStandardMaterial({
      color: 0x2e7d32,
      roughness: 0.3,
      metalness: 0.1,
    });
  }

  public get activeCashCount(): number {
    return this.drops.length;
  }

  public spawnCash(position: THREE.Vector3, amount: number): CashDrop {
    const mesh = new THREE.Mesh(this.bundleGeo, this.bundleMat);
    mesh.position.copy(position);
    mesh.castShadow = true;

    const drop: CashDrop = {
      mesh,
      amount,
      position: position.clone(),
      rotationSpeed: 2.0 + Math.random(),
      floatOffset: Math.random() * Math.PI * 2,
    };

    this.drops.push(drop);
    this.group.add(mesh);
    return drop;
  }

  public update(delta: number, playerPos: THREE.Vector3): number {
    let totalCollected = 0;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.floatOffset += delta * 4;
      drop.mesh.rotation.y += delta * drop.rotationSpeed;
      drop.mesh.position.y = drop.position.y + Math.sin(drop.floatOffset) * 0.08;

      // Distance to player
      const dx = playerPos.x - drop.mesh.position.x;
      const dz = playerPos.z - drop.mesh.position.z;
      const distSq = dx * dx + dz * dz;

      if (distSq <= this.pickupRadius * this.pickupRadius) {
        totalCollected += drop.amount;
        this.group.remove(drop.mesh);
        this.drops.splice(i, 1);
      }
    }

    return totalCollected;
  }

  public clear(): void {
    for (const drop of this.drops) {
      this.group.remove(drop.mesh);
    }
    this.drops = [];
  }
}
