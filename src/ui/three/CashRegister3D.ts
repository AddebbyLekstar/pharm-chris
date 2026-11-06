import * as THREE from 'three';
import { soundFx } from '../../audio/sfx';

export interface NairaDenomination {
  value: number;
  color: number;
  label: string;
  secondaryColor: string;
}

export class CashRegister3D {
  public group: THREE.Group;
  public drawerMesh: THREE.Mesh;
  public displayCanvas: HTMLCanvasElement;
  public displayTexture: THREE.CanvasTexture;
  public posDisplayCanvas: HTMLCanvasElement;
  public posDisplayTexture: THREE.CanvasTexture;
  public isDrawerOpen = false;
  public currentPrice = 0;
  public tenderedChange = 0;
  public changeRequired = 0;
  private drawerTargetZ = 0;

  // Interactive Scanner & Laser
  public scannerGroup: THREE.Group;
  public laserLine: THREE.Line;
  private laserTimeout: any = null;

  // Clickable Naira Bill Compartments
  public billCompartments: THREE.Mesh[] = [];
  public posGroup!: THREE.Group;
  public countingTrayGroup!: THREE.Group;

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

    // Handheld Barcode Scanner in cradle + Laser line
    const { scannerGroup, laserLine } = this.buildBarcodeScanner();
    this.scannerGroup = scannerGroup;
    this.laserLine = laserLine;
    this.group.add(this.scannerGroup);

