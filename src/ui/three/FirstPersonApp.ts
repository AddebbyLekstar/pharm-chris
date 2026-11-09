import * as THREE from 'three';
import { soundFx } from '../../audio/sfx';
import { PharmChrisEngine } from '../../sim/engine';
import { FirstPersonPlayer } from './FirstPersonPlayer';
import { WalkablePharmacyStore, ShelfSlot3D } from './WalkablePharmacyStore';
import { ProductBox3D } from './ProductBox3D';
import { DeliveryCrate3D } from './DeliveryCrate3D';
import { Customer3D } from './Customer3D';

export class FirstPersonApp {
  public rootEl: HTMLElement;
  public engine: PharmChrisEngine;
  public scene: THREE.Scene;
  public renderer: THREE.WebGLRenderer;
  public player: FirstPersonPlayer;
  public store: WalkablePharmacyStore;

  // UI Elements
  private crosshairEl!: HTMLElement;
  private promptEl!: HTMLElement;
  private lockOverlayEl!: HTMLElement;
  private heldBadgeEl!: HTMLElement;
  private subtitlesEl!: HTMLElement;
  private subtitlesSpeakerEl!: HTMLElement;
  private subtitlesTextEl!: HTMLElement;
  private hudDayEl!: HTMLElement;
  private hudCashEl!: HTMLElement;
  private hudDebtEl!: HTMLElement;
  private hudTrustEl!: HTMLElement;
  private modalHostEl!: HTMLElement;

  // Mobile Dual-Thumb Touch Controls
  public isMobile = false;
  private joystickBaseEl: HTMLElement | null = null;
  private joystickKnobEl: HTMLElement | null = null;
  private joystickTouchId: number | null = null;
  private joystickStartX = 0;
  private joystickStartY = 0;
  private lookTouchId: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;
  private drawerQuickBarEl: HTMLElement | null = null;
  private drawerInfoEl: HTMLElement | null = null;

  // State
  private clock = new THREE.Clock();
  private animId = 0;
  public currentHeldBox: ProductBox3D | null = null;
  public currentCounterItem: THREE.Mesh | null = null;
  public currentCarriedCrate: DeliveryCrate3D | null = null;
  public scannedPrice = 0;
  public changeDue = 0;
  public activeModal: 'ledger' | 'delivery' | 'sms' | 'pc' | null = null;
  public queueSlots: THREE.Vector3[] = [
    new THREE.Vector3(-2.5, 0, 1.6),
    new THREE.Vector3(-2.5, 0, 2.8),
    new THREE.Vector3(-2.5, 0, 4.0),
    new THREE.Vector3(-2.5, 0, 5.2),
  ];

  constructor(root: HTMLElement) {
    this.rootEl = root;
    this.engine = new PharmChrisEngine();

    this.isMobile = typeof window !== 'undefined' && (
      'ontouchstart' in window ||
      (navigator && (navigator.maxTouchPoints > 0 || (navigator as any).msMaxTouchPoints > 0)) ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
    );

    // 1. Build Full-Screen DOM Shell
    this.buildDomStructure();

    // 2. Setup Three.js Scene & Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0f0d);
    this.scene.fog = new THREE.FogExp2(0x0c0f0d, 0.035);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    const viewport = this.rootEl.querySelector('#game-viewport-3d')!;
    viewport.appendChild(this.renderer.domElement);

    // 3. Player & First-Person Controls
    this.player = new FirstPersonPlayer(this.renderer.domElement);
    this.scene.add(this.player.camera);

    // 4. Ambient & Walkable Store
    const ambLight = new THREE.AmbientLight(0xffeedd, 1.4);
    this.scene.add(ambLight);

    this.store = new WalkablePharmacyStore();
    this.scene.add(this.store.group);

    // 5. Populate initial stock on shelves
    this.store.populateShelves(this.engine.getAllProducts());

    // Spawn initial morning wholesale delivery crate on curb pallet (Z=7.5)
    const initialPrd = this.engine.getAllProducts()[0];
    this.store.spawnDeliveryCrate(initialPrd, 8);

    // 6. Spawn initial Day 1 customer (Mama Ngozi) & start customer shopping
    const cust = this.engine.getCurrentCustomer();
    if (cust) {
      const cust3D = this.store.setCustomer(cust);
      this.startCustomerShopping(cust3D);
    }

    // 7. Event bindings
    this.bindEvents();
    this.updateHudValues();

    // 8. Start Loop
    this.animate();
  }

