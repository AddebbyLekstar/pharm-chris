import * as THREE from 'three';
import { Customer } from '../../sim/types';

export type CustomerAnimState = 'idle' | 'walking' | 'talking' | 'shocked' | 'happy' | 'paying' | 'taking';
export type CustomerAIState =
  | 'outside'
  | 'entering'
  | 'walking_to_shelf'
  | 'browsing'
  | 'picking'
  | 'out_of_stock'
  | 'walking_to_queue'
  | 'in_queue'
  | 'at_counter'
  | 'paying'
  | 'taking'
  | 'leaving'
  | 'exited';

export class Customer3D {
  public group: THREE.Group;
  public customer: Customer;
  public headMesh: THREE.Mesh;
  public torsoMesh: THREE.Mesh;
  public leftArm: THREE.Group;
  public rightArm: THREE.Group;
  public leftLeg!: THREE.Mesh;
  public rightLeg!: THREE.Mesh;
  public speechBubbleCanvas: HTMLCanvasElement;
  public speechBubbleTexture: THREE.CanvasTexture;
  public speechSprite: THREE.Sprite;
  public animState: CustomerAnimState = 'idle';
  public aiState: CustomerAIState = 'outside';
  private animTime = 0;
  public targetY = 0;

  // Pathfinding & Autonomous Movement
  public targetPos: THREE.Vector3 | null = null;
  public waypointQueue: THREE.Vector3[] = [];
  public onArrival: (() => void) | null = null;
  public walkSpeed = 2.2;
  public isWalking = false;
  public queueIndex = -1;
  public carriedProductMesh: THREE.Group | null = null;
  public counterItemMesh: THREE.Mesh | null = null;
  public requestedProductId: string = '';

