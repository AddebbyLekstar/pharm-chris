import * as THREE from 'three';
import { Product, Customer } from '../../sim/types';
import { ProductBox3D } from './ProductBox3D';
import { CashRegister3D } from './CashRegister3D';
import { Customer3D } from './Customer3D';
import { DeliveryCrate3D } from './DeliveryCrate3D';

export interface ShelfSlot3D {
  id: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  category: string;
  currentProduct?: ProductBox3D;
  priceTagMesh?: THREE.Mesh;
  priceTagCanvas?: HTMLCanvasElement;
  priceTagTexture?: THREE.CanvasTexture;
  slotMesh?: THREE.Mesh;
  wholesaleCost?: number;
  retailPrice?: number;
  stockCount?: number;
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
  public deliveryCrateInstance?: DeliveryCrate3D;
  public dumpsterGroup: THREE.Group;
  public managementPCGroup: THREE.Group;

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

    // Mark register and subcomponents as interactable
    this.cashRegister.group.userData = {
      interactionType: 'register',
      promptText: '[E] Open Cash Register / Settle Transaction',
    };
    this.interactables.push(this.cashRegister.group);
    this.interactables.push(this.cashRegister.scannerGroup);
    this.interactables.push(this.cashRegister.posGroup);
    this.cashRegister.billCompartments.forEach((b) => this.interactables.push(b));

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

    // 9. Exterior Dumpster at X=-6, Z=6.5
    this.dumpsterGroup = this.buildExteriorDumpster();

    // 10. In-Store Management PC Desk in back corner
    this.managementPCGroup = this.buildManagementPCDesk();
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

