import * as THREE from 'three';

export class PharmacyRoom {
  public group: THREE.Group;
  public fanBlades: THREE.Group;
  public neonCrossLight: THREE.PointLight;
  public fluorescentLight1: THREE.PointLight;
  public fluorescentLight2: THREE.PointLight;
  public shelfSlots: { position: THREE.Vector3; category: string }[] = [];
  public isBlackout = false;
  private fanSpeed = 3.5;
  private flickerTimer = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'pharmacy_environment';

    // Build Floor & Walls
    this.buildRoomWalls();

    // Build Pharmacist Main Counter
    this.buildCounter();

    // Build Multi-Tier Medicine Shelves
    this.buildShelves();

    // Build Iron Security Grille / Bars
    this.buildSecurityGrille();

    // Build Ceiling Fan
    this.fanBlades = this.buildCeilingFan();

    // Build Neon Green Pharmacy Cross
    this.neonCrossLight = this.buildNeonCross();

    // Overhead Fluorescent Lights
    const { light1, light2 } = this.buildFluorescentLights();
    this.fluorescentLight1 = light1;
    this.fluorescentLight2 = light2;

    // Auntie Joke's Framed PCN License on Wall
    this.buildFramedLicense();
  }

  private buildRoomWalls(): void {
    // Floor (checkerboard green/cream linoleum)
    const floorGeom = new THREE.PlaneGeometry(16, 16);
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 256;
    floorCanvas.height = 256;
    const fCtx = floorCanvas.getContext('2d')!;
    fCtx.fillStyle = '#1e3328';
    fCtx.fillRect(0, 0, 256, 256);
    fCtx.fillStyle = '#2d4d3c';
    fCtx.fillRect(0, 0, 128, 128);
    fCtx.fillRect(128, 128, 128, 128);
    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(8, 8);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    this.group.add(floorMesh);

    // Back Wall behind shelves
    const backWallGeom = new THREE.PlaneGeometry(16, 10);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xe8e6df,
      roughness: 0.8,
    });
    const backWall = new THREE.Mesh(backWallGeom, wallMat);
    backWall.position.set(0, 5, -5.5);
    backWall.receiveShadow = true;
    this.group.add(backWall);

    // Lower wall ceramic wainscot tile band
    const tileBandGeom = new THREE.PlaneGeometry(16, 2.2);
    const tileBandMat = new THREE.MeshStandardMaterial({ color: 0x1b5e3c, roughness: 0.4 });
    const tileBand = new THREE.Mesh(tileBandGeom, tileBandMat);
    tileBand.position.set(0, 1.1, -5.48);
    this.group.add(tileBand);

    // Side Walls
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-8, 5, 0);
    this.group.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(8, 5, 0);
    this.group.add(rightWall);

    // Ceiling
    const ceilingGeom = new THREE.PlaneGeometry(16, 16);
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.9 });
    const ceiling = new THREE.Mesh(ceilingGeom, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 6.5, 0);
    this.group.add(ceiling);
  }

  private buildCounter(): void {
    const counterGroup = new THREE.Group();
    counterGroup.position.set(0, 0, 0);

    // Sturdy teak counter base
    const baseGeom = new THREE.BoxGeometry(6.5, 1.8, 1.4);
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x4a2e1b,
      roughness: 0.5,
    });
    const counterBase = new THREE.Mesh(baseGeom, woodMat);
    counterBase.position.y = 0.9;
    counterBase.castShadow = true;
    counterBase.receiveShadow = true;
    counterGroup.add(counterBase);

    // Polished green linoleum counter top
    const topGeom = new THREE.BoxGeometry(6.8, 0.12, 1.6);
    const linoMat = new THREE.MeshStandardMaterial({
      color: 0x1c4a30,
      roughness: 0.25,
      metalness: 0.1,
    });
    const counterTop = new THREE.Mesh(topGeom, linoMat);
    counterTop.position.y = 1.86;
    counterTop.castShadow = true;
    counterTop.receiveShadow = true;
    counterGroup.add(counterTop);

    // Brass edging trim around counter top
    const brassGeom = new THREE.BoxGeometry(6.84, 0.04, 1.64);
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd49826,
      metalness: 0.8,
      roughness: 0.3,
    });
    const brassTrim = new THREE.Mesh(brassGeom, brassMat);
    brassTrim.position.y = 1.81;
    counterGroup.add(brassTrim);

    // Glass display showcase under customer side
    const glassGeom = new THREE.BoxGeometry(5.8, 0.9, 0.1);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.85,
      transparent: true,
      opacity: 0.4,
      roughness: 0.1,
    });
    const glassMesh = new THREE.Mesh(glassGeom, glassMat);
    glassMesh.position.set(0, 0.9, 0.72);
    counterGroup.add(glassMesh);

    this.group.add(counterGroup);
  }

  private buildShelves(): void {
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(0, 0, -4.8);

    const shelfWood = new THREE.MeshStandardMaterial({
      color: 0x3e2723,
      roughness: 0.6,
    });

    // Side supports
    const uprightGeom = new THREE.BoxGeometry(0.12, 4.2, 0.75);
    for (const x of [-3.8, -1.3, 1.3, 3.8]) {
      const upright = new THREE.Mesh(uprightGeom, shelfWood);
      upright.position.set(x, 2.2, 0);
      upright.castShadow = true;
      shelfGroup.add(upright);
    }

    // 4 Horizontal shelf tiers
    const shelfGeom = new THREE.BoxGeometry(7.8, 0.1, 0.75);
    const shelfY = [0.6, 1.6, 2.6, 3.6];
    const categoryNames = [
      'ANTIMALARIALS & ARTEMISININ',
      'ANALGESICS & ANTIPYRETICS',
      'ANTIBIOTICS & SUSPENSIONS',
      'COLD CHAIN BIOLOGICS & VITAMINS',
    ];

    for (let i = 0; i < shelfY.length; i++) {
      const y = shelfY[i];
      const shelf = new THREE.Mesh(shelfGeom, shelfWood);
      shelf.position.set(0, y, 0);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      shelfGroup.add(shelf);

      // Add shelf category header plate
      const plateCanvas = document.createElement('canvas');
      plateCanvas.width = 512;
      plateCanvas.height = 48;
      const pCtx = plateCanvas.getContext('2d')!;
      pCtx.fillStyle = '#1B5E3C';
      pCtx.fillRect(0, 0, 512, 48);
      pCtx.fillStyle = '#FFFFFF';
      pCtx.font = 'bold 20px monospace';
      pCtx.textAlign = 'center';
      pCtx.fillText(categoryNames[i], 256, 32);
      const plateTex = new THREE.CanvasTexture(plateCanvas);
      const plateGeom = new THREE.PlaneGeometry(2.4, 0.18);
      const plateMat = new THREE.MeshBasicMaterial({ map: plateTex });
      const plate = new THREE.Mesh(plateGeom, plateMat);
      plate.position.set(0, y + 0.14, 0.38);
      shelfGroup.add(plate);

      // Calculate slot coordinates for stocking 3D medicine boxes
      for (let s = -3.2; s <= 3.2; s += 0.95) {
        this.shelfSlots.push({
          position: new THREE.Vector3(s, y + 0.75, -4.7),
          category: categoryNames[i],
        });
      }
    }

    this.group.add(shelfGroup);
  }

  private buildSecurityGrille(): void {
    const grilleGroup = new THREE.Group();
    grilleGroup.position.set(0, 1.9, 0.65);

    const barMat = new THREE.MeshStandardMaterial({
      color: 0x1f2421,
      metalness: 0.85,
      roughness: 0.35,
    });

    // Vertical security bars with service opening in center
    const barGeom = new THREE.CylinderGeometry(0.025, 0.025, 2.2, 8);
    for (let x = -3.2; x <= 3.2; x += 0.28) {
      // Leave center opening for cash & medicine dispensing
      if (x > -0.9 && x < 0.9) continue;

      const bar = new THREE.Mesh(barGeom, barMat);
      bar.position.set(x, 1.1, 0);
      bar.castShadow = true;
      grilleGroup.add(bar);
    }

    // Service Hatch Arch over opening
    const archGeom = new THREE.BoxGeometry(1.9, 0.08, 0.06);
    const arch = new THREE.Mesh(archGeom, barMat);
    arch.position.set(0, 1.7, 0);
    grilleGroup.add(arch);

    // Horizontal reinforcement rails
    const railGeom = new THREE.BoxGeometry(6.6, 0.06, 0.05);
    for (const ry of [0.4, 1.1, 2.1]) {
      const rail = new THREE.Mesh(railGeom, barMat);
      rail.position.set(0, ry, 0);
      grilleGroup.add(rail);
    }

    this.group.add(grilleGroup);
  }

  private buildCeilingFan(): THREE.Group {
    const fan = new THREE.Group();
    fan.position.set(0, 5.8, -1.2);

    // Rod from ceiling
    const rodGeom = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 12);
    const fanMat = new THREE.MeshStandardMaterial({ color: 0x22332a, roughness: 0.5 });
    const rod = new THREE.Mesh(rodGeom, fanMat);
    rod.position.y = 0.6;
    fan.add(rod);

    // Motor housing
    const motorGeom = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 16);
    const motor = new THREE.Mesh(motorGeom, fanMat);
    fan.add(motor);

    // Blades
    const bladesGroup = new THREE.Group();
    const bladeGeom = new THREE.BoxGeometry(1.6, 0.02, 0.22);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.4 });
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const blade = new THREE.Mesh(bladeGeom, bladeMat);
      blade.position.set(Math.cos(angle) * 0.9, 0, Math.sin(angle) * 0.9);
      blade.rotation.y = -angle;
      blade.rotation.z = 0.08; // Pitch
      blade.castShadow = true;
      bladesGroup.add(blade);
    }
    fan.add(bladesGroup);
    this.group.add(fan);
    return bladesGroup;
  }

  private buildNeonCross(): THREE.PointLight {
    const crossGroup = new THREE.Group();
    crossGroup.position.set(-5.6, 4.2, -5.4);

    // Glowing Green Cross
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
    const vGeom = new THREE.BoxGeometry(0.35, 1.4, 0.08);
    const hGeom = new THREE.BoxGeometry(1.4, 0.35, 0.08);
    crossGroup.add(new THREE.Mesh(vGeom, crossMat));
    crossGroup.add(new THREE.Mesh(hGeom, crossMat));

    // Green PointLight glow
    const glowLight = new THREE.PointLight(0x00ff66, 2.5, 6);
    glowLight.position.set(0, 0, 0.3);
    crossGroup.add(glowLight);

    this.group.add(crossGroup);
    return glowLight;
  }

  private buildFluorescentLights(): { light1: THREE.PointLight; light2: THREE.PointLight } {
    const lightGroup = new THREE.Group();
    lightGroup.position.set(0, 5.6, -1.5);

    // 2 Long tube fixtures
    const fixtureGeom = new THREE.BoxGeometry(4.2, 0.12, 0.35);
    const fixMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    const fixture = new THREE.Mesh(fixtureGeom, fixMat);
    lightGroup.add(fixture);

    const tubeGeom = new THREE.CylinderGeometry(0.04, 0.04, 3.8, 12);
    tubeGeom.rotateZ(Math.PI / 2);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const tube = new THREE.Mesh(tubeGeom, tubeMat);
    tube.position.y = -0.07;
    lightGroup.add(tube);

    // Warm-cool pharmacy fluorescent illumination
    const light1 = new THREE.PointLight(0xfff5ea, 4.5, 12);
    light1.position.set(-1.4, -0.2, 0);
    light1.castShadow = true;
    lightGroup.add(light1);

    const light2 = new THREE.PointLight(0xfff5ea, 4.5, 12);
    light2.position.set(1.4, -0.2, 0);
    light2.castShadow = true;
    lightGroup.add(light2);

    this.group.add(lightGroup);
    return { light1, light2 };
  }

  private buildFramedLicense(): void {
    const frameGroup = new THREE.Group();
    frameGroup.position.set(4.5, 4.2, -5.4);

    // Mahogany frame
    const frameGeom = new THREE.BoxGeometry(1.6, 1.2, 0.06);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    frameGroup.add(new THREE.Mesh(frameGeom, frameMat));

    // Certificate Canvas
    const certCanvas = document.createElement('canvas');
    certCanvas.width = 512;
    certCanvas.height = 384;
    const cCtx = certCanvas.getContext('2d')!;
    cCtx.fillStyle = '#FFFDF5';
    cCtx.fillRect(0, 0, 512, 384);
    cCtx.strokeStyle = '#D49826';
    cCtx.lineWidth = 10;
    cCtx.strokeRect(12, 12, 488, 360);

    cCtx.fillStyle = '#1B5E3C';
    cCtx.font = 'bold 22px serif';
    cCtx.textAlign = 'center';
    cCtx.fillText('PHARMACISTS COUNCIL OF NIGERIA', 256, 55);
    cCtx.font = '16px serif';
    cCtx.fillStyle = '#333333';
    cCtx.fillText('ANNUAL PREMISES REGISTRATION CERTIFICATE', 256, 85);
    cCtx.font = 'bold 20px sans-serif';
    cCtx.fillText('PHARM CHRIS / AUNTIE JOKE MEMORIAL', 256, 140);
    cCtx.font = '14px sans-serif';
    cCtx.fillText('ORILE-KOKA DISTRICT, LAGOS STATE', 256, 170);
    cCtx.font = 'bold 15px monospace';
    cCtx.fillText('PREMISES LICENSE NO: PCN/LA/2019/8821', 256, 215);
    cCtx.font = 'italic 14px serif';
    cCtx.fillText('Authorized for Retail Dispensation & Patient Consultation', 256, 250);

    // Red seal
    cCtx.fillStyle = '#B71C1C';
    cCtx.beginPath();
    cCtx.arc(256, 305, 32, 0, Math.PI * 2);
    cCtx.fill();
    cCtx.fillStyle = '#FFFFFF';
    cCtx.font = 'bold 12px sans-serif';
    cCtx.fillText('OFFICIAL', 256, 302);
    cCtx.fillText('SEAL', 256, 316);

    const certTex = new THREE.CanvasTexture(certCanvas);
    const certGeom = new THREE.PlaneGeometry(1.48, 1.08);
    const certMesh = new THREE.Mesh(certGeom, new THREE.MeshBasicMaterial({ map: certTex }));
    certMesh.position.z = 0.035;
    frameGroup.add(certMesh);

    this.group.add(frameGroup);
  }

  public update(delta: number): void {
    // Spin ceiling fan
    this.fanBlades.rotation.y += delta * this.fanSpeed;

    // Pulse green cross neon
    this.neonCrossLight.intensity = 2.2 + Math.sin(Date.now() * 0.003) * 0.6;

    // Generator / Blackout flicker if active
    if (this.isBlackout) {
      this.flickerTimer += delta;
      if (this.flickerTimer > 0.08) {
        this.flickerTimer = 0;
        const flicker = 0.5 + Math.random() * 2.2;
        this.fluorescentLight1.intensity = flicker;
        this.fluorescentLight2.intensity = flicker * 0.8;
      }
    } else {
      this.fluorescentLight1.intensity = 4.5;
      this.fluorescentLight2.intensity = 4.5;
    }
  }
}
