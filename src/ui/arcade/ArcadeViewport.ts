import * as THREE from 'three';
import { quality } from './quality';

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
export const DEFAULT_PLAYABLE_BOUNDS: PlayableBounds = {
  minX: -6.0,
  maxX: 6.0,
  minZ: -6.5,
  maxZ: 6.5,
};

/** NDC fraction of the viewport the playable floor must stay inside (0.92 = 92%). */
const SCREEN_MARGIN = 0.92;
/** Furthest the camera may be pushed back from its base offset, as a multiple. */
const MAX_FIT_SCALE = 2.8;
/** Height of the tallest fixture that must stay framed, in metres. */
const FRAME_HEIGHT = 2.6;
/** Eye-to-hair height of the player, used to keep the character controllable. */
const CHARACTER_HEIGHT = 1.75;
/** Smallest on-screen player height: a share of the viewport and an absolute floor. */
const MIN_CHARACTER_FRACTION = 0.05;
const MIN_CHARACTER_PX = 40;
/** Metres kept between the camera target and the wall when zoomed in. */
const CAMERA_INSET = 2.5;
/** Metres the camera may trail when the whole room already fits on screen. */
const CONTAINED_PAN = 2.2;

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
  /** Real floor extent; the camera may zoom in but must never show past these walls. */
  public roomBounds: PlayableBounds = { minX: -8, maxX: 8, minZ: -9, maxZ: 9 };
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
  public setRoomBounds(bounds: PlayableBounds): void {
    this.roomBounds = { ...bounds };
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

    // Dynamic FOV adjustments: widen FOV on narrow mobile portrait so shop stays in view
    if (this.aspect < 0.75) {
      // Portrait smartphone (e.g. 360-430px wide)
      this.camera.fov = 44;
    } else if (this.aspect < 1.0) {
      this.camera.fov = 39;
    } else {
      // Desktop widescreen
      this.camera.fov = 34;
    }

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
    const baseLen = this.baseOffset.length();
    this.shopCenter.set(
      (this.bounds.minX + this.bounds.maxX) / 2,
      0,
      (this.bounds.minZ + this.bounds.maxZ) / 2
    );

    this.probeCamera.fov = this.camera.fov;
    this.probeCamera.aspect = this.aspect;
    this.probeCamera.near = 0.1;
    this.probeCamera.far = 200;
    this.probeCamera.updateProjectionMatrix();

    const containDist = this.solveContainDistance(baseLen);
    const playDist = this.playableDistance();

    const dist = Math.min(containDist, playDist);
    this.contained = dist >= containDist - 0.01;
    this.targetOffset.copy(this.isoDir).multiplyScalar(dist);

    if (this.contained) {
      // Whole room on screen: trail the player a little (max CONTAINED_PAN) so the
      // composition stays centred instead of sliding the shop to one edge.
      this.panLimit.set(
        Math.min(CONTAINED_PAN, this.maxPan(0, dist)),
        Math.min(CONTAINED_PAN, this.maxPan(1, dist))
      );
    } else {
      // Zoomed in for readability: trail the player freely, but keep the camera
      // target inside the room so it never drifts past the walls.
      const halfRoomX = (this.roomBounds.maxX - this.roomBounds.minX) / 2;
      const halfRoomZ = (this.roomBounds.maxZ - this.roomBounds.minZ) / 2;
      const halfWalkX = (this.bounds.maxX - this.bounds.minX) / 2;
      const halfWalkZ = (this.bounds.maxZ - this.bounds.minZ) / 2;
      this.panLimit.set(
        Math.max(0, Math.min(halfWalkX, halfRoomX - CAMERA_INSET)),
        Math.max(0, Math.min(halfWalkZ, halfRoomZ - CAMERA_INSET))
      );
    }
  }

  /** Distance at which the framed area first fits inside SCREEN_MARGIN. */
  private solveContainDistance(baseLen: number): number {
    let dist = baseLen;
    for (let i = 0; i < 6; i++) {
      const extent = this.projectedExtent(0, 0, dist);
      if (extent <= SCREEN_MARGIN) break;
      dist = Math.min(baseLen * MAX_FIT_SCALE, dist * (extent / SCREEN_MARGIN) * 1.02);
    }
    return dist;
  }

  /** Distance at which a standing character is still big enough to control. */
  private playableDistance(): number {
    const targetPx = Math.max(MIN_CHARACTER_PX, this.viewportHeight * MIN_CHARACTER_FRACTION);
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const horizontal = Math.hypot(this.isoDir.x, this.isoDir.z);
    // Apparent height of a vertical segment shrinks as cos(elevation).
    return (this.viewportHeight * CHARACTER_HEIGHT * horizontal) / (2 * targetPx * Math.tan(halfFov));
  }

  /** Largest |NDC| reached by the floor corners at y=0 and y=FRAME_HEIGHT. */
  private projectedExtent(shiftX: number, shiftZ: number, dist: number): number {
    const cx = this.shopCenter.x + shiftX;
    const cz = this.shopCenter.z + shiftZ;
    const cam = this.probeCamera;
    cam.position.set(cx + this.isoDir.x * dist, this.isoDir.y * dist, cz + this.isoDir.z * dist);
    cam.lookAt(cx, 0, cz);
    cam.updateMatrixWorld(true);

    let worst = 0;
    for (const x of [this.bounds.minX, this.bounds.maxX]) {
      for (const z of [this.bounds.minZ, this.bounds.maxZ]) {
        for (const y of [0, FRAME_HEIGHT]) {
          const p = this.probePoint.set(x, y, z).project(cam);
          worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y));
        }
      }
    }
    return worst;
  }

  /**
   * How far a contained framing may slide along one axis before a floor corner
   * leaves the screen margin.
   */
  private maxPan(axis: 0 | 1, dist: number): number {
    const limit = 6;
    const ok = (sx: number, sz: number): boolean =>
      this.projectedExtent(sx, sz, dist) <= SCREEN_MARGIN;

    if (!ok(0, 0)) return 0;
    const shift = (v: number): [number, number] => (axis === 0 ? [v, 0] : [0, v]);
    const [lx, lz] = shift(limit);
    if (ok(lx, lz)) return limit;

    let lo = 0;
    let hi = limit;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      const [mx, mz] = shift(mid);
      if (ok(mx, mz)) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  public updateCameraFollow(targetPos: THREE.Vector3, delta: number = 0.016): void {
    // Trail the player, but never far enough to push the shop off screen.
    this.clampedTarget.set(
      clamp(targetPos.x, this.shopCenter.x - this.panLimit.x, this.shopCenter.x + this.panLimit.x),
      targetPos.y,
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