        // 3D Shelf Price Tag mounted on shelf front lip
        const tagCanvas = document.createElement('canvas');
        tagCanvas.width = 160;
        tagCanvas.height = 64;
        const tagTex = new THREE.CanvasTexture(tagCanvas);
        tagTex.colorSpace = THREE.SRGBColorSpace;
        const tagMat = new THREE.MeshBasicMaterial({ map: tagTex });
        const tagMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.08), tagMat);
        tagMesh.position.set(s, y + 0.04, 0.305);
        backShelfGroup.add(tagMesh);

        // Invisible bounding slot mesh for raycasting [E] to stock cartons
        const slotGeom = new THREE.BoxGeometry(0.5, 0.35, 0.4);
        const slotMat = new THREE.MeshBasicMaterial({ visible: false });
        const slotMesh = new THREE.Mesh(slotGeom, slotMat);
        slotMesh.position.copy(worldPos);

        const slotObj: ShelfSlot3D = {
          id: slotId,
          position: worldPos,
          rotation: new THREE.Euler(0, 0, 0),
          category: categories[i],
          priceTagMesh: tagMesh,
          priceTagCanvas: tagCanvas,
          priceTagTexture: tagTex,
          slotMesh: slotMesh,
          wholesaleCost: 0,
          retailPrice: 0,
          stockCount: 0,
        };

        slotMesh.userData = {
          interactionType: 'shelf_slot',
          promptText: '[E] Stock Carton on Shelf',
          slot: slotObj,
        };
        this.interactables.push(slotMesh);
        this.group.add(slotMesh);
        this.shelfSlots.push(slotObj);

        this.updateShelfPriceTag(slotObj);
      }
    }

    this.group.add(backShelfGroup);
  }

  public updateShelfPriceTag(slot: ShelfSlot3D): void {
    if (!slot.priceTagCanvas || !slot.priceTagTexture) return;
    const ctx = slot.priceTagCanvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 160, 64);
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 158, 62);

    // Green header bar
    ctx.fillStyle = '#1b5e3c';
    ctx.fillRect(1, 1, 158, 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    const prodName = slot.currentProduct ? slot.currentProduct.product.name.substring(0, 14) : 'EMPTY SLOT';
    ctx.fillText(prodName, 80, 14);

    // Wholesale Cost & Retail Price
    ctx.textAlign = 'left';
    ctx.fillStyle = '#555555';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`COST: ₦${slot.wholesaleCost || 0}`, 6, 32);

    ctx.fillStyle = '#1b5e3c';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`SELL: ₦${slot.retailPrice || 0}`, 6, 48);

    // Stock count indicator
    ctx.fillStyle = (slot.stockCount || 0) > 0 ? '#0d47a1' : '#c62828';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`QTY: ${slot.stockCount || 0}`, 154, 52);

    slot.priceTagTexture.needsUpdate = true;
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
    // Curb delivery pallet at Z=7.5
    palletGroup.position.set(0, 0, 7.5);

    // Wooden Pallet
    const woodPalletMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.8 });
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 1.6), woodPalletMat);
    pallet.position.y = 0.08;
    pallet.receiveShadow = true;
    palletGroup.add(pallet);

    // Pallet wood slats
    for (let i = -0.65; i <= 0.65; i += 0.32) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.03, 0.18), woodPalletMat);
      slat.position.set(0, 0.17, i);
      palletGroup.add(slat);
    }

    pallet.userData = {
      interactionType: 'curb_pallet',
      promptText: 'Curb Delivery Receiving Pallet (Z=7.5)',
    };
    this.interactables.push(pallet);

    this.group.add(palletGroup);
    return pallet;
  }

  private buildExteriorDumpster(): THREE.Group {
    const dumpsterGroup = new THREE.Group();
    // Exterior dumpster at X=-6, Z=6.5
    dumpsterGroup.position.set(-6.0, 0, 6.5);

    // Large metal dumpster body
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x1b3b22,
      roughness: 0.55,
      metalness: 0.65,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.3), metalMat);
    body.position.y = 0.55;
    body.castShadow = true;
    body.receiveShadow = true;
    dumpsterGroup.add(body);

    // Heavy sloped metal lid
    const lidMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.7,
      metalness: 0.4,
    });
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.08, 1.35), lidMat);
    lid.position.set(0, 1.14, -0.05);
    lid.rotation.x = -Math.PI / 8;
    dumpsterGroup.add(lid);

    // Front trash label
    const stencilCanvas = document.createElement('canvas');
    stencilCanvas.width = 256;
    stencilCanvas.height = 64;
    const sCtx = stencilCanvas.getContext('2d')!;
    sCtx.fillStyle = '#1b3b22';
    sCtx.fillRect(0, 0, 256, 64);
    sCtx.fillStyle = '#ffffff';
    sCtx.font = 'bold 22px monospace';
    sCtx.textAlign = 'center';
    sCtx.fillText('COMMUNITY DUMPSTER', 128, 40);
    const stencilTex = new THREE.CanvasTexture(stencilCanvas);
    const stencil = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.3), new THREE.MeshBasicMaterial({ map: stencilTex }));
    stencil.position.set(0, 0.7, 0.66);
    dumpsterGroup.add(stencil);

    dumpsterGroup.userData = {
      interactionType: 'dumpster',
      promptText: '[E] Throw Empty Crate into Dumpster',
    };
    this.interactables.push(dumpsterGroup);
    this.group.add(dumpsterGroup);
    return dumpsterGroup;
  }

  private buildManagementPCDesk(): THREE.Group {
    const pcDeskGroup = new THREE.Group();
    // Back corner PC desk
    pcDeskGroup.position.set(3.6, 0, -4.8);

    const deskMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.7 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.0), deskMat);
    desk.position.y = 0.5;
    desk.castShadow = true;
    desk.receiveShadow = true;
    pcDeskGroup.add(desk);

    // LCD Monitor
    const standGeom = new THREE.CylinderGeometry(0.04, 0.08, 0.25, 12);
    const plasticMat = new THREE.MeshStandardMaterial({ color: 0x1f2326, roughness: 0.5 });
    const stand = new THREE.Mesh(standGeom, plasticMat);
    stand.position.set(0, 1.12, 0);
    pcDeskGroup.add(stand);

    const monitorGeom = new THREE.BoxGeometry(0.85, 0.55, 0.06);
    const monitor = new THREE.Mesh(monitorGeom, plasticMat);
    monitor.position.set(0, 1.45, 0);
    pcDeskGroup.add(monitor);

    // Glowing monitor screen
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 256;
    screenCanvas.height = 160;
    const sCtx = screenCanvas.getContext('2d')!;
    sCtx.fillStyle = '#081f3d';
    sCtx.fillRect(0, 0, 256, 160);
    sCtx.fillStyle = '#00ffcc';
    sCtx.font = 'bold 18px sans-serif';
    sCtx.textAlign = 'center';
    sCtx.fillText('PHARMASUPPLY B2B', 128, 38);
    sCtx.fillStyle = '#ffffff';
    sCtx.font = '13px monospace';
    sCtx.fillText('DEBT: ₦4,200,000', 128, 75);
    sCtx.fillStyle = '#ffd700';
    sCtx.fillText('[E] WHOLESALE ORDERS', 128, 120);
    const screenTex = new THREE.CanvasTexture(screenCanvas);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ map: screenTex }));
    screen.position.set(0, 1.45, 0.035);
    screen.rotation.y = Math.PI;
    pcDeskGroup.add(screen);

    // Keyboard & Mouse
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 0.18), plasticMat);
    kb.position.set(0, 1.02, 0.28);
    pcDeskGroup.add(kb);

    const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.12), plasticMat);
    mouse.position.set(0.35, 1.02, 0.28);
    pcDeskGroup.add(mouse);

    // PC Tower
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.5), plasticMat);
    tower.position.set(0.65, 0.3, 0);
    pcDeskGroup.add(tower);

    // User data for interaction
    desk.userData = {
      interactionType: 'management_pc',
      promptText: '[E] Open In-Store Management PC (PharmaSupply & Debt)',
    };
    monitor.userData = {
      interactionType: 'management_pc',
      promptText: '[E] Open In-Store Management PC (PharmaSupply & Debt)',
    };
    this.interactables.push(desk);
    this.interactables.push(monitor);

    this.group.add(pcDeskGroup);
    return pcDeskGroup;
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

  public spawnDeliveryCrate(product: Product, totalItems: number = 8): DeliveryCrate3D {
    if (this.deliveryCrateInstance) {
      this.group.remove(this.deliveryCrateInstance.group);
      const idx = this.interactables.indexOf(this.deliveryCrateInstance.group);
      if (idx !== -1) this.interactables.splice(idx, 1);
    }

    const crate = new DeliveryCrate3D(product, totalItems);
    // Curb delivery pallet at Z=7.5
    crate.group.position.set(0, 0.16, 7.5);

    this.group.add(crate.group);
    this.interactables.push(crate.group);
    this.deliveryCrateInstance = crate;
    this.deliveryCrateGroup = crate.group;
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
      slot.wholesaleCost = prd.baseCost;
      slot.retailPrice = prd.baseRetail;
      slot.stockCount = 1;
      this.updateShelfPriceTag(slot);
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