    this.group.userData = { isCashRegister: true };
  }

  private buildBarcodeScanner(): { scannerGroup: THREE.Group; laserLine: THREE.Line } {
    const scannerGroup = new THREE.Group();
    scannerGroup.position.set(0.68, 0.42, 0.25);
    scannerGroup.rotation.y = -Math.PI / 6;

    // Cradle base
    const cradleGeom = new THREE.BoxGeometry(0.16, 0.12, 0.18);
    const cradleMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.6 });
    const cradle = new THREE.Mesh(cradleGeom, cradleMat);
    cradle.position.y = 0.06;
    scannerGroup.add(cradle);

    // Scanner Gun Body
    const gunGroup = new THREE.Group();
    gunGroup.position.set(0, 0.14, 0);
    gunGroup.rotation.x = -Math.PI / 8;

    // Handle
    const handleGeom = new THREE.BoxGeometry(0.06, 0.22, 0.08);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.3 });
    const handle = new THREE.Mesh(handleGeom, gunMat);
    gunGroup.add(handle);

    // Head
    const headGeom = new THREE.BoxGeometry(0.09, 0.1, 0.2);
    const head = new THREE.Mesh(headGeom, gunMat);
    head.position.set(0, 0.12, -0.06);
    gunGroup.add(head);

    // Optical Glass Window (red tint)
    const windowGeom = new THREE.PlaneGeometry(0.07, 0.07);
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });
    const glass = new THREE.Mesh(windowGeom, windowMat);
    glass.position.set(0, 0.12, -0.162);
    glass.rotation.y = Math.PI;
    gunGroup.add(glass);

    // Trigger
    const triggerGeom = new THREE.BoxGeometry(0.02, 0.04, 0.04);
    const triggerMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f });
    const trigger = new THREE.Mesh(triggerGeom, triggerMat);
    trigger.position.set(0, 0.03, -0.05);
    gunGroup.add(trigger);

    // Laser Line (starts from scanner window)
    const laserPoints = [new THREE.Vector3(0, 0.12, -0.17), new THREE.Vector3(-1.8, -0.15, -0.17)];
    const laserGeom = new THREE.BufferGeometry().setFromPoints(laserPoints);
    const laserMat = new THREE.LineBasicMaterial({ color: 0xff0033 });
    const laserLine = new THREE.Line(laserGeom, laserMat);
    laserLine.visible = false;
    gunGroup.add(laserLine);

    scannerGroup.add(gunGroup);

    scannerGroup.userData = {
      interactionType: 'scanner',
      promptText: '[Click] Pick Up Barcode Scanner / Scan Item',
    };

    return { scannerGroup, laserLine };
  }

  public fireScanner(targetWorldPos?: THREE.Vector3): void {
    if (this.laserTimeout) clearTimeout(this.laserTimeout);

    if (targetWorldPos) {
      const localTarget = targetWorldPos.clone();
      this.scannerGroup.worldToLocal(localTarget);
      const pts = [new THREE.Vector3(0, 0.26, -0.17), localTarget];
      this.laserLine.geometry.setFromPoints(pts);
    }

    this.laserLine.visible = true;
    soundFx.playBarcodeBeep();

    this.laserTimeout = setTimeout(() => {
      this.laserLine.visible = false;
    }, 220);
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
    this.billCompartments = [];
    const denoms: NairaDenomination[] = [
      { value: 1000, color: 0x1b5e20, label: '₦1000', secondaryColor: '#4caf50' },
      { value: 500, color: 0x880e4f, label: '₦500', secondaryColor: '#ad1457' },
      { value: 200, color: 0x0d47a1, label: '₦200', secondaryColor: '#1976d2' },
      { value: 100, color: 0xd84315, label: '₦100', secondaryColor: '#f4511e' },
      { value: 50, color: 0x00838f, label: '₦50', secondaryColor: '#00acc1' },
    ];

    const totalWidth = 1.36;
    const slotWidth = totalWidth / denoms.length;
    const startX = -totalWidth / 2 + slotWidth / 2;

    denoms.forEach((denom, i) => {
      const posX = startX + i * slotWidth;
      const stackGeom = new THREE.BoxGeometry(slotWidth * 0.88, 0.09, 0.65);
      const stackMat = new THREE.MeshStandardMaterial({
        color: denom.color,
        roughness: 0.75,
      });
      const stackMesh = new THREE.Mesh(stackGeom, stackMat);
      stackMesh.position.set(posX, 0.12, 0);
      stackMesh.castShadow = true;

      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 128;
      labelCanvas.height = 64;
      const ctx = labelCanvas.getContext('2d')!;
      ctx.fillStyle = denom.secondaryColor;
      ctx.fillRect(0, 0, 128, 64);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, 120, 56);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(denom.label, 64, 40);

      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const labelMat = new THREE.MeshBasicMaterial({ map: labelTex });
      const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(slotWidth * 0.82, 0.28), labelMat);
      labelMesh.rotation.x = -Math.PI / 2;
      labelMesh.position.set(0, 0.05, 0);
      stackMesh.add(labelMesh);

      stackMesh.userData = {
        interactionType: 'naira_bill',
        denomination: denom.value,
        promptText: `[Click] Add ${denom.label} Note to Change`,
      };

      drawer.add(stackMesh);
      this.billCompartments.push(stackMesh);
    });
  }

  public addChange(amount: number): number {
    this.tenderedChange += amount;
    soundFx.playTap();
    this.updateCompartmentPrompts();
    return this.tenderedChange;
  }

  public resetChange(): void {
    this.tenderedChange = 0;
    this.updateCompartmentPrompts();
  }

  public setChangeRequired(required: number): void {
    this.changeRequired = required;
    this.updateCompartmentPrompts();
  }

  public updateCompartmentPrompts(): void {
    this.billCompartments.forEach((comp) => {
      const val = comp.userData.denomination;
      comp.userData.promptText = `[Click] Add ₦${val} (Tendered: ₦${this.tenderedChange.toLocaleString()} / Due: ₦${this.changeRequired.toLocaleString()})`;
    });
  }

  public triggerCardTap(amount: number, onComplete?: () => void): void {
    this.updatePosScreen('PROCESSING...', 'MTN 4G NET');
    soundFx.playTap();
    setTimeout(() => {
      soundFx.playPosBeep();
      this.updatePosScreen('APPROVED', `₦${amount.toLocaleString()}`);
      if (onComplete) onComplete();
    }, 900);
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
