import * as THREE from 'three';

export interface FloorUpgradePadConfig {
  id: string;
  title: string;
  cost: number;
  position: THREE.Vector3;
  radius?: number;
}

export class FloorUpgradePad {
  public id: string;
  public title: string;
  public cost: number;
  public position: THREE.Vector3;
  public radius: number;
  public progress: number = 0; // 0 to 1
  public isUnlocked: boolean = false;
  public onPurchased?: () => void;

  public mesh: THREE.Group;
  private baseMesh: THREE.Mesh;
  private progressMesh: THREE.Mesh;
  private pulseTimer: number = 0;
  private readonly chargeDuration: number = 1.2; // seconds to fill

  constructor(config: FloorUpgradePadConfig) {
    this.id = config.id;
    this.title = config.title;
    this.cost = config.cost;
    this.position = config.position;
    this.radius = config.radius ?? 1.5;

    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.position);

    // Base circle
    const baseGeo = new THREE.RingGeometry(this.radius * 0.7, this.radius, 32);
    const baseMat = new THREE.MeshBasicMaterial({
      color: 0xffb300,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    this.baseMesh = new THREE.Mesh(baseGeo, baseMat);
    this.baseMesh.rotation.x = -Math.PI / 2;
    this.baseMesh.position.y = 0.02;
    this.mesh.add(this.baseMesh);

    // Inner progress circle
    const progGeo = new THREE.CircleGeometry(this.radius * 0.65, 32);
    const progMat = new THREE.MeshBasicMaterial({
      color: 0x00e676,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    this.progressMesh = new THREE.Mesh(progGeo, progMat);
    this.progressMesh.rotation.x = -Math.PI / 2;
    this.progressMesh.position.y = 0.03;
    this.progressMesh.scale.set(0.001, 0.001, 1);
    this.mesh.add(this.progressMesh);
  }

  public isInside(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.position.x;
    const dz = pos.z - this.position.z;
    return Math.sqrt(dx * dx + dz * dz) <= this.radius;
  }

  public update(delta: number, playerPos: THREE.Vector3, availableFunds: number): number {
    if (this.isUnlocked) return 0;

    this.pulseTimer += delta * 3;
    const pulse = 1 + Math.sin(this.pulseTimer) * 0.05;
    this.baseMesh.scale.set(pulse, pulse, 1);

    if (this.isInside(playerPos) && availableFunds >= this.cost) {
      const step = delta / this.chargeDuration;
      const prevProgress = this.progress;
      this.progress = Math.min(1, this.progress + step);

      // Scale progress ring
      const currentScale = Math.max(0.001, this.progress);
      this.progressMesh.scale.set(currentScale, currentScale, 1);

      // Money spent proportionally
      const spent = (this.progress - prevProgress) * this.cost;

      if (this.progress >= 1 && !this.isUnlocked) {
        this.isUnlocked = true;
        this.mesh.visible = false;
        if (this.onPurchased) {
          this.onPurchased();
        }
      }

      return spent;
    } else {
      // Decay progress if player steps off
      if (this.progress > 0 && !this.isUnlocked) {
        this.progress = Math.max(0, this.progress - delta * 0.8);
        const currentScale = Math.max(0.001, this.progress);
        this.progressMesh.scale.set(currentScale, currentScale, 1);
      }
      return 0;
    }
  }
}