  constructor(customer: Customer) {
    this.customer = customer;
    this.group = new THREE.Group();
    this.group.name = `customer_${customer.id}`;

    // Speech bubble sprite floating above head
    this.speechBubbleCanvas = document.createElement('canvas');
    this.speechBubbleCanvas.width = 512;
    this.speechBubbleCanvas.height = 180;
    this.speechBubbleTexture = new THREE.CanvasTexture(this.speechBubbleCanvas);
    this.speechBubbleTexture.colorSpace = THREE.SRGBColorSpace;
    const spriteMat = new THREE.SpriteMaterial({
      map: this.speechBubbleTexture,
      transparent: true,
    });
    this.speechSprite = new THREE.Sprite(spriteMat);
    this.speechSprite.scale.set(3.2, 1.1, 1);
    this.speechSprite.position.set(0, 3.4, 0);
    this.group.add(this.speechSprite);

    // Skin tone for Nigerian customers
    const skinColor = 0x543624;
    const skinMat = new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.7,
    });

    // Torso / Clothing
    const { torsoMat, clothesGroup } = this.buildClothing(customer.avatarKey);
    const torsoGeom = new THREE.CylinderGeometry(0.55, 0.65, 1.6, 16);
    this.torsoMesh = new THREE.Mesh(torsoGeom, torsoMat);
    this.torsoMesh.position.y = 1.35;
    this.torsoMesh.castShadow = true;
    this.torsoMesh.receiveShadow = true;
    this.torsoMesh.add(clothesGroup);
    this.group.add(this.torsoMesh);

    // Neck
    const neckGeom = new THREE.CylinderGeometry(0.18, 0.2, 0.35, 12);
    const neckMesh = new THREE.Mesh(neckGeom, skinMat);
    neckMesh.position.y = 2.25;
    this.group.add(neckMesh);

    // Head
    const headGeom = new THREE.SphereGeometry(0.38, 16, 16);
    this.headMesh = new THREE.Mesh(headGeom, skinMat);
    this.headMesh.position.y = 2.65;
    this.headMesh.castShadow = true;
    this.group.add(this.headMesh);

    // Head accessories (Gele, Helmet, Cap, Glasses)
    this.addHeadwear(customer.avatarKey, this.headMesh);

    // Arms
    const { leftArm, rightArm } = this.buildArms(skinMat, torsoMat);
    this.leftArm = leftArm;
    this.rightArm = rightArm;
    this.leftArm.position.set(-0.7, 2.05, 0);
    this.rightArm.position.set(0.7, 2.05, 0);
    this.group.add(this.leftArm);
    this.group.add(this.rightArm);

    // Legs (walking animation)
    const legGeom = new THREE.CylinderGeometry(0.16, 0.13, 1.1, 12);
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1f2326, roughness: 0.8 });
    this.leftLeg = new THREE.Mesh(legGeom, pantsMat);
    this.leftLeg.position.set(-0.25, 0.55, 0);
    this.leftLeg.castShadow = true;
    this.group.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeom, pantsMat);
    this.rightLeg.position.set(0.25, 0.55, 0);
    this.rightLeg.castShadow = true;
    this.group.add(this.rightLeg);

    this.requestedProductId = (customer.matchedProductIds && customer.matchedProductIds[0]) || '';
    this.updateSpeechBubble(customer.initialQuote);
    this.group.userData = { isCustomer: true, customerInstance: this };
  }

  private buildClothing(avatarKey: string): { torsoMat: THREE.Material; clothesGroup: THREE.Group } {
    const clothesGroup = new THREE.Group();
    let mainColor = 0x334466;

    if (avatarKey === 'mama_ngozi') {
      // Bright African print boubou (vibrant purple/gold)
      mainColor = 0x7b1fa2;
      const patternGeom = new THREE.CylinderGeometry(0.57, 0.67, 0.5, 16);
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xd49826, roughness: 0.5 });
      const band = new THREE.Mesh(patternGeom, goldMat);
      band.position.y = 0.2;
      clothesGroup.add(band);
    } else if (avatarKey === 'emeka_okada') {
      // Reflective neon lime green okada vest over black jacket
      mainColor = 0x1f1f1f;
      const vestGeom = new THREE.CylinderGeometry(0.57, 0.67, 1.2, 16);
      const vestMat = new THREE.MeshStandardMaterial({ color: 0x76ff03, roughness: 0.6 });
      const vest = new THREE.Mesh(vestGeom, vestMat);
      vest.position.y = 0.1;
      clothesGroup.add(vest);

      // Silver reflective stripe across vest
      const stripeGeom = new THREE.CylinderGeometry(0.58, 0.64, 0.15, 16);
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8 });
      const stripe = new THREE.Mesh(stripeGeom, stripeMat);
      stripe.position.y = 0.1;
      clothesGroup.add(stripe);
    } else if (avatarKey === 'bayo_danfo') {
      // Oshodi Danfo yellow shirt with white sweat towel
      mainColor = 0xffd600;
      // White sweat towel slung over shoulder
      const towelGeom = new THREE.BoxGeometry(0.25, 0.7, 0.35);
      const towelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
      const towel = new THREE.Mesh(towelGeom, towelMat);
      towel.position.set(-0.45, 0.5, 0.1);
      clothesGroup.add(towel);
    } else if (avatarKey === 'alabi_fintech') {
      // Dark navy hoodie
      mainColor = 0x1a237e;
    } else if (avatarKey === 'danjuma_audit') {
      // Inspector uniform with badge
      mainColor = 0x263238;
      const badgeGeom = new THREE.BoxGeometry(0.12, 0.15, 0.05);
      const badgeMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9 });
      const badge = new THREE.Mesh(badgeGeom, badgeMat);
      badge.position.set(0.28, 0.45, 0.52);
      clothesGroup.add(badge);
    }

    const torsoMat = new THREE.MeshStandardMaterial({
      color: mainColor,
      roughness: 0.7,
    });

    return { torsoMat, clothesGroup };
  }

  private addHeadwear(avatarKey: string, head: THREE.Mesh): void {
    if (avatarKey === 'mama_ngozi') {
      // Towering Gele (African head-tie)
      const geleGeom = new THREE.CylinderGeometry(0.65, 0.45, 0.5, 16);
      const geleMat = new THREE.MeshStandardMaterial({
        color: 0xab47bc,
        roughness: 0.6,
      });
      const gele = new THREE.Mesh(geleGeom, geleMat);
      gele.position.y = 0.32;
      gele.rotation.z = 0.12;
      head.add(gele);

      // Gold earrings
      const earGeom = new THREE.TorusGeometry(0.06, 0.02, 8, 16);
      const earMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9 });
      const earL = new THREE.Mesh(earGeom, earMat);
      earL.position.set(-0.4, -0.08, 0);
      earL.rotation.y = Math.PI / 2;
      const earR = earL.clone();
      earR.position.x = 0.4;
      head.add(earL);
      head.add(earR);
    } else if (avatarKey === 'emeka_okada') {
      // Motorcycle Helmet
      const helmetGeom = new THREE.SphereGeometry(0.44, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.7);
      const helmetMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.3 });
      const helmet = new THREE.Mesh(helmetGeom, helmetMat);
      helmet.position.y = 0.05;
      head.add(helmet);

      // Tinted visor
      const visorGeom = new THREE.BoxGeometry(0.45, 0.18, 0.2);
      const visorMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.1,
        metalness: 0.9,
      });
      const visor = new THREE.Mesh(visorGeom, visorMat);
      visor.position.set(0, 0, 0.36);
      head.add(visor);
    } else if (avatarKey === 'alabi_fintech') {
      // Wireframe Glasses
      const frameGeom = new THREE.BoxGeometry(0.48, 0.12, 0.05);
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });
      const glasses = new THREE.Mesh(frameGeom, frameMat);
      glasses.position.set(0, 0.04, 0.36);
      head.add(glasses);
    } else {
      // Casual Cap for Bayo / general customers
      const capGeom = new THREE.CylinderGeometry(0.42, 0.42, 0.18, 16);
      const capMat = new THREE.MeshStandardMaterial({ color: 0x37474f });
      const cap = new THREE.Mesh(capGeom, capMat);
      cap.position.y = 0.3;
      const peakGeom = new THREE.BoxGeometry(0.35, 0.04, 0.25);
      const peak = new THREE.Mesh(peakGeom, capMat);
      peak.position.set(0, -0.05, 0.3);
      cap.add(peak);
      head.add(cap);
    }
  }

  private buildArms(skinMat: THREE.Material, clothesMat: THREE.Material): { leftArm: THREE.Group; rightArm: THREE.Group } {
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();

    const sleeveGeom = new THREE.CylinderGeometry(0.18, 0.16, 0.5, 12);
    const sleeveMesh = new THREE.Mesh(sleeveGeom, clothesMat);
    sleeveMesh.position.y = -0.25;

    const foreArmGeom = new THREE.CylinderGeometry(0.13, 0.11, 0.65, 12);
    const foreArmMesh = new THREE.Mesh(foreArmGeom, skinMat);
    foreArmMesh.position.y = -0.7;

    const handGeom = new THREE.SphereGeometry(0.13, 12, 12);
    const handMesh = new THREE.Mesh(handGeom, skinMat);
    handMesh.position.y = -1.1;

    leftArm.add(sleeveMesh.clone());
    leftArm.add(foreArmMesh.clone());
    leftArm.add(handMesh.clone());

    rightArm.add(sleeveMesh);
    rightArm.add(foreArmMesh);
    rightArm.add(handMesh);

    return { leftArm, rightArm };
  }

  public updateSpeechBubble(text: string): void {
    const ctx = this.speechBubbleCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 180);

    // Pixel speech bubble frame
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(16, 12, 480, 140);
    ctx.strokeStyle = '#121113';
    ctx.lineWidth = 6;
    ctx.strokeRect(16, 12, 480, 140);

    // Pointer triangle
    ctx.beginPath();
    ctx.moveTo(230, 152);
    ctx.lineTo(256, 178);
    ctx.lineTo(282, 152);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.stroke();

    // Header with customer name
    ctx.fillStyle = '#329663';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`${this.customer.name.toUpperCase()} (${this.customer.mood}):`, 36, 42);

    // Main text wrapped into 2 short lines
    ctx.fillStyle = '#111111';
    ctx.font = '900 21px sans-serif';

    const words = text.split(' ');
    let line1 = '';
    let line2 = '';
    for (const w of words) {
      if ((line1 + ' ' + w).length < 32) {
        line1 += (line1 ? ' ' : '') + w;
      } else {
        line2 += (line2 ? ' ' : '') + w;
      }
    }

    ctx.fillText(line1, 36, 80);
    if (line2) {
      ctx.fillText(line2, 36, 115);
    }

    this.speechBubbleTexture.needsUpdate = true;
  }

  public walkTo(target: THREE.Vector3, onArrival?: () => void): void {
    this.targetPos = target.clone();
    this.targetPos.y = this.group.position.y;
    this.onArrival = onArrival || null;
    this.isWalking = true;
    this.animState = 'walking';
  }

  public setWaypoints(points: THREE.Vector3[], onComplete?: () => void): void {
    if (points.length === 0) return;
    this.waypointQueue = points.map((p) => {
      const v = p.clone();
      v.y = this.group.position.y;
      return v;
    });
    const first = this.waypointQueue.shift()!;
    this.walkTo(first, () => {
      if (this.waypointQueue.length > 0) {
        const nextPts = [...this.waypointQueue];
        this.waypointQueue = [];
        this.setWaypoints(nextPts, onComplete);
      } else {
        if (onComplete) onComplete();
      }
    });
  }

  public showThoughtBubble(text: string, isUnhappy = false): void {
    const ctx = this.speechBubbleCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 180);

    ctx.fillStyle = isUnhappy ? '#FFF0F0' : '#FFFFFF';
    ctx.fillRect(16, 12, 480, 140);
    ctx.strokeStyle = isUnhappy ? '#D13438' : '#121113';
    ctx.lineWidth = 6;
    ctx.strokeRect(16, 12, 480, 140);

    ctx.beginPath();
    ctx.moveTo(230, 152);
    ctx.lineTo(256, 178);
    ctx.lineTo(282, 152);
    ctx.fillStyle = isUnhappy ? '#FFF0F0' : '#FFFFFF';
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isUnhappy ? '#D13438' : '#329663';
    ctx.font = 'bold 20px sans-serif';
    const title = isUnhappy ? `⚠️ ${this.customer.name.toUpperCase()} (OUT OF STOCK):` : `${this.customer.name.toUpperCase()}:`;
    ctx.fillText(title, 36, 42);

    ctx.fillStyle = isUnhappy ? '#8C1111' : '#111111';
    ctx.font = '900 20px sans-serif';

    const words = text.split(' ');
    let line1 = '';
    let line2 = '';
    for (const w of words) {
      if ((line1 + ' ' + w).length < 32) {
        line1 += (line1 ? ' ' : '') + w;
      } else {
        line2 += (line2 ? ' ' : '') + w;
      }
    }
    ctx.fillText(line1, 36, 80);
    if (line2) ctx.fillText(line2, 36, 115);

    this.speechBubbleTexture.needsUpdate = true;
  }

  public attachCarriedProduct(productName: string, color: number = 0x2e7d32): void {
    this.removeCarriedProduct();
    const pGroup = new THREE.Group();
    const geom = new THREE.BoxGeometry(0.28, 0.18, 0.12);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    pGroup.add(mesh);

    // Label on carton
    const lCanv = document.createElement('canvas');
    lCanv.width = 128;
    lCanv.height = 64;
    const lCtx = lCanv.getContext('2d')!;
    lCtx.fillStyle = '#ffffff';
    lCtx.fillRect(0, 0, 128, 64);
    lCtx.fillStyle = '#111111';
    lCtx.font = 'bold 16px sans-serif';
    lCtx.textAlign = 'center';
    lCtx.fillText(productName.substring(0, 10), 64, 38);
    const lMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.12),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lCanv) })
    );
    lMesh.position.z = 0.062;
    pGroup.add(lMesh);

    pGroup.position.set(0, -0.65, 0.25);
    this.rightArm.add(pGroup);
    this.carriedProductMesh = pGroup;
  }

  public removeCarriedProduct(): void {
    if (this.carriedProductMesh) {
      this.rightArm.remove(this.carriedProductMesh);
      this.carriedProductMesh = null;
    }
  }

  public placeItemOnCounter(parentGroup: THREE.Group): THREE.Mesh {
    this.removeCarriedProduct();
    const itemGeom = new THREE.BoxGeometry(0.35, 0.2, 0.22);
    const itemMat = new THREE.MeshStandardMaterial({
      color: 0x1b5e3c,
      roughness: 0.4,
    });
    const counterItem = new THREE.Mesh(itemGeom, itemMat);
    counterItem.position.set(-0.2, 1.16, 0.25);
    counterItem.castShadow = true;
    counterItem.receiveShadow = true;

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 128;
    const ctx = labelCanvas.getContext('2d')!;
    ctx.fillStyle = '#f8fdf9';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#1b5e3c';
    ctx.fillRect(0, 0, 256, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MEDICINE PACK', 128, 22);
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(this.customer.matchedProductIds[0] || 'PHARM PRODUCT', 128, 65);
    // Barcode
    ctx.fillStyle = '#000000';
    for (let x = 30; x < 226; x += 6) {
      ctx.fillRect(x, 85, (x % 12 === 0) ? 4 : 2, 35);
    }
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.18),
      new THREE.MeshBasicMaterial({ map: labelTex })
    );
    labelMesh.position.y = 0.102;
    labelMesh.rotation.x = -Math.PI / 2;
    counterItem.add(labelMesh);

    counterItem.userData = {
      interactionType: 'counter_item',
      promptText: '[Click] Aim Barcode Scanner to Scan Item',
      customer: this.customer,
      customerInstance: this,
    };

    parentGroup.add(counterItem);
    this.counterItemMesh = counterItem;
    return counterItem;
  }

  public setState(state: CustomerAnimState): void {
    this.animState = state;
  }

  public update(delta: number): void {
    this.animTime += delta;

    // Pathfinding / Autonomous Movement
    if (this.targetPos) {
      const curPos = this.group.position;
      const dx = this.targetPos.x - curPos.x;
      const dz = this.targetPos.z - curPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.08) {
        this.isWalking = true;
        this.animState = 'walking';
        const moveDist = Math.min(dist, this.walkSpeed * delta);
        curPos.x += (dx / dist) * moveDist;
        curPos.z += (dz / dist) * moveDist;

        // Face movement direction
        const targetAngle = Math.atan2(dx, dz);
        this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, targetAngle, Math.min(1, delta * 8));
      } else {
        // Reached destination waypoint
        curPos.x = this.targetPos.x;
        curPos.z = this.targetPos.z;
        this.targetPos = null;
        this.isWalking = false;
        this.animState = 'idle';

        if (this.onArrival) {
          const cb = this.onArrival;
          this.onArrival = null;
          cb();
        }
      }
    }

    // Walking leg & arm swing
    if (this.isWalking) {
      const walkPhase = this.animTime * 9;
      this.leftLeg.rotation.x = Math.sin(walkPhase) * 0.55;
      this.rightLeg.rotation.x = -Math.sin(walkPhase) * 0.55;
      this.leftArm.rotation.x = -Math.sin(walkPhase) * 0.45;
      this.rightArm.rotation.x = Math.sin(walkPhase) * 0.45;
      this.torsoMesh.position.y = 1.35 + Math.abs(Math.sin(walkPhase * 2)) * 0.04;
    } else {
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, delta * 6);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, delta * 6);
      // Breathing idle bob
      const breath = Math.sin(this.animTime * 2.5) * 0.03;
      this.headMesh.position.y = 2.65 + breath;
      this.torsoMesh.position.y = 1.35 + breath * 0.5;
    }

    // Expression gestures
    if (this.animState === 'talking') {
      this.headMesh.rotation.y = Math.sin(this.animTime * 5) * 0.15;
      this.rightArm.rotation.x = -0.5 + Math.sin(this.animTime * 6) * 0.3;
      this.leftArm.rotation.x = -0.2 + Math.cos(this.animTime * 4) * 0.15;
    } else if (this.animState === 'shocked') {
      // Throw hands up in indignation
      this.headMesh.position.y = 2.75 + Math.sin(this.animTime * 8) * 0.05;
      this.leftArm.rotation.x = -2.2;
      this.rightArm.rotation.x = -2.2;
      this.leftArm.rotation.z = -0.4;
      this.rightArm.rotation.z = 0.4;
    } else if (this.animState === 'happy') {
      // Nodding in approval
      this.headMesh.rotation.x = Math.sin(this.animTime * 6) * 0.2;
      this.rightArm.rotation.x = -0.4;
      this.leftArm.rotation.x = -0.4;
    } else if (this.animState === 'paying') {
      // Reaching hand forward onto counter
      this.rightArm.rotation.x = -1.4;
      this.rightArm.rotation.y = -0.2;
    } else if (this.animState === 'taking') {
      // Reaching both hands forward to grab medication box
      this.leftArm.rotation.x = -1.3;
      this.rightArm.rotation.x = -1.3;
    } else if (!this.isWalking) {
      // Idle
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, delta * 4);
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, delta * 4);
      this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 0, delta * 4);
      this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, 0, delta * 4);
      this.headMesh.rotation.x = THREE.MathUtils.lerp(this.headMesh.rotation.x, 0, delta * 4);
      this.headMesh.rotation.y = THREE.MathUtils.lerp(this.headMesh.rotation.y, 0, delta * 4);
    }
  }
}
