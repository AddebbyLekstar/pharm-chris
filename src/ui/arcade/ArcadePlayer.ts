import * as THREE from 'three';
import { ArcadeScene, WalkableBounds } from './ArcadeScene';

export interface ArcadePlayerOptions {
  bounds?: WalkableBounds;
  baseSpeed?: number;
}

export class ArcadePlayer {
  public mesh: THREE.Group;
  public stackSocket: THREE.Group;
  public bounds: WalkableBounds;
  public baseSpeed: number;
  public speedMultiplier: number = 1.0;

  private walkTimer: number = 0;
  private leftLeg!: THREE.Mesh;
  private rightLeg!: THREE.Mesh;
  private leftArm!: THREE.Mesh;
  private rightArm!: THREE.Mesh;
  private bodyGroup!: THREE.Group;

  constructor(options?: ArcadePlayerOptions) {
    this.bounds = options?.bounds || {
      minX: -6.0,
      maxX: 6.0,
      minZ: -6.5,
      maxZ: 6.5,
    };
    this.baseSpeed = options?.baseSpeed ?? 6.0;

    this.mesh = new THREE.Group();
    this.mesh.position.set(0, 0, 0);

    this.buildStylizedModel();

    // Grounded circular contact shadow beneath Chris
    const contactShadow = ArcadeScene.createContactShadow(0.55, 0.36);
    this.mesh.add(contactShadow);

    // Stack socket mounted on Chris's back/arms
    this.stackSocket = new THREE.Group();
    this.stackSocket.position.set(0, 1.25, -0.32);
    this.mesh.add(this.stackSocket);
  }

  public get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  public get speed(): number {
    return this.baseSpeed * this.speedMultiplier;
  }

  private buildStylizedModel(): void {
    this.bodyGroup = new THREE.Group();
    this.mesh.add(this.bodyGroup);

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x4a2e1b, // Nigerian dark skin tone
      roughness: 0.6,
    });
    const coatMat = new THREE.MeshStandardMaterial({
      color: 0xf5f8f7, // Crisp white pharmacist lab coat
      roughness: 0.4,
    });
    const scrubsMat = new THREE.MeshStandardMaterial({
      color: 0x1b5e48, // Lagos clinic dark teal trousers
      roughness: 0.5,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.7,
    });

    // Torso / Lab Coat
    const torsoGeo = new THREE.BoxGeometry(0.7, 0.9, 0.45);
    const torso = new THREE.Mesh(torsoGeo, coatMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    this.bodyGroup.add(torso);

    // ID Badge / Stethoscope accent on chest
    const badgeGeo = new THREE.BoxGeometry(0.18, 0.22, 0.05);
    const badgeMat = new THREE.MeshStandardMaterial({ color: 0x00e676 });
    const badge = new THREE.Mesh(badgeGeo, badgeMat);
    badge.position.set(0.18, 1.2, 0.24);
    this.bodyGroup.add(badge);

    // Head
    const headGeo = new THREE.BoxGeometry(0.48, 0.48, 0.48);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.74;
    head.castShadow = true;
    this.bodyGroup.add(head);

    // Hair (black crop)
    const hairGeo = new THREE.BoxGeometry(0.52, 0.2, 0.52);
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 1.95;
    this.bodyGroup.add(hair);

    // Glasses (retro gold frames)
    const glassesGeo = new THREE.BoxGeometry(0.42, 0.12, 0.08);
    const glassesMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8 });
    const glasses = new THREE.Mesh(glassesGeo, glassesMat);
    glasses.position.set(0, 1.76, 0.25);
    this.bodyGroup.add(glasses);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.18, 0.7, 0.2);
    this.leftArm = new THREE.Mesh(armGeo, coatMat);
    this.leftArm.position.set(-0.48, 1.05, 0);
    this.leftArm.castShadow = true;
    this.bodyGroup.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, coatMat);
    this.rightArm.position.set(0.48, 1.05, 0);
    this.rightArm.castShadow = true;
    this.bodyGroup.add(this.rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.24, 0.65, 0.25);
    this.leftLeg = new THREE.Mesh(legGeo, scrubsMat);
    this.leftLeg.position.set(-0.2, 0.35, 0);
    this.leftLeg.castShadow = true;
    this.mesh.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, scrubsMat);
    this.rightLeg.position.set(0.2, 0.35, 0);
    this.rightLeg.castShadow = true;
    this.mesh.add(this.rightLeg);

    // Feet / Shoes
    const shoeGeo = new THREE.BoxGeometry(0.26, 0.12, 0.35);
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.32, 0.05);
    this.leftLeg.add(leftShoe);

    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.32, 0.05);
    this.rightLeg.add(rightShoe);
  }

  public move(dir: THREE.Vector2, delta: number): void {
    if (dir.lengthSq() < 0.001) {
      // Idle stance
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.leftArm.rotation.x = 0;
      this.rightArm.rotation.x = 0;
      this.bodyGroup.position.y = 0;
      return;
    }

    const currentSpeed = this.speed;
    // In 3D: X is right, Z is down/towards screen
    const worldX = dir.x;
    const worldZ = dir.y;
    const moveX = worldX * currentSpeed * delta;
    const moveZ = worldZ * currentSpeed * delta;

    this.mesh.position.x += moveX;
    this.mesh.position.z += moveZ;

    // Clamping to walkable bounds
    this.mesh.position.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.mesh.position.x));
    this.mesh.position.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, this.mesh.position.z));

    // Smooth rotation towards movement direction
    const targetAngle = Math.atan2(worldX, worldZ);
    let diff = targetAngle - this.mesh.rotation.y;
    // Wrap around [-PI, PI]
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.mesh.rotation.y += diff * Math.min(1, delta * 15);

    // Running bounce & leg swing
    this.walkTimer += delta * 14;
    const swing = Math.sin(this.walkTimer) * 0.45;
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = -swing * 0.8;
    this.rightArm.rotation.x = swing * 0.8;
    this.bodyGroup.position.y = Math.abs(Math.sin(this.walkTimer * 2)) * 0.08;
  }

  public update(delta: number, inputDir?: THREE.Vector2): void {
    if (inputDir) {
      this.move(inputDir, delta);
    }
  }
}
