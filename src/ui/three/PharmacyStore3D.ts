import * as THREE from 'three';
import { Product, Customer, CustomerMood } from '../../sim/types';
import { PharmacyRoom } from './PharmacyRoom';
import { ProductBox3D } from './ProductBox3D';
import { CashRegister3D } from './CashRegister3D';
import { Customer3D } from './Customer3D';

export type CameraViewMode = 'COUNTER' | 'SHELVES' | 'INSPECT' | 'REGISTER';

export interface Pharmacy3DCallbacks {
  onSelectProduct?: (product: Product) => void;
  onPopTablet?: (poppedCount: number) => void;
  onScratchMas?: (code: string) => void;
  onPriceChange?: (price: number) => void;
  onCashPay?: () => void;
  onPosPay?: () => void;
}

export class PharmacyStore3D {
  public container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public room: PharmacyRoom;
  public cashRegister: CashRegister3D;
  public currentCustomer3D?: Customer3D;
  public shelfProducts: Map<string, ProductBox3D> = new Map();
  public activeInspectedBox?: ProductBox3D;
  public counterBox?: ProductBox3D;
  public viewMode: CameraViewMode = 'COUNTER';
  public callbacks: Pharmacy3DCallbacks = {};

  // Camera targets for smooth transitions
  private targetCamPos = new THREE.Vector3(0, 2.25, -0.6);
  private targetCamLookAt = new THREE.Vector3(0, 2.0, 2.6);
  private currentCamLookAt = new THREE.Vector3(0, 2.0, 2.6);

  // Inspect Orbit Drag state
  private isDragging = false;
  private prevMouseX = 0;
  private prevMouseY = 0;
  private inspectEuler = new THREE.Euler(0, 0, 0);

  // Raycasting for interaction
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private animationFrameId = 0;
  private clock = new THREE.Clock();

  constructor(container: HTMLElement, products: Product[], callbacks: Pharmacy3DCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1110);
    this.scene.fog = new THREE.FogExp2(0x0e1110, 0.04);

