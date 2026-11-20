import * as THREE from 'three';
import { quality } from './quality';
import { LIGHTS, artVersion, bakeContactAO } from './art';
import { textures } from './textures';
import { WALKABLE, ROOM, SHOP_W, SHOP_D, COUNTER, SHELF_BAYS, boundsFor, type Rect } from './layout';
import { buildRoomShell } from './kit/roomShell';
import { buildDressing, placementsFor } from './kit/props';
import { buildDockMarkings } from './kit/dockMarkings';
import { buildExpansion } from './kit/expansion';
import { chamferBox } from './kit/geometry';
import { material } from './kit/materials';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
  private shell: THREE.Group | null = null;
  private dressing: THREE.Group | null = null;
  /** Interior rectangle currently built. Expansions replace it, walls and all. */
  private room: Rect = { ...ROOM };
  private street: THREE.Mesh | null = null;
  private curb: THREE.Mesh | null = null;
  private level = 0;
  private bounds: WalkableBounds = { ...WALKABLE };
  /**
   * Static ground shadows, collected and merged into one mesh per opacity.
   *
   * Every footprint used to be its own transparent quad: 13 of the scene's 105
   * draw calls were single-colour shadow planes. They never move, so they merge.
   * Character shadows stay separate — they follow the player.
   */
  private staticShadows: Array<{ geo: THREE.PlaneGeometry; opacity: number }> = [];

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
    // Every pass above queues its ground quads; merge them once, after the last one.
    this.flushShadows();
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
      this.pushShadow(w, d, x, z, opacity, 0.02);
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
      this.pushShadow(w, d, x, z, 0.26, 0.015);
    };
    // Shelves used to be shadowed at |x| = 6.2 — the 16 x 18 m coordinates. Once the
    // shop shrank to 8.4 m those planes landed outside the room and the bays lost
    // their contact shadow entirely. Derived from the layout, so they cannot drift.
    for (const bay of SHELF_BAYS) {
      footprint(bay.width + 0.4, bay.depth + 0.3, bay.x, bay.z);
    }
    footprint(COUNTER.width + 0.3, COUNTER.depth + 0.3, COUNTER.x, COUNTER.z);
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

  /** (Re)build the dollhouse shell for the current room rectangle. */
  private rebuildShell(): void {
    if (this.shell) {
      this.group.remove(this.shell);
      this.shell.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      this.shell = null;
    }
    this.shell = buildRoomShell({ room: this.room });
    this.group.add(this.shell);

    const floor = this.shell.getObjectByName('pharm-floor') as THREE.Mesh | undefined;
    if (floor) this.paintFloor(floor);

    // The cross is parented to the scene, not the shell, so it has to be walked
    // back to whichever wall is now the back wall. Left alone it floats mid-room
    // after the first expansion.
    const cross = this.group.getObjectByName('pharm-cross') as THREE.Mesh | undefined;
    if (cross) cross.position.z = this.room.minZ + 0.07;

    // Dressing is authored against the starting shop; when a wall moves, the props
    // on it move too, or they end up hanging over the new aisle.
    if (this.dressing) {
      this.group.remove(this.dressing);
      this.dressing.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      this.dressing = null;
    }
    this.dressing = buildDressing(placementsFor(this.level));
    this.group.add(this.dressing);
  }

  /** Street and kerb outside the doorway, sized to the current frontage. */
  private rebuildStreet(): void {
    if (this.street) {
      this.group.remove(this.street);
      this.street.geometry.dispose();
      this.street = null;
    }
    if (this.curb) {
      this.group.remove(this.curb);
      this.curb.geometry.dispose();
      this.curb = null;
    }
    const width = this.room.maxX - this.room.minX;
    const centerX = (this.room.minX + this.room.maxX) / 2;

    const streetMat = new THREE.MeshStandardMaterial({ color: 0x6a6f68, roughness: 0.9 });
    const street = new THREE.Mesh(new THREE.PlaneGeometry(width + 6, 5), streetMat);
    street.name = 'pharm-street';
    street.rotation.x = -Math.PI / 2;
    street.position.set(centerX, -0.02, this.room.maxZ + 3);
    street.receiveShadow = true;
    this.group.add(street);
    this.street = street;

    const curb = new THREE.Mesh(chamferBox(width + 6, 0.08, 0.3, 0.02), new THREE.MeshStandardMaterial({ color: 0x828784, roughness: 0.6 }));
    curb.name = 'pharm-curb';
    curb.position.set(centerX, 0.02, this.room.maxZ + 0.6);
    this.group.add(curb);
    this.curb = curb;
  }

  /**
   * Terrazzo on a floor mesh. The shell is rebuilt on every expansion, so the maps
   * have to be reapplied or a bought extension appears as bare grey tile next to a
   * textured hall. Repeat is derived from the room so a tile stays 2.1 m wide at any
   * shop size instead of stretching with the plane.
   */
  private paintFloor(floor: THREE.Mesh): void {
    const tex = textures();
    if (!tex) return;
    const mat = floor.material as THREE.MeshStandardMaterial;
    const width = this.room.maxX - this.room.minX;
    const depth = this.room.maxZ - this.room.minZ;
    tex.terrazzo.repeat.set(width / 2.1, depth / 2.05);
    tex.terrazzoRoughness?.repeat.set(width / 2.1, depth / 2.05);
    mat.map = tex.terrazzo;
    mat.roughnessMap = tex.terrazzoRoughness;
    mat.color.setHex(0xffffff);   // the map carries the colour now
    mat.roughness = 1.0;          // roughnessMap scales this down per pixel
    mat.metalness = 0.03;
    mat.envMapIntensity = 0.8;
    mat.needsUpdate = true;
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
    this.rebuildShell();
    this.rebuildStreet();

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
    // Both sneeze guards share one glass material, so merge them: two transparent
    // draws for two panes was 1 draw call of pure waste on the phone budget.
    const guardGeos = [-1, 1].map((side) => {
      const geo = chamferBox(guardWidth, 0.75, 0.06, 0.015);
      geo.translate(COUNTER.x + side * (0.6 + guardWidth / 2), 1.645, COUNTER.z);
      return geo;
    });
    const guardsMerged = mergeGeometries(guardGeos, false);
    for (const geo of guardGeos) geo.dispose();
    if (guardsMerged) {
      const guards = new THREE.Mesh(guardsMerged, material('glass'));
      guards.name = 'pharm-guards';
      this.group.add(guards);
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
    // Accumulated with the rest of the static shadows and merged on the next flush.
    for (const offset of [-1.0, 0, 1.0]) {
      this.pushShadow(1.15 * 0.85 * 2, 0.8 * 0.85 * 2, COUNTER.x + offset, COUNTER.z, 0.3, 0.006);
    }

    // Pharmacy cross on the back wall, above the dispensary. One merged mesh, so it
    // is one draw call and the expansion rebuild only has to move one object.
    const crossMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.4, emissive: 0x0d2f10, emissiveIntensity: 0.4 });
    const crossGeos = [chamferBox(0.42, 1.3, 0.1, 0.02), chamferBox(1.3, 0.42, 0.1, 0.02)];
    const crossMerged = mergeGeometries(crossGeos, false);
    for (const geo of crossGeos) geo.dispose();
    if (crossMerged) {
      const cross = new THREE.Mesh(crossMerged, crossMat);
      cross.name = 'pharm-cross';
      cross.position.set(0, 2.25, ROOM.minZ + 0.07);
      this.group.add(cross);
    }

    // Painted dock signage. Parented to the room group, not the shell: the dock
    // trigger never moves when a wall is bought, so the paint must not either.
    this.group.add(buildDockMarkings());
  }

  /** Queue a ground quad. Flushed into one mesh per opacity in flushShadows(). */
  private pushShadow(w: number, d: number, x: number, z: number, opacity: number, y: number): void {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    geo.translate(x, y, z);
    this.staticShadows.push({ geo, opacity });
  }

  /**
   * Merge the queued ground quads. Materials are shared per opacity, so the whole
   * shop's contact shading costs one draw call per distinct opacity instead of one
   * per quad.
   */
  private flushShadows(): void {
    if (!this.staticShadows.length) return;
    const byOpacity = new Map<number, THREE.BufferGeometry[]>();
    for (const { geo, opacity } of this.staticShadows) {
      const bucket = byOpacity.get(opacity) ?? [];
      bucket.push(geo);
      byOpacity.set(opacity, bucket);
    }
    for (const [opacity, geos] of byOpacity) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      if (merged !== geos[0]) for (const geo of geos) geo.dispose();
      const mesh = new THREE.Mesh(
        merged,
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false })
      );
      mesh.name = `pharm-ground-shadow-${opacity}`;
      mesh.renderOrder = 1;
      this.group.add(mesh);
    }
    this.staticShadows = [];
  }

  /**
   * Visibly grows the store. Level 1 knocks down the partition (extra aisle,
   * waiting bench, second register); level 2 adds the consultation corner.
   * Rebuilds into one group and disposes the previous geometry so repeated
   * expansions cannot leak buffers.
   */
  public applyExpansion(level: number): void {
    const clamped = Math.max(0, Math.min(2, Math.floor(level)));
    this.level = clamped;

    // Bounds move first: the camera and the player read them on the next frame, and
    // a purchase that grows the room must widen where the player may stand.
    this.bounds = { ...boundsFor(clamped).walkable };

    // A bought expansion is a bigger room, not a mat laid on the old floor. Rebuild
    // the shell (walls, floor, skirting, cut trim) against the new rectangle, then
    // re-dress: every prop mounted on a wall that moved goes with the wall.
    const next = boundsFor(clamped).room;
    const changed =
      next.minX !== this.room.minX ||
      next.maxX !== this.room.maxX ||
      next.minZ !== this.room.minZ ||
      next.maxZ !== this.room.maxZ;
    if (changed) {
      this.room = { ...next };
      this.rebuildShell();
      this.rebuildStreet();
    }

    if (this.expansionGroup) {
      this.group.remove(this.expansionGroup);
      this.expansionGroup.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      this.expansionGroup = null;
    }
    // Level 0 adds nothing: an empty group in the scene graph is a child count that
    // grows on every rebuild and tells a reviewer nothing.
    if (clamped === 0) {
      this.expansionGroup = null;
      return;
    }
    this.expansionGroup = buildExpansion(clamped);
    this.group.add(this.expansionGroup);

    // New geometry arrives after the boot bake, so it has no contact gradient and
    // reads flatter than the room it stands in. The bake skips meshes that already
    // carry a colour attribute, so re-running only touches what was just built.
    if (artVersion() !== 'v1') bakeContactAO(this.group, 0, 0.9);
  }

  public getWalkableBounds(): WalkableBounds {
    return { ...this.bounds };
  }

  /** Interior faces of the walls, which the camera must not look past. */
  public getRoomBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    return { ...this.room };
  }
}
