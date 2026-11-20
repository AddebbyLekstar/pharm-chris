import * as THREE from 'three';
import { EmployeeRole, StoreRun } from '../../sim/progression';
import { buildCharacterRig } from './kit/characterRig';
import { mergeRigSingleMesh } from './kit/rigMerge';
import { staffLook } from './kit/look';

/**
 * Visible staff. If you paid for a cashier, a cashier is standing there.
 * Purely cosmetic: the labour itself is simulated in StoreRun.
 *
 * Workers used to be three loose boxes per employee with no arms, one material each,
 * so three hires cost fifteen draw calls and looked like shop dummies. They now go
 * through the same `buildCharacterRig` as the crowd — arms, a face, a role prop, one
 * uniform colour — and then flattened to a single mesh, because nothing on a worker
 * animates per joint.
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
    this.stockerMesh = this.ensure(this.stockerMesh, run.state.employees.stocker.count, 'stocker');
    this.cashierMesh = this.ensure(this.cashierMesh, run.state.employees.cashier.count, 'cashier');
    this.cleanerMesh = this.ensure(this.cleanerMesh, run.state.employees.cleaner.count, 'cleaner');
    if (this.cashierMesh) this.cashierMesh.position.copy(this.cashierPos);
    if (this.cleanerMesh) this.cleanerMesh.position.copy(this.cleanerPos);
  }

  private ensure(
    existing: THREE.Group | null,
    count: number,
    role: Extract<EmployeeRole, 'stocker' | 'cashier' | 'cleaner'>
  ): THREE.Group | null {
    if (count > 0 && !existing) {
      const mesh = this.buildWorker(role);
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

  private buildWorker(role: Extract<EmployeeRole, 'stocker' | 'cashier' | 'cleaner'>): THREE.Group {
    const rig = buildCharacterRig(staffLook(role), { role });

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.36, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.006;
    rig.root.add(shadow);

    // Staff never animate per joint, so the whole worker is one mesh: 2 draws each
    // (body + ground shadow) instead of the 5 the old loose-box build cost.
    mergeRigSingleMesh(rig.root);
    return rig.root;
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
