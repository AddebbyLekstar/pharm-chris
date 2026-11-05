import * as THREE from 'three';
import { Product } from '../../sim/types';
import { MedicineTextureGenerator, BoxTextureSet } from './MedicineTextures';
import { BlisterStrip3D } from './BlisterStrip3D';

export type PackagingType = 'carton' | 'bottle' | 'vial';

export class ProductBox3D {
  public group: THREE.Group;
  public product: Product;
  public packagingType: PackagingType;
  public textureSet?: BoxTextureSet;
  public blisterStrip?: BlisterStrip3D;
  public isBlisterExtended = false;
  public mesh: THREE.Mesh;
  public isCounterfeit: boolean;
  public batchNumber: string;
  public expiryDate: string;
  public masCode: string;

  // Transform target for smooth movement
  public targetPosition = new THREE.Vector3();
  public targetRotation = new THREE.Euler();
  public targetScale = new THREE.Vector3(1, 1, 1);
  public isInspecting = false;

  constructor(
    product: Product,
    batchNumber = '#OK-902',
    expiryDate = '11/2028',
    masCode = '3892-0192-88',
    isCounterfeit = false
  ) {
    this.product = product;
    this.batchNumber = batchNumber;
    this.expiryDate = expiryDate;
    this.masCode = masCode;
    this.isCounterfeit = isCounterfeit;
    this.group = new THREE.Group();
    this.group.name = `box_${product.id}`;

    if (product.id.includes('elixir') || product.id.includes('susp') || product.id.includes('paediatric')) {
      this.packagingType = 'bottle';
    } else if (product.isColdChain) {
      this.packagingType = 'vial';
    } else {
      this.packagingType = 'carton';
    }

    this.mesh = this.buildGeometryAndMaterials();
    this.group.add(this.mesh);

    // Add Blister Strip for tablets if fractional allowed or anti-malarial/antibiotic
    if (
      this.packagingType === 'carton' &&
      (product.fractionalAllowed || product.hasMasScratchCode)
    ) {
      const count = product.id.includes('malaguard') ? 6 : product.id.includes('clavumed') ? 14 : 10;
      const foilExpiry = isCounterfeit
        ? 'EXP 06/2026 LOT MG204'
        : `EXP ${expiryDate} LOT ${batchNumber.replace('#', '')}`;
      this.blisterStrip = new BlisterStrip3D(count, '#F5F5FA', foilExpiry);
      this.blisterStrip.group.position.set(0, 0, 0);
      this.blisterStrip.group.rotation.set(0, 0, Math.PI / 2);
      this.blisterStrip.group.visible = false;
      this.group.add(this.blisterStrip.group);
    }

    this.group.userData = {
      isProductBox: true,
      productId: product.id,
      productBoxInstance: this,
    };
  }

  private buildGeometryAndMaterials(): THREE.Mesh {
    if (this.packagingType === 'bottle') {
      return this.buildAmberBottle();
    } else if (this.packagingType === 'vial') {
      return this.buildBiologicVial();
    } else {
      return this.buildStandardCarton();
    }
  }

