import * as THREE from 'three';
import { ArcadeScene } from './ArcadeScene';

export interface CashDrop {
  mesh: THREE.Object3D;
  amount: number;
  position: THREE.Vector3;
  rotationSpeed: number;
  floatOffset: number;
  velocity: THREE.Vector3;
  isBursting: boolean;
  isAttracting: boolean;
  contactShadow?: THREE.Mesh;
}

export class CashDropManager {
  public group: THREE.Group;
  private drops: CashDrop[] = [];
  private bundleGeo: THREE.BoxGeometry;
  private strapGeo: THREE.BoxGeometry;
  private bundleMat: THREE.MeshStandardMaterial;
  private strapMat: THREE.MeshStandardMaterial;
  private pickupRadius: number = 2.4; // Spec 4.1: r_pickup = 2.4m

  constructor() {
    this.group = new THREE.Group();
    // Rich Nigerian Central Bank polymer green stack: Width 0.45, Height 0.14, Depth 0.28
    this.bundleGeo = new THREE.BoxGeometry(0.45, 0.14, 0.28);
    this.strapGeo = new THREE.BoxGeometry(0.46, 0.145, 0.10);

    this.bundleMat = new THREE.MeshStandardMaterial({
      color: 0x2e7d32,
      roughness: 0.30,
      metalness: 0.05,
    });
    this.strapMat = new THREE.MeshStandardMaterial({
      color: 0xfff9c4,
      roughness: 0.60,
    });
  }

  public get activeCashCount(): number {
    return this.drops.length;
  }

  public spawnCash(position: THREE.Vector3, amount: number, burst: boolean = true): CashDrop {
    const container = new THREE.Group();
    container.position.copy(position);

    // Polymer Naira bundle
    const bundleMesh = new THREE.Mesh(this.bundleGeo, this.bundleMat);
    bundleMesh.castShadow = true;
    container.add(bundleMesh);

    // Ivory paper currency belly-band
    const strapMesh = new THREE.Mesh(this.strapGeo, this.strapMat);
    container.add(strapMesh);

    // Small contact shadow beneath bundle
    const contactShadow = ArcadeScene.createContactShadow(0.26, 0.28);
    container.add(contactShadow);

    // Parabolic burst velocity or mild drift
    const velX = burst ? (Math.random() - 0.5) * 1.8 : 0;
    const velY = burst ? 2.6 + Math.random() * 1.2 : 0;
    const velZ = burst ? 0.6 + Math.random() * 1.4 : 0;

    const drop: CashDrop = {
      mesh: container,
      amount,
      position: position.clone(),
      rotationSpeed: 2.8, // Spec 4.1: 2.8 rad/s
      floatOffset: Math.random() * Math.PI * 2,
      velocity: new THREE.Vector3(velX, velY, velZ),
      isBursting: burst,
      isAttracting: false,
      contactShadow,
    };

    this.drops.push(drop);
    this.group.add(container);
    return drop;
  }

  public update(delta: number, playerPos: THREE.Vector3): number {
    let totalCollected = 0;
    const targetPos = new THREE.Vector3(playerPos.x, playerPos.y + 0.8, playerPos.z);

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      const meshPos = drop.mesh.position;

      // 1. Check distance to player
      const dx = playerPos.x - meshPos.x;
      const dz = playerPos.z - meshPos.z;
      const horizontalDist = Math.sqrt(dx * dx + dz * dz);
      const totalDist = meshPos.distanceTo(targetPos);

      // Immediate arrival / collection threshold
      if (horizontalDist <= 0.45 || totalDist <= 0.45) {
        totalCollected += drop.amount;
        this.group.remove(drop.mesh);
        this.drops.splice(i, 1);
        continue;
      }

      // 2. Parabolic Arc Burst phase
      if (drop.isBursting) {
        drop.velocity.y -= 9.8 * delta;
        meshPos.x += drop.velocity.x * delta;
        meshPos.y += drop.velocity.y * delta;
        meshPos.z += drop.velocity.z * delta;

        if (drop.contactShadow) {
          drop.contactShadow.position.y = -meshPos.y + 0.005;
        }

        if (meshPos.y <= 0.22) {
          meshPos.y = 0.22;
          drop.position.copy(meshPos);
          drop.isBursting = false;
          drop.velocity.set(0, 0, 0);
          if (drop.contactShadow) {
            drop.contactShadow.position.y = -0.215;
          }
        }
      } else if (horizontalDist <= this.pickupRadius) {
        // 3. Spec 4.1 Magnetic Attraction Curve (Vacuum to Chris)
        // Let distance ratio be d = ||P_player - P_cash|| / r_pickup
        const d = Math.max(0.01, totalDist / this.pickupRadius);
        const accelMag = 18.0 / (d + 0.1);

        const toPlayer = targetPos.clone().sub(meshPos).normalize();
        drop.velocity.addScaledVector(toPlayer, accelMag * delta);

        // Clamp maximum vacuum velocity to avoid astronomical overshoots
        drop.velocity.clampLength(0, 22.0);
        meshPos.addScaledVector(drop.velocity, delta);

        if (drop.contactShadow) {
          drop.contactShadow.scale.setScalar(Math.max(0.2, 1.0 - (meshPos.y / 2.0)));
        }

        // Check if arrival reached during magnetic vacuum step
        if (meshPos.distanceTo(targetPos) <= 0.4) {
          totalCollected += drop.amount;
          this.group.remove(drop.mesh);
          this.drops.splice(i, 1);
          continue;
        }
      } else {
        // 4. Spec 4.1 Idle Float: Floats 0.22m above ground with rotation 2.8 rad/s and sinusoidal bobbing ±0.08m
        drop.floatOffset += delta * 3.5;
        drop.mesh.rotation.y += delta * drop.rotationSpeed;
        meshPos.y = 0.22 + Math.sin(drop.floatOffset) * 0.08;

        if (drop.contactShadow) {
          const bobNorm = (Math.sin(drop.floatOffset) + 1) * 0.5;
          drop.contactShadow.scale.setScalar(0.9 + bobNorm * 0.2);
        }
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
