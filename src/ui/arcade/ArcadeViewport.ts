import * as THREE from 'three';

export interface ArcadeViewportOptions {
  scene?: THREE.Scene | THREE.Group;
  renderer?: THREE.WebGLRenderer;
}

export class ArcadeViewport {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer | null = null;
  public container: HTMLElement | null = null;
  public aspect: number = 1;
  public targetOffset: THREE.Vector3 = new THREE.Vector3(12, 16, 12);
  public cameraTarget: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  private resizeObserver: any = null;

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
        this.renderer = new THREE.WebGLRenderer({
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
        });
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

  public resize(width?: number, height?: number): void {
    const w = width ?? (this.container?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 800));
    const h = height ?? (this.container?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600));
    this.aspect = w / (h || 1);
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

    this.camera.updateProjectionMatrix();

    if (this.renderer) {
      this.renderer.setSize(w, h, false);
      this.renderer.setPixelRatio(typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1);
    }
  }

  public updateCameraFollow(targetPos: THREE.Vector3, delta: number = 0.016): void {
    // Smoothly interpolate camera target
    const lerpFactor = Math.min(1, delta * 5);
    this.cameraTarget.lerp(targetPos, lerpFactor);

    const desiredCamPos = this.cameraTarget.clone().add(this.targetOffset);
    this.camera.position.lerp(desiredCamPos, lerpFactor);
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
