import * as THREE from 'three';
import { QUEUE_SLOTS, ROOM, WALKABLE } from './layout';
import { mergeRigVertexColors } from './kit/rigMerge';
import { buildCharacterRig, type CharacterRig } from './kit/characterRig';
import { customerLook, type CharacterLook } from './kit/look';
import { Customer } from '../../sim/types';
import { ArcadeScene } from './ArcadeScene';

export type CustomerState = 'walking' | 'queued' | 'serving' | 'leaving';

/**
 * A customer in the queue.
 *
 * The body is no longer built here: `buildCharacterRig` turns a `CharacterLook` into
 * a jointed rig, so this class owns only behaviour — where the person walks, which
 * way they face, how the walk cycle reads. Look variety used to be four colour
 * palettes on one silhouette; it is now outfit, build, height, hair, face and
 * accessories, and it still merges to one draw call per joint.
 */
export class ArcadeCustomer {
  public mesh: THREE.Group;
  public data: Customer;
  public slotIndex: number;
  public state: CustomerState = 'walking';
  public isStoryCustomer: boolean;
  public hasNegotiated: boolean = false;
  public targetPosition: THREE.Vector3 = new THREE.Vector3(0, 0, ROOM.maxZ + 1.2);

  /** The person this customer is, derived deterministically from their id. */
  public readonly look: CharacterLook;
  public readonly rig: CharacterRig;

  private walkTimer: number = 0;
  private bodyGroup: THREE.Group;
  private leftLegSocket: THREE.Group;
  private rightLegSocket: THREE.Group;
  private leftArmSocket: THREE.Group;
  private rightArmSocket: THREE.Group;
  private contactShadow!: THREE.Mesh;
  private bubbleMesh?: THREE.Mesh;

  constructor(data: Customer, slotIndex: number = 0) {
    this.data = data;
    this.slotIndex = slotIndex;
    this.isStoryCustomer = this.checkIfStory(data.id);

    this.mesh = new THREE.Group();
    // Spawn at street entrance doorway (z = 8.5)
    this.mesh.position.set(0, 0, 8.5);

    this.look = customerLook(data);
    this.rig = buildCharacterRig(this.look);
    this.mesh.add(this.rig.root);

    this.bodyGroup = this.rig.body;
    this.leftLegSocket = this.rig.leftLeg;
    this.rightLegSocket = this.rig.rightLeg;
    this.leftArmSocket = this.rig.leftArm;
    this.rightArmSocket = this.rig.rightArm;

    this.buildSymptomBubble();

    // Spec 1.3 & 2.3: Grounded circular contact shadow beneath customer
    this.contactShadow = ArcadeScene.createContactShadow(0.48, 0.32);
    this.mesh.add(this.contactShadow);

    // One mesh per animated joint instead of one per joint-colour pair.
    mergeRigVertexColors(this.mesh);
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

  /**
   * Overhead symptom marker.
   *
   * Unlit, so the merge deliberately leaves it alone (see `rigMerge.isMergeable`):
   * baking it into the rig froze it in place, rotating nothing, because the merge
   * consumes the very transform its spin was driven through.
   */
  private buildSymptomBubble(): void {
    this.bubbleMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.24, 0),
      new THREE.MeshBasicMaterial({ color: this.isStoryCustomer ? 0xffd700 : 0x00e676 })
    );
    this.bubbleMesh.name = 'symptom-bubble';
    this.bubbleMesh.position.set(0, 2.02 * this.look.height, 0);
    this.mesh.add(this.bubbleMesh);
  }

  public updateTargetSlot(slotIndex: number): void {
    this.slotIndex = slotIndex;
    // Slot 0 is right at counter (z = 2.8)
    // Slots come from the layout module: two rows in front of the counter plus two
    // flanking seats. Overflow queues tighter rather than walking into the wall.
    const slot = QUEUE_SLOTS[slotIndex % QUEUE_SLOTS.length];
    const overflow = Math.floor(slotIndex / QUEUE_SLOTS.length);
    const targetZ = Math.min(slot.z + overflow * 0.55, WALKABLE.maxZ - 0.25);
    const targetX = slot.x + (overflow % 2 === 1 ? 0.55 : 0);
    this.targetPosition.set(targetX, 0, targetZ);
  }

  public setLeaving(): void {
    this.state = 'leaving';
    this.targetPosition.set(this.mesh.position.x, 0, ROOM.maxZ + 2.4); // out to the street
  }

  public update(delta: number): void {
    // Overhead bubble spin & hover
    if (this.bubbleMesh) {
      this.bubbleMesh.rotation.y += delta * 3;
      const headTop = 2.02 * this.look.height;
      this.bubbleMesh.position.y = headTop + Math.sin(performance.now() * 0.004) * 0.04;
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

      // Spec 3.1: Stylized walk cycle with hip & shoulder pivots
      this.walkTimer += delta * 12.0;
      const swing = Math.sin(this.walkTimer) * 0.45;
      this.leftLegSocket.rotation.x = swing;
      this.rightLegSocket.rotation.x = -swing;
      this.leftArmSocket.rotation.x = -swing * 0.7;
      this.rightArmSocket.rotation.x = swing * 0.7;
      this.bodyGroup.position.y = Math.abs(Math.sin(this.walkTimer)) * 0.08;
      this.bodyGroup.rotation.z = Math.sin(this.walkTimer) * 0.04;

      const shadowScale = Math.max(0.7, 1.0 - this.bodyGroup.position.y * 0.25);
      this.contactShadow.scale.set(shadowScale, shadowScale, 1);
    } else {
      this.mesh.position.z = this.targetPosition.z;
      this.leftLegSocket.rotation.x = 0;
      this.rightLegSocket.rotation.x = 0;
      this.leftArmSocket.rotation.x = 0;
      this.rightArmSocket.rotation.x = 0;
      this.bodyGroup.position.y = 0;
      this.bodyGroup.rotation.z = 0;
      this.mesh.rotation.y = Math.PI; // Face counter (north)
      this.contactShadow.scale.set(1, 1, 1);

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
