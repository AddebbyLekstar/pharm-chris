import * as THREE from 'three';
import { Product, Customer } from '../../sim/types';
import { ProductBox3D } from './ProductBox3D';
import { CashRegister3D } from './CashRegister3D';
import { Customer3D } from './Customer3D';

export interface ShelfSlot3D {
  id: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  category: string;
  currentProduct?: ProductBox3D;
}

export class WalkablePharmacyStore {
  public group: THREE.Group;
  public interactables: THREE.Object3D[] = [];
  public shelfSlots: ShelfSlot3D[] = [];
  public cashRegister: CashRegister3D;
  public customerGroup: THREE.Group;
  public currentCustomer3D?: Customer3D;

  // Interactive Shop Elements
  public shutterMesh: THREE.Mesh;
  public shutterOpen = false;
  public fanBlades: THREE.Group;
  public neonCrossLight: THREE.PointLight;
  public ceilingLight1: THREE.PointLight;
  public ceilingLight2: THREE.PointLight;
  public ledgerDeskMesh: THREE.Mesh;
  public deliveryPalletMesh: THREE.Mesh;
  public deliveryCrateGroup?: THREE.Group;

  private fanSpeed = 3.6;
  private shutterTargetY = 2.1;
  private shutterCurrentY = 2.1;

  constructor() {
    this.group = new THREE.Group();
    this.customerGroup = new THREE.Group();
    this.group.add(this.customerGroup);

    // 1. Structure: Floor, Walls, Ceiling, Street
    this.shutterMesh = this.buildArchitecture();

    // 2. Service Counter & Service Hatch
    this.buildServiceCounter();

    // 3. 3D Cash Register on Counter
    this.cashRegister = new CashRegister3D();
    this.cashRegister.group.position.set(1.2, 1.12, 0.1);
    this.cashRegister.group.rotation.y = -Math.PI / 12;
    this.group.add(this.cashRegister.group);

    // Mark register as interactable
    this.cashRegister.group.userData = {
      interactionType: 'register',
      promptText: '[E] Open Cash Register',
    };
    this.interactables.push(this.cashRegister.group);

    // 4. Multi-tier Walkable Shelves
    this.buildShelvingUnits();

    // 5. Auntie Joke's Ledger Desk behind counter
    this.ledgerDeskMesh = this.buildLedgerDesk();

    // 6. Delivery Crate Receiving Pallet
    this.deliveryPalletMesh = this.buildDeliveryZone();

    // 7. Ceiling Fan, Neon Green Cross, Fluorescent Tubes
    this.fanBlades = this.buildCeilingFan();
    this.neonCrossLight = this.buildNeonCross();
    const { l1, l2 } = this.buildLighting();
    this.ceilingLight1 = l1;
    this.ceilingLight2 = l2;

    // 8. Framed PCN License
    this.buildFramedLicense();
  }

