import * as THREE from 'three';

export class CashRegister3D {
  public group: THREE.Group;
  public drawerMesh: THREE.Mesh;
  public displayCanvas: HTMLCanvasElement;
  public displayTexture: THREE.CanvasTexture;
  public posDisplayCanvas: HTMLCanvasElement;
  public posDisplayTexture: THREE.CanvasTexture;
  public isDrawerOpen = false;
  public currentPrice = 0;
  private drawerTargetZ = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'cash_register_unit';

    // Build display texture
    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.width = 256;
    this.displayCanvas.height = 64;
    this.displayTexture = new THREE.CanvasTexture(this.displayCanvas);
    this.displayTexture.colorSpace = THREE.SRGBColorSpace;
    this.updateDisplay(0);

    // Build POS terminal screen texture
    this.posDisplayCanvas = document.createElement('canvas');
    this.posDisplayCanvas.width = 128;
    this.posDisplayCanvas.height = 96;
    this.posDisplayTexture = new THREE.CanvasTexture(this.posDisplayCanvas);
    this.posDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    this.updatePosScreen('READY', '₦0');

    // Register Main Base
    const baseGeom = new THREE.BoxGeometry(1.6, 0.45, 1.4);
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x2e3338,
      roughness: 0.4,
      metalness: 0.6,
    });
    const baseMesh = new THREE.Mesh(baseGeom, metalMat);
    baseMesh.position.y = 0.225;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    this.group.add(baseMesh);

    // Sliding Cash Drawer
    const drawerGeom = new THREE.BoxGeometry(1.5, 0.35, 1.3);
    const drawerMat = new THREE.MeshStandardMaterial({
      color: 0x1f2327,
      roughness: 0.5,
      metalness: 0.4,
    });
    this.drawerMesh = new THREE.Mesh(drawerGeom, drawerMat);
    this.drawerMesh.position.set(0, 0.2, 0);
    this.drawerMesh.castShadow = true;
    this.group.add(this.drawerMesh);

    // Add Naira bills in drawer
    this.addNairaBillsToDrawer(this.drawerMesh);

    // Angled Keyboard Housing
    const keyHousingGeom = new THREE.BoxGeometry(1.4, 0.3, 0.8);
    const keyHousingMat = new THREE.MeshStandardMaterial({ color: 0x3d444b, roughness: 0.5 });
    const keyHousingMesh = new THREE.Mesh(keyHousingGeom, keyHousingMat);
    keyHousingMesh.position.set(0, 0.55, 0.1);
    keyHousingMesh.rotation.x = -Math.PI / 10;
    keyHousingMesh.castShadow = true;
    this.group.add(keyHousingMesh);

    // Keypad buttons
    this.addKeypadButtons(keyHousingMesh);

    // Raised Customer Pole Display
    const poleGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 12);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
    const poleMesh = new THREE.Mesh(poleGeom, poleMat);
    poleMesh.position.set(0.45, 0.75, -0.45);
    this.group.add(poleMesh);

    // Raised LED Display Pod
    const displayPodGeom = new THREE.BoxGeometry(0.9, 0.35, 0.25);
    const displayPodMat = new THREE.MeshStandardMaterial({ color: 0x181a1c, roughness: 0.3 });
    const displayPodMesh = new THREE.Mesh(displayPodGeom, displayPodMat);
    displayPodMesh.position.set(0.45, 1.1, -0.45);
    displayPodMesh.castShadow = true;
    this.group.add(displayPodMesh);

    // Glowing LED Screen Face
    const screenGeom = new THREE.PlaneGeometry(0.8, 0.25);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.displayTexture,
    });
    const screenMesh = new THREE.Mesh(screenGeom, screenMat);
    screenMesh.position.set(0, 0, 0.126);
    displayPodMesh.add(screenMesh);

    // POS Terminal beside the register
    this.buildPosTerminal();

    // Pill Counting Tray on counter
    this.buildCountingTray();

    this.group.userData = { isCashRegister: true };
  }

  private buildPosTerminal(): void {
    const posGroup = new THREE.Group();
    posGroup.name = 'pos_terminal';
    posGroup.position.set(1.4, 0.05, 0.15);
    posGroup.rotation.y = -Math.PI / 12;

    // Handheld POS body (OPay / Moniepoint style)
    const posBodyGeom = new THREE.BoxGeometry(0.65, 0.18, 1.1);
    const posBodyMat = new THREE.MeshStandardMaterial({ color: 0x1c6758, roughness: 0.4 });
    const posBody = new THREE.Mesh(posBodyGeom, posBodyMat);
    posBody.position.y = 0.09;
    posBody.rotation.x = -Math.PI / 16;
    posBody.castShadow = true;
    posGroup.add(posBody);

    // Blue LCD display
    const screenGeom = new THREE.PlaneGeometry(0.5, 0.4);
    const screenMat = new THREE.MeshBasicMaterial({ map: this.posDisplayTexture });
    const screenMesh = new THREE.Mesh(screenGeom, screenMat);
    screenMesh.rotation.x = -Math.PI / 2;
    screenMesh.position.set(0, 0.185, -0.2);
    posGroup.add(screenMesh);

    // POS keypad buttons
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const keyGeom = new THREE.BoxGeometry(0.08, 0.03, 0.06);
        const keyMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const keyMesh = new THREE.Mesh(keyGeom, keyMat);
        keyMesh.position.set(-0.15 + c * 0.15, 0.19, 0.1 + r * 0.1);
        posGroup.add(keyMesh);
      }
    }

    this.group.add(posGroup);
  }

  private buildCountingTray(): void {
    const trayGroup = new THREE.Group();
    trayGroup.name = 'counting_tray';
    trayGroup.position.set(-1.4, 0.02, 0.1);

    // Stainless steel tray plate
    const trayGeom = new THREE.BoxGeometry(1.1, 0.04, 0.8);
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      metalness: 0.9,
      roughness: 0.2,
    });
    const trayMesh = new THREE.Mesh(trayGeom, steelMat);
    trayMesh.castShadow = true;
    trayMesh.receiveShadow = true;
    trayGroup.add(trayMesh);

    // Dispensing Spatula
    const handleGeom = new THREE.BoxGeometry(0.06, 0.03, 0.4);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.6 });
    const handleMesh = new THREE.Mesh(handleGeom, handleMat);
    handleMesh.position.set(0.5, 0.03, 0.1);
    handleMesh.rotation.y = 0.2;
    trayGroup.add(handleMesh);

    const bladeGeom = new THREE.BoxGeometry(0.08, 0.015, 0.5);
    const bladeMesh = new THREE.Mesh(bladeGeom, steelMat);
    bladeMesh.position.set(0.44, 0.03, -0.2);
    bladeMesh.rotation.y = 0.2;
    trayGroup.add(bladeMesh);

    this.group.add(trayGroup);
  }

  private addKeypadButtons(parent: THREE.Mesh): void {
    const colors = [0xeeeeee, 0xd49826, 0x329663, 0xd13438];
    let cIdx = 0;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        const keyGeom = new THREE.BoxGeometry(0.18, 0.06, 0.12);
        const keyMat = new THREE.MeshStandardMaterial({
          color: colors[cIdx % colors.length],
          roughness: 0.5,
        });
        const keyMesh = new THREE.Mesh(keyGeom, keyMat);
        keyMesh.position.set(-0.45 + col * 0.22, 0.18, -0.25 + row * 0.16);
        parent.add(keyMesh);
        cIdx++;
      }
    }
  }

  private addNairaBillsToDrawer(drawer: THREE.Mesh): void {
    const billColors = [0x2e7d32, 0xb71c1c, 0x1565c0]; // ₦1000 green, ₦500 red, ₦200 blue
    for (let slot = 0; slot < 3; slot++) {
      const posX = -0.45 + slot * 0.45;
      const stackGeom = new THREE.BoxGeometry(0.38, 0.08, 0.7);
      const stackMat = new THREE.MeshStandardMaterial({
        color: billColors[slot],
        roughness: 0.8,
      });
      const stackMesh = new THREE.Mesh(stackGeom, stackMat);
      stackMesh.position.set(posX, 0.12, 0);
      drawer.add(stackMesh);
    }
  }

  public updateDisplay(amount: number): void {
    this.currentPrice = amount;
    const ctx = this.displayCanvas.getContext('2d')!;
    ctx.fillStyle = '#0a1a0f';
    ctx.fillRect(0, 0, 256, 64);

    // Bright green fluorescent LED digits
    ctx.fillStyle = '#00ff66';
    ctx.font = '900 32px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`₦${amount.toLocaleString()}`, 240, 44);
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('TOTAL:', 14, 40);

    this.displayTexture.needsUpdate = true;
  }

  public updatePosScreen(status: string, subtext: string): void {
    const ctx = this.posDisplayCanvas.getContext('2d')!;
    ctx.fillStyle = '#081f3d';
    ctx.fillRect(0, 0, 128, 96);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(status, 64, 35);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(subtext, 64, 65);
    ctx.textAlign = 'left';

    this.posDisplayTexture.needsUpdate = true;
  }

  public openDrawer(): void {
    this.isDrawerOpen = true;
    this.drawerTargetZ = 0.9; // Slides open forward
  }

  public closeDrawer(): void {
    this.isDrawerOpen = false;
    this.drawerTargetZ = 0;
  }

  public update(delta: number): void {
    this.drawerMesh.position.z = THREE.MathUtils.lerp(
      this.drawerMesh.position.z,
      this.drawerTargetZ,
      Math.min(1, delta * 10)
    );
  }
}
