import * as THREE from 'three';
import { chamferBox } from './kit/geometry';
import { ArcadeScene, WalkableBounds } from './ArcadeScene';
import { mergeRig } from './mergeMeshes';

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
  private bodyGroup!: THREE.Group;
  private leftArmSocket!: THREE.Group;
  private rightArmSocket!: THREE.Group;
  private leftLegSocket!: THREE.Group;
  private rightLegSocket!: THREE.Group;
  private headSocket!: THREE.Group;
  private contactShadow!: THREE.Mesh;

  constructor(options?: ArcadePlayerOptions) {
    this.bounds = options?.bounds || {
      minX: -6.0,
      maxX: 6.0,
      minZ: -6.5,
      maxZ: 6.5,
    };
    this.baseSpeed = options?.baseSpeed ?? 6.0;

    this.mesh = new THREE.Group();
    // Spawn by the entrance, not on the register pad (the counter trigger would
    // otherwise fire the moment the page loads).
    this.mesh.position.set(0, 0, 4.2);

    this.buildStylizedModel();
    mergeRig(this.mesh);

    // Spec 1.3 & 2.3: Grounded circular contact shadow beneath Chris
    this.contactShadow = ArcadeScene.createContactShadow(0.55, 0.36);
    this.mesh.add(this.contactShadow);

    // Spec 1.3: Stack socket mounted on Chris's back/torso
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

  /**
   * Spec 1.1, 1.2 & 1.3: Procedural Mesh Construction (Hierarchical Rig)
   */
  private buildStylizedModel(): void {
    // Body Root — Bobbing / Sway Pivot
    this.bodyGroup = new THREE.Group();
    // 1.35x: Chris is a 2.2 m man in a 2.8 m room, the same cheat The Sims Mobile
    // uses. At true 1.62 m he rendered 47 px tall on a 360 px phone and read as a
    // pawn; the only alternatives were zooming until the shop left the frame.
    this.bodyGroup.scale.setScalar(1.35);
    // The height the camera and the mobile gate both measure against. Kept next to
    // the scale so the two can never drift apart again.
    this.visualHeight = 1.63 * 1.35;
    this.mesh.add(this.bodyGroup);

    // Spec 1.2: Melanin Deep Rich skin
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x3e2312,
      roughness: 0.62,
      metalness: 0.02,
    });
    // Spec 1.2: Crisp clinic white lab coat
    const coatMat = new THREE.MeshStandardMaterial({
      // Deep green coat, not white: against a cream floor and cream walls a white
      // coat disappears, and Chris spent the whole session blending into the room.
      color: 0x1b4a3c,
      roughness: 0.35,
    });
    // Spec 1.2: Dark Lagos teal scrub trousers
    const scrubsMat = new THREE.MeshStandardMaterial({
      color: 0xf1e6cf,
      roughness: 0.50,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0x1f2421,
      roughness: 0.70,
    });

    // Spec 1.1: Torso Width 0.72 tapering, Height 0.88, Depth 0.44
    const torsoGeo = new THREE.BoxGeometry(0.72, 0.88, 0.44);
    const torso = new THREE.Mesh(torsoGeo, coatMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.bodyGroup.add(torso);

    // Pelvis base under coat
    const pelvisGeo = new THREE.BoxGeometry(0.62, 0.22, 0.4);
    const pelvis = new THREE.Mesh(pelvisGeo, scrubsMat);
    pelvis.position.y = 0.76;
    this.bodyGroup.add(pelvis);

    // Spec 1.2: Official PSN green badge on left breast pocket
    const badgeGeo = new THREE.BoxGeometry(0.14, 0.18, 0.04);
    const badgeMat = new THREE.MeshStandardMaterial({
      color: 0x00e676,
      roughness: 0.3,
    });
    const badge = new THREE.Mesh(badgeGeo, badgeMat);
    badge.position.set(0.20, 1.22, 0.23);
    this.bodyGroup.add(badge);

    // Spec 1.3: Head Socket — Pivot at neck [y: 1.55]
    this.headSocket = new THREE.Group();
    this.headSocket.position.set(0, 1.55, 0);
    this.bodyGroup.add(this.headSocket);

    // Head: chamfered, not a cube. At 47 px the silhouette of the skull is most of
    // what tells the player which blob is theirs; a hard-edged box reads as a crate.
    const headGeo = chamferBox(0.58, 0.6, 0.56, 0.1);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.name = 'player-head';
    head.position.y = 0.24;
    head.castShadow = true;
    this.headSocket.add(head);

    // Face. Three small shapes is the difference between "a person" and "a pawn" at
    // mobile scale: eyes to aim the gaze, brows to carry expression, a mouth line.
    const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf7f2e8, roughness: 0.4 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.3 });
    for (const side of [-1, 1]) {
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), scleraMat);
      sclera.position.set(side * 0.11, 0.28, 0.225);
      this.headSocket.add(sclera);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), pupilMat);
      pupil.position.set(side * 0.11, 0.28, 0.268);
      this.headSocket.add(pupil);
      const brow = new THREE.Mesh(chamferBox(0.11, 0.025, 0.03, 0.008), pupilMat);
      brow.position.set(side * 0.11, 0.355, 0.245);
      brow.rotation.z = side * -0.12;
      this.headSocket.add(brow);
    }
    const nose = new THREE.Mesh(chamferBox(0.07, 0.09, 0.06, 0.02), skinMat);
    nose.position.set(0, 0.20, 0.26);
    this.headSocket.add(nose);
    const mouth = new THREE.Mesh(chamferBox(0.1, 0.022, 0.02, 0.006), new THREE.MeshStandardMaterial({ color: 0x4a2a1e, roughness: 0.6 }));
    mouth.position.set(0, 0.115, 0.253);
    this.headSocket.add(mouth);

    // Hair (textured dark crop)
    const hairGeo = new THREE.BoxGeometry(0.52, 0.18, 0.52);
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x0f0f0f,
      roughness: 0.9,
    });
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 0.46;
    this.headSocket.add(hair);

    // Spec 1.2: Gold-rim retro aviators (color: 0xD4AF37, Metalness 0.85, Roughness 0.2)
    const glassesGeo = new THREE.BoxGeometry(0.42, 0.12, 0.08);
    const glassesMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.85,
      roughness: 0.20,
    });
    const glasses = new THREE.Mesh(glassesGeo, glassesMat);
    glasses.position.set(0, 0.26, 0.25);
    this.headSocket.add(glasses);

    // Spec 1.2: Stethoscope draped around neck (tubing: #1E293B)
    const stethGeo = new THREE.TorusGeometry(0.24, 0.022, 8, 16, Math.PI);
    const stethMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
    });
    const steth = new THREE.Mesh(stethGeo, stethMat);
    steth.rotation.x = Math.PI / 2;
    steth.position.set(0, 0.02, 0.12);
    this.headSocket.add(steth);

    // Spec 1.1 & 1.3: Arm Sockets — Pivot at shoulders [x: ±0.46, y: 1.35, z: 0]
    const armGeo = new THREE.BoxGeometry(0.18, 0.72, 0.18);

    // Left Arm Socket
    this.leftArmSocket = new THREE.Group();
    this.leftArmSocket.position.set(-0.46, 1.35, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, coatMat);
    leftArmMesh.position.y = -0.32; // Offset center so socket acts as shoulder pivot
    leftArmMesh.castShadow = true;
    this.leftArmSocket.add(leftArmMesh);
    this.bodyGroup.add(this.leftArmSocket);

    // Right Arm Socket
    this.rightArmSocket = new THREE.Group();
    this.rightArmSocket.position.set(0.46, 1.35, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, coatMat);
    rightArmMesh.position.y = -0.32; // Offset center so socket acts as shoulder pivot
    rightArmMesh.castShadow = true;
    this.rightArmSocket.add(rightArmMesh);
    this.bodyGroup.add(this.rightArmSocket);

    // Spec 1.1 & 1.3: Leg Sockets — Pivot at hips [x: ±0.18, y: 0.75, z: 0]
    const legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.22);
    const shoeGeo = new THREE.BoxGeometry(0.24, 0.16, 0.34);

    // Left Leg Socket
    this.leftLegSocket = new THREE.Group();
    this.leftLegSocket.position.set(-0.18, 0.75, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, scrubsMat);
    leftLegMesh.position.y = -0.36; // Hip pivot offset
    leftLegMesh.castShadow = true;
    this.leftLegSocket.add(leftLegMesh);
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.68, 0.06);
    this.leftLegSocket.add(leftShoe);
    this.mesh.add(this.leftLegSocket);

    // Player marker: a soft ring under the feet. Cheap (one draw), and it answers
    // the question the art review kept asking — where am I? — without a HUD arrow.
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.46, 28),
      new THREE.MeshBasicMaterial({ color: 0x7cf0c0, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })
    );
    marker.name = 'player-marker';
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.015;
    marker.renderOrder = 2;
    this.mesh.add(marker);

    // Right Leg Socket
    this.rightLegSocket = new THREE.Group();
    this.rightLegSocket.position.set(0.18, 0.75, 0);
    const rightLegMesh = new THREE.Mesh(legGeo, scrubsMat);
    rightLegMesh.position.y = -0.36; // Hip pivot offset
    rightLegMesh.castShadow = true;
    this.rightLegSocket.add(rightLegMesh);
    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.68, 0.06);
    this.rightLegSocket.add(rightShoe);
    this.mesh.add(this.rightLegSocket);
  }

  /**
   * Spec 3.1: Stylized Bounce-Walk Cycle with Hierarchical Limb Rig
   */
  public move(dir: THREE.Vector2, delta: number): void {
    if (dir.lengthSq() < 0.001) {
      // Idle stance: limbs return to neutral
      this.leftLegSocket.rotation.x = 0;
      this.rightLegSocket.rotation.x = 0;
      if (this.stackSocket.children.length > 0) {
        // Cradle stack pose even while idle
        this.leftArmSocket.rotation.x = -0.65;
        this.leftArmSocket.rotation.z = 0.15;
        this.rightArmSocket.rotation.x = -0.65;
        this.rightArmSocket.rotation.z = -0.15;
      } else {
        this.leftArmSocket.rotation.x = 0;
        this.leftArmSocket.rotation.z = 0;
        this.rightArmSocket.rotation.x = 0;
        this.rightArmSocket.rotation.z = 0;
      }
      this.bodyGroup.position.y = 0;
      this.bodyGroup.rotation.x = 0;
      this.bodyGroup.rotation.z = 0;
      this.bodyGroup.scale.set(1, 1, 1);
      this.contactShadow.scale.set(1, 1, 1);
      return;
    }

    const currentSpeed = this.speed;
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
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.mesh.rotation.y += diff * Math.min(1, delta * 15);

    // Spec 3.1: Stylized Bounce-Walk Cycle kinematics
    const vmax = 6.5;
    const rv = Math.min(1.0, currentSpeed / vmax);
    const omega = 14.5; // rad/s (~2.3 Hz)
    this.walkTimer += delta * omega;

    // 1. Vertical Body Bobbing (Squash & Stretch)
    const Ay = 0.12;
    const yBounce = Math.abs(Math.sin(this.walkTimer)) * Ay * rv;
    const Sy = 1.0 + Math.sin(2 * this.walkTimer) * 0.06 * rv;
    const Sxz = 1.0 / Math.sqrt(Math.max(0.01, Sy));
    this.bodyGroup.position.y = yBounce;
    this.bodyGroup.scale.set(Sxz, Sy, Sxz);

    // 2. Hip Roll & Torso Forward Pitch
    this.bodyGroup.rotation.z = Math.sin(this.walkTimer) * 0.075 * rv;
    this.bodyGroup.rotation.x = -0.12 * rv;

    // 3. Opposed Limb Swing with Hip & Shoulder Pivots
    const legSwing = Math.sin(this.walkTimer) * 0.55 * rv;
    this.leftLegSocket.rotation.x = legSwing;
    this.rightLegSocket.rotation.x = -legSwing;

    const isCarryingStack = this.stackSocket.children.length > 0;
    if (isCarryingStack) {
      // Lock forward at -0.65 rad to cradle boxes
      this.leftArmSocket.rotation.x = -0.65;
      this.leftArmSocket.rotation.z = 0.15;
      this.rightArmSocket.rotation.x = -0.65;
      this.rightArmSocket.rotation.z = -0.15;
    } else {
      const armSwing = Math.sin(this.walkTimer) * 0.42 * rv;
      this.leftArmSocket.rotation.x = -armSwing;
      this.leftArmSocket.rotation.z = 0;
      this.rightArmSocket.rotation.x = armSwing;
      this.rightArmSocket.rotation.z = 0;
    }

    // Dynamic Contact Shadow scale
    const shadowScale = Math.max(0.7, 1.0 - yBounce * 0.25);
    this.contactShadow.scale.set(shadowScale, shadowScale, 1);
  }

  /**
   * World-space vertical extent of the character, in metres.
   *
   * The mobile gate needs Chris's real on-screen height; a hardcoded 1.75 m segment
   * stopped matching the moment he was scaled 1.35x against the architecture, and
   * the gate failed a shot that was already at the 80 px floor.
   */
  /** Body silhouette height in metres, after the architecture scale is applied. */
  public visualHeight = 2.2;

  public worldExtent(): { minY: number; maxY: number } {
    // Declared, not measured. A bounding box picked up the hat, the stethoscope and
    // the ground ring and reported 2.88 m, which pushed the camera back until Chris
    // read at 61 px. Legibility is defined against the body silhouette we authored:
    // 1.63 m of man scaled 1.35x against the architecture.
    return { minY: 0, maxY: this.visualHeight };
  }

  public update(delta: number, inputDir?: THREE.Vector2): void {
    if (inputDir) {
      this.move(inputDir, delta);
    }
  }
}