    // Camera
    const w = Math.max(container.clientWidth || 0, 360);
    const h = Math.max(container.clientHeight || 0, 290);
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 50);
    this.camera.position.set(0, 2.25, -0.6);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    // Environment Lighting
    const ambientLight = new THREE.AmbientLight(0xffeedd, 1.2);
    this.scene.add(ambientLight);

    // Room Architecture
    this.room = new PharmacyRoom();
    this.scene.add(this.room.group);

    // Cash Register & Counter Units
    this.cashRegister = new CashRegister3D();
    this.cashRegister.group.position.set(1.1, 1.92, -0.1);
    this.scene.add(this.cashRegister.group);

    // Populate 3D Shelves with Products
    this.stockShelves(products);

    // Bind Event Listeners for Interaction & Drag
    this.bindEvents();

    // Start Render Loop
    this.animate();
  }

  /**
   * Populate the 3D shelves with physical medicine packages
   */
  public stockShelves(products: Product[]): void {
    // Clear existing
    this.shelfProducts.forEach((p) => this.scene.remove(p.group));
    this.shelfProducts.clear();

    for (let i = 0; i < products.length; i++) {
      const prd = products[i];
      const slot = this.room.shelfSlots[i % this.room.shelfSlots.length];
      const isCounterfeit = prd.id.includes('malaguard') && Math.random() > 0.5;
      const batchNumber = isCounterfeit ? '#MG-204' : `#OK-${800 + i * 15}`;
      const expiryDate = isCounterfeit ? '11/2028' : '08/2027';

      const box = new ProductBox3D(prd, batchNumber, expiryDate, '3892-0192-88', isCounterfeit);
      box.group.position.copy(slot.position);
      box.targetPosition.copy(slot.position);
      box.targetRotation.set(0, 0, 0);
      this.scene.add(box.group);
      this.shelfProducts.set(prd.id, box);
    }
  }

  /**
   * Set active Customer in front of counter
   */
  public setCustomer(customer: Customer): void {
    if (this.currentCustomer3D) {
      this.scene.remove(this.currentCustomer3D.group);
    }

    this.currentCustomer3D = new Customer3D(customer);
    this.currentCustomer3D.group.position.set(0, 0, 2.2);
    this.currentCustomer3D.group.rotation.y = Math.PI;
    this.scene.add(this.currentCustomer3D.group);
  }

  /**
   * Update customer dialogue / speech bubble
   */
  public updateCustomerSpeech(quote: string, mood?: CustomerMood): void {
    if (!this.currentCustomer3D) return;
    if (mood) {
      this.currentCustomer3D.customer.mood = mood;
    }
    this.currentCustomer3D.updateSpeechBubble(quote);
    this.currentCustomer3D.setState('talking');
  }

  /**
   * Switch Camera View Mode
   */
  public setViewMode(mode: CameraViewMode): void {
    this.viewMode = mode;

    if (mode === 'COUNTER') {
      // Facing customer across counter
      this.targetCamPos.set(0, 2.25, -0.6);
      this.targetCamLookAt.set(0, 2.0, 2.6);
      if (this.activeInspectedBox) {
        this.returnBoxToShelf(this.activeInspectedBox);
      }
    } else if (mode === 'SHELVES') {
      // Turned around facing medicine racks
      this.targetCamPos.set(0, 2.2, -1.8);
      this.targetCamLookAt.set(0, 2.1, -4.8);
    } else if (mode === 'INSPECT') {
      // Focused right in front of player's hands
      this.targetCamPos.set(0, 2.15, -0.5);
      this.targetCamLookAt.set(0, 2.1, 0.4);
      this.inspectEuler.set(0, 0, 0);
    } else if (mode === 'REGISTER') {
      // Looking down at cash register & POS
      this.targetCamPos.set(0.7, 2.4, -0.4);
      this.targetCamLookAt.set(1.1, 1.95, 0.1);
    }
  }

  /**
   * Pick a product to inspect in hands in 3D
   */
  public inspectProduct(productId: string): ProductBox3D | undefined {
    const box = this.shelfProducts.get(productId);
    if (!box) return undefined;

    if (this.activeInspectedBox && this.activeInspectedBox !== box) {
      this.returnBoxToShelf(this.activeInspectedBox);
    }

    this.activeInspectedBox = box;
    box.isInspecting = true;
    this.setViewMode('INSPECT');

    // Float box right in front of inspection camera
    box.targetPosition.set(0, 2.1, 0.4);
    box.targetRotation.set(0, 0, 0);
    box.targetScale.set(1.4, 1.4, 1.4);

    if (this.callbacks.onSelectProduct) {
      this.callbacks.onSelectProduct(box.product);
    }
    return box;
  }

  /**
   * Return a box to its shelf slot
   */
  public returnBoxToShelf(box: ProductBox3D): void {
    const products = Array.from(this.shelfProducts.values());
    const idx = products.indexOf(box);
    const slot = this.room.shelfSlots[idx % this.room.shelfSlots.length];
    if (slot) {
      box.targetPosition.copy(slot.position);
      box.targetRotation.set(0, 0, 0);
      box.targetScale.set(1, 1, 1);
      box.isInspecting = false;
    }
    if (this.activeInspectedBox === box) {
      this.activeInspectedBox = undefined;
    }
  }

  /**
   * Place inspected box onto counter for dispensing
   */
  public placeBoxOnCounter(box: ProductBox3D): void {
    if (this.counterBox && this.counterBox !== box) {
      this.returnBoxToShelf(this.counterBox);
    }
    this.counterBox = box;
    box.isInspecting = false;
    box.targetPosition.set(-0.6, 1.98, 0.2);
    box.targetRotation.set(0, Math.PI / 8, 0);
    box.targetScale.set(1, 1, 1);
    this.setViewMode('COUNTER');
  }

  /**
   * Trigger Cash Payment in 3D
   */
  public triggerCashPayment(amount: number): void {
    this.cashRegister.updateDisplay(amount);
    this.cashRegister.openDrawer();
    if (this.currentCustomer3D) {
      this.currentCustomer3D.setState('paying');
    }
    setTimeout(() => {
      this.cashRegister.closeDrawer();
      if (this.currentCustomer3D) {
        this.currentCustomer3D.setState('taking');
      }
    }, 1800);
  }

  /**
   * Trigger POS Transfer Payment in 3D
   */
  public triggerPosPayment(amount: number): void {
    this.cashRegister.updateDisplay(amount);
    this.cashRegister.updatePosScreen('APPROVED', `₦${amount.toLocaleString()}`);
    if (this.currentCustomer3D) {
      this.currentCustomer3D.setState('paying');
    }
    setTimeout(() => {
      this.cashRegister.updatePosScreen('SUCCESS', 'REC: OK-982');
      if (this.currentCustomer3D) {
        this.currentCustomer3D.setState('taking');
      }
    }, 1800);
  }

  /**
   * Set Blackout generator mode
   */
  public setBlackout(active: boolean): void {
    this.room.isBlackout = active;
  }

  private bindEvents(): void {
    const canvas = this.renderer.domElement;

    // Pointer Down for drag / click
    canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;

      // Raycast click
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.handlePointerClick();
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const deltaX = e.clientX - this.prevMouseX;
      const deltaY = e.clientY - this.prevMouseY;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;

      // If in inspect mode, rotate the 3D box
      if (this.viewMode === 'INSPECT' && this.activeInspectedBox) {
        this.inspectEuler.y += deltaX * 0.015;
        this.inspectEuler.x += deltaY * 0.015;
        this.inspectEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.inspectEuler.x));
        this.activeInspectedBox.targetRotation.copy(this.inspectEuler);
      }
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    // Resize observer
    const ro = new ResizeObserver(() => {
      this.onResize();
    });
    ro.observe(this.container);
  }

  private handlePointerClick(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    for (const hit of intersects) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        // Check tablet popping
        if (obj.userData?.isTablet && this.activeInspectedBox?.blisterStrip) {
          const idx = obj.userData.tabletIndex;
          if (this.activeInspectedBox.blisterStrip.popTablet(idx)) {
            if (this.callbacks.onPopTablet) {
              this.callbacks.onPopTablet(this.activeInspectedBox.blisterStrip.poppedCount);
            }
          }
          return;
        }

        // Check Product Box click
        if (obj.userData?.isProductBox && obj.userData.productBoxInstance) {
          const box: ProductBox3D = obj.userData.productBoxInstance;
          if (this.viewMode === 'SHELVES') {
            this.inspectProduct(box.product.id);
          } else if (this.viewMode === 'INSPECT' && box === this.activeInspectedBox) {
            // Click box in inspect mode: scratch foil or toggle blister slide
            if (box.product.hasMasScratchCode && !box.textureSet?.isScratched) {
              box.scratchFoil();
              if (this.callbacks.onScratchMas) {
                this.callbacks.onScratchMas(box.masCode);
              }
            } else if (box.blisterStrip) {
              box.toggleBlisterSlide();
            }
          }
          return;
        }

        // Check Cash Register click
        if (obj.userData?.isCashRegister) {
          if (this.viewMode !== 'REGISTER') {
            this.setViewMode('REGISTER');
          } else {
            this.setViewMode('COUNTER');
          }
          return;
        }

        obj = obj.parent;
      }
    }
  }

  private onResize(): void {
    const w = Math.max(this.container.clientWidth || 0, 360);
    const h = Math.max(this.container.clientHeight || 0, 290);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();

    // Camera Lerping
    this.camera.position.lerp(this.targetCamPos, Math.min(1, delta * 6));
    this.currentCamLookAt.lerp(this.targetCamLookAt, Math.min(1, delta * 6));
    this.camera.lookAt(this.currentCamLookAt);

    // Update components
    this.room.update(delta);
    this.cashRegister.update(delta);

    if (this.currentCustomer3D) {
      this.currentCustomer3D.update(delta);
    }

    this.shelfProducts.forEach((box) => box.update(delta));

    this.renderer.render(this.scene, this.camera);
  };

  public destroy(): void {
    cancelAnimationFrame(this.animationFrameId);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
