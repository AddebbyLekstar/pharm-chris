import * as THREE from 'three';
import { soundFx } from '../../audio/sfx';
import { PharmChrisEngine } from '../../sim/engine';
import { FirstPersonPlayer } from './FirstPersonPlayer';
import { WalkablePharmacyStore } from './WalkablePharmacyStore';
import { ProductBox3D } from './ProductBox3D';

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

  // State
  private clock = new THREE.Clock();
  private animId = 0;
  public currentHeldBox: ProductBox3D | null = null;
  public activeModal: 'ledger' | 'delivery' | 'sms' | null = null;

  constructor(root: HTMLElement) {
    this.rootEl = root;
    this.engine = new PharmChrisEngine();

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

    // 6. Spawn initial Day 1 customer (Mama Ngozi)
    const cust = this.engine.getCurrentCustomer();
    this.store.setCustomer(cust);

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
    // Pointer Lock click
    this.lockOverlayEl.addEventListener('click', () => {
      this.player.controls.lock();
    });

    this.player.controls.addEventListener('lock', () => {
      this.lockOverlayEl.style.display = 'none';
    });

    this.player.controls.addEventListener('unlock', () => {
      if (!this.activeModal) {
        this.lockOverlayEl.style.display = 'flex';
      }
    });

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

    // Window resize
    window.addEventListener('resize', () => {
      this.player.camera.aspect = window.innerWidth / window.innerHeight;
      this.player.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private handleInteract(): void {
    const target = this.player.currentTarget;
    if (!target) return;

    switch (target.type) {
      case 'shutter':
        this.store.toggleShutter();
        soundFx.playShutter();
        this.showSubtitle(
          'ORILE-KOKA STREET',
          this.store.shutterOpen
            ? 'Roller shutter lifted! Morning customers can now walk in.'
            : 'Roller shutter pulled down.',
          3500
        );
        break;

      case 'product_shelf':
        if (target.data?.boxInstance && !this.currentHeldBox) {
          const box: ProductBox3D = target.data.boxInstance;
          this.currentHeldBox = box;
          this.store.group.remove(box.group);
          this.player.attachHeldItem(box.group);
          soundFx.playTap();

          // Update held badge
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

      case 'customer':
        if (this.store.currentCustomer3D) {
          const c = this.store.currentCustomer3D.customer;
          soundFx.playTap();
          this.showSubtitle(c.name, `"${c.initialQuote}"`, 5000);
          this.store.currentCustomer3D.setState('talking');
        }
        break;

      case 'register':
        this.handleCheckout();
        break;

      case 'ledger':
        this.toggleLedgerModal();
        break;

      case 'delivery_crate':
        this.openDeliveryInspection();
        break;
    }
  }

  private handlePutBack(): void {
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
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #8C5F10; padding-bottom: 10px; margin-bottom: 16px;">
          <h2 style="font-family: 'Silkscreen', monospace; font-size: 16px; margin: 0; color: #6A2411;">📖 AUNTIE JOKE'S HANDWRITTEN LEDGER</h2>
          <button id="btn-close-modal" style="background: #B84A28; color: #ffffff; border: none; padding: 4px 12px; cursor: pointer; font-weight: bold; border-radius: 4px;">[ESC] CLOSE</button>
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

    this.modalHostEl.querySelector('#btn-close-modal')?.addEventListener('click', () => {
      this.closeModal();
    });
  }

  private openDeliveryInspection(): void {
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

  private closeModal(): void {
    this.activeModal = null;
    this.modalHostEl.style.display = 'none';
    this.modalHostEl.innerHTML = '';
    this.player.controls.lock();
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
}
