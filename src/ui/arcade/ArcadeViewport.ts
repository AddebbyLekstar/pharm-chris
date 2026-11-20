import * as THREE from 'three';
import { quality } from './quality';
import { ROOM, WALKABLE } from './layout';

export interface ArcadeViewportOptions {
  scene?: THREE.Scene | THREE.Group;
  renderer?: THREE.WebGLRenderer;
}

export interface PlayableBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Walkable floor the camera must keep framed, matching ArcadeScene's bounds. */
export const DEFAULT_PLAYABLE_BOUNDS: PlayableBounds = { ...WALKABLE };

/** NDC fraction of the viewport the playable floor must stay inside (0.92 = 92%). */
/** Height of the tallest fixture that must stay framed, in metres. */
const FRAME_HEIGHT = 2.6;
/** Eye-to-hair height of the player, used to keep the character controllable. */

// Character size floor, in px. The design said 46, and at 46 Chris is a 47 px blob
// on a 360 px phone: findable, not readable. The Sims Mobile puts its people at
// ~10-14 % of screen height, and the user's brief is that Chris is a star, so the
// camera trades room-in-frame for a character you can actually see. 80 px is 10 %
// of an 800 px viewport.
const MIN_CHARACTER_PX = 80;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export class ArcadeViewport {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer | null = null;
  public container: HTMLElement | null = null;
  public aspect: number = 1;
  /** Base camera offset for a landscape view; scaled out on narrow screens. */
  private readonly baseOffset = new THREE.Vector3(12, 16, 12);
  public targetOffset: THREE.Vector3 = new THREE.Vector3(12, 16, 12);
  public cameraTarget: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  private resizeObserver: any = null;
  private readonly desiredCamPos = new THREE.Vector3();
  private readonly clampedTarget = new THREE.Vector3();
  private readonly isoDir = new THREE.Vector3(12, 16, 12).normalize();
  private readonly shopCenter = new THREE.Vector3();
  private readonly probeCamera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
  private readonly probePoint = new THREE.Vector3();

  /** Walkable floor the camera framing is solved against. */
  public bounds: PlayableBounds = { ...DEFAULT_PLAYABLE_BOUNDS };
  /**
   * How far the camera may trail the player, in metres per axis. Zero when the
   * viewport is too narrow to both follow and keep the whole floor in frame.
   */
  public panLimit: THREE.Vector2 = new THREE.Vector2(0, 0);
  /** True when the whole room fits on screen and the camera trails inside it. */
  public contained = true;
  /** Share of viewport width the room occupied at the last solve (0-1). */
  public roomFill = 0;
  /**
   * The character's real height, in metres, as measured from his mesh. The solve
   * used to assume a constant; when Chris was scaled 1.35x the assumption went
   * stale and the gate measured 77 px against an 80 px floor.
   */
  public characterHeight = 2.2;
  /**
   * Expansion level the framing is solved for. Each level steps the camera back one
   * notch — a bigger shop you cannot see is not a bigger shop — which is done by
   * dropping the character px floor, not by scaling the fov.
   */
  public expansionLevel = 0;
  /** Real floor extent; the camera may zoom in but must never show past these walls. */
  public roomBounds: PlayableBounds = { ...ROOM };
  public viewportHeight = 600;
  public viewportWidth = 800;

  constructor(options?: ArcadeViewportOptions) {
    if (options?.scene instanceof THREE.Scene) {
      this.scene = options.scene;
    } else {
      this.scene = new THREE.Scene();
      if (options?.scene) {
        this.scene.add(options.scene);
      }
    }

    // 35-degree FOV isometric perspective camera
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.camera.position.copy(this.targetOffset);
    this.camera.lookAt(this.cameraTarget);

    if (options?.renderer) {
      this.renderer = options.renderer;
    } else if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const q = quality();
        this.renderer = new THREE.WebGLRenderer({
          antialias: q.antialias,
          powerPreference: 'high-performance',
          alpha: false,
        });
        this.renderer.shadowMap.enabled = q.shadows;
        this.renderer.shadowMap.type = q.shadows ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
      } catch (e) {
        // In headless testing or environments without WebGL
        this.renderer = null;
      }
    }
  }

  public mount(container: HTMLElement): void {
    this.container = container;
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.renderer.domElement.style.display = 'block';
      container.innerHTML = '';
      container.appendChild(this.renderer.domElement);
    }

    const w = container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 800);
    const h = container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);
    this.resize(w, h);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            this.resize(width, height);
          }
        }
      });
      this.resizeObserver.observe(container);
    }
  }

  /**
   * Point the framing solver at the room the player can actually walk.
   *
   * `padding` widens the framed area past the walkable floor so the wall bases
   * and shelf fixtures stay visible; without it the camera frames the painted
   * floor and the room still looks cropped at the edges.
   */
  /**
   * Tell the camera how tall the character actually is, then re-solve. Called once
   * the player mesh exists; keeps the px floor honest through any future rescale.
   */
  public setCharacterHeight(metres: number): void {
    if (!(metres > 0.1)) return;
    this.characterHeight = metres;
    this.fitCameraToBounds();
    this.camera.updateProjectionMatrix();
  }

  public setRoomBounds(bounds: PlayableBounds): void {
    this.roomBounds = { ...bounds };
  }

  /** Step the camera back one notch per purchased expansion. */
  public setExpansionLevel(level: number): void {
    this.expansionLevel = Math.max(0, Math.min(2, Math.floor(level)));
    this.fitCameraToBounds();
    this.camera.updateProjectionMatrix();
  }

  /** The px floor for the current expansion: 80 at level 0, 64 at level 2. */
  private get minimumCharacterPx(): number {
    return Math.max(56, MIN_CHARACTER_PX - this.expansionLevel * 8);
  }

  public setPlayableBounds(bounds: PlayableBounds, padding = 0.6): void {
    this.bounds = {
      minX: bounds.minX - padding,
      maxX: bounds.maxX + padding,
      minZ: bounds.minZ - padding,
      maxZ: bounds.maxZ + padding,
    };
    this.fitCameraToBounds();
    this.camera.updateProjectionMatrix();
  }

  public resize(width?: number, height?: number): void {
    const w = width ?? (this.container?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 800));
    const h = height ?? (this.container?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600));
    this.aspect = w / (h || 1);
    this.viewportHeight = h || 600;
    this.viewportWidth = w || 800;
    this.camera.aspect = this.aspect;

    this.camera.fov = 32;

    // Fit the walkable floor to the viewport on both axes, then bound how far
    // the camera may trail the player (see fitCameraToBounds).
    this.fitCameraToBounds();

    this.camera.updateProjectionMatrix();

    if (this.renderer) {
      this.renderer.setSize(w, h, false);
      const q = quality();
      this.renderer.setPixelRatio(
        typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, q.maxPixelRatio) : 1
      );
    }
  }

  /**
   * Choose the camera distance and the follow envelope.
   *
   * Two constraints fight on a phone: the whole room in frame, and a player
   * large enough to control. Fitting a 13x14 m room into a 360 px-wide portrait
   * viewport shrinks a 1.75 m character to ~20 px, so containment alone is not
   * playable. The rule is therefore:
   *
   *  - if the room fits while the player is still at least MIN_CHARACTER_PX tall,
   *    frame the room (contain) and let the camera trail within that frame;
   *  - otherwise zoom to the playable scale and trail the player, clamped so the
   *    view never leaves the room (cover) and no empty background shows.
   */
  private fitCameraToBounds(): void {
    this.shopCenter.set(
      (this.roomBounds.minX + this.roomBounds.maxX) / 2,
      0,
      (this.roomBounds.minZ + this.roomBounds.maxZ) / 2
    );

    this.probeCamera.fov = this.camera.fov;
    this.probeCamera.aspect = this.aspect;
    this.probeCamera.near = 0.1;
    this.probeCamera.far = 200;
    this.probeCamera.updateProjectionMatrix();

    // Two constraints, and at phone widths they cannot both be satisfied by
    // framing alone: measured in screen space, a 1.62 m character is only
    // 1.62 * cos(elev) / roomDiagonal of the room's projected width. With a
    // 12.45 m diamond (8.4 x 9.2 at 45 degrees yaw) the room at 85 % of a 360 px
    // screen puts Chris at ~29 px, not 46. The design's fill band assumed screen
    // width, not projected diagonal.
    //
    // So the rules are: cover the width minimum (room never shrinks inside the
    // frame), and let the camera come closer until Chris is 46 px, cropping the
    // room and trailing the player. That is what The Sims Mobile does.
    const dPlayer = this.solvePlayerDistance(this.minimumCharacterPx);
    const dCover = this.solveFillDistance(1.0);
    const dist = Math.min(dPlayer, dCover);

    this.targetOffset.copy(this.isoDir).multiplyScalar(dist);
    this.roomFill = this.projectedRoomFraction(dist);
    this.contained = this.roomFill <= 1.05;
    // Pan envelope, in two regimes.
    //
    // Fill 1.0 is the contained case: the room exactly fills the frame, so any pan
    // slides a wall in and the far bay out (Instabox hermes2, 120 px). Zero pan.
    //
    // Once the camera has zoomed in to keep Chris at 46 px the room overflows, so
    // the camera has to be free to centre the player anywhere on the walkable floor
    // — otherwise standing in a side bay leaves you 2-3 px off the edge (both PC
    // boxes, all four phone widths). Pan ramps to the walkable half over the first
    // 25 % of zoom so it is never a step change.
    const zoomT = clamp((this.roomFill - 1) / 0.25, 0, 1);
    const walkHalfX = (this.bounds.maxX - this.bounds.minX) / 2;
    const walkHalfZ = (this.bounds.maxZ - this.bounds.minZ) / 2;
    // Stop 1.2 m short of the walkable edge. At full zoom the frame is only ~4 m
    // wide, so letting the target reach the wall edge put the shop's front boundary
    // — and the empty street beyond it — across the bottom third of the screen.
    const EDGE_MARGIN = 1.2;
    this.panLimit.set(
      Math.max(0, walkHalfX * zoomT - EDGE_MARGIN),
      Math.max(0, walkHalfZ * zoomT - EDGE_MARGIN)
    );
  }

  /** Public read-out of the shot, so tests and the Playwright gate share one number. */
  public playerPixels(x = 0, z = 0.2): number {
    this.probeCamera.fov = this.camera.fov;
    this.probeCamera.aspect = this.aspect;
    this.probeCamera.updateProjectionMatrix();
    return this.projectedPlayerPixels(this.targetOffset.length(), x, z);
  }

  private placeProbe(dist: number, atX = this.shopCenter.x, atZ = this.shopCenter.z): void {
    const cam = this.probeCamera;
    cam.position.set(atX + this.isoDir.x * dist, this.isoDir.y * dist, atZ + this.isoDir.z * dist);
    cam.lookAt(atX, 0, atZ);
    cam.updateMatrixWorld(true);
  }

  /**
   * Fraction of viewport width covered by the room's projected bounding box.
   *
   * Measured across all eight corners, not just the two side walls: the camera
   * yaws 45 degrees, so the room projects as a diamond and its widest screen span
   * is a diagonal. Sampling only (minX, z) to (maxX, z) under-reports the width by
   * ~20 % and puts the near-right shelf bay off screen.
   */
  private projectedRoomFraction(dist: number): number {
    this.placeProbe(dist);
    let min = Infinity;
    let max = -Infinity;
    for (const x of [this.roomBounds.minX, this.roomBounds.maxX]) {
      for (const z of [this.roomBounds.minZ, this.roomBounds.maxZ]) {
        for (const y of [0, FRAME_HEIGHT]) {
          const ndc = this.probePoint.set(x, y, z).project(this.probeCamera).x;
          if (ndc < min) min = ndc;
          if (ndc > max) max = ndc;
        }
      }
    }
    return (max - min) / 2;
  }

  private projectedPlayerPixels(dist: number, x: number, z: number): number {
    this.placeProbe(dist);
    const feet = this.probePoint.set(x, 0, z).project(this.probeCamera).clone();
    const head = this.probePoint.set(x, this.characterHeight, z).project(this.probeCamera).clone();
    return (Math.abs(head.y - feet.y) * this.viewportHeight) / 2;
  }

  /** Distance at which the room's projected width is `target` of the viewport. */
  private solveFillDistance(target: number, baseLen = this.baseOffset.length()): number {
    let dist = baseLen;
    for (let i = 0; i < 18; i++) {
      const fill = this.projectedRoomFraction(dist);
      if (fill <= 0) break;
      if (Math.abs(fill - target) < 0.002) break;
      dist = clamp(dist * (fill / target), 6, 120);
    }
    return dist;
  }

  /** Distance at which a standing character projects at exactly targetPx. */
  private solvePlayerDistance(targetPx: number): number {
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const horizontal = Math.hypot(this.isoDir.x, this.isoDir.z);
    return (this.viewportHeight * this.characterHeight * horizontal) / (2 * targetPx * Math.tan(halfFov));
  }

  public updateCameraFollow(targetPos: THREE.Vector3, delta: number = 0.016): void {
    // Trail the player, but never far enough to push the shop off screen.
    // Aim ~0.9 m above the player's feet, not at them. Looking at the floor pushes
    // the room into the top third and leaves the bottom of a tall phone as empty
    // pavement; lifting the aim point centres the room and the character in frame.
    this.clampedTarget.set(
      clamp(targetPos.x, this.shopCenter.x - this.panLimit.x, this.shopCenter.x + this.panLimit.x),
      targetPos.y + 0.9,
      clamp(targetPos.z, this.shopCenter.z - this.panLimit.y, this.shopCenter.z + this.panLimit.y)
    );

    const lerpFactor = Math.min(1, delta * 5);
    this.cameraTarget.lerp(this.clampedTarget, lerpFactor);

    this.desiredCamPos.copy(this.cameraTarget).add(this.targetOffset);
    this.camera.position.lerp(this.desiredCamPos, lerpFactor);
    this.camera.lookAt(this.cameraTarget);
  }

  public render(): void {
    if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public dispose(): void {
    if (this.resizeObserver && this.container) {
      this.resizeObserver.unobserve(this.container);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