  private buildArchitecture(): THREE.Mesh {
    // Floor (10x12m green/cream checkerboard)
    const floorGeom = new THREE.PlaneGeometry(10, 12);
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 256;
    floorCanvas.height = 256;
    const fCtx = floorCanvas.getContext('2d')!;
    fCtx.fillStyle = '#1b3b2b';
    fCtx.fillRect(0, 0, 256, 256);
    fCtx.fillStyle = '#2c533e';
    fCtx.fillRect(0, 0, 128, 128);
    fCtx.fillRect(128, 128, 128, 128);
    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(10, 12);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.5 });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Ceiling
    const ceilingGeom = new THREE.PlaneGeometry(10, 12);
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xd6d6cf, roughness: 0.9 });
    const ceiling = new THREE.Mesh(ceilingGeom, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 4.2;
    this.group.add(ceiling);

    // Back Wall (Z = -6)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8e6db, roughness: 0.8 });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.2), wallMat);
    backWall.position.set(0, 2.1, -6);
    this.group.add(backWall);

    // Side Walls (X = -5 and X = 5)
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.2), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-5, 2.1, 0);
    this.group.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.2), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(5, 2.1, 0);
    this.group.add(rightWall);

    // Lower ceramic wainscot tile band (Lagos clinic green)
    const tileMat = new THREE.MeshStandardMaterial({ color: 0x1b5e3c, roughness: 0.35 });
    const backTile = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.2), tileMat);
    backTile.position.set(0, 0.6, -5.98);
    this.group.add(backTile);

    const leftTile = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.2), tileMat);
    leftTile.rotation.y = Math.PI / 2;
    leftTile.position.set(-4.98, 0.6, 0);
    this.group.add(leftTile);

    const rightTile = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.2), tileMat);
    rightTile.rotation.y = -Math.PI / 2;
    rightTile.position.set(4.98, 0.6, 0);
    this.group.add(rightTile);

    // Front Entrance Wall with Roller Shutter Opening (Z = 6)
    const frontWallLeft = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.2, 0.2), wallMat);
    frontWallLeft.position.set(-3.25, 2.1, 6);
    this.group.add(frontWallLeft);

    const frontWallRight = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.2, 0.2), wallMat);
    frontWallRight.position.set(3.25, 2.1, 6);
    this.group.add(frontWallRight);

    const frontWallHeader = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 0.2), wallMat);
    frontWallHeader.position.set(0, 3.6, 6);
    this.group.add(frontWallHeader);

    // Corrugated Roller Shutter
    const shutterGeom = new THREE.BoxGeometry(3.0, 3.0, 0.08);
    const shutterCanvas = document.createElement('canvas');
    shutterCanvas.width = 128;
    shutterCanvas.height = 512;
    const sCtx = shutterCanvas.getContext('2d')!;
    for (let y = 0; y < 512; y += 16) {
      sCtx.fillStyle = y % 32 === 0 ? '#546E7A' : '#37474F';
      sCtx.fillRect(0, y, 128, 16);
    }
    const shutterTex = new THREE.CanvasTexture(shutterCanvas);
    const shutterMat = new THREE.MeshStandardMaterial({
      map: shutterTex,
      metalness: 0.8,
      roughness: 0.4,
    });
    const shutter = new THREE.Mesh(shutterGeom, shutterMat);
    shutter.position.set(0, 1.5, 5.95);
    shutter.userData = {
      interactionType: 'shutter',
      promptText: '[E] Pull Up Roller Shutter',
    };
    this.interactables.push(shutter);
    this.group.add(shutter);

    // Exterior Street Sidewalk & Road (Z > 6)
    const sidewalkGeom = new THREE.PlaneGeometry(16, 6);
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
    const sidewalk = new THREE.Mesh(sidewalkGeom, sidewalkMat);
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(0, -0.02, 9);
    this.group.add(sidewalk);

    return shutter;
  }

  private buildServiceCounter(): void {
    const counterGroup = new THREE.Group();
    counterGroup.position.set(0, 0, 0);

    // Main wooden counter base (Length: 6.8m, Height: 1.1m, Depth: 1.2m)
    const baseGeom = new THREE.BoxGeometry(6.6, 1.1, 1.2);
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.6 });
    const base = new THREE.Mesh(baseGeom, woodMat);
    base.position.y = 0.55;
    base.castShadow = true;
    base.receiveShadow = true;
    counterGroup.add(base);

    // Green linoleum top with brass edge
    const topGeom = new THREE.BoxGeometry(6.9, 0.08, 1.35);
    const topMat = new THREE.MeshStandardMaterial({ color: 0x1c4a30, roughness: 0.3 });
    const top = new THREE.Mesh(topGeom, topMat);
    top.position.y = 1.14;
    top.castShadow = true;
    top.receiveShadow = true;
    counterGroup.add(top);

    // Brass edging trim
    const trimGeom = new THREE.BoxGeometry(6.94, 0.04, 1.39);
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd49826,
      metalness: 0.85,
      roughness: 0.25,
    });
    const trim = new THREE.Mesh(trimGeom, brassMat);
    trim.position.y = 1.11;
    counterGroup.add(trim);

    // Security Bar Grille with central service aperture
    const barMat = new THREE.MeshStandardMaterial({
      color: 0x212121,
      metalness: 0.9,
      roughness: 0.3,
    });
    const barGeom = new THREE.CylinderGeometry(0.02, 0.02, 1.6, 8);
    for (let x = -3.2; x <= 3.2; x += 0.25) {
      // Central service hatch opening between -0.8 and 0.8
      if (x > -0.8 && x < 0.8) continue;
      const bar = new THREE.Mesh(barGeom, barMat);
      bar.position.set(x, 1.98, 0.55);
      bar.castShadow = true;
      counterGroup.add(bar);
    }

    // Service Hatch Arch
    const archGeom = new THREE.BoxGeometry(1.68, 0.06, 0.06);
    const arch = new THREE.Mesh(archGeom, barMat);
    arch.position.set(0, 2.78, 0.55);
    counterGroup.add(arch);

    // Dispensing bell on counter
    const bellGeom = new THREE.CylinderGeometry(0.06, 0.1, 0.08, 16);
    const bell = new THREE.Mesh(bellGeom, brassMat);
    bell.position.set(-0.9, 1.22, 0.2);
    bell.userData = {
      interactionType: 'counter_bell',
      promptText: '[E] Ring Service Bell',
    };
    this.interactables.push(bell);
    counterGroup.add(bell);

    this.group.add(counterGroup);
  }

  private buildShelvingUnits(): void {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.7 });

    // Back Wall Main Shelf Rack (Z = -5.4)
    const backShelfGroup = new THREE.Group();
    backShelfGroup.position.set(0, 0, -5.4);

    // Upright side panels
    const uprightGeom = new THREE.BoxGeometry(0.12, 3.2, 0.6);
    for (const x of [-4.2, -1.4, 1.4, 4.2]) {
      const upright = new THREE.Mesh(uprightGeom, woodMat);
      upright.position.set(x, 1.6, 0);
      backShelfGroup.add(upright);
    }

    // 4 Tiers
    const tierGeom = new THREE.BoxGeometry(8.4, 0.08, 0.6);
    const tierHeights = [0.6, 1.3, 2.0, 2.7];
    const categories = [
      'ANTIMALARIALS & ARTEMISININ',
      'ANALGESICS & ANTIPYRETICS',
      'ANTIBIOTICS & SUSPENSIONS',
      'COLD CHAIN BIOLOGICS & VITAMINS',
    ];

    for (let i = 0; i < tierHeights.length; i++) {
      const y = tierHeights[i];
      const tier = new THREE.Mesh(tierGeom, woodMat);
      tier.position.set(0, y, 0);
      tier.receiveShadow = true;
      backShelfGroup.add(tier);

      // Category name label
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 512;
      labelCanvas.height = 40;
      const lCtx = labelCanvas.getContext('2d')!;
      lCtx.fillStyle = '#1B5E3C';
      lCtx.fillRect(0, 0, 512, 40);
      lCtx.fillStyle = '#FFFFFF';
      lCtx.font = 'bold 18px monospace';
      lCtx.textAlign = 'center';
      lCtx.fillText(categories[i], 256, 28);
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const labelMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 0.16),
        new THREE.MeshBasicMaterial({ map: labelTex })
      );
      labelMesh.position.set(0, y + 0.12, 0.31);
      backShelfGroup.add(labelMesh);

      // Shelf slot positions for placing/picking 3D cartons
      for (let s = -3.6; s <= 3.6; s += 0.8) {
        const slotId = `slot_${i}_${s.toFixed(1)}`;
        const worldPos = new THREE.Vector3(s, y + 0.18, -5.25);
        this.shelfSlots.push({
          id: slotId,
          position: worldPos,
          rotation: new THREE.Euler(0, 0, 0),
          category: categories[i],
        });
      }
    }

    this.group.add(backShelfGroup);
  }

  private buildLedgerDesk(): THREE.Mesh {
    const deskGroup = new THREE.Group();
    deskGroup.position.set(-3.6, 0, -2.6);

    const deskMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.6 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 1.0), deskMat);
    desk.position.y = 0.5;
    deskGroup.add(desk);

    // Auntie Joke's Leather Bound Ledger Book
    const ledgerGeom = new THREE.BoxGeometry(0.48, 0.08, 0.36);
    const ledgerMat = new THREE.MeshStandardMaterial({ color: 0x8d1c1c, roughness: 0.5 });
    const ledger = new THREE.Mesh(ledgerGeom, ledgerMat);
    ledger.position.set(0, 1.05, 0);
    ledger.rotation.y = 0.15;
    ledger.userData = {
      interactionType: 'ledger',
      promptText: "[E] Open Auntie Joke's Daily Ledger",
    };
    this.interactables.push(ledger);
    deskGroup.add(ledger);

    // Banker's Desk Lamp with green shade
    const lampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 0.04, 16),
      new THREE.MeshStandardMaterial({ color: 0xd49826, metalness: 0.8 })
    );
    lampBase.position.set(0.5, 1.02, -0.2);
    deskGroup.add(lampBase);

    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.16, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0x1b5e3c, roughness: 0.3 })
    );
    shade.position.set(0.5, 1.32, -0.2);
    shade.rotation.x = Math.PI / 6;
    deskGroup.add(shade);

    const lampLight = new THREE.PointLight(0xffeedd, 1.5, 4);
    lampLight.position.set(0.5, 1.25, -0.2);
    deskGroup.add(lampLight);

    this.group.add(deskGroup);
    return ledger;
  }

  private buildDeliveryZone(): THREE.Mesh {
    const palletGroup = new THREE.Group();
    palletGroup.position.set(3.4, 0, 3.8);

    // Wooden Pallet
    const woodPalletMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.8 });
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 1.4), woodPalletMat);
    pallet.position.y = 0.07;
    pallet.receiveShadow = true;
    palletGroup.add(pallet);

    // Sign on wall: "DELIVERY RECEIVING ZONE"
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 256;
    signCanvas.height = 64;
    const sCtx = signCanvas.getContext('2d')!;
    sCtx.fillStyle = '#D49826';
    sCtx.fillRect(0, 0, 256, 64);
    sCtx.fillStyle = '#000000';
    sCtx.font = 'bold 16px sans-serif';
    sCtx.textAlign = 'center';
    sCtx.fillText('DELIVERIES & RESTOCK', 128, 40);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signCanvas) })
    );
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(4.98, 1.6, 3.8);
    this.group.add(sign);

    this.group.add(palletGroup);
    return pallet;
  }

  private buildCeilingFan(): THREE.Group {
    const fan = new THREE.Group();
    fan.position.set(0, 4.0, 0);

    const fanMat = new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.4 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 12), fanMat);
    rod.position.y = 0.4;
    fan.add(rod);

    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 16), fanMat);
    fan.add(motor);

    const blades = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.2), fanMat);
      blade.position.set(Math.cos(angle) * 0.8, 0, Math.sin(angle) * 0.8);
      blade.rotation.y = -angle;
      blade.rotation.z = 0.08;
      blades.add(blade);
    }
    fan.add(blades);
    this.group.add(fan);
    return blades;
  }

  private buildNeonCross(): THREE.PointLight {
    const crossGroup = new THREE.Group();
    crossGroup.position.set(-4.95, 3.2, 5.2);

    const crossMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
    crossGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.0, 0.05), crossMat));
    crossGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.05), crossMat));

    const crossLight = new THREE.PointLight(0x00ff66, 2.8, 6);
    crossLight.position.set(0.1, 0, 0);
    crossGroup.add(crossLight);

    this.group.add(crossGroup);
    return crossLight;
  }

  private buildLighting(): { l1: THREE.PointLight; l2: THREE.PointLight } {
    const l1 = new THREE.PointLight(0xfff8ee, 3.5, 12);
    l1.position.set(0, 3.8, -2.5);
    l1.castShadow = true;
    this.group.add(l1);

    const l2 = new THREE.PointLight(0xfff8ee, 3.5, 12);
    l2.position.set(0, 3.8, 2.5);
    l2.castShadow = true;
    this.group.add(l2);

    return { l1, l2 };
  }

  private buildFramedLicense(): void {
    const frameGroup = new THREE.Group();
    frameGroup.position.set(4.95, 2.8, -2.4);
    frameGroup.rotation.y = -Math.PI / 2;

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.0, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x4e342e })
    );
    frameGroup.add(frame);

    const certCanvas = document.createElement('canvas');
    certCanvas.width = 512;
    certCanvas.height = 384;
    const ctx = certCanvas.getContext('2d')!;
    ctx.fillStyle = '#FFFDF5';
    ctx.fillRect(0, 0, 512, 384);
    ctx.strokeStyle = '#D49826';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 492, 364);
    ctx.fillStyle = '#1B5E3C';
    ctx.font = 'bold 22px serif';
    ctx.textAlign = 'center';
    ctx.fillText('PHARMACISTS COUNCIL OF NIGERIA', 256, 50);
    ctx.font = '16px serif';
    ctx.fillStyle = '#333333';
    ctx.fillText('ANNUAL PREMISES CERTIFICATE', 256, 80);
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('PHARM CHRIS / AUNTIE JOKE', 256, 140);
    ctx.font = '14px monospace';
    ctx.fillText('ORILE-KOKA DISTRICT, LAGOS STATE', 256, 180);
    ctx.fillText('LICENSE NO: PCN/LA/2019/8821', 256, 210);
    const certMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.9),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(certCanvas) })
    );
    certMesh.position.z = 0.03;
    frameGroup.add(certMesh);

    this.group.add(frameGroup);
  }

  public toggleShutter(): boolean {
    this.shutterOpen = !this.shutterOpen;
    this.shutterTargetY = this.shutterOpen ? 4.2 : 1.5;
    this.shutterMesh.userData.promptText = this.shutterOpen
      ? '[E] Pull Down Roller Shutter'
      : '[E] Pull Up Roller Shutter';
    return this.shutterOpen;
  }

  public spawnDeliveryCrate(batchNumber: string, isTampered: boolean): THREE.Group {
    if (this.deliveryCrateGroup) {
      this.group.remove(this.deliveryCrateGroup);
      const idx = this.interactables.indexOf(this.deliveryCrateGroup);
      if (idx !== -1) this.interactables.splice(idx, 1);
    }

    const crate = new THREE.Group();
    crate.position.set(3.4, 0.45, 3.8);

    const crateMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.85 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), crateMat);
    box.castShadow = true;
    crate.add(box);

    // Tamper evident tape or Agency hologram
    const tapeMat = new THREE.MeshStandardMaterial({
      color: isTampered ? 0xe53935 : 0x00acc1,
      metalness: 0.6,
    });
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.82), tapeMat);
    tape.position.y = 0.22;
    crate.add(tape);

    crate.userData = {
      interactionType: 'delivery_crate',
      promptText: `[E] Inspect Delivery Crate (Batch ${batchNumber})`,
      batchNumber,
      isTampered,
    };
    this.interactables.push(crate);
    this.group.add(crate);
    this.deliveryCrateGroup = crate;
    return crate;
  }

  public setCustomer(customer: Customer): Customer3D {
    if (this.currentCustomer3D) {
      this.customerGroup.remove(this.currentCustomer3D.group);
      const idx = this.interactables.indexOf(this.currentCustomer3D.group);
      if (idx !== -1) this.interactables.splice(idx, 1);
    }

    this.currentCustomer3D = new Customer3D(customer);
    // Customer stands right at the service counter opening
    this.currentCustomer3D.group.position.set(0, 0, 1.4);
    this.currentCustomer3D.group.rotation.y = Math.PI;

    this.currentCustomer3D.group.userData = {
      interactionType: 'customer',
      promptText: `[E] Talk to ${customer.name}`,
      customer,
    };
    this.interactables.push(this.currentCustomer3D.group);
    this.customerGroup.add(this.currentCustomer3D.group);
    return this.currentCustomer3D;
  }

  public populateShelves(products: Product[]): ProductBox3D[] {
    const boxes: ProductBox3D[] = [];
    for (let i = 0; i < products.length; i++) {
      const prd = products[i];
      const slot = this.shelfSlots[i % this.shelfSlots.length];
      const isCounterfeit = prd.id.includes('malaguard') && Math.random() > 0.5;
      const batchNumber = isCounterfeit ? '#MG-204' : `#OK-${800 + i * 15}`;
      const expiryDate = isCounterfeit ? '11/2028' : '08/2027';

      const box = new ProductBox3D(prd, batchNumber, expiryDate, '3892-0192-88', isCounterfeit);
      box.group.position.copy(slot.position);
      box.targetPosition.copy(slot.position);
      box.group.rotation.copy(slot.rotation);

      // Add interaction metadata to box
      box.group.userData = {
        interactionType: 'product_shelf',
        promptText: `[E] Pick Up ${prd.name}`,
        product: prd,
        boxInstance: box,
        slot,
      };
      this.interactables.push(box.group);
      this.group.add(box.group);
      slot.currentProduct = box;
      boxes.push(box);
    }
    return boxes;
  }

  public update(delta: number): void {
    // Spin ceiling fan
    this.fanBlades.rotation.y += delta * this.fanSpeed;

    // Pulse green cross neon
    this.neonCrossLight.intensity = 2.4 + Math.sin(Date.now() * 0.003) * 0.6;

    // Smoothly animate shutter opening/closing
    if (Math.abs(this.shutterCurrentY - this.shutterTargetY) > 0.02) {
      this.shutterCurrentY += (this.shutterTargetY - this.shutterCurrentY) * delta * 4.0;
      this.shutterMesh.position.y = this.shutterCurrentY;
    }

    // Update Cash register
    this.cashRegister.update(delta);

    // Update Customer
    if (this.currentCustomer3D) {
      this.currentCustomer3D.update(delta);
    }
  }
}
