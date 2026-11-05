import * as THREE from 'three';

export interface BlisterTablet {
  mesh: THREE.Mesh;
  index: number;
  popped: boolean;
}

export class BlisterStrip3D {
  public group: THREE.Group;
  public tablets: BlisterTablet[] = [];
  public totalTablets: number;
  public poppedCount = 0;
  private foilMaterial: THREE.MeshStandardMaterial;
  private tabletMaterial: THREE.MeshStandardMaterial;
  private emptyFoilMaterial: THREE.MeshStandardMaterial;

  constructor(
    totalTablets = 10,
    tabletColor = '#FFFFFF',
    foilExpiry = 'EXP 06/2026 LOT MG204'
  ) {
    this.totalTablets = totalTablets;
    this.group = new THREE.Group();
    this.group.name = 'blister_strip';

    // Metallic reflective aluminum foil material
    this.foilMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.85,
      roughness: 0.25,
    });

    this.tabletMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tabletColor),
      roughness: 0.5,
      metalness: 0.05,
    });

    this.emptyFoilMaterial = new THREE.MeshStandardMaterial({
      color: 0x777777,
      metalness: 0.9,
      roughness: 0.6,
      transparent: true,
      opacity: 0.6,
    });

    this.buildStrip(foilExpiry);
  }

  private buildStrip(foilExpiry: string): void {
    // Dimensions for standard 2x5 or 2x7 strip
    const rows = 2;
    const cols = Math.ceil(this.totalTablets / 2);
    const spacingX = 0.32;
    const spacingZ = 0.36;
    const width = cols * spacingX + 0.2;
    const depth = rows * spacingZ + 0.2;
    const thickness = 0.015;

    // Base foil strip
    const baseGeom = new THREE.BoxGeometry(width, thickness, depth);
    const baseMesh = new THREE.Mesh(baseGeom, this.foilMaterial);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    this.group.add(baseMesh);

    // Add stamped foil text on the edge (canvas texture)
    const stampCanvas = document.createElement('canvas');
    stampCanvas.width = 512;
    stampCanvas.height = 64;
    const sCtx = stampCanvas.getContext('2d')!;
    sCtx.fillStyle = '#CCCCCC';
    sCtx.fillRect(0, 0, 512, 64);
    sCtx.fillStyle = '#555555';
    sCtx.font = 'bold 22px monospace';
    sCtx.fillText(foilExpiry, 20, 42);
    const stampTex = new THREE.CanvasTexture(stampCanvas);
    const stampMat = new THREE.MeshStandardMaterial({
      map: stampTex,
      metalness: 0.8,
      roughness: 0.3,
    });
    const stampGeom = new THREE.PlaneGeometry(width * 0.9, 0.12);
    const stampMesh = new THREE.Mesh(stampGeom, stampMat);
    stampMesh.rotation.x = -Math.PI / 2;
    stampMesh.position.set(0, thickness / 2 + 0.001, depth / 2 - 0.08);
    this.group.add(stampMesh);

    // Add blister bubbles & tablets
    let count = 0;
    const startX = -((cols - 1) * spacingX) / 2;
    const startZ = -((rows - 1) * spacingZ) / 2;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (count >= this.totalTablets) break;

        const posX = startX + c * spacingX;
        const posZ = startZ + r * spacingZ;

        // Blister dome (plastic / bubble)
        const bubbleGeom = new THREE.CylinderGeometry(0.1, 0.11, 0.08, 16);
        const tabletMesh = new THREE.Mesh(bubbleGeom, this.tabletMaterial);
        tabletMesh.position.set(posX, 0.045, posZ);
        tabletMesh.castShadow = true;
        tabletMesh.userData = { isTablet: true, tabletIndex: count };
        this.group.add(tabletMesh);

        this.tablets.push({
          mesh: tabletMesh,
          index: count,
          popped: false,
        });

        count++;
      }
    }
  }

  /**
   * Pop a tablet out of the blister strip
   */
  public popTablet(index: number): boolean {
    const tab = this.tablets[index];
    if (!tab || tab.popped) return false;

    tab.popped = true;
    this.poppedCount++;

    // Morph to crushed / empty foil depression
    tab.mesh.scale.set(0.9, 0.25, 0.9);
    tab.mesh.position.y = 0.012;
    tab.mesh.material = this.emptyFoilMaterial;
    return true;
  }

  /**
   * Reset all tablets back into strip
   */
  public resetTablets(): void {
    this.poppedCount = 0;
    for (const tab of this.tablets) {
      tab.popped = false;
      tab.mesh.scale.set(1, 1, 1);
      tab.mesh.position.y = 0.045;
      tab.mesh.material = this.tabletMaterial;
    }
  }
}
