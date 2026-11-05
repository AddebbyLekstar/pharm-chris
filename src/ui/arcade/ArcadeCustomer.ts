import * as THREE from 'three';
import { Customer } from '../../sim/types';
import { ArcadeScene } from './ArcadeScene';

export type CustomerState = 'walking' | 'queued' | 'serving' | 'leaving';

export class ArcadeCustomer {
  public mesh: THREE.Group;
  public data: Customer;
  public slotIndex: number;
  public state: CustomerState = 'walking';
  public isStoryCustomer: boolean;
  public hasNegotiated: boolean = false;
  public targetPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 8.5);
  
  private walkTimer: number = 0;
  private leftLeg!: THREE.Mesh;
  private rightLeg!: THREE.Mesh;
  private bubbleMesh?: THREE.Mesh;

  constructor(data: Customer, slotIndex: number = 0) {
    this.data = data;
    this.slotIndex = slotIndex;
    this.isStoryCustomer = this.checkIfStory(data.id);

    this.mesh = new THREE.Group();
    // Spawn at street entrance doorway (z = 8.5)
    this.mesh.position.set(0, 0, 8.5);

    this.buildCustomerModel();

    // Grounded circular contact shadow beneath customer
    const contactShadow = ArcadeScene.createContactShadow(0.48, 0.3);
    this.mesh.add(contactShadow);

    this.updateTargetSlot(slotIndex);
  }

  public get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  private checkIfStory(id: string): boolean {
    const storyIds = [
      'cust_mama_ngozi',
      'cust_emeka',
      'cust_danjuma',
    ];
    return storyIds.includes(id);
  }

  private buildCustomerModel(): void {
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x4a2e1b,
      roughness: 0.7,
    });

    // Outfit color according to character role
    let outfitColor = 0x3f51b5;
    if (this.data.id.includes('mama')) outfitColor = 0xff9800; // Bright Ankara wrapper
    else if (this.data.id.includes('emeka')) outfitColor = 0xfdd835; // Okada yellow jersey
    else if (this.data.id.includes('bayo')) outfitColor = 0x00897b; // Danfo driver teal
    else if (this.data.id.includes('danjuma')) outfitColor = 0x37474f; // Board Inspector uniform

    const outfitMat = new THREE.MeshStandardMaterial({
      color: outfitColor,
      roughness: 0.5,
    });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.65, 0.85, 0.4);
    const torso = new THREE.Mesh(torsoGeo, outfitMat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    this.mesh.add(torso);

    // Head
    const headGeo = new THREE.BoxGeometry(0.44, 0.44, 0.44);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.65;
    head.castShadow = true;
    this.mesh.add(head);

    // Gele or Cap if Mama or Okada
    if (this.data.id.includes('mama')) {
      const gele = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.28, 0.58),
        new THREE.MeshStandardMaterial({ color: 0xd84315, roughness: 0.4 })
      );
      gele.position.y = 1.9;
      this.mesh.add(gele);
    } else if (this.data.id.includes('emeka')) {
      const helmet = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.22, 0.52),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
      );
      helmet.position.y = 1.88;
      this.mesh.add(helmet);
    }

    // Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.6, 0.22);
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x212121 });
    this.leftLeg = new THREE.Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.18, 0.3, 0);
    this.leftLeg.castShadow = true;
    this.mesh.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.18, 0.3, 0);
    this.rightLeg.castShadow = true;
    this.mesh.add(this.rightLeg);

    // Overhead Symptom Bubble / Diamond
    const bubbleGeo = new THREE.OctahedronGeometry(0.24, 0);
    const bubbleMat = new THREE.MeshBasicMaterial({
      color: this.isStoryCustomer ? 0xffd700 : 0x00e676,
      wireframe: false,
    });
    this.bubbleMesh = new THREE.Mesh(bubbleGeo, bubbleMat);
    this.bubbleMesh.position.set(0, 2.3, 0);
    this.mesh.add(this.bubbleMesh);
  }

  public updateTargetSlot(slotIndex: number): void {
    this.slotIndex = slotIndex;
    // Slot 0 is right at counter (z = 2.8)
    // Each further slot is 1.3 units back along Z towards entrance
    const targetZ = 2.8 + slotIndex * 1.3;
    this.targetPosition.set(0, 0, targetZ);
  }

  public setLeaving(): void {
    this.state = 'leaving';
    this.targetPosition.set(0, 0, 11.0); // Outside street
  }

  public update(delta: number): void {
    // Overhead bubble spin
    if (this.bubbleMesh) {
      this.bubbleMesh.rotation.y += delta * 3;
    }

    const dz = this.targetPosition.z - this.mesh.position.z;
    const dist = Math.abs(dz);

    if (dist > 0.05) {
      if (this.state !== 'leaving') {
        this.state = 'walking';
      }
      const speed = 2.8;
      const step = Math.sign(dz) * Math.min(dist, speed * delta);
      this.mesh.position.z += step;

      // Facing rotation
      this.mesh.rotation.y = dz > 0 ? 0 : Math.PI;

      // Walking swing
      this.walkTimer += delta * 12;
      const swing = Math.sin(this.walkTimer) * 0.4;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
    } else {
      this.mesh.position.z = this.targetPosition.z;
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.mesh.rotation.y = Math.PI; // Face counter (north)

      if (this.state !== 'leaving') {
        if (this.slotIndex === 0) {
          this.state = 'serving';
        } else {
          this.state = 'queued';
        }
      }
    }
  }
}