  private buildStandardCarton(): THREE.Mesh {
    const width = 0.9;
    const height = 1.35;
    const depth = 0.5;

    this.textureSet = MedicineTextureGenerator.generateCartonTextures(
      this.product,
      this.batchNumber,
      this.expiryDate,
      this.masCode,
      this.isCounterfeit
    );

    // BoxGeometry material array orders: Right, Left, Top, Bottom, Front, Back
    const materials = [
      new THREE.MeshStandardMaterial({ map: this.textureSet.right, roughness: 0.35 }),
      new THREE.MeshStandardMaterial({ map: this.textureSet.left, roughness: 0.35 }),
      new THREE.MeshStandardMaterial({ map: this.textureSet.top, roughness: 0.35 }),
      new THREE.MeshStandardMaterial({ map: this.textureSet.bottom, roughness: 0.35 }),
      new THREE.MeshStandardMaterial({ map: this.textureSet.front, roughness: 0.35 }),
      new THREE.MeshStandardMaterial({ map: this.textureSet.back, roughness: 0.35 }),
    ];

    const geom = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geom, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildAmberBottle(): THREE.Mesh {
    const group = new THREE.Group();

    // Amber bottle body (brown glass)
    const bodyGeom = new THREE.CylinderGeometry(0.32, 0.32, 1.1, 24);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x4a2a10,
      roughness: 0.15,
      transmission: 0.7,
      transparent: true,
      opacity: 0.85,
      ior: 1.5,
    });
    const bodyMesh = new THREE.Mesh(bodyGeom, glassMat);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    // White screw cap
    const capGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.25, 20);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const capMesh = new THREE.Mesh(capGeom, capMat);
    capMesh.position.y = 0.65;
    group.add(capMesh);

    // Paper Label around bottle
    const labelGeom = new THREE.CylinderGeometry(0.325, 0.325, 0.75, 24, 1, true);
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 512;
    labelCanvas.height = 256;
    const lCtx = labelCanvas.getContext('2d')!;
    lCtx.fillStyle = '#FFF8EE';
    lCtx.fillRect(0, 0, 512, 256);
    lCtx.fillStyle = this.product.pixelColor || '#B84A28';
    lCtx.fillRect(0, 0, 512, 40);
    lCtx.fillStyle = '#FFFFFF';
    lCtx.font = 'bold 22px sans-serif';
    lCtx.fillText(this.product.name.toUpperCase(), 20, 28);
    lCtx.fillStyle = '#222222';
    lCtx.font = 'bold 20px sans-serif';
    lCtx.fillText(this.product.name, 20, 80);
    lCtx.font = '16px sans-serif';
    lCtx.fillText(this.product.unitDescription, 20, 110);
    lCtx.fillStyle = '#555555';
    lCtx.font = 'bold 14px monospace';
    lCtx.fillText(`BATCH: ${this.batchNumber}`, 20, 160);
    lCtx.fillText(`EXP: ${this.expiryDate}`, 20, 185);
    lCtx.fillText(`NAFDAC REG: 04-${this.isCounterfeit ? '9912 (SUSPECT)' : '8821'}`, 20, 215);

    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.MeshStandardMaterial({
      map: labelTex,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const labelMesh = new THREE.Mesh(labelGeom, labelMat);
    group.add(labelMesh);

    const containerGeom = new THREE.BoxGeometry(0.7, 1.4, 0.7);
    const containerMat = new THREE.MeshBasicMaterial({ visible: false });
    const containerMesh = new THREE.Mesh(containerGeom, containerMat);
    containerMesh.add(group);
    return containerMesh;
  }

  private buildBiologicVial(): THREE.Mesh {
    const group = new THREE.Group();

    // Clear frosted glass vial
    const vialGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.9, 20);
    const vialMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2f1,
      roughness: 0.2,
      transmission: 0.85,
      transparent: true,
      opacity: 0.9,
      ior: 1.4,
    });
    const vialMesh = new THREE.Mesh(vialGeom, vialMat);
    group.add(vialMesh);

    // Cold-chain frost frost ring
    const frostGeom = new THREE.CylinderGeometry(0.242, 0.242, 0.85, 20);
    const frostMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      transparent: true,
      opacity: 0.35,
    });
    group.add(new THREE.Mesh(frostGeom, frostMat));

    // Aluminum crimp & teal rubber stopper
    const crimpGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.15, 20);
    const crimpMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 });
    const crimpMesh = new THREE.Mesh(crimpGeom, crimpMat);
    crimpMesh.position.y = 0.52;
    group.add(crimpMesh);

    const topGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16);
    const topMat = new THREE.MeshStandardMaterial({ color: 0x00897b, roughness: 0.5 });
    const topMesh = new THREE.Mesh(topGeom, topMat);
    topMesh.position.y = 0.61;
    group.add(topMesh);

    const containerGeom = new THREE.BoxGeometry(0.6, 1.3, 0.6);
    const containerMat = new THREE.MeshBasicMaterial({ visible: false });
    const containerMesh = new THREE.Mesh(containerGeom, containerMat);
    containerMesh.add(group);
    return containerMesh;
  }

  /**
   * Perform interactive scratch-off on the MAS foil
   */
  public scratchFoil(): boolean {
    if (!this.textureSet || !this.textureSet.scratchCanvas) return false;
    const canvas = this.textureSet.scratchCanvas;
    const ctx = canvas.getContext('2d')!;

    // Scratch off silver foil with coin/scratch marks
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const r = 8 + Math.random() * 14;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    if (this.textureSet.scratchTexture) {
      this.textureSet.scratchTexture.needsUpdate = true;
    }
    this.textureSet.isScratched = true;
    return true;
  }

  /**
   * Toggle blister pack sliding in and out of the carton
   */
  public toggleBlisterSlide(): boolean {
    if (!this.blisterStrip) return false;
    this.isBlisterExtended = !this.isBlisterExtended;
    this.blisterStrip.group.visible = true;
    return this.isBlisterExtended;
  }

  /**
   * Animate smooth transform transitions
   */
  public update(delta: number): void {
    const lerpSpeed = Math.min(1, delta * 8);
    this.group.position.lerp(this.targetPosition, lerpSpeed);

    this.group.quaternion.slerp(
      new THREE.Quaternion().setFromEuler(this.targetRotation),
      lerpSpeed
    );

    this.group.scale.lerp(this.targetScale, lerpSpeed);

    // If blister strip is sliding out
    if (this.blisterStrip) {
      const targetX = this.isBlisterExtended ? 0.75 : 0;
      this.blisterStrip.group.position.x = THREE.MathUtils.lerp(
        this.blisterStrip.group.position.x,
        targetX,
        lerpSpeed * 1.5
      );
      if (!this.isBlisterExtended && Math.abs(this.blisterStrip.group.position.x) < 0.05) {
        this.blisterStrip.group.visible = false;
      }
    }
  }
}