  private buildDomStructure(): void {
    this.rootEl.innerHTML = `
      <div id="game-viewport-3d"></div>

      <!-- Center Crosshair & Interaction Prompt -->
      <div class="fps-crosshair" id="fps-crosshair">
        <div class="crosshair-dot"></div>
        <div class="fps-interaction-prompt" id="fps-prompt">[E] Interact</div>
      </div>

      <!-- Click to Lock Mouse / Play Overlay -->
      <div class="fps-click-to-lock-overlay" id="fps-lock-overlay">
        <div class="lock-card">
          <div class="lock-title">PHARM CHRIS 3D</div>
          <div class="lock-subtitle">
            Lagos Neighbourhood Pharmacy Simulator
            <br><br>
            💸 Debt: <strong>₦4,200,000</strong> • ⏳ Timeline: <strong>90 Days</strong>
            <br>
            Walk inside your shop, physically stock shelves, and serve customers.
          </div>
          <button class="lock-btn" id="btn-enter-game">▶ ENTER PHARMACY</button>
        </div>
      </div>

      <!-- Top HUD Stats Bar -->
      <div class="fps-hud-top">
        <div class="fps-hud-left">
          <div class="fps-pill fps-pill--gold" id="hud-day">DAY 1 / 90</div>
          <div class="fps-pill" id="hud-time">08:00 AM</div>
          <div class="fps-pill" id="hud-phase">MORNING RUSH</div>
        </div>
        <div class="fps-hud-right">
          <div class="fps-pill fps-pill--danger" id="hud-debt">DEBT: ₦4,200,000</div>
          <div class="fps-pill fps-pill--gold" id="hud-cash">CASH: ₦84,200</div>
          <div class="fps-pill" id="hud-trust">TRUST: 65%</div>
        </div>
      </div>

      <!-- Bottom Left Controls Legend -->
      <div class="fps-hud-controls">
        <div><span class="fps-key">W</span><span class="fps-key">A</span><span class="fps-key">S</span><span class="fps-key">D</span> Move</div>
        <div><span class="fps-key">Shift</span> Sprint &bull; <span class="fps-key">Mouse</span> Look</div>
        <div><span class="fps-key">E</span> Interact / Pick Up</div>
        <div><span class="fps-key">F</span> Inspect in Hands (MAS foil & blister)</div>
        <div><span class="fps-key">Q</span> Put Back on Shelf</div>
        <div><span class="fps-key">Tab</span> Auntie's Ledger &bull; <span class="fps-key">ESC</span> Unlock Mouse</div>
      </div>

      <!-- Bottom Right Held Item Badge -->
      <div class="fps-held-badge" id="fps-held-badge" style="display: none;">
        HANDS: <span id="fps-held-item-name">Empty</span>
      </div>

      <!-- Bottom Center Dialogue Subtitles -->
      <div class="fps-subtitles" id="fps-subtitles">
        <div class="fps-subtitles-speaker" id="fps-speaker">Mama Ngozi</div>
        <div class="fps-subtitles-text" id="fps-dialogue">"Pharmacist, where Auntie Joke? Give me Malaguard sharp-sharp!"</div>
      </div>

      <!-- Modal Host Overlay for Ledger / Minigames -->
      <div class="fps-modal-overlay" id="fps-modal-host" style="display: none;"></div>

      <!-- Mobile Landscape Touch Layer -->
      <div id="fps-mobile-touch-layer" style="display: none; position: absolute; inset: 0; pointer-events: none; z-index: 45;">
        <!-- Left Side: Movement Virtual Joystick Zone -->
        <div id="fps-touch-zone-move" style="position: absolute; left: 0; top: 0; width: 44%; height: 100%; pointer-events: auto; touch-action: none;">
          <div id="fps-joystick-base" style="display: none; position: fixed; width: 100px; height: 100px; margin-left: -50px; margin-top: -50px; border-radius: 50%; background: rgba(0, 255, 204, 0.15); border: 2px solid rgba(0, 255, 204, 0.5); pointer-events: none; z-index: 50;">
            <div id="fps-joystick-knob" style="position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin-left: -22px; margin-top: -22px; border-radius: 50%; background: #00ffcc; box-shadow: 0 0 12px #00ffcc; transform: translate(-50%, -50%);"></div>
          </div>
        </div>

        <!-- Right Side: Camera Swipe Area -->
        <div id="fps-touch-zone-look" style="position: absolute; right: 0; top: 0; width: 56%; height: 100%; pointer-events: auto; touch-action: none;"></div>

        <!-- Right Thumb Ergonomic Action Buttons -->
        <div class="fps-mobile-action-buttons" style="position: absolute; right: 16px; bottom: 20px; display: flex; flex-direction: column; gap: 10px; pointer-events: auto; z-index: 55;">
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="btn-touch-ledger" style="min-width: 54px; min-height: 48px; border-radius: 8px; background: rgba(30, 25, 20, 0.85); border: 2px solid #8C5F10; color: #fdf6e2; font-family: 'Silkscreen', monospace; font-size: 11px; font-weight: bold; cursor: pointer; touch-action: manipulation;">📖 LEDGER</button>
            <button id="btn-touch-drop" style="min-width: 54px; min-height: 48px; border-radius: 8px; background: rgba(40, 20, 20, 0.85); border: 2px solid #D13438; color: #ff9999; font-family: 'Silkscreen', monospace; font-size: 11px; font-weight: bold; cursor: pointer; touch-action: manipulation;">[Q] DROP</button>
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="btn-touch-inspect" style="min-width: 54px; min-height: 48px; border-radius: 8px; background: rgba(20, 35, 45, 0.85); border: 2px solid #00a8ff; color: #a0e6ff; font-family: 'Silkscreen', monospace; font-size: 11px; font-weight: bold; cursor: pointer; touch-action: manipulation;">[F] MAS</button>
            <button id="btn-touch-interact" style="min-width: 64px; min-height: 48px; border-radius: 8px; background: rgba(0, 50, 40, 0.85); border: 2px solid #00ffcc; color: #00ffcc; font-family: 'Silkscreen', monospace; font-size: 13px; font-weight: bold; cursor: pointer; box-shadow: 0 0 10px rgba(0,255,204,0.3); touch-action: manipulation;">[E] ACT</button>
          </div>
        </div>

        <!-- Cash Register Drawer Quickbar for Mobile -->
        <div id="fps-drawer-quickbar" style="display: none; position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); background: rgba(12, 15, 13, 0.95); border: 2px solid #00ffcc; border-radius: 10px; padding: 10px 14px; flex-direction: column; align-items: center; gap: 8px; pointer-events: auto; z-index: 60; box-shadow: 0 8px 32px rgba(0,0,0,0.85);">
          <div id="fps-drawer-quickbar-info" style="font-family: 'Silkscreen', monospace; font-size: 12px; color: #00ffcc; font-weight: bold;">TENDER CHANGE</div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;">
            <button class="btn-change-quick" data-denom="50" style="min-width: 44px; min-height: 44px; background: #2a2d32; border: 1px solid #555; color: #fff; border-radius: 6px; font-weight: bold; cursor: pointer; touch-action: manipulation;">₦50</button>
            <button class="btn-change-quick" data-denom="100" style="min-width: 44px; min-height: 44px; background: #2a2d32; border: 1px solid #555; color: #fff; border-radius: 6px; font-weight: bold; cursor: pointer; touch-action: manipulation;">₦100</button>
            <button class="btn-change-quick" data-denom="200" style="min-width: 44px; min-height: 44px; background: #2a2d32; border: 1px solid #555; color: #fff; border-radius: 6px; font-weight: bold; cursor: pointer; touch-action: manipulation;">₦200</button>
            <button class="btn-change-quick" data-denom="500" style="min-width: 44px; min-height: 44px; background: #2a2d32; border: 1px solid #555; color: #fff; border-radius: 6px; font-weight: bold; cursor: pointer; touch-action: manipulation;">₦500</button>
            <button class="btn-change-quick" data-denom="1000" style="min-width: 44px; min-height: 44px; background: #2a2d32; border: 1px solid #555; color: #fff; border-radius: 6px; font-weight: bold; cursor: pointer; touch-action: manipulation;">₦1000</button>
            <button id="btn-quick-pos" style="min-width: 50px; min-height: 44px; background: #1c6758; border: 1px solid #00ffcc; color: #fff; border-radius: 6px; font-weight: bold; cursor: pointer; touch-action: manipulation;">POS</button>
            <button id="btn-quick-close-drawer" style="min-width: 50px; min-height: 44px; background: #D13438; border: none; color: #fff; border-radius: 6px; font-weight: bold; cursor: pointer; touch-action: manipulation;">DONE</button>
          </div>
        </div>
      </div>
    `;

    this.crosshairEl = this.rootEl.querySelector('#fps-crosshair')!;
    this.promptEl = this.rootEl.querySelector('#fps-prompt')!;
    this.lockOverlayEl = this.rootEl.querySelector('#fps-lock-overlay')!;
    this.heldBadgeEl = this.rootEl.querySelector('#fps-held-badge')!;
    this.subtitlesEl = this.rootEl.querySelector('#fps-subtitles')!;
    this.subtitlesSpeakerEl = this.rootEl.querySelector('#fps-speaker')!;
    this.subtitlesTextEl = this.rootEl.querySelector('#fps-dialogue')!;
    this.hudDayEl = this.rootEl.querySelector('#hud-day')!;
    this.hudCashEl = this.rootEl.querySelector('#hud-cash')!;
    this.hudDebtEl = this.rootEl.querySelector('#hud-debt')!;
    this.hudTrustEl = this.rootEl.querySelector('#hud-trust')!;
    this.modalHostEl = this.rootEl.querySelector('#fps-modal-host')!;
  }

