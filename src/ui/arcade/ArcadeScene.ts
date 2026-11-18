import * as THREE from 'three';
import { quality } from './quality';
import { LIGHTS, artVersion, bakeContactAO } from './art';

export interface WalkableBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class ArcadeScene {
  public group: THREE.Group;
  public scene: THREE.Scene;
  private expansionGroup: THREE.Group | null = null;
  private bounds: WalkableBounds = {
    minX: -6.0,
    maxX: 6.0,
    minZ: -6.5,
    maxZ: 6.5,
  };

  constructor() {
    this.group = new THREE.Group();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101714);
    this.scene.add(this.group);

    this.buildLighting();
    this.buildPharmacyEnvironment();
    if (artVersion() === 'v2') {
      // Static geometry only: characters are added later by the director.
      bakeContactAO(this.group, 0, 0.9);
      this.finishArtPass();
    }
  }

  /**
   * v2 finishing: the terrazzo reads as blown-out white under a brighter sun, and
   * large fixtures sit on it without a contact shadow. Both are cheap to fix and
   * both are what makes a scene look pasted together.
   */
  private finishArtPass(): void {
    const floor = this.group.getObjectByName('pharm-floor') as THREE.Mesh | undefined;
    if (floor) {
      const mat = floor.material as THREE.MeshStandardMaterial;
      mat.color.setHex(0xd8d1c2);
      mat.roughness = 0.55;
      mat.needsUpdate = true;
    }

    const shade = (w: number, d: number, x: number, z: number, opacity: number): void => {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false })
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(x, 0.02, z);   // clear of the floor plane's depth epsilon at 34 m
      plane.renderOrder = 1;
      this.group.add(plane);
    };

    // Counter footprint plus a soft overhang
    shade(7.2, 1.7, 0, 1.5, 0.22);
    // Wall bases: a narrow band that reads as occlusion, not decoration
    shade(16, 0.75, 0, -8.55, 0.22);
    shade(0.75, 18, -7.55, 0, 0.16);
    shade(0.75, 18, 7.55, 0, 0.16);
  }

  /**
   * Generates a grounded circular / oval contact shadow mesh
   * positioned just above the floor (y = 0.005) with soft opacity.
   */
  public static createContactShadow(radius: number = 0.5, opacity: number = 0.32): THREE.Mesh {
    const geo = new THREE.CircleGeometry(radius, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.005;
    mesh.renderOrder = 1;
    return mesh;
  }

  private buildLighting(): void {
    const setup = LIGHTS[artVersion()];

    // Ambient fill lifts contrast; v2 drops it because the environment map now
    // supplies the fill that flat ambient used to fake.
    const ambient = new THREE.AmbientLight(setup.ambient.color, setup.ambient.intensity);
    this.group.add(ambient);

    // Primary sun cutting crisp isometric shadows
    const sun = new THREE.DirectionalLight(setup.sun.color, setup.sun.intensity);
    sun.position.set(12.0, 22.0, 14.0);
    const shadows = quality().shadows;
    sun.castShadow = shadows;
    sun.shadow.mapSize.width = shadows ? 1024 : 256;
    sun.shadow.mapSize.height = shadows ? 1024 : 256;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 55;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    const d = 16;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    this.group.add(sun);

    // Spec 2.2: HemisphereLight - Sky ambient fill and warm terrazzo floor bounce
    const hemi = new THREE.HemisphereLight(setup.hemisphere.sky, setup.hemisphere.ground, setup.hemisphere.intensity);
    hemi.position.set(0, 20.0, 0);
    this.group.add(hemi);

    if (setup.counterSpot) {
      const counterSpot = new THREE.PointLight(setup.counterSpot.color, setup.counterSpot.intensity, setup.counterSpot.distance, 1.1);
      counterSpot.position.set(0.0, 3.8, 1.5);
      this.group.add(counterSpot);
    }

    if (setup.crossGlow) {
      const crossGlow = new THREE.PointLight(setup.crossGlow.color, setup.crossGlow.intensity, setup.crossGlow.distance, 1.5);
      crossGlow.position.set(0.0, 3.2, -7.5);
      this.group.add(crossGlow);
    }
  }

  private buildPharmacyEnvironment(): void {
    // Spec 2.3: Floor (Terrazzo Tile) 16m x 18m
    const floorGeo = new THREE.PlaneGeometry(16, 18);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.32,
      metalness: 0.04,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.name = 'pharm-floor';
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    this.group.add(floorMesh);

    // Spec 2.3: Procedural Grout Grid overlay (1m spacing lines)
    const gridHelper = new THREE.GridHelper(16, 16, 0xddd6c8, 0xddd6c8);
    gridHelper.position.y = 0.001;
    this.group.add(gridHelper);

    // Spec 2.3: Perimeter Skirting / Border: Width 0.6m, color 0x182E24, roughness 0.55
    const borderMat = new THREE.MeshStandardMaterial({
      color: 0x182e24,
      roughness: 0.55,
    });
    // North perimeter strip
    const northBorder = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.6), borderMat);
    northBorder.rotation.x = -Math.PI / 2;
    northBorder.position.set(0, 0.002, -8.7);
    this.group.add(northBorder);

    // West perimeter strip
    const westBorder = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 18), borderMat);
    westBorder.rotation.x = -Math.PI / 2;
    westBorder.position.set(-7.7, 0.002, 0);
    this.group.add(westBorder);

    // East perimeter strip
    const eastBorder = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 18), borderMat);
    eastBorder.rotation.x = -Math.PI / 2;
    eastBorder.position.set(7.7, 0.002, 0);
    this.group.add(eastBorder);

    // Customer waiting queue aisle runner mat (high contrast forest green)
    const runnerGeo = new THREE.PlaneGeometry(3.2, 7.5);
    const runnerMat = new THREE.MeshStandardMaterial({
      color: 0x1e3f32,
      roughness: 0.7,
    });
    const runner = new THREE.Mesh(runnerGeo, runnerMat);
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(0, 0.003, 5.5);
    runner.receiveShadow = true;
    this.group.add(runner);

    // Outside street pavement patch (south entrance)
    const streetGeo = new THREE.PlaneGeometry(16, 5);
    const streetMat = new THREE.MeshStandardMaterial({
      color: 0x3c3f3d,
      roughness: 0.85,
    });
    const streetMesh = new THREE.Mesh(streetGeo, streetMat);
    streetMesh.rotation.x = -Math.PI / 2;
    streetMesh.position.set(0, -0.02, 10.5);
    streetMesh.receiveShadow = true;
    this.group.add(streetMesh);

    // Curb threshold edge
    const curbGeo = new THREE.BoxGeometry(16, 0.08, 0.3);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x828784, roughness: 0.6 });
    const curb = new THREE.Mesh(curbGeo, curbMat);
    curb.position.set(0, 0.02, 8.85);
    this.group.add(curb);

    // Back and side walls
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x22493d, // Crisp Lagos community chemist deep emerald wall
      roughness: 0.65,
    });

    // North (Back) Wall
    const backWallGeo = new THREE.BoxGeometry(16, 4.5, 0.5);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, 2.25, -9.25);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    this.group.add(backWall);

    // West (Left) Wall
    const westWallGeo = new THREE.BoxGeometry(0.5, 4.5, 18);
    const westWall = new THREE.Mesh(westWallGeo, wallMat);
    westWall.position.set(-8.25, 2.25, 0);
    westWall.castShadow = true;
    westWall.receiveShadow = true;
    this.group.add(westWall);

    // East (Right) Wall
    const eastWallGeo = new THREE.BoxGeometry(0.5, 4.5, 18);
    const eastWall = new THREE.Mesh(eastWallGeo, wallMat);
    eastWall.position.set(8.25, 2.25, 0);
    eastWall.castShadow = true;
    eastWall.receiveShadow = true;
    this.group.add(eastWall);

    // Front Wall with Entrance Doorway (z = 9)
    const frontLeftGeo = new THREE.BoxGeometry(6, 4.5, 0.5);
    const frontLeft = new THREE.Mesh(frontLeftGeo, wallMat);
    frontLeft.position.set(-5, 2.25, 9.25);
    this.group.add(frontLeft);

    const frontRightGeo = new THREE.BoxGeometry(6, 4.5, 0.5);
    const frontRight = new THREE.Mesh(frontRightGeo, wallMat);
    frontRight.position.set(5, 2.25, 9.25);
    this.group.add(frontRight);

    // Spec 2.3: Dispensary Counter (Teak Wood base + Ivory Laminate Top + Glass Guard)
    // Base Counter: BoxGeometry(6.4, 1.15, 0.95), Nigerian Teak wood panels (0x4E342E)
    const counterGeo = new THREE.BoxGeometry(6.4, 1.15, 0.95);
    const teakMat = new THREE.MeshStandardMaterial({
      color: 0x4e342e,
      roughness: 0.65,
      metalness: 0.05,
    });
    const counter = new THREE.Mesh(counterGeo, teakMat);
    counter.name = 'pharm-counter';
    counter.position.set(0, 0.575, 1.5);
    counter.castShadow = true;
    counter.receiveShadow = true;
    this.group.add(counter);

    // Beveled ivory laminate countertop slab
    const slabGeo = new THREE.BoxGeometry(6.6, 0.12, 1.1);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0xf7fafc,
      roughness: 0.20,
      metalness: 0.08,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, 1.21, 1.5);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.group.add(slab);

    // Glass Sneeze Guard Partition.
    // A transmission material forces three.js to render the whole scene into an
    // extra buffer every frame (2x draw calls on a phone) for a detail nobody
    // reads at this camera distance. Plain transparency looks the same here.
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xd7f0f4,
      transparent: true,
      opacity: 0.28,
      roughness: 0.15,
      metalness: 0.05,
      depthWrite: false,
    });
    // Left and right sneeze guards leaving 1.2m service gap in center
    const glassPanelGeo = new THREE.BoxGeometry(2.4, 0.75, 0.06);
    const leftGlass = new THREE.Mesh(glassPanelGeo, glassMat);
    leftGlass.position.set(-1.8, 1.645, 1.5);
    this.group.add(leftGlass);

    const rightGlass = new THREE.Mesh(glassPanelGeo, glassMat);
    rightGlass.position.set(1.8, 1.645, 1.5);
    this.group.add(rightGlass);

    // Grounded contact shadows beneath counter
    for (const offset of [-2.6, 0, 2.6]) {
      const counterShadow = ArcadeScene.createContactShadow(0.85, 0.4);
      counterShadow.scale.set(1.4, 0.9, 1);
      counterShadow.position.set(offset, 0.006, 1.5);
      this.group.add(counterShadow);
    }

    // Cash Register unit on counter
    const regGeo = new THREE.BoxGeometry(0.8, 0.6, 0.7);
    const regMat = new THREE.MeshStandardMaterial({ color: 0x1f2421, roughness: 0.35, metalness: 0.2 });
    const register = new THREE.Mesh(regGeo, regMat);
    register.position.set(0, 1.55, 1.5);
    register.castShadow = true;
    this.group.add(register);

    // Green Cross Neon Emblem on back wall with luminous glow
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x00e676 });
    const crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1.4, 0.12),
      crossMat
    );
    crossV.position.set(0, 3.2, -8.95);
    this.group.add(crossV);

    const crossH = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.4, 0.12),
      crossMat
    );
    crossH.position.set(0, 3.2, -8.95);
    this.group.add(crossH);
  }

  /**
   * Visibly grows the store. Level 1 knocks down the partition (extra aisle,
   * waiting bench, second register); level 2 adds the consultation corner.
   * Rebuilds into one group and disposes the previous geometry so repeated
   * expansions cannot leak buffers.
   */
  public applyExpansion(level: number): void {
    if (this.expansionGroup) {
      this.group.remove(this.expansionGroup);
      this.expansionGroup.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      this.expansionGroup = null;
    }
    if (level <= 0) return;

    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.7 });
    const teal = new THREE.MeshStandardMaterial({ color: 0x1b4d3e, roughness: 0.45 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.4 });

    if (level >= 1) {
      // Second aisle floor patch on the east side
      const aisle = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 10), cream);
      aisle.rotation.x = -Math.PI / 2;
      aisle.position.set(6.2, 0.004, 1.6);
      aisle.receiveShadow = true;
      g.add(aisle);

      // Waiting bench for the queue
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 0.6), wood);
      bench.position.set(-4.6, 0.46, 5.4);
      bench.castShadow = true;
      g.add(bench);
      for (const dx of [-1.1, 1.1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.46, 0.5), teal);
        leg.position.set(-4.6 + dx, 0.23, 5.4);
        g.add(leg);
      }

      // Second register station
      const reg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.6), teal);
      reg.position.set(3.1, 1.5, 1.5);
      reg.castShadow = true;
      g.add(reg);
    }

    if (level >= 2) {
      // Consultation corner: curtain rail + screen + stool
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.08), teal);
      rail.position.set(-4.8, 2.5, -1.6);
      g.add(rail);
      const curtain = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 2.2, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x2f6f56, roughness: 0.9, transparent: true, opacity: 0.85 })
      );
      curtain.position.set(-4.8, 1.35, -1.6);
      g.add(curtain);
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 12), wood);
      stool.position.set(-4.8, 0.25, -1.1);
      g.add(stool);
    }

    this.expansionGroup = g;
    this.group.add(g);
  }

  public getWalkableBounds(): WalkableBounds {
    return { ...this.bounds };
  }

  /** Full floor extent (16 x 18 m), which the camera must not look past. */
  public getRoomBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    return { minX: -8, maxX: 8, minZ: -9, maxZ: 9 };
  }
}
