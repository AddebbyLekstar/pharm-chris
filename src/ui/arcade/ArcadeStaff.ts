import * as THREE from 'three';
import { EmployeeRole, StoreRun } from '../../sim/progression';

/**
 * Visible staff. If you paid for a cashier, a cashier is standing there.
 * Purely cosmetic: the labour itself is simulated in StoreRun.
 */
export class ArcadeStaff {
  public group: THREE.Group;
  private stockerMesh: THREE.Group | null = null;
  private cashierMesh: THREE.Group | null = null;
  private cleanerMesh: THREE.Group | null = null;
  private walkPhase = 0;
  private readonly steerScratch = new THREE.Vector3();
  private stockerTarget: 'dock' | 'shelf' = 'dock';
  private readonly dockPos = new THREE.Vector3(1.6, 0, -6.2);
  private readonly shelfPos = new THREE.Vector3(-3.4, 0, -3.2);
  private readonly cashierPos = new THREE.Vector3(1.4, 0, 0.55);
  private readonly cleanerPos = new THREE.Vector3(-2.2, 0, 4.6);

  constructor() {
    this.group = new THREE.Group();
  }

  public sync(run: StoreRun): void {
    this.stockerMesh = this.ensure(this.stockerMesh, run.state.employees.stocker.count, 0x2e7d5b, 'stocker');
    this.cashierMesh = this.ensure(this.cashierMesh, run.state.employees.cashier.count, 0x1e5a8a, 'cashier');
    this.cleanerMesh = this.ensure(this.cleanerMesh, run.state.employees.cleaner.count, 0x7a4a1e, 'cleaner');
    if (this.cashierMesh) this.cashierMesh.position.copy(this.cashierPos);
    if (this.cleanerMesh) this.cleanerMesh.position.copy(this.cleanerPos);
  }

  private ensure(existing: THREE.Group | null, count: number, color: number, role: EmployeeRole): THREE.Group | null {
    if (count > 0 && !existing) {
      const mesh = this.buildWorker(color, role);
      this.group.add(mesh);
      return mesh;
    }
    if (count <= 0 && existing) {
      this.group.remove(existing);
      existing.traverse((child) => {
        const m = child as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      return null;
    }
    return existing;
  }

  private buildWorker(color: number, role: EmployeeRole): THREE.Group {
    const g = new THREE.Group();
    const apron = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x3e2312, roughness: 0.65 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1f2421, roughness: 0.7 });

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.3), dark);
    legs.position.y = 0.31;
    g.add(legs);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.66, 0.34), apron);
    torso.position.y = 0.95;
    torso.castShadow = true;
    g.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
    head.position.y = 1.43;
    head.castShadow = true;
    g.add(head);

    if (role === 'stocker') {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.26), new THREE.MeshStandardMaterial({ color: 0xb98a4b, roughness: 0.8 }));
      crate.position.set(0, 1.02, 0.26);
      g.add(crate);
    }
    if (role === 'cashier') {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), apron);
      cap.position.y = 1.62;
      g.add(cap);
    }
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.006;
    g.add(shadow);
    return g;
  }

  public update(delta: number): void {
    if (!this.stockerMesh) return;
    const target = this.stockerTarget === 'dock' ? this.dockPos : this.shelfPos;
    const pos = this.stockerMesh.position;
    const dist = pos.distanceTo(target);
    if (dist < 0.25) {
      this.stockerTarget = this.stockerTarget === 'dock' ? 'shelf' : 'dock';
      return;
    }
    const dir = this.steerScratch.copy(target).sub(pos).normalize();
    pos.addScaledVector(dir, delta * 2.2);
    this.walkPhase += delta * 9;
    this.stockerMesh.rotation.y = Math.atan2(dir.x, dir.z);
    this.stockerMesh.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.05;
  }

  public dispose(): void {
    this.group.traverse((child) => {
      const m = child as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.group.clear();
  }
}