  private bindEvents(): void {
    const mobileLayer = this.rootEl.querySelector('#fps-mobile-touch-layer') as HTMLElement | null;
    this.joystickBaseEl = this.rootEl.querySelector('#fps-joystick-base');
    this.joystickKnobEl = this.rootEl.querySelector('#fps-joystick-knob');
    this.drawerQuickBarEl = this.rootEl.querySelector('#fps-drawer-quickbar');
    this.drawerInfoEl = this.rootEl.querySelector('#fps-drawer-quickbar-info');

    const activateTouchControls = () => {
      this.isMobile = true;
      this.player.isTouchMode = true;
      this.lockOverlayEl.style.display = 'none';
      if (mobileLayer) mobileLayer.style.display = 'block';
      // Hide desktop keyboard legend on mobile touch
      const desktopLegend = this.rootEl.querySelector('.fps-hud-controls') as HTMLElement | null;
      if (desktopLegend) desktopLegend.style.display = 'none';
    };

    if (this.isMobile) {
      activateTouchControls();
    }

    // Pointer Lock click (Desktop click or mobile tap)
    this.lockOverlayEl.addEventListener('click', () => {
      if (this.isMobile) {
        activateTouchControls();
      } else {
        this.player.controls.lock();
      }
    });

    this.lockOverlayEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      activateTouchControls();
    }, { passive: false });

    this.player.controls.addEventListener('lock', () => {
      this.lockOverlayEl.style.display = 'none';
    });

    this.player.controls.addEventListener('unlock', () => {
      if (!this.activeModal && !this.player.isTouchMode) {
        this.lockOverlayEl.style.display = 'flex';
      }
    });

    // Setup Left Virtual Joystick & Right Look Swipe
    this.bindTouchControls();

    // Keyboard interaction
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') {
        this.handleInteract();
      } else if (e.code === 'KeyQ') {
        this.handlePutBack();
      } else if (e.code === 'Tab') {
        e.preventDefault();
        this.toggleLedgerModal();
      }
    });

    // Click on canvas for interaction
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (!this.player.isLocked) return;
      if (e.button === 0) {
        // Left Click
        if (this.player.isInspectingHeldItem && this.currentHeldBox) {
          // Scratch MAS foil or slide blister
          if (this.currentHeldBox.product.hasMasScratchCode && !this.currentHeldBox.textureSet?.isScratched) {
            this.currentHeldBox.scratchFoil();
            soundFx.playFoilScratch();
            this.showSubtitle('AGENCY MAS CODE', `Revealed Code: ${this.currentHeldBox.masCode}`, 3000);
          } else if (this.currentHeldBox.blisterStrip) {
            this.currentHeldBox.toggleBlisterSlide();
            soundFx.playTap();
          }
        } else {
          this.handleInteract();
        }
      }
    });

    // Window Resize
    window.addEventListener('resize', () => {
      this.player.camera.aspect = window.innerWidth / window.innerHeight;
      this.player.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private bindTouchControls(): void {
      const moveZone = this.rootEl.querySelector('#fps-touch-zone-move') as HTMLElement | null;
      const lookZone = this.rootEl.querySelector('#fps-touch-zone-look') as HTMLElement | null;
      const maxRadius = 45;

      if (moveZone) {
        moveZone.addEventListener('touchstart', (e: TouchEvent) => {
          e.preventDefault();
          if (this.joystickTouchId !== null) return;
          const touch = e.changedTouches[0];
          this.joystickTouchId = touch.identifier;
          this.joystickStartX = touch.clientX;
          this.joystickStartY = touch.clientY;

          if (this.joystickBaseEl) {
            this.joystickBaseEl.style.display = 'block';
            this.joystickBaseEl.style.left = `${touch.clientX}px`;
            this.joystickBaseEl.style.top = `${touch.clientY}px`;
            if (this.joystickKnobEl) {
              this.joystickKnobEl.style.transform = 'translate(-50%, -50%)';
            }
          }
        }, { passive: false });

        moveZone.addEventListener('touchmove', (e: TouchEvent) => {
          e.preventDefault();
          for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === this.joystickTouchId) {
              const dx = touch.clientX - this.joystickStartX;
              const dy = touch.clientY - this.joystickStartY;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist > 0) {
                const clamped = Math.min(dist, maxRadius);
                const norm = clamped / maxRadius;
                const normX = (dx / dist) * norm;
                const normY = (dy / dist) * norm;
                this.player.setTouchMove(normX, normY);

                if (this.joystickKnobEl) {
                  const knobX = (dx / dist) * clamped;
                  const knobY = (dy / dist) * clamped;
                  this.joystickKnobEl.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
                }
              } else {
                this.player.setTouchMove(0, 0);
              }
              break;
            }
          }
        }, { passive: false });

        const endMove = (e: TouchEvent) => {
          for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === this.joystickTouchId) {
              this.joystickTouchId = null;
              this.player.setTouchMove(0, 0);
              if (this.joystickBaseEl) {
                this.joystickBaseEl.style.display = 'none';
              }
              break;
            }
          }
        };
        moveZone.addEventListener('touchend', endMove);
        moveZone.addEventListener('touchcancel', endMove);
      }

      if (lookZone) {
        lookZone.addEventListener('touchstart', (e: TouchEvent) => {
          e.preventDefault();
          if (this.lookTouchId !== null) return;
          const touch = e.changedTouches[0];
          this.lookTouchId = touch.identifier;
          this.lastLookX = touch.clientX;
          this.lastLookY = touch.clientY;
        }, { passive: false });

        lookZone.addEventListener('touchmove', (e: TouchEvent) => {
          e.preventDefault();
          for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === this.lookTouchId) {
              const dx = touch.clientX - this.lastLookX;
              const dy = touch.clientY - this.lastLookY;
              this.lastLookX = touch.clientX;
              this.lastLookY = touch.clientY;
              this.player.rotateView(dx, dy);
              break;
            }
          }
        }, { passive: false });

        const endLook = (e: TouchEvent) => {
          for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === this.lookTouchId) {
              this.lookTouchId = null;
              break;
            }
          }
        };
        lookZone.addEventListener('touchend', endLook);
        lookZone.addEventListener('touchcancel', endLook);
      }

    // Right Thumb Action Buttons
    this.rootEl.querySelector('#btn-touch-interact')?.addEventListener('click', () => {
      this.handleInteract();
    });
    this.rootEl.querySelector('#btn-touch-inspect')?.addEventListener('click', () => {
      if (this.player.isInspectingHeldItem && this.currentHeldBox) {
        if (this.currentHeldBox.product.hasMasScratchCode && !this.currentHeldBox.textureSet?.isScratched) {
          this.currentHeldBox.scratchFoil();
          soundFx.playFoilScratch();
          this.showSubtitle('AGENCY MAS CODE', `Revealed Code: ${this.currentHeldBox.masCode}`, 3000);
        } else if (this.currentHeldBox.blisterStrip) {
          this.currentHeldBox.toggleBlisterSlide();
          soundFx.playTap();
        }
      } else if (this.player.heldItem) {
        this.player.toggleInspectHeldItem();
      }
    });
    this.rootEl.querySelector('#btn-touch-drop')?.addEventListener('click', () => {
      this.handlePutBack();
    });
    this.rootEl.querySelector('#btn-touch-ledger')?.addEventListener('click', () => {
      this.toggleLedgerModal();
    });

      // Drawer Quickbar Change Buttons
      const changeBtns = this.rootEl.querySelectorAll('.btn-change-quick');
      changeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const denom = parseInt((btn as HTMLElement).dataset.denom || '0', 10);
          if (denom > 0) {
            this.tenderChangeDenom(denom);
          }
        });
      });

      this.rootEl.querySelector('#btn-quick-pos')?.addEventListener('click', () => {
        this.triggerMobilePosPayment();
      });

      this.rootEl.querySelector('#btn-quick-close-drawer')?.addEventListener('click', () => {
        this.store.cashRegister.closeDrawer();
        if (this.drawerQuickBarEl) this.drawerQuickBarEl.style.display = 'none';
      });
    }

    private updateDrawerQuickbar(): void {
      if (!this.drawerQuickBarEl) return;
      if (this.store.cashRegister.isDrawerOpen && this.changeDue > 0) {
        this.drawerQuickBarEl.style.display = 'flex';
        if (this.drawerInfoEl) {
          const tendered = this.store.cashRegister.tenderedChange;
          this.drawerInfoEl.textContent = `GIVE CHANGE: ₦${tendered.toLocaleString()} / ₦${this.changeDue.toLocaleString()} DUE`;
        }
      } else {
        this.drawerQuickBarEl.style.display = 'none';
      }
    }

    public tenderChangeDenom(denom: number): void {
      const tendered = this.store.cashRegister.addChange(denom);
      this.updateDrawerQuickbar();

      if (tendered === this.changeDue) {
        soundFx.playCashRegister();
        const cust = this.store.currentCustomer3D;
        if (cust) cust.setState('taking');

        if (this.currentCounterItem) {
          this.store.group.remove(this.currentCounterItem);
          const idx = this.store.interactables.indexOf(this.currentCounterItem);
          if (idx !== -1) this.store.interactables.splice(idx, 1);
          this.currentCounterItem = null;
        }

        this.showSubtitle(
          'CHANGE TENDERED',
          `Exact change ₦${tendered.toLocaleString()} given! Customer thanked you and completed transaction.`,
          4500
        );

        this.engine.executeTransaction({
          productId: cust?.requestedProductId || 'lonart-forte',
          offeredPrice: this.scannedPrice,
          paymentMethod: 'cash',
        });
        this.updateHudValues();
        if (this.drawerQuickBarEl) this.drawerQuickBarEl.style.display = 'none';

        setTimeout(() => {
          this.store.cashRegister.closeDrawer();
          if (cust) {
            cust.showThoughtBubble('Thank you pharmacist! Have a wonderful day.');
            cust.setWaypoints([new THREE.Vector3(0, 0, 5.2), new THREE.Vector3(0, 0, 8.5)], () => {
              this.store.customerGroup.remove(cust.group);
              cust.aiState = 'exited';
            });
          }
        }, 1600);
      } else if (tendered > this.changeDue) {
        soundFx.playBuzz();
        this.showSubtitle(
          'OVERPAYMENT ERROR',
          `You gave too much change (₦${tendered.toLocaleString()} vs ₦${this.changeDue.toLocaleString()} due)! Resetting drawer change.`,
          4000
        );
        this.store.cashRegister.resetChange();
        this.updateDrawerQuickbar();
      } else {
        this.showSubtitle(
          'TENDERED CHANGE',
          `Added ₦${denom.toLocaleString()}. Tendered: ₦${tendered.toLocaleString()} / ₦${this.changeDue.toLocaleString()} due.`,
          2500
        );
      }
    }

    public triggerMobilePosPayment(): void {
      this.store.cashRegister.triggerCardTap(this.scannedPrice || 1200, () => {
        const cust = this.store.currentCustomer3D;
        if (cust) cust.setState('taking');

        if (this.currentCounterItem) {
          this.store.group.remove(this.currentCounterItem);
          const idx = this.store.interactables.indexOf(this.currentCounterItem);
          if (idx !== -1) this.store.interactables.splice(idx, 1);
          this.currentCounterItem = null;
        }

        this.engine.executeTransaction({
          productId: cust?.requestedProductId || 'lonart-forte',
          offeredPrice: this.scannedPrice || 1200,
          paymentMethod: 'pos_transfer',
        });
        this.updateHudValues();
        if (this.drawerQuickBarEl) this.drawerQuickBarEl.style.display = 'none';

        this.showSubtitle('POS APPROVED', `Payment of ₦${(this.scannedPrice || 1200).toLocaleString()} approved via POS terminal!`, 4000);

        setTimeout(() => {
          if (cust) {
            cust.showThoughtBubble('Debit alert received! Thank you.');
            cust.setWaypoints([new THREE.Vector3(0, 0, 5.2), new THREE.Vector3(0, 0, 8.5)], () => {
              this.store.customerGroup.remove(cust.group);
              cust.aiState = 'exited';
            });
          }
        }, 1500);
      });
  }

  public startCustomerShopping(cust3D: Customer3D): void {
    if (!cust3D) return;

    // Customer initial spawn position outside
    cust3D.group.position.set(0, 0, 7.5);
    cust3D.aiState = 'outside';

    // If store shutter is closed, wait outside
    if (!this.store.shutterOpen) {
      cust3D.showThoughtBubble('Waiting for chemist roller shutter to open...', false);
      return;
    }

    // Phase 1: Enter store through doorway
    cust3D.aiState = 'entering';
    cust3D.setWaypoints([new THREE.Vector3(0, 0, 5.2), new THREE.Vector3(0, 0, 2.8)], () => {
      // Phase 2: Find matching shelf slot
      const prdId = cust3D.requestedProductId;
      let targetSlot = this.store.shelfSlots.find(
        (s) => s.currentProduct && (s.currentProduct.product.id === prdId || cust3D.customer.matchedProductIds.includes(s.currentProduct.product.id))
      );
      if (!targetSlot) {
        targetSlot = this.store.shelfSlots.find((s) => s.currentProduct);
      }

      if (targetSlot && targetSlot.currentProduct && (targetSlot.stockCount || 0) > 0) {
        cust3D.aiState = 'walking_to_shelf';
        const browsePos = new THREE.Vector3(targetSlot.position.x, 0, targetSlot.position.z + 1.2);
        cust3D.walkTo(browsePos, () => {
          cust3D.aiState = 'browsing';
          cust3D.setState('talking');
          cust3D.showThoughtBubble(`Checking ${targetSlot!.currentProduct!.product.name}...`);

          setTimeout(() => {
            // Pick carton from shelf
            cust3D.aiState = 'picking';
            const prd = targetSlot!.currentProduct!.product;
            cust3D.attachCarriedProduct(prd.name);
            targetSlot!.stockCount = Math.max(0, (targetSlot!.stockCount || 1) - 1);
            if (targetSlot!.stockCount === 0) {
              this.store.group.remove(targetSlot!.currentProduct!.group);
              targetSlot!.currentProduct = undefined;
            }
            this.store.updateShelfPriceTag(targetSlot!);
            cust3D.showThoughtBubble('Found it! Walking to checkout counter.');
            soundFx.playTap();

            // Walk to counter queue
            cust3D.aiState = 'walking_to_queue';
            cust3D.setWaypoints([new THREE.Vector3(0, 0, 2.8), this.queueSlots[0]], () => {
              cust3D.aiState = 'at_counter';
              cust3D.group.rotation.y = Math.PI;
              const counterItem = cust3D.placeItemOnCounter(this.store.group);
              this.store.interactables.push(counterItem);
              this.currentCounterItem = counterItem;
              this.showSubtitle(
                cust3D.customer.name,
                `"Good day pharmacist! Please scan this ${prd.name} for me."`,
                4000
              );
            });
          }, 1400);
        });
      } else {
        // Out of stock response
        cust3D.aiState = 'walking_to_shelf';
        const emptySlot = this.store.shelfSlots[0];
        const browsePos = new THREE.Vector3(emptySlot.position.x, 0, emptySlot.position.z + 1.2);
        cust3D.walkTo(browsePos, () => {
          cust3D.aiState = 'out_of_stock';
          cust3D.setState('shocked');
          cust3D.showThoughtBubble(`Ahn ahn! No stock of ${cust3D.customer.matchedProductIds[0] || 'medicine'}?!`, true);
          soundFx.playBuzz();
          this.showSubtitle(
            cust3D.customer.name,
            `"Chei! You don't have medicine in stock? I will try another chemist."`,
            4500
          );

          setTimeout(() => {
            cust3D.aiState = 'leaving';
            cust3D.setWaypoints([new THREE.Vector3(0, 0, 5.2), new THREE.Vector3(0, 0, 8.5)], () => {
              this.store.customerGroup.remove(cust3D.group);
              cust3D.aiState = 'exited';
            });
          }, 3000);
        });
      }
    });
  }

  private handleInteract(): void {
    const target = this.player.currentTarget;
    if (!target) return;

    switch (target.type) {
      case 'shutter': {
        const opened = this.store.toggleShutter();
        soundFx.playShutter();
        this.showSubtitle(
          'ORILE-KOKA STREET',
          opened
            ? 'Roller shutter lifted! Morning customers can now walk in.'
            : 'Roller shutter pulled down.',
          3500
        );
        if (opened && this.store.currentCustomer3D && this.store.currentCustomer3D.aiState === 'outside') {
          this.startCustomerShopping(this.store.currentCustomer3D);
        }
        break;
      }

      case 'curb_pallet': {
        if (this.player.carriedCrate) {
          this.handlePutBack();
        } else {
          this.showSubtitle('CURB DELIVERY PALLET', 'Wholesale pallets arrive here at Z=7.5.', 2500);
        }
        break;
      }

      case 'delivery_crate': {
        if (!this.player.carriedCrate) {
          const crate = target.data?.crateInstance || this.store.deliveryCrateInstance;
          if (crate) {
            this.store.group.remove(crate.group);
            const idx = this.store.interactables.indexOf(crate.group);
            if (idx !== -1) this.store.interactables.splice(idx, 1);
            this.player.attachCrate(crate);
            this.currentCarriedCrate = crate;
            soundFx.playCrateDrop();
            this.showSubtitle(
              'DELIVERY CRATE',
              `Carrying ${crate.data.productName} (${crate.data.remainingItems} packs). Look at shelf slot to stock, or [Q] to drop.`,
              4000
            );
          }
        }
        break;
      }

      case 'shelf_slot':
      case 'product_shelf': {
        if (this.player.carriedCrate) {
          const crate = this.player.carriedCrate;
          const slot: ShelfSlot3D = target.data?.slot || this.store.shelfSlots[0];
          if (crate.data.remainingItems > 0) {
            crate.takeItem();
            const box = new ProductBox3D(crate.product);
            box.group.position.copy(slot.position);
            box.targetPosition.copy(slot.position);
            box.group.rotation.copy(slot.rotation);
            this.store.group.add(box.group);

            slot.currentProduct = box;
            slot.wholesaleCost = crate.product.baseCost;
            slot.retailPrice = crate.product.baseRetail;
            slot.stockCount = (slot.stockCount || 0) + 1;
            this.store.updateShelfPriceTag(slot);

            soundFx.playTap();
            this.showSubtitle(
              'SHELF RESTOCKED',
              `Stocked 1x ${crate.data.productName} on shelf. (${crate.data.remainingItems} packs remaining in crate)`,
              3000
            );

            if (crate.data.remainingItems === 0) {
              this.showSubtitle(
                'CRATE EMPTY',
                'Crate is empty! Walk outside to exterior dumpster (X=-6, Z=6.5) and press [E] to discard.',
                4500
              );
            }
          } else {
            this.showSubtitle('CRATE EMPTY', 'This crate is empty. Walk outside to the dumpster to discard it.', 3000);
          }
        } else if (target.data?.boxInstance && !this.currentHeldBox) {
          const box: ProductBox3D = target.data.boxInstance;
          this.currentHeldBox = box;
          this.store.group.remove(box.group);
          this.player.attachHeldItem(box.group);
          soundFx.playTap();

          this.heldBadgeEl.style.display = 'block';
          const nameEl = this.rootEl.querySelector('#fps-held-item-name')!;
          nameEl.textContent = `${box.product.name} (Press F to Inspect)`;

          this.showSubtitle(
            'PHARMACIST HANDS',
            `Holding ${box.product.name}. Press [F] to inspect MAS foil in hands or walk to counter to dispense.`,
            4000
          );
        }
        break;
      }

      case 'dumpster': {
        if (this.player.carriedCrate) {
          const crate = this.player.carriedCrate;
          if (crate.data.remainingItems === 0 || crate.data.isTrash) {
            this.player.detachCrate();
            this.currentCarriedCrate = null;
            soundFx.playDumpsterSlam();
            this.showSubtitle('COMMUNITY DUMPSTER', 'Empty crate discarded into dumpster with a metal slam!', 3500);
          } else {
            soundFx.playBuzz();
            this.showSubtitle(
              'DUMPSTER',
              `Cannot discard! Crate still contains ${crate.data.remainingItems} packs. Stock them first.`,
              3500
            );
          }
        } else {
          this.showSubtitle('DUMPSTER', 'Community waste dumpster. Carry empty delivery crates here to discard.', 3000);
        }
        break;
      }

      case 'counter_item': {
        this.store.cashRegister.fireScanner(target.object.position);
        soundFx.playScannerBeep();

        const cust = this.store.currentCustomer3D?.customer || this.engine.getCurrentCustomer();
        const prd =
          this.engine.getAllProducts().find((p) => p.id === cust?.matchedProductIds[0]) ||
          this.engine.getAllProducts()[0];
        this.scannedPrice = prd.baseRetail;
        this.store.cashRegister.updateDisplay(this.scannedPrice);
        this.store.cashRegister.openDrawer();
        soundFx.playCashRegister();

        const noteTendered = this.scannedPrice <= 500 ? 500 : this.scannedPrice <= 1000 ? 1000 : 2000;
        this.changeDue = Math.max(0, noteTendered - this.scannedPrice);
        this.store.cashRegister.setChangeRequired(this.changeDue);
        this.store.cashRegister.resetChange();

        this.showSubtitle(
          cust ? cust.name : 'Customer',
          `"Scanned: ₦${this.scannedPrice.toLocaleString()}. Here is ₦${noteTendered.toLocaleString()} note. Click cash drawer compartments for ₦${this.changeDue.toLocaleString()} change, or click POS to pay by card."`,
          6000
        );
        break;
      }

      case 'scanner': {
        if (this.currentCounterItem) {
          this.store.cashRegister.fireScanner(this.currentCounterItem.position);
          soundFx.playScannerBeep();
        } else {
          this.store.cashRegister.fireScanner();
          soundFx.playScannerBeep();
        }
        break;
      }

      case 'naira_bill': {
        const denom = target.data.denomination;
        const tendered = this.store.cashRegister.addChange(denom);

        if (tendered === this.changeDue) {
          soundFx.playCashRegister();
          const cust = this.store.currentCustomer3D;
          if (cust) cust.setState('taking');

          if (this.currentCounterItem) {
            this.store.group.remove(this.currentCounterItem);
            const idx = this.store.interactables.indexOf(this.currentCounterItem);
            if (idx !== -1) this.store.interactables.splice(idx, 1);
            this.currentCounterItem = null;
          }

          this.showSubtitle(
            'CHANGE TENDERED',
            `Exact change ₦${tendered.toLocaleString()} given! Customer thanked you and completed transaction.`,
            4500
          );

          this.engine.executeTransaction({
            productId: cust?.requestedProductId || 'lonart-forte',
            offeredPrice: this.scannedPrice,
            paymentMethod: 'cash',
          });
          this.updateHudValues();

          setTimeout(() => {
            this.store.cashRegister.closeDrawer();
            if (cust) {
              cust.showThoughtBubble('Thank you pharmacist! Have a wonderful day.');
              cust.setWaypoints([new THREE.Vector3(0, 0, 5.2), new THREE.Vector3(0, 0, 8.5)], () => {
                this.store.customerGroup.remove(cust.group);
                cust.aiState = 'exited';
              });
            }
          }, 1600);
        } else if (tendered > this.changeDue) {
          soundFx.playBuzz();
          this.showSubtitle(
            'OVERPAYMENT ERROR',
            `You gave too much change (₦${tendered.toLocaleString()} vs ₦${this.changeDue.toLocaleString()} due)! Resetting drawer change.`,
            4000
          );
          this.store.cashRegister.resetChange();
        } else {
          this.showSubtitle(
            'TENDERED CHANGE',
            `Added ₦${denom.toLocaleString()}. Tendered: ₦${tendered.toLocaleString()} / ₦${this.changeDue.toLocaleString()} due.`,
            2500
          );
        }
        break;
      }

      case 'pos': {
        this.store.cashRegister.triggerCardTap(this.scannedPrice || 1200, () => {
          const cust = this.store.currentCustomer3D;
          if (cust) cust.setState('taking');

          if (this.currentCounterItem) {
            this.store.group.remove(this.currentCounterItem);
            const idx = this.store.interactables.indexOf(this.currentCounterItem);
            if (idx !== -1) this.store.interactables.splice(idx, 1);
            this.currentCounterItem = null;
          }

          this.engine.executeTransaction({
            productId: cust?.requestedProductId || 'lonart-forte',
            offeredPrice: this.scannedPrice || 1200,
            paymentMethod: 'pos_transfer',
          });
          this.updateHudValues();

          this.showSubtitle('POS APPROVED', `Payment of ₦${(this.scannedPrice || 1200).toLocaleString()} approved via POS terminal!`, 4000);

          setTimeout(() => {
            if (cust) {
              cust.showThoughtBubble('Debit alert received! Thank you.');
              cust.setWaypoints([new THREE.Vector3(0, 0, 5.2), new THREE.Vector3(0, 0, 8.5)], () => {
                this.store.customerGroup.remove(cust.group);
                cust.aiState = 'exited';
              });
            }
          }, 1600);
        });
        break;
      }

      case 'management_pc': {
        this.openManagementPCModal();
        break;
      }

      case 'customer': {
        if (this.store.currentCustomer3D) {
          const c = this.store.currentCustomer3D.customer;
          soundFx.playTap();
          this.showSubtitle(c.name, `"${c.initialQuote}"`, 5000);
          this.store.currentCustomer3D.setState('talking');
        }
        break;
      }

      case 'register': {
        this.handleCheckout();
        break;
      }

      case 'ledger': {
        this.toggleLedgerModal();
        break;
      }
    }
  }

  private handlePutBack(): void {
    if (this.player.carriedCrate) {
      const crate = this.player.detachCrate();
      if (crate) {
        crate.group.position.set(this.player.camera.position.x, 0.16, this.player.camera.position.z - 0.8);
        this.store.group.add(crate.group);
        this.store.interactables.push(crate.group);
        soundFx.playCrateDrop();
        this.showSubtitle('DELIVERY CRATE', 'Placed delivery crate on floor.', 2500);
      }
      return;
    }

    if (!this.currentHeldBox) return;

    const box = this.currentHeldBox;
    const detached = this.player.detachHeldItem();
    if (detached) {
      // Find an open shelf slot
      const emptySlot = this.store.shelfSlots.find((s) => !s.currentProduct) || this.store.shelfSlots[0];
      box.group.position.copy(emptySlot.position);
      box.targetPosition.copy(emptySlot.position);
      box.group.rotation.copy(emptySlot.rotation);
      box.group.scale.set(1, 1, 1);
      this.store.group.add(box.group);
      emptySlot.currentProduct = box;
      this.store.updateShelfPriceTag(emptySlot);
    }

    this.currentHeldBox = null;
    this.heldBadgeEl.style.display = 'none';
    soundFx.playTap();
    this.showSubtitle('SHELVES', 'Returned medicine carton to shelf.', 2500);
  }

  private handleCheckout(): void {
    const cust = this.engine.getCurrentCustomer();
    if (!cust) return;

    // Check if player is holding medicine matching customer's need
    if (this.currentHeldBox) {
      const prd = this.currentHeldBox.product;
      const result = this.engine.executeTransaction({
        productId: prd.id,
        offeredPrice: prd.baseRetail,
        paymentMethod: 'cash',
      });

      this.store.cashRegister.updateDisplay(prd.baseRetail);
      this.store.cashRegister.openDrawer();
      soundFx.playCashRegister();

      if (this.store.currentCustomer3D) {
        this.store.currentCustomer3D.setState('paying');
      }

      setTimeout(() => {
        this.store.cashRegister.closeDrawer();
        if (this.store.currentCustomer3D) {
          this.store.currentCustomer3D.setState('taking');
        }
      }, 1600);

      this.showSubtitle(
        'TRANSACTION COMPLETE',
        `${cust.name}: "${result.customerDialogue.text}" (${result.success ? '+1 Trust' : '-1 Trust'})`,
        5000
      );

      // Detach and consume medicine carton
      this.player.detachHeldItem();
      this.currentHeldBox = null;
      this.heldBadgeEl.style.display = 'none';

      this.updateHudValues();
    } else {
      soundFx.playBuzz();
      this.showSubtitle(
        'CASH REGISTER',
        `Walk over to the shelves and pick up ${cust.matchedProductIds[0] || 'medication'} with [E], then return to counter to complete sale!`,
        4500
      );
    }
  }

  public showSubtitle(speaker: string, text: string, durationMs = 4000): void {
    this.subtitlesSpeakerEl.textContent = speaker;
    this.subtitlesTextEl.textContent = text;
    this.subtitlesEl.style.display = 'block';

    clearTimeout((this.subtitlesEl as any)._timeout);
    (this.subtitlesEl as any)._timeout = setTimeout(() => {
      this.subtitlesEl.style.display = 'none';
    }, durationMs);
  }

  public updateHudValues(): void {
    const st = this.engine.getState();
    this.hudDayEl.textContent = `DAY ${st.day} / 90`;
    this.hudCashEl.textContent = `CASH: ₦${st.cash.toLocaleString()}`;
    this.hudDebtEl.textContent = `DEBT: ₦${st.debt.toLocaleString()}`;
    this.hudTrustEl.textContent = `TRUST: ${st.trust}%`;
  }

  private toggleLedgerModal(): void {
    if (this.activeModal === 'ledger') {
      this.closeModal();
      return;
    }

    this.activeModal = 'ledger';
    this.player.controls.unlock();
    soundFx.playPageFlip();

    this.modalHostEl.style.display = 'flex';
    this.modalHostEl.innerHTML = `
      <div class="ledger-modal-inner" style="background: #F4EBD9; color: #121113; max-width: 580px; width: 100%; padding: 24px; border: 4px solid #8C5F10; border-radius: 8px; box-shadow: 0 16px 48px rgba(0,0,0,0.9); font-family: 'Space Grotesk', sans-serif; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #8b5a2b; padding-bottom: 8px; margin-bottom: 14px;">
          <h2 style="font-family: 'Silkscreen', monospace; font-size: 16px; margin: 0; color: #5c3a21;">📖 AUNTIE JOKE'S CREDIT & DEBT LEDGER</h2>
          <button id="btn-close-ledger" style="background: #8b5a2b; color: #fdf6e2; border: none; min-height: 44px; padding: 8px 14px; cursor: pointer; font-weight: bold; border-radius: 6px; touch-action: manipulation;">✕ CLOSE</button>
        </div>
        <div style="font-size: 13px; line-height: 1.6; margin-bottom: 16px;">
          <strong>LAST ENTRY &bull; 14 DAYS BEFORE DISAPPEARANCE:</strong><br>
          "Chief Okonkwo delivery arrived intact. But Prime Star Pharma representative Dele dropped 50 cartons unmanifested at 40% discount."
        </div>
        <div style="border: 2px dashed #D13438; padding: 12px; background: rgba(209, 52, 56, 0.1); border-radius: 6px; margin-bottom: 16px;">
          <strong style="color: #D13438;">⚠️ CIRCLED IN RED INK:</strong><br>
          Batch <strong>#MG-204</strong> (Malaguard Forte) &bull; Carton Expiry: 11/2028 &bull; Inner Blister Expiry: 06/2026.<br>
          Agency MAS Verification code returned: <em>DUPLICATE QUOTA EXCEEDED</em>.
        </div>
        <div style="text-align: right; font-size: 12px; color: #555555;">
          Press <strong>[ESC]</strong> or click Close to return to 3D walk.
        </div>
      </div>
    `;

    this.modalHostEl.querySelector('#btn-close-ledger')?.addEventListener('click', () => {
      this.closeModal();
    });
    this.modalHostEl.querySelector('#btn-close-modal')?.addEventListener('click', () => {
      this.closeModal();
    });
  }

  public openDeliveryInspection(): void {
    this.activeModal = 'delivery';
    this.player.controls.unlock();
    soundFx.playTap();

    this.modalHostEl.style.display = 'flex';
    this.modalHostEl.innerHTML = `
      <div style="background: #221F23; color: #F4EBD9; max-width: 520px; width: 100%; padding: 24px; border: 3px solid #D49826; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #D49826; padding-bottom: 8px; margin-bottom: 14px;">
          <h3 style="font-family: 'Silkscreen', monospace; font-size: 14px; margin: 0; color: #D49826;">📦 MORNING DELIVERY CRATE INSPECTION</h3>
          <button id="btn-close-delivery" style="background: #B84A28; color: #fff; border: none; padding: 4px 10px; cursor: pointer;">CLOSE</button>
        </div>
        <p style="font-size: 13px; margin-bottom: 12px;">Supplier: Prime Star Logistics &bull; Batch #MG-204</p>
        <div style="background: #121113; padding: 14px; border-radius: 6px; margin-bottom: 16px;">
          <div style="font-size: 12px; color: #888; margin-bottom: 6px;">TAMPER SEAL STATUS:</div>
          <div style="color: #ff6b6b; font-weight: bold;">⚠️ Hologram missing. Clear sellotape reapplied over edge.</div>
        </div>
        <button id="btn-quarantine-crate" style="background: #B84A28; color: #fff; border: 1px solid #fff; padding: 10px; width: 100%; cursor: pointer; font-family: 'Silkscreen', monospace; font-size: 11px; margin-bottom: 8px;">🚫 QUARANTINE SUSPICIOUS STOCK</button>
        <button id="btn-accept-crate" style="background: #329663; color: #fff; border: 1px solid #fff; padding: 10px; width: 100%; cursor: pointer; font-family: 'Silkscreen', monospace; font-size: 11px;">✅ ACCEPT INTO SHELF INVENTORY</button>
      </div>
    `;

    this.modalHostEl.querySelector('#btn-close-delivery')?.addEventListener('click', () => {
      this.closeModal();
    });
    this.modalHostEl.querySelector('#btn-quarantine-crate')?.addEventListener('click', () => {
      this.closeModal();
      soundFx.playTap();
      this.showSubtitle('REGULATORY COMPLIANCE', 'Quarantined suspicious batch #MG-204. +2 Trust with Agency inspectors.', 4500);
      this.engine.resolveDelivery('quarantine');
      this.updateHudValues();
    });
    this.modalHostEl.querySelector('#btn-accept-crate')?.addEventListener('click', () => {
      this.closeModal();
      soundFx.playCashRegister();
      this.showSubtitle('INVENTORY RESTOCKED', 'Accepted batch into active stock.', 3500);
      this.engine.resolveDelivery('accept');
      this.updateHudValues();
    });
  }

  private openManagementPCModal(): void {
    if (this.activeModal === 'pc') {
      this.closeModal();
      return;
    }

    this.activeModal = 'pc';
    this.player.controls.unlock();
    soundFx.playTap();

    const st = this.engine.getState();

    this.modalHostEl.style.display = 'flex';
    this.modalHostEl.innerHTML = `
      <div style="background: #151a1e; color: #f0f4f8; max-width: 680px; width: 100%; padding: 24px; border: 3px solid #00ffcc; border-radius: 8px; box-shadow: 0 16px 48px rgba(0,0,0,0.95); font-family: 'Space Grotesk', sans-serif;">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #00ffcc; padding-bottom: 10px; margin-bottom: 16px;">
          <h2 style="font-family: 'Silkscreen', monospace; font-size: 15px; margin: 0; color: #00ffcc;">💻 PHARMASUPPLY B2B WHOLESALE & DEBT TRACKER</h2>
          <button id="btn-close-pc" style="background: #e53935; color: #ffffff; border: none; min-height: 44px; padding: 8px 16px; cursor: pointer; font-weight: bold; border-radius: 6px; touch-action: manipulation;">✕ CLOSE</button>
        </div>

        <!-- ₦4.2M Debt Payoff Tracker -->
        <div style="background: #1f272f; border: 2px solid #ffb300; border-radius: 6px; padding: 14px; margin-bottom: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="font-size: 13px; font-weight: bold; color: #ffb300;">DEBT TO CHIEF OKONKWO:</div>
            <div style="font-size: 18px; font-weight: 900; color: #ff5252; font-family: monospace;">₦${st.debt.toLocaleString()}</div>
          </div>
          <div style="font-size: 12px; color: #90a4ae; margin-bottom: 10px;">Available Cash: <strong style="color: #00ff66;">₦${st.cash.toLocaleString()}</strong></div>
          <div style="display: flex; gap: 8px;">
            <button id="btn-pay-debt-50k" style="flex: 1; min-height: 44px; background: #263238; border: 1px solid #ffb300; color: #fff; padding: 8px 12px; cursor: pointer; font-size: 12px; font-weight: bold; border-radius: 6px; touch-action: manipulation;">PAY ₦50,000</button>
            <button id="btn-pay-debt-200k" style="flex: 1; min-height: 44px; background: #263238; border: 1px solid #ffb300; color: #fff; padding: 8px 12px; cursor: pointer; font-size: 12px; font-weight: bold; border-radius: 6px; touch-action: manipulation;">PAY ₦200,000</button>
          </div>
        </div>

        <!-- Wholesale Ordering Catalog -->
        <h3 style="font-size: 13px; color: #00ffcc; text-transform: uppercase; margin-bottom: 10px;">📦 Order Direct Delivery (Spawns on Curb Pallet at Z=7.5)</h3>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; background: #1c232a; padding: 10px 14px; border-radius: 6px; border: 1px solid #37474f;">
            <div>
              <strong style="color: #fff;">Coartem 80/480mg (Carton of 10)</strong><br>
              <span style="font-size: 11px; color: #78909c;">Anti-malarial Artemether/Lumefantrine • Wholesale Price: ₦12,000</span>
            </div>
            <button id="btn-order-coartem" style="min-height: 44px; background: #00bfa5; color: #000; border: none; padding: 8px 16px; font-weight: bold; font-size: 12px; cursor: pointer; border-radius: 6px; touch-action: manipulation;">ORDER ₦12k</button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; background: #1c232a; padding: 10px 14px; border-radius: 6px; border: 1px solid #37474f;">
            <div>
              <strong style="color: #fff;">Lonart Forte (Carton of 10)</strong><br>
              <span style="font-size: 11px; color: #78909c;">Premium ACT Antimalarial • Wholesale Price: ₦15,000</span>
            </div>
            <button id="btn-order-lonart" style="min-height: 44px; background: #00bfa5; color: #000; border: none; padding: 8px 16px; font-weight: bold; font-size: 12px; cursor: pointer; border-radius: 6px; touch-action: manipulation;">ORDER ₦15k</button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; background: #1c232a; padding: 10px 14px; border-radius: 6px; border: 1px solid #37474f;">
            <div>
              <strong style="color: #fff;">Emzor Paracetamol 500mg (Carton of 20)</strong><br>
              <span style="font-size: 11px; color: #78909c;">Fast-acting Analgesic • Wholesale Price: ₦6,000</span>
            </div>
            <button id="btn-order-emzor" style="min-height: 44px; background: #00bfa5; color: #000; border: none; padding: 8px 16px; font-weight: bold; font-size: 12px; cursor: pointer; border-radius: 6px; touch-action: manipulation;">ORDER ₦6k</button>
          </div>
        </div>

        <div style="font-size: 11px; color: #78909c; text-align: right;">
          Orders are offloaded onto curb delivery pallet at Z=7.5. Pick up with [E].
        </div>
      </div>
    `;

    this.modalHostEl.querySelector('#btn-close-pc')?.addEventListener('click', () => {
      this.closeModal();
    });

    const bindOrderBtn = (btnId: string, prdKeyword: string, cost: number, packQty: number) => {
      this.modalHostEl.querySelector(btnId)?.addEventListener('click', () => {
        const curState = this.engine.getState();
        if (curState.cash < cost) {
          soundFx.playBuzz();
          alert(`Insufficient cash! You need ₦${cost.toLocaleString()} but only have ₦${curState.cash.toLocaleString()}`);
          return;
        }
        this.engine.deductCash(cost);
        const targetPrd = this.engine.getAllProducts().find((p) => p.name.toLowerCase().includes(prdKeyword.toLowerCase())) || this.engine.getAllProducts()[0];
        this.store.spawnDeliveryCrate(targetPrd, packQty);
        soundFx.playCashRegister();
        this.updateHudValues();
        this.showSubtitle(
          'WHOLESALE CRATE DELIVERED',
          `Dispatched ${targetPrd.name} (${packQty} packs). Offloaded onto curb pallet at Z=7.5.`,
          4500
        );
        this.closeModal();
      });
    };

    bindOrderBtn('#btn-order-coartem', 'coartem', 12000, 10);
    bindOrderBtn('#btn-order-lonart', 'lonart', 15000, 10);
    bindOrderBtn('#btn-order-emzor', 'paracetamol', 6000, 20);

    const bindPayDebtBtn = (btnId: string, amount: number) => {
      this.modalHostEl.querySelector(btnId)?.addEventListener('click', () => {
        const curState = this.engine.getState();
        if (curState.cash < amount) {
          soundFx.playBuzz();
          alert(`Insufficient cash! You need ₦${amount.toLocaleString()} to pay this debt installment.`);
          return;
        }
        const paid = this.engine.payDebt(amount);
        soundFx.playCashRegister();
        this.updateHudValues();
        const updatedState = this.engine.getState();
        this.showSubtitle(
          'DEBT REPAYMENT',
          `Paid ₦${paid.toLocaleString()} to Chief Okonkwo. Remaining debt: ₦${updatedState.debt.toLocaleString()}`,
          4500
        );
        this.openManagementPCModal();
      });
    };

    bindPayDebtBtn('#btn-pay-debt-50k', 50000);
    bindPayDebtBtn('#btn-pay-debt-200k', 200000);
  }

  private closeModal(): void {
    this.activeModal = null;
    this.modalHostEl.style.display = 'none';
    this.modalHostEl.innerHTML = '';
    if (!this.isMobile && !this.player.isTouchMode) {
      this.player.controls.lock();
    }
  }

  private animate = (): void => {
    this.animId = requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();

    // Update player movement and interaction raycasting
    this.player.update(delta, this.store.interactables);

    // Update walkable store components
    this.store.update(delta);

    // Update crosshair prompt text based on raycast
    const target = this.player.currentTarget;
    if (target) {
      this.crosshairEl.classList.add('active');
      this.promptEl.textContent = target.promptText;
    } else {
      this.crosshairEl.classList.remove('active');
    }

    this.renderer.render(this.scene, this.player.camera);
  };

  public destroy(): void {
    cancelAnimationFrame(this.animId);
    this.renderer.dispose();
  }

  public dispose(): void {
    this.destroy();
  }
}
