import * as THREE from 'three';
import { Product } from '../../sim/types';
import { soundFx } from '../../audio/sfx';

export interface DeliveryCrateData {
  crateId: string;
  productId: string;
  productName: string;
  totalItems: number;
  remainingItems: number;
  unitCost: number;
  isColdChain: boolean;
  opened: boolean;
  isTrash: boolean;
}

export class DeliveryCrate3D {
  public group: THREE.Group;
  public data: DeliveryCrateData;
  public product: Product;
  public tapeMesh: THREE.Mesh;
  public flapLeft: THREE.Mesh;
  public flapRight: THREE.Mesh;
  public interiorItemsGroup: THREE.Group;
  public itemMeshes: THREE.Mesh[] = [];
  public labelCanvas: HTMLCanvasElement;
  public labelTexture: THREE.CanvasTexture;

  constructor(product: Product, totalItems: number = 8, crateId?: string) {
    this.product = product;
    this.group = new THREE.Group();
    this.group.name = `delivery_crate_${product.id}_${Date.now()}`;

    this.data = {
      crateId: crateId || `crate_${Math.random().toString(36).substring(2, 9)}`,
      productId: product.id,
      productName: product.name,
      totalItems,
      remainingItems: totalItems,
      unitCost: product.baseCost,
      isColdChain: product.category === 'cold_chain' || product.id.includes('insulin'),
      opened: false,
      isTrash: false,
    };

    // Label Texture
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 512;
    this.labelCanvas.height = 256;
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.updateLabel();

    // Main Box Body (Length: 0.65m, Height: 0.45m, Width: 0.5m)
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x8d6e63,
      roughness: 0.88,
      metalness: 0.05,
    });
    const bodyGeom = new THREE.BoxGeometry(0.65, 0.42, 0.5);
    const bodyMesh = new THREE.Mesh(bodyGeom, boxMat);
    bodyMesh.position.y = 0.21;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.group.add(bodyMesh);

    // Shipping Labels on front and top
    const labelMat = new THREE.MeshBasicMaterial({
      map: this.labelTexture,
      transparent: true,
    });
    const labelMeshFront = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.28), labelMat);
    labelMeshFront.position.set(0, 0.21, 0.252);
    this.group.add(labelMeshFront);

    const labelMeshSide = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), labelMat);
    labelMeshSide.rotation.y = Math.PI / 2;
    labelMeshSide.position.set(0.327, 0.21, 0);
    this.group.add(labelMeshSide);

    // Interior Items (Medicine packs visible when opened)
    this.interiorItemsGroup = new THREE.Group();
    this.interiorItemsGroup.position.set(0, 0.28, 0);
    this.interiorItemsGroup.visible = false;
    this.group.add(this.interiorItemsGroup);

    this.buildInternalPacks();

    // Top Flaps (Left & Right)
    const flapMat = new THREE.MeshStandardMaterial({
      color: 0x795548,
      roughness: 0.9,
    });
    const flapGeom = new THREE.BoxGeometry(0.65, 0.02, 0.25);

    this.flapLeft = new THREE.Mesh(flapGeom, flapMat);
    this.flapLeft.position.set(0, 0.425, -0.125);
    this.group.add(this.flapLeft);

    this.flapRight = new THREE.Mesh(flapGeom, flapMat);
    this.flapRight.position.set(0, 0.425, 0.125);
    this.group.add(this.flapRight);

    // Tamper-Evident Shipping Tape sealing flaps
    const tapeMat = new THREE.MeshStandardMaterial({
      color: this.data.isColdChain ? 0x00acc1 : 0xd49826,
      metalness: 0.4,
      roughness: 0.5,
    });
    const tapeGeom = new THREE.BoxGeometry(0.66, 0.025, 0.08);
    this.tapeMesh = new THREE.Mesh(tapeGeom, tapeMat);
    this.tapeMesh.position.set(0, 0.432, 0);
    this.group.add(this.tapeMesh);

    // Interaction metadata
    this.updateUserData();
  }

  private updateLabel(): void {
    const ctx = this.labelCanvas.getContext('2d')!;
    ctx.fillStyle = '#f5ede0';
    ctx.fillRect(0, 0, 512, 256);

    // Red border
    ctx.strokeStyle = '#c62828';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 496, 240);

    // Header
    ctx.fillStyle = '#1b5e3c';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('ORILE WHOLESALE DISTRIBUTORS', 24, 44);

    // Product info
    ctx.fillStyle = '#111111';
    ctx.font = '900 32px sans-serif';
    ctx.fillText(this.data.productName.toUpperCase().substring(0, 24), 24, 96);

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#37474f';
    ctx.fillText(`QTY: ${this.data.remainingItems}/${this.data.totalItems} PACKS`, 24, 138);
    ctx.fillText(`BATCH: #OK-${Math.floor(this.data.unitCost * 7)}`, 24, 172);

    if (this.data.isColdChain) {
      ctx.fillStyle = '#00838f';
      ctx.fillRect(24, 190, 200, 36);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('❄ COLD CHAIN (2-8°C)', 32, 215);
    } else {
      ctx.fillStyle = '#2e7d32';
      ctx.fillRect(24, 190, 200, 36);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('✓ NAFDAC VERIFIED', 32, 215);
    }

    // Fake Barcode lines
    ctx.fillStyle = '#111111';
    let bx = 300;
    while (bx < 480) {
      const w = (bx % 7 === 0 || bx % 11 === 0) ? 6 : 2;
      ctx.fillRect(bx, 130, w, 80);
      bx += w + 3;
    }

    this.labelTexture.needsUpdate = true;
  }

  private buildInternalPacks(): void {
    this.interiorItemsGroup.clear();
    this.itemMeshes = [];

    // 2 rows of 4 or 5 packs inside
    const count = this.data.remainingItems;
    const packMat = new THREE.MeshStandardMaterial({
      color: this.data.isColdChain ? 0x29b6f6 : 0x4caf50,
      roughness: 0.4,
    });
    const packGeom = new THREE.BoxGeometry(0.12, 0.18, 0.08);

    for (let i = 0; i < count; i++) {
      const pack = new THREE.Mesh(packGeom, packMat);
      const row = Math.floor(i / 4);
      const col = i % 4;
      pack.position.set(-0.2 + col * 0.13, 0.02, -0.09 + row * 0.18);
      pack.castShadow = true;
      this.interiorItemsGroup.add(pack);
      this.itemMeshes.push(pack);
    }
  }

  public openFlaps(): void {
    if (this.data.opened) return;
    this.data.opened = true;
    soundFx.playFoilScratch();

    // Remove or hide tape
    this.tapeMesh.visible = false;

    // Rotate flaps open outward
    this.flapLeft.rotation.z = Math.PI * 0.65;
    this.flapLeft.position.set(-0.35, 0.41, -0.125);

    this.flapRight.rotation.z = -Math.PI * 0.65;
    this.flapRight.position.set(0.35, 0.41, 0.125);

    // Show internal packs
    this.interiorItemsGroup.visible = true;
    this.updateUserData();
  }

  public takeItem(): boolean {
    if (!this.data.opened || this.data.remainingItems <= 0) return false;

    this.data.remainingItems--;
    if (this.itemMeshes.length > 0) {
      const removed = this.itemMeshes.pop();
      if (removed) this.interiorItemsGroup.remove(removed);
    }

    if (this.data.remainingItems === 0) {
      this.data.isTrash = true;
    }

    this.updateLabel();
    this.updateUserData();
    return true;
  }

  public updateUserData(): void {
    if (this.data.isTrash) {
      this.group.userData = {
        interactionType: 'delivery_crate',
        promptText: `[E] Pick Up Empty Box (Dispose in Dumpster)`,
        crateInstance: this,
        isTrash: true,
      };
    } else if (!this.data.opened) {
      this.group.userData = {
        interactionType: 'delivery_crate',
        promptText: `[E] Pick Up Crate: ${this.data.productName} (${this.data.remainingItems} packs)`,
        crateInstance: this,
        isTrash: false,
      };
    } else {
      this.group.userData = {
        interactionType: 'delivery_crate',
        promptText: `[E] Pick Up Open Crate: ${this.data.productName} (${this.data.remainingItems} left)`,
        crateInstance: this,
        isTrash: false,
      };
    }
  }

  /**
   * Creates a holographic translucent green ghost box for shelf placement preview
   */
  public static createGhostPreview(product: Product): THREE.Mesh {
    const geom = new THREE.BoxGeometry(0.35, 0.28, 0.18);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.55,
      wireframe: false,
    });
    const ghost = new THREE.Mesh(geom, mat);
    ghost.name = `ghost_preview_${product.id}`;
    return ghost;
  }
}
