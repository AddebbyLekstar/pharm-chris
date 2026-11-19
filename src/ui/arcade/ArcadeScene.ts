import * as THREE from 'three';
import { quality } from './quality';
import { LIGHTS, artVersion, bakeContactAO } from './art';
import { textures } from './textures';
import { WALKABLE, ROOM, SHOP_W, SHOP_D, COUNTER, SHELF_BAYS, boundsFor } from './layout';
import { buildRoomShell } from './kit/roomShell';
import { chamferBox } from './kit/geometry';
import { material } from './kit/materials';

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
  private bounds: WalkableBounds = { ...WALKABLE };

  constructor() {
    this.group = new THREE.Group();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101714);
    this.scene.add(this.group);

    this.buildLighting();
    this.buildPharmacyEnvironment();
    if (artVersion() !== 'v1') {
      this.finishArtPass();
      if (artVersion() === 'v3' || artVersion() === 'v4') this.applySurfaceArt();
      // Static geometry only: characters are added later by the director. Baking
      // last means the vertex-colour gradient multiplies whatever map is present
      // instead of being overwritten by one.
      bakeContactAO(this.group, 0, 0.9);
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
    shade(COUNTER.width + 0.4, COUNTER.depth + 0.4, COUNTER.x, COUNTER.z, 0.22);
    // Wall bases: a narrow band that reads as occlusion, not decoration
    shade(SHOP_W, 0.75, 0, ROOM.minZ + 0.375, 0.22);
    shade(0.75, SHOP_D, ROOM.minX + 0.375, 0, 0.16);
    shade(0.75, SHOP_D, ROOM.maxX - 0.375, 0, 0.16);
  }


  /**
   * v3 surface pass.
   *
   * Every prop in this room is a primitive with one flat albedo, so the light has
   * nothing to describe: uniform colour across a 6 m slab reads as plastic no
   * matter how good the env map is. Maps here are generated once in a canvas and
   * cost nothing at draw-call level because the materials already exist.
   */
  private applySurfaceArt(): void {
    const tex = textures();
    if (!tex) return; // no DOM (unit tests): keep the flat materials

    const floor = this.group.getObjectByName('pharm-floor') as THREE.Mesh | undefined;
    if (floor) {
      const mat = floor.material as THREE.MeshStandardMaterial;
      mat.map = tex.terrazzo;
      mat.roughnessMap = tex.terrazzoRoughness;
      mat.color.setHex(0xffffff);   // the map carries the colour now
      mat.roughness = 1.0;          // roughnessMap scales this down per pixel
      mat.metalness = 0.03;
      mat.envMapIntensity = 0.8;
      mat.needsUpdate = true;
    }
    // Grout is in the map; the helper would draw a second, mismatched grid.
    const grid = this.group.getObjectByName('pharm-floor-grid');
    if (grid) grid.visible = false;

    // Walls: no map on purpose. The dark-green tile texture multiplied every tint
    // into the same murky green, so the room read as one dark box. Plaster at 0.86
    // roughness is the surface; the colour IS the design — cream sides, one deep
    // green accent wall. Nothing to override here, so the shell's materials stand.

    const counter = this.group.getObjectByName('pharm-counter') as THREE.Mesh | undefined;
    if (counter) {
      const mat = counter.material as THREE.MeshStandardMaterial;
      mat.map = tex.teak;
      mat.color.setHex(0xffffff);
      mat.roughness = 0.62;
      mat.metalness = 0.04;
      mat.needsUpdate = true;
    }

    const slab = this.group.getObjectByName('pharm-slab') as THREE.Mesh | undefined;
    if (slab) {
      const mat = slab.material as THREE.MeshStandardMaterial;
      mat.map = tex.laminate;
      mat.color.setHex(0xffffff);
      mat.roughness = 0.24;
      mat.metalness = 0.06;
      mat.needsUpdate = true;
    }

    const runner = this.group.getObjectByName('pharm-runner') as THREE.Mesh | undefined;
    if (runner) {
      const mat = runner.material as THREE.MeshStandardMaterial;
      mat.map = tex.steelGreen;
      mat.color.setHex(0x9fd8bd);   // tint the steel texture into the runner green
      mat.roughness = 0.92;
      mat.needsUpdate = true;
    }

    const curb = this.group.getObjectByName('pharm-curb') as THREE.Mesh | undefined;
    if (curb) {
      const mat = curb.material as THREE.MeshStandardMaterial;
      mat.map = tex.wall;
      mat.color.setHex(0xb9bdb8);
      mat.roughness = 0.78;
      mat.needsUpdate = true;
    }

    // Street pavement used to end on a hard edge in the void, reading as a grey
    // slab pasted beside the shop. Fade it into the backdrop instead.
    const street = this.group.getObjectByName('pharm-street') as THREE.Mesh | undefined;
    if (street) {
      const mat = street.material as THREE.MeshStandardMaterial;
      mat.map = tex.wall;
      mat.alphaMap = tex.groundFade;
      mat.transparent = true;
      mat.depthWrite = false;
      mat.color.setHex(0x8f938f);
      mat.roughness = 0.95;
      mat.needsUpdate = true;
    }

    // Sneeze guard read as an opaque white slab at this camera distance; lower
    // the opacity and let the env map give it an edge highlight.
    for (const child of this.group.children) {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (mat && mat.transparent && mat.opacity === 0.28) {
        mat.opacity = 0.16;
        mat.roughness = 0.06;
        mat.envMapIntensity = 1.6;
        mat.needsUpdate = true;
      }
    }

    // Fixtures sat straight on the floor with only a vertex gradient. A soft
    // footprint under each bay is what makes heavy furniture look heavy.
    const footprint = (w: number, d: number, x: number, z: number): void => {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false })
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(x, 0.015, z);
      plane.renderOrder = 1;
      this.group.add(plane);
    };
    footprint(2.0, 1.2, -6.2, -4.5);
    footprint(2.0, 1.2, -6.2, 0.5);
    footprint(2.0, 1.2, 6.2, -4.5);
    footprint(2.0, 1.2, 6.2, 0.5);
    footprint(1.1, 1.0, 0, 1.5);

    // The room used to float on #101714. A staged gradient with a warm centre
    // glow gives the diorama a horizon instead of a void.
    this.scene.background = tex.backdrop;
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
      // Pendant over the counter: the lamp hangs from the implied ceiling, not from
      // the old 3.8 m height that only worked in a 4.5 m room.
      counterSpot.position.set(COUNTER.x, 2.55, COUNTER.z);
      this.group.add(counterSpot);
    }

    if (setup.crossGlow) {
      const crossGlow = new THREE.PointLight(setup.crossGlow.color, setup.crossGlow.intensity, setup.crossGlow.distance, 1.5);
      // Fridge light: cool teal at the cold-chain bay, the room's second temperature.
      const cold = SHELF_BAYS.find((bay) => bay.category === 'cold_chain');
      crossGlow.position.set(cold ? cold.x : 3.2, 1.8, cold ? cold.z : 0.6);
      this.group.add(crossGlow);
    }
  }

  private buildPharmacyEnvironment(): void {
    // The shell owns floor, walls, doorway, cut-face trim and skirting. Keeping it
    // in the kit means the room can change size without touching this file.
    this.group.add(buildRoomShell());

    // Street beyond the doorway. Without it the 2.2 m opening looks onto the void,
    // and the doorway is the whole reason the front wall is cut rather than solid.
    // Lighter than the void: the street is ground the shop sits on, not a black hole.
    const streetMat = new THREE.MeshStandardMaterial({ color: 0x6a6f68, roughness: 0.9 });
    const street = new THREE.Mesh(new THREE.PlaneGeometry(SHOP_W + 6, 5), streetMat);
    street.name = 'pharm-street';
    street.rotation.x = -Math.PI / 2;
    street.position.set(0, -0.02, ROOM.maxZ + 3);
    street.receiveShadow = true;
    this.group.add(street);

    const curbMat = new THREE.MeshStandardMaterial({ color: 0x828784, roughness: 0.6 });
    const curb = new THREE.Mesh(chamferBox(SHOP_W + 6, 0.08, 0.3, 0.02), curbMat);
    curb.name = 'pharm-curb';
    curb.position.set(0, 0.02, ROOM.maxZ + 0.6);
    this.group.add(curb);

    // Dispensing counter: teak base, ivory slab, two glass sneeze guards with a
    // 1.2 m service gap in the middle so the player and customers are not
    // separated by a wall of glass.
    const counterBase = new THREE.Mesh(
      chamferBox(COUNTER.width, 1.15, COUNTER.depth, 0.03),
      material('wood', 0x4e342e)
    );
    counterBase.name = 'pharm-counter';
    counterBase.position.set(COUNTER.x, 0.575, COUNTER.z);
    counterBase.castShadow = true;
    counterBase.receiveShadow = true;
    this.group.add(counterBase);

    const slab = new THREE.Mesh(
      chamferBox(COUNTER.width + 0.2, 0.12, COUNTER.depth + 0.15, 0.02),
      material('plaster', 0xf7fafc)
    );
    slab.name = 'pharm-slab';
    slab.position.set(COUNTER.x, 1.21, COUNTER.z);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.group.add(slab);

    const guardWidth = (COUNTER.width - 1.2) / 2;
    for (const side of [-1, 1]) {
      const guard = new THREE.Mesh(chamferBox(guardWidth, 0.75, 0.06, 0.015), material('glass'));
      guard.name = `pharm-guard-${side < 0 ? 'l' : 'r'}`;
      guard.position.set(COUNTER.x + side * (0.6 + guardWidth / 2), 1.645, COUNTER.z);
      this.group.add(guard);
    }

    // Till, not a black cube. Three parts is enough to read at 60 px: a compact
    // base, an angled screen that catches the pendant light, and a brass drawer lip.
    const till = new THREE.Group();
    till.name = 'pharm-register';
    till.position.set(COUNTER.x, 1.27, COUNTER.z);
    const tillBase = new THREE.Mesh(chamferBox(0.62, 0.22, 0.48, 0.02), material('steel', 0x2b3238));
    tillBase.position.y = 0.11;
    tillBase.castShadow = true;
    till.add(tillBase);
    const drawer = new THREE.Mesh(chamferBox(0.58, 0.1, 0.44, 0.015), material('wood', 0xb08a4a));
    drawer.position.set(0, 0.05, 0.01);
    till.add(drawer);
    const screen = new THREE.Mesh(
      chamferBox(0.5, 0.34, 0.05, 0.015),
      new THREE.MeshStandardMaterial({ color: 0x11201a, emissive: 0x2f8f6a, emissiveIntensity: 0.55, roughness: 0.35 })
    );
    screen.position.set(0, 0.42, -0.06);
    screen.rotation.x = -0.35;
    screen.castShadow = true;
    till.add(screen);
    const keypad = new THREE.Mesh(chamferBox(0.42, 0.03, 0.24, 0.01), material('steel', 0x3a4248));
    keypad.position.set(0, 0.235, 0.08);
    till.add(keypad);
    this.group.add(till);

    // Contact shadows under the counter, so it sits on the floor instead of hovering.
    for (const offset of [-1.0, 0, 1.0]) {
      const counterShadow = ArcadeScene.createContactShadow(0.85, 0.3);
      counterShadow.scale.set(1.15, 0.8, 1);
      counterShadow.position.set(COUNTER.x + offset, 0.006, COUNTER.z);
      this.group.add(counterShadow);
    }

    // Pharmacy cross on the back wall, above the dispensary.
    const crossMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.4, emissive: 0x0d2f10, emissiveIntensity: 0.4 });
    const crossV = new THREE.Mesh(chamferBox(0.42, 1.3, 0.1, 0.02), crossMat);
    crossV.name = 'pharm-cross-v';
    crossV.position.set(0, 2.25, ROOM.minZ + 0.07);
    this.group.add(crossV);
    const crossH = new THREE.Mesh(chamferBox(1.3, 0.42, 0.1, 0.02), crossMat);
    crossH.name = 'pharm-cross-h';
    crossH.position.set(0, 2.25, ROOM.minZ + 0.07);
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

    // Bounds move first: the camera and the player read them on the next frame, and
    // a purchase that grows the room must widen where the player may stand.
    this.bounds = { ...boundsFor(level).walkable };
    if (level <= 0) return;

    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.7 });
    const teal = new THREE.MeshStandardMaterial({ color: 0x1b4d3e, roughness: 0.45 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.4 });

    if (level >= 1) {
      // The east partition comes down: patch of floor in the new bay.
      const bay = boundsFor(1).room.maxX - ROOM.maxX;
      const aisle = new THREE.Mesh(new THREE.PlaneGeometry(bay, SHOP_D), cream);
      aisle.rotation.x = -Math.PI / 2;
      aisle.position.set(ROOM.maxX + bay / 2, 0.004, 0);
      aisle.receiveShadow = true;
      g.add(aisle);

      // Waiting bench against the front wall, clear of the queue slots at x +/-0.9.
      const benchX = -2.3;
      const benchZ = WALKABLE.maxZ - 0.4;
      const bench = new THREE.Mesh(chamferBox(2.2, 0.16, 0.55, 0.03), wood);
      bench.position.set(benchX, 0.46, benchZ);
      bench.castShadow = true;
      g.add(bench);
      for (const dx of [-0.9, 0.9]) {
        const leg = new THREE.Mesh(chamferBox(0.14, 0.46, 0.45, 0.02), teal);
        leg.position.set(benchX + dx, 0.23, benchZ);
        g.add(leg);
      }

      // Second register on the widened counter run.
      const reg = new THREE.Mesh(chamferBox(0.7, 0.55, 0.6, 0.03), teal);
      reg.position.set(COUNTER.x + 1.25, 1.53, COUNTER.z);
      reg.castShadow = true;
      g.add(reg);
    }

    if (level >= 2) {
      // Consultation corner in the north-west extension.
      const cx = boundsFor(2).room.minX + 0.9;
      const cz = boundsFor(2).room.minZ + 1.2;
      const rail = new THREE.Mesh(chamferBox(2.4, 0.08, 0.08, 0.02), teal);
      rail.position.set(cx, 2.5, cz);
      g.add(rail);
      const curtain = new THREE.Mesh(
        chamferBox(2.3, 2.2, 0.05, 0.015),
        new THREE.MeshStandardMaterial({ color: 0x2f6f56, roughness: 0.9, transparent: true, opacity: 0.85 })
      );
      curtain.position.set(cx, 1.35, cz);
      g.add(curtain);
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 12), wood);
      stool.position.set(cx, 0.25, cz + 0.7);
      g.add(stool);
    }

    this.expansionGroup = g;
    this.group.add(g);
  }

  public getWalkableBounds(): WalkableBounds {
    return { ...this.bounds };
  }

  /** Interior faces of the walls, which the camera must not look past. */
  public getRoomBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    return { ...ROOM };
  }
}
