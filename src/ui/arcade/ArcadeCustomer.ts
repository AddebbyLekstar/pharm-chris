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
  private bodyGroup!: THREE.Group;
  private leftLegSocket!: THREE.Group;
  private rightLegSocket!: THREE.Group;
  private leftArmSocket!: THREE.Group;
  private rightArmSocket!: THREE.Group;
  private headSocket!: THREE.Group;
  private contactShadow!: THREE.Mesh;
  private bubbleMesh?: THREE.Mesh;

  constructor(data: Customer, slotIndex: number = 0) {
    this.data = data;
    this.slotIndex = slotIndex;
    this.isStoryCustomer = this.checkIfStory(data.id);

    this.mesh = new THREE.Group();
    // Spawn at street entrance doorway (z = 8.5)
    this.mesh.position.set(0, 0, 8.5);

    this.buildCustomerModel();

    // Spec 1.3 & 2.3: Grounded circular contact shadow beneath customer
    this.contactShadow = ArcadeScene.createContactShadow(0.48, 0.32);
    this.mesh.add(this.contactShadow);

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
   * Spec 1.1, 1.2 & 1.3: Procedural Lagos Fashion Token Library & Hierarchical Rig
   */
  private buildCustomerModel(): void {
    this.bodyGroup = new THREE.Group();
    this.mesh.add(this.bodyGroup);

    // Spec 1.2 Character Palette tokens
    let skinColor = 0x4a2e1b;
    let garmentColor = 0x1a237e;
    let pantsColor = 0x212121;
    let accessoryColor = 0xd84315;

    const id = this.data.id.toLowerCase();
    if (id.includes('mama')) {
      // Mama Ngozi: Warm Umber skin, Ankara orange wrapper, Coral bead necklace & Gele
      skinColor = 0x532e17;
      garmentColor = 0xf57c00;
      pantsColor = 0xd84315;
      accessoryColor = 0xbf360c;
    } else if (id.includes('emeka')) {
      // Emeka: Deep Espresso, High-vis Lagos Okada yellow jersey, denim jeans, black helmet
      skinColor = 0x452814;
      garmentColor = 0xfdd835;
      pantsColor = 0x1a237e;
      accessoryColor = 0x1a1a1a;
    } else if (id.includes('bayo')) {
      // Bayo: Dark Mahogany, Danfo yellow vest with stripe, dark trousers
      skinColor = 0x3b200f;
      garmentColor = 0xfbc02d;
      pantsColor = 0x37474f;
      accessoryColor = 0x5d4037;
    } else if (id.includes('danjuma')) {
      // Alhaji Danjuma: Chestnut Bronze, Agbada Navy Slate, Fula cap
      skinColor = 0x4a2e1b;
      garmentColor = 0x1e293b;
      pantsColor = 0x0f172a;
      accessoryColor = 0xd4af37;
    } else {
      // Varied Lagos street presets
      const palettes = [
        { skin: 0x3e2312, top: 0x00897b, bot: 0x263238 },
        { skin: 0x4a2e1b, top: 0x7b1fa2, bot: 0x212121 },
        { skin: 0x532e17, top: 0x0288d1, bot: 0x37474f },
        { skin: 0x3b200f, top: 0xc2185b, bot: 0x1a237e },
      ];
      const seed = Math.abs(this.data.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
      const chosen = palettes[seed % palettes.length];
      skinColor = chosen.skin;
      garmentColor = chosen.top;
      pantsColor = chosen.bot;
    }

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.65 });
    const outfitMat = new THREE.MeshStandardMaterial({ color: garmentColor, roughness: 0.5 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.6 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1f2421, roughness: 0.7 });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.68, 0.86, 0.42);
    const torso = new THREE.Mesh(torsoGeo, outfitMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.bodyGroup.add(torso);

    // Pelvis
    const pelvisGeo = new THREE.BoxGeometry(0.60, 0.22, 0.38);
    const pelvis = new THREE.Mesh(pelvisGeo, pantsMat);
    pelvis.position.y = 0.76;
    this.bodyGroup.add(pelvis);

    // Head Socket [y: 1.55]
    this.headSocket = new THREE.Group();
    this.headSocket.position.set(0, 1.55, 0);
    this.bodyGroup.add(this.headSocket);

    // Head Cranium
    const headGeo = new THREE.BoxGeometry(0.46, 0.46, 0.46);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 0.23;
    head.castShadow = true;
    this.headSocket.add(head);

    // Spec 1.2 Distinctive Cultural Accessories
    if (id.includes('mama')) {
      // Oversized sculpted Gele head-tie tilted back
      const geleGeo = new THREE.BoxGeometry(0.65, 0.32, 0.65);
      const geleMat = new THREE.MeshStandardMaterial({ color: accessoryColor, roughness: 0.45 });
      const gele = new THREE.Mesh(geleGeo, geleMat);
      gele.position.set(0, 0.44, -0.05);
      gele.rotation.x = -0.14; // Tilted 8 degrees back
      gele.castShadow = true;
      this.headSocket.add(gele);

      // Coral bead necklace
      const coralGeo = new THREE.TorusGeometry(0.22, 0.035, 8, 16);
      const coralMat = new THREE.MeshStandardMaterial({ color: 0xff5722, roughness: 0.3 });
      const coral = new THREE.Mesh(coralGeo, coralMat);
      coral.rotation.x = Math.PI / 2;
      coral.position.set(0, 0.02, 0.1);
      this.headSocket.add(coral);
    } else if (id.includes('emeka')) {
      // Motorcycle helmet pushed up on forehead
      const helmetGeo = new THREE.BoxGeometry(0.54, 0.26, 0.54);
      const helmetMat = new THREE.MeshStandardMaterial({
        color: accessoryColor,
        roughness: 0.15,
        metalness: 0.3,
      });
      const helmet = new THREE.Mesh(helmetGeo, helmetMat);
      helmet.position.set(0, 0.44, 0.02);
      helmet.castShadow = true;
      this.headSocket.add(helmet);

      // Reflective nylon cross-body messenger pouch
      const pouchGeo = new THREE.BoxGeometry(0.3, 0.25, 0.1);
      const pouchMat = new THREE.MeshStandardMaterial({ color: 0x00e676, roughness: 0.3 });
      const pouch = new THREE.Mesh(pouchGeo, pouchMat);
      pouch.position.set(0.2, 0.95, 0.22);
      pouch.rotation.z = -0.25;
      this.bodyGroup.add(pouch);
    } else if (id.includes('bayo')) {
      // Rolled newsboy cap & toothpick
      const capGeo = new THREE.BoxGeometry(0.52, 0.14, 0.54);
      const capMat = new THREE.MeshStandardMaterial({ color: accessoryColor, roughness: 0.7 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(0, 0.45, 0.04);
      this.headSocket.add(cap);

      // Shoulder towel
      const towelGeo = new THREE.BoxGeometry(0.22, 0.45, 0.24);
      const towelMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
      const towel = new THREE.Mesh(towelGeo, towelMat);
      towel.position.set(-0.35, 1.25, 0);
      this.bodyGroup.add(towel);
    } else if (id.includes('danjuma')) {
      // Fula cap
      const capGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 16);
      const capMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(0, 0.52, 0);
      this.headSocket.add(cap);
    }

    // Shoulder sockets & arms
    const armGeo = new THREE.BoxGeometry(0.18, 0.70, 0.18);

    this.leftArmSocket = new THREE.Group();
    this.leftArmSocket.position.set(-0.44, 1.35, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, outfitMat);
    leftArmMesh.position.y = -0.30;
    leftArmMesh.castShadow = true;
    this.leftArmSocket.add(leftArmMesh);
    this.bodyGroup.add(this.leftArmSocket);

    this.rightArmSocket = new THREE.Group();
    this.rightArmSocket.position.set(0.44, 1.35, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, outfitMat);
    rightArmMesh.position.y = -0.30;
    rightArmMesh.castShadow = true;
    this.rightArmSocket.add(rightArmMesh);
    this.bodyGroup.add(this.rightArmSocket);

    // Hip sockets & legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.72, 0.22);
    const shoeGeo = new THREE.BoxGeometry(0.24, 0.16, 0.32);

    this.leftLegSocket = new THREE.Group();
    this.leftLegSocket.position.set(-0.18, 0.75, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, pantsMat);
    leftLegMesh.position.y = -0.35;
    leftLegMesh.castShadow = true;
    this.leftLegSocket.add(leftLegMesh);
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.66, 0.05);
    this.leftLegSocket.add(leftShoe);
    this.mesh.add(this.leftLegSocket);

    this.rightLegSocket = new THREE.Group();
    this.rightLegSocket.position.set(0.18, 0.75, 0);
    const rightLegMesh = new THREE.Mesh(legGeo, pantsMat);
    rightLegMesh.position.y = -0.35;
    rightLegMesh.castShadow = true;
    this.rightLegSocket.add(rightLegMesh);
    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.66, 0.05);
    this.rightLegSocket.add(rightShoe);
    this.mesh.add(this.rightLegSocket);

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
    // Overhead bubble spin & hover
    if (this.bubbleMesh) {
      this.bubbleMesh.rotation.y += delta * 3;
      this.bubbleMesh.position.y = 2.3 + Math.sin(performance.now() * 0.004) * 0.04;
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
