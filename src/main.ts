import { FirstPersonApp } from './ui/three/FirstPersonApp';
import { ArcadeApp } from './ui/arcade/ArcadeApp';
import { soundFx } from './audio/sfx';
import { PharmChrisEngine } from './sim/engine';
import { PaymentMethod, Product, SupplierChoice, TransactionResult } from './sim/types';
import { PharmacyStore3D } from './ui/three/PharmacyStore3D';

class PharmChrisUIApp {
  private engine: PharmChrisEngine;
  private selectedProduct: Product;
  private offeredPrice: number;
  private isFractional: boolean = false;
  private fractionalUnits: number = 4;
  private rootEl: HTMLElement;
  private activeToastTimeout: number | null = null;
  private shutterOpen: boolean = false;
  private showLedgerModal: boolean = false;
  private voiceNotePlaying: boolean = false;
  private lastSmsResponse: any = null;
  private rushTimer: number | null = null;
  private store3D?: PharmacyStore3D;

  constructor(root: HTMLElement) {
    this.rootEl = root;
    this.engine = new PharmChrisEngine();

    const initialCust = this.engine.getCurrentCustomer();
    const defaultProdId = initialCust.matchedProductIds[0] || 'prd_feverease_extra';
    this.selectedProduct = this.engine.getProduct(defaultProdId) || this.engine.getAllProducts()[0];
    this.offeredPrice = this.selectedProduct.baseRetail;

    this.render();
  }

  private selectProduct(product: Product): void {
    this.selectedProduct = product;
    this.updatePriceForSelection();
    soundFx.playTap();
    soundFx.triggerHaptic('light');
    if (this.store3D) {
      this.store3D.inspectProduct(product.id);
    }
    this.render();
  }

  private updatePriceForSelection(): void {
    if (this.isFractional && this.selectedProduct.fractionalAllowed) {
      const fb = this.engine.calculateFairBand(this.selectedProduct, this.fractionalUnits);
      this.offeredPrice = fb.standard;
    } else {
      this.isFractional = false;
      this.offeredPrice = this.selectedProduct.baseRetail;
    }
  }

  private setPrice(newPrice: number): void {
    this.offeredPrice = newPrice;
    soundFx.playTick();
    this.updatePriceDisplayOnly();
    this.store3D?.cashRegister.updateDisplay(newPrice);
  }

  private setFractional(active: boolean, units: number = 4): void {
    if (active && !this.selectedProduct.fractionalAllowed) {
      return;
    }
    this.isFractional = active;
    this.fractionalUnits = units;
    this.updatePriceForSelection();
    soundFx.playTap();
    this.render();
  }

  private submitTransaction(method: PaymentMethod): void {
    if (method === 'cash') {
      soundFx.playCashRegister();
      this.store3D?.triggerCashPayment(this.offeredPrice);
    } else {
      soundFx.playPosBeep();
      this.store3D?.triggerPosPayment(this.offeredPrice);
    }

    const result = this.engine.executeTransaction({
      productId: this.selectedProduct.id,
      offeredPrice: this.offeredPrice,
      paymentMethod: method,
      isFractional: this.isFractional,
      fractionalUnits: this.isFractional ? this.fractionalUnits : undefined,
    });

    if (result.success) {
      soundFx.playSuccessChime();
      soundFx.triggerHaptic('success');
      this.spawnFloatingDelta(`+₦${result.cashDelta.toLocaleString()}`, '#55D48A');
    } else {
      soundFx.playBuzz();
      soundFx.triggerHaptic(result.isOverpriced ? 'warning' : 'error');
      this.spawnFloatingDelta(result.isOverpriced ? 'GOUGE!' : 'FAILED', '#FF6666');
    }

    this.render();
    this.showToast(result);
  }

  private beginDayRush(): void {
    this.engine.startDayRush();
    if (this.rushTimer !== null) window.clearInterval(this.rushTimer);
    this.rushTimer = window.setInterval(() => {
      const tick = this.engine.tickDayRush(1);
      if (tick.secondsRemaining === 0) {
        if (this.rushTimer !== null) window.clearInterval(this.rushTimer);
        this.rushTimer = null;
        this.engine.resolveFollowUps();
        this.engine.closeDayLedger();
      }
      this.render();
    }, 1000);
    this.render();
  }

  private openShutters(): void {
    soundFx.playShutter();
    this.shutterOpen = true;
    this.engine.setPhase('first_sale');
    this.render();
  }

  private nextCustomer(): void {
    soundFx.playTap();
    const nextCust = this.engine.getPhase() === 'day_rush'
      ? this.engine.advanceRushCustomer()
      : this.engine.nextCustomer();
    if (!nextCust) {
      this.render();
      return;
    }
    if (nextCust.id === 'cust_emeka') {
      this.engine.setPhase('unit_dispensing');
      const painaway = this.engine.getProduct('prd_painaway_500');
      if (painaway) {
        this.selectedProduct = painaway;
        this.isFractional = true;
        this.fractionalUnits = 4;
        this.updatePriceForSelection();
      }
    } else {
      const matched = this.engine.getProduct(nextCust.matchedProductIds[0]);
      if (matched) {
        this.selectedProduct = matched;
        this.isFractional = false;
        this.offeredPrice = matched.baseRetail;
      }
    }
    this.render();
  }

  private openLedgerModal(): void {
    soundFx.playPageFlip();
    this.showLedgerModal = true;
    this.engine.openLedger();
    this.render();
  }

  private closeLedgerAndCloseDay(): void {
    soundFx.playShutter();
    this.showLedgerModal = false;
    this.engine.setPhase('evening_tally');
    this.render();
    setTimeout(() => {
      soundFx.playPhoneBuzz();
    }, 450);
  }

  private playDeleVoiceNote(): void {
    soundFx.playPhoneBuzz();
    this.voiceNotePlaying = true;
    this.render();
    setTimeout(() => {
      this.voiceNotePlaying = false;
      this.render();
    }, 2800);
  }

  private makeSupplierChoice(choice: SupplierChoice): void {
    soundFx.playCashRegister();
    this.engine.recordDay1Choice(choice);
    this.render();
  }

  private toggleMute(): void {
    soundFx.isMuted = !soundFx.isMuted;
    this.render();
  }

  private resetSim(): void {
    soundFx.playTap();
    this.engine.reset();
    this.shutterOpen = false;
    this.showLedgerModal = false;
    this.isFractional = false;
    this.fractionalUnits = 4;
    const cust = this.engine.getCurrentCustomer();
    const matched = this.engine.getProduct(cust.matchedProductIds[0]);
    if (matched) {
      this.selectedProduct = matched;
      this.offeredPrice = matched.baseRetail;
    }
    this.render();
  }

  private spawnFloatingDelta(text: string, color: string): void {
    const el = document.createElement('div');
    el.className = 'floating-number';
    el.innerText = text;
    el.style.color = color;
    el.style.left = '42%';
    el.style.top = '38%';
    this.rootEl.querySelector('.mobile-container')?.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  private showToast(result: TransactionResult): void {
    if (this.store3D) {
      this.store3D.updateCustomerSpeech(
        result.customerDialogue.text,
        result.success ? 'Patient' : result.isOverpriced ? 'Dramatic' : 'Haggling'
      );
      this.store3D.currentCustomer3D?.setState(result.success ? 'taking' : 'talking');
    }
    const container = this.rootEl.querySelector('.toast-overlay');
    if (!container) return;

    if (this.activeToastTimeout) {
      window.clearTimeout(this.activeToastTimeout);
    }

    const statusClass = result.success ? 'toast-success' : 'toast-failed';
    const title = result.success ? 'TRANSACTION APPROVED' : 'SALE REJECTED';
    const trustStr = result.trustDelta >= 0 ? `+${result.trustDelta} Trust` : `${result.trustDelta} Trust`;
    const trustColor = result.trustDelta >= 0 ? 'badge-gain' : 'badge-loss';

    container.innerHTML = `
      <div class="retro-toast ${statusClass}">
        <div class="toast-header">
          <span>${title}</span>
          <span>${result.receiptNumber}</span>
        </div>
        <div class="toast-dialogue">
          <strong>${result.customerDialogue.speaker}:</strong> "${result.customerDialogue.text}"
        </div>
        <div class="toast-tola">
          ${result.tolaRemark}
        </div>
        <div class="toast-badges">
          <span class="${trustColor}">${trustStr}</span>
          <span>Margin: ${result.marginPercent}%</span>
          <span>${result.isWithinFairBand ? 'Fair Band ✓' : result.isOverpriced ? 'Overpriced ✗' : 'Discount ★'}</span>
        </div>
      </div>
    `;

    this.activeToastTimeout = window.setTimeout(() => {
      container.innerHTML = '';
    }, 4500);
  }

  private updatePriceDisplayOnly(): void {
    const priceValEl = this.rootEl.querySelector('#price-val-display');
    const marginPillEl = this.rootEl.querySelector('#margin-pill');
    const fairBand = this.engine.calculateFairBand(
      this.selectedProduct,
      this.isFractional ? this.fractionalUnits : undefined
    );

    if (priceValEl) {
      priceValEl.textContent = `₦${this.offeredPrice.toLocaleString()}`;
    }

    if (marginPillEl) {
      const effectiveCost = this.isFractional
        ? (this.selectedProduct.unitCost ?? 35) * this.fractionalUnits
        : this.selectedProduct.baseCost;
      const margin = Math.round(((this.offeredPrice - effectiveCost) / effectiveCost) * 100);
      const maxAllowed = Math.max(fairBand.max, this.isFractional ? fairBand.max : this.selectedProduct.baseRetail);
      const isOver = this.offeredPrice > maxAllowed;
      const isFair = this.offeredPrice >= fairBand.min && this.offeredPrice <= maxAllowed;

      if (isFair) {
        marginPillEl.className = 'fair-band-pill fair';
        marginPillEl.textContent = `FAIR BAND (${margin}%)`;
      } else if (isOver) {
        marginPillEl.className = 'fair-band-pill warning';
        marginPillEl.textContent = `⚠ GOUGING (${margin}%)`;
      } else {
        marginPillEl.className = 'fair-band-pill fair';
        marginPillEl.textContent = `DISCOUNT (${margin}%)`;
      }
    }
  }

  private getAvatarEmoji(avatarKey: string): string {
    switch (avatarKey) {
      case 'mama_ngozi': return '🧓🏾';
      case 'emeka_okada': return '🏍️';
      case 'bayo_danfo': return '🧔🏾';
      case 'alabi_fintech': return '👨🏾💻';
      case 'iya_basira': return '🧕🏾';
      default: return '🧑🏾';
    }
  }

  public render(): void {
    const currentPhase = this.engine.getPhase();

    if (currentPhase === 'epilogue' || this.engine.getState().endgameReport) {
      this.renderEpilogueScreen();
      return;
    }

    if (currentPhase === 'day2_morning_arrival' || currentPhase === 'day2_inspection' || currentPhase === 'day2_resolved') {
      this.renderDeliveryInspectionScreen();
      return;
    }

    const state = this.engine.getState();
    if (this.engine.getPhase() === 'evening_tally' && state.day > 1) {
      this.renderEveningLedger();
      return;
    }
    const phase = currentPhase;
    const customer = this.engine.getCurrentCustomer();
    const products = this.engine.getAllProducts();
    const fairBand = this.engine.calculateFairBand(
      this.selectedProduct,
      this.isFractional ? this.fractionalUnits : undefined
    );
    const stock = this.engine.getStock(this.selectedProduct.id);

    const effectiveCost = this.isFractional
      ? (this.selectedProduct.unitCost ?? 35) * this.fractionalUnits
      : this.selectedProduct.baseCost;

    const minSlider = Math.max(50, Math.round(effectiveCost * 0.9));
    const maxSlider = Math.round(effectiveCost * 2.4);
    const currentMargin = Math.round(((this.offeredPrice - effectiveCost) / effectiveCost) * 100);
    const maxAllowed = Math.max(fairBand.max, this.isFractional ? fairBand.max : this.selectedProduct.baseRetail);
    const isFair = this.offeredPrice >= fairBand.min && this.offeredPrice <= maxAllowed;
    const isOver = this.offeredPrice > maxAllowed;

    // Render Evening / Dilemma / Day 2 Screen if phase reached
    const isEveningOrLater = phase === 'evening_tally' || phase === 'choice' || phase === 'day2_teaser';

    this.rootEl.innerHTML = `
      <div class="mobile-container">
        <!-- 0:00 Shutters Overlay -->
        <div class="shutter-screen ${this.shutterOpen ? 'open' : ''}" id="shutter-screen">
          <div class="shutter-metal-wall">
            <div class="shutter-signboard">
              <div class="shutter-shop-title">PHARM CHRIS</div>
              <div class="shutter-shop-sub">Community Chemist & Dispensary • Day 1</div>
            </div>
            <div class="shutter-padlock-slot">🔒</div>
          </div>
          <div class="shutter-bottom-bar">
            <div class="sade-opening-bubble">
              <span class="sade-opening-speaker">Sade (Counter Apprentice):</span>
              "Pharmacist, you came. Customers don't know yet. They'll ask for Auntie first."
            </div>
            <button class="btn-shutter-pull" id="btn-pull-shutter">
              <span>▲ PULL UP ROLLER SHUTTER</span>
            </button>
          </div>
        </div>

        <!-- Top Status Bar: Strictly Two Numbers in 1st Minute Rule -->
        <div class="top-status-bar">
          <div class="logo-text">
            <span class="logo-icon"></span>
            PHARM CHRIS
          </div>
          <div class="stats-row">
            <div class="stat-pill stat-debt" title="Debt to Chief Okonkwo">
              <span class="stat-label">DEBT</span>
              <span class="stat-val-debt">₦${(state.debt / 1000000).toFixed(1)}M</span>
            </div>
            <div class="stat-pill stat-flight" title="UK Visa Flight Clock">
              <span class="stat-label">FLIGHT</span>
              <span class="stat-val-flight">${state.daysRemaining}d</span>
            </div>
            ${
              state.totalCustomersServed > 0
                ? `
            <div class="stat-pill">
              <span class="stat-label">CASH</span>
              <span class="stat-val-cash">₦${state.cash.toLocaleString()}</span>
            </div>
            <div class="stat-pill">
              <span class="stat-label">TRUST</span>
              <span class="stat-val-trust">${state.trust}%</span>
            </div>
            `
                : ''
            }
          </div>
        </div>

        <!-- Toast Overlay Container -->
        <div class="toast-overlay"></div>

        <!-- Stage 5: Season Progression & Fast Sim Controls -->
        <div class="season-controls-bar">
          <div class="season-controls-info">
            <span>DAY ${state.day}/90</span>
            <span>CLUES: ${(state.clues || []).length}/7</span>
            ${state.boardViolations > 0 ? `<span class="season-badge season-badge--danger">VIOLATIONS: ${state.boardViolations}/2</span>` : ''}
            ${(state.activeShocks || []).length > 0 ? `<span class="season-badge season-badge--danger">FX SHOCK ACTIVE</span>` : ''}
          </div>
          <div class="season-btn-group">
            <button class="season-sim-btn" id="btn-sim-next-day">+1 DAY</button>
            <button class="season-sim-btn" id="btn-sim-day15">DAY 15 (FX)</button>
            <button class="season-sim-btn" id="btn-sim-day45">DAY 45 (INSPECTION)</button>
            ${(state.clues || []).length >= 7 && !state.agencyRaidCompleted ? `<button class="season-sim-btn" id="btn-action-agency-raid" style="background: #E74C3C; color: #fff; font-weight: bold;">🚨 AGENCY RAID</button>` : `<button class="season-sim-btn" id="btn-sim-day70">DAY 70 (RAID)</button>`}
            <button class="season-sim-btn" id="btn-sim-day90" style="background: var(--brass); color: #000; font-weight: bold;">DAY 90 (FINALE)</button>
          </div>
        </div>

        ${phase === 'day_rush' ? `<div class="rush-hud"><strong>DAY RUSH ${String(Math.floor((state.rushSecondsRemaining ?? 120) / 60)).padStart(2, '0')}:${String((state.rushSecondsRemaining ?? 120) % 60).padStart(2, '0')}</strong><span>FEATURED ${state.currentCustomerIndex + 1}/10 • WALK-INS ${this.engine.getBackgroundWalkInCount()}</span>${state.blackout ? `<button class="btn-secondary" id="btn-generator-fuel">BLACKOUT • USE GENERATOR FUEL (${state.generatorFuel ?? 0})</button>` : ''}</div>` : ''}

        <!-- Three.js 3D In-Store Pharmacy Viewport -->
        <div class="three-stage-wrapper" id="three-stage-wrapper">
          <div class="three-hud-overlay">
            <div class="three-view-toggles">
              <button class="btn-3d-view active" id="btn-view-counter" title="Counter & Customer">🏪 COUNTER</button>
              <button class="btn-3d-view" id="btn-view-shelves" title="Turn to Medicine Shelves">📦 SHELVES</button>
              <button class="btn-3d-view" id="btn-view-inspect" title="Inspect Medicine Box in Hand">🔍 INSPECT</button>
              <button class="btn-3d-view" id="btn-view-register" title="Cash Register & POS">💵 REGISTER</button>
            </div>
          </div>
          <div class="three-hint-bubble">
            Drag to rotate 3D box • Click tablets to pop • Click foil to scratch MAS
          </div>
          <div class="three-inspect-bar" id="three-inspect-bar" style="display: none;">
            <button class="btn-3d-action" id="btn-3d-scratch">✨ SCRATCH MAS CODE</button>
            <button class="btn-3d-action" id="btn-3d-blister">💊 SLIDE BLISTER STRIP</button>
            <button class="btn-3d-action btn-3d-action--warn" id="btn-3d-place-counter">📥 PLACE ON COUNTER</button>
          </div>
          <div class="three-canvas-host" id="three-canvas-host"></div>
        </div>

        <!-- Counter Stage / Customer Card -->
        <div class="counter-stage">
          <div class="customer-card">
            <div class="customer-avatar-box">
              <div class="pixel-face">${this.getAvatarEmoji(customer.avatarKey)}</div>
              <span class="avatar-mood-badge">${customer.mood.toUpperCase()}</span>
            </div>
            <div class="customer-info-box">
              <div class="customer-title-row">
                <span class="customer-name">${customer.name}</span>
                <span class="customer-budget">BUDGET ₦${customer.budget.toLocaleString()}</span>
              </div>
              <div class="speech-bubble">
                "${customer.initialQuote}"
              </div>
              <div class="symptom-tag-bar">
                ${customer.symptoms.map((s) => `<span class="symptom-chip">#${s}</span>`).join('')}
                <span class="symptom-chip" style="border-color: var(--brass); color: var(--cream);">
                  Pref: ${customer.preferredPayment === 'cash' ? 'Cash' : 'POS'} 
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Medicine Shelf -->
        <div class="shelf-section">
          <div class="shelf-header">
            <span>■ MEDICINE SHELF (TAP TO SELECT)</span>
            <span>DAY ${state.day}</span>
          </div>
          <div class="shelf-grid" id="shelf-grid">
            ${products.map((p) => {
              const isSel = p.id === this.selectedProduct.id;
              const pStock = state.inventory[p.id] ?? 0;
              return `
                <div class="medicine-tile ${isSel ? 'selected' : ''}" data-id="${p.id}">
                  <span class="medicine-stock-badge ${p.requiresPrescription ? 'badge-rx' : ''}">
                    ${p.requiresPrescription ? 'Rx ' : ''}${pStock}x
                  </span>
                  <div class="medicine-bottle-art" style="background-color: ${p.pixelColor};">
                    <div class="bottle-cap"></div>
                    <div class="bottle-label-strip">${p.code}</div>
                  </div>
                  <div class="medicine-name">${p.name}</div>
                  <div class="medicine-cost">Cost ₦${p.baseCost}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Counter Interaction Tray -->
        <div class="counter-tray">
          <div class="selected-preview-strip">
            <div>
              <div class="preview-title">
                ${this.selectedProduct.name} ${this.isFractional ? `(${this.fractionalUnits} Tabs Unit)` : ''}
              </div>
              <div class="preview-cost-meta">
                ${this.selectedProduct.category} • Cost ₦${effectiveCost} • Stock: ${stock}
              </div>
            </div>
            <div id="margin-pill" class="fair-band-pill ${isFair ? 'fair' : isOver ? 'warning' : 'fair'}">
              ${isFair ? `FAIR BAND (${currentMargin}%)` : isOver ? `⚠ GOUGING (${currentMargin}%)` : `DISCOUNT (${currentMargin}%)`}
            </div>
          </div>

          <!-- Unit Dispensing Mode Toggle (1:30 Beat) -->
          ${
            this.selectedProduct.fractionalAllowed
              ? `
            <div class="unit-dispense-toggle-strip">
              <button class="btn-unit-toggle ${!this.isFractional ? 'active' : ''}" id="btn-mode-full">
                <span>FULL PACK (10 Tabs)</span>
                <span>₦${this.selectedProduct.baseRetail}</span>
              </button>
              <button class="btn-unit-toggle ${this.isFractional ? 'active' : ''}" id="btn-mode-unit">
                <span>UNIT DISPENSE (${this.fractionalUnits} Tabs)</span>
                <span>₦${(this.selectedProduct.unitRetail || 50) * this.fractionalUnits}</span>
              </button>
            </div>
            `
              : ''
          }

          <!-- Margin Slider & Fair Price Indicator -->
          <div class="margin-control-block">
            <div class="slider-info-row">
              <span>OFFERED RETAIL PRICE:</span>
              <span id="price-val-display" style="color: var(--brass); font-weight: bold;">₦${this.offeredPrice.toLocaleString()}</span>
            </div>
            <div class="price-slider-wrap">
              <input
                type="range"
                class="pixel-slider"
                id="margin-range"
                min="${minSlider}"
                max="${maxSlider}"
                step="${this.isFractional ? '10' : '50'}"
                value="${this.offeredPrice}"
              />
            </div>
            <div class="band-indicators">
              <span>Min ₦${minSlider}</span>
              <span style="color: var(--eucalyptus);">Fair Band: ₦${fairBand.min} - ₦${maxAllowed}</span>
              <span>Max ₦${maxSlider}</span>
            </div>
          </div>

          <!-- Dual Payment Triggers -->
          <div class="action-buttons-row">
            <button class="pixel-btn btn-cash" id="btn-cash-pay">
              <span>💵 ACCEPT CASH</span>
              <span class="btn-subtext">Notes & Counter Drawer</span>
            </button>
            <button class="pixel-btn btn-pos" id="btn-pos-pay">
              <span>📳 POS TRANSFER</span>
              <span class="btn-subtext">Bank Beep & Slip</span>
            </button>
          </div>
        </div>

        <!-- Bottom Replay / Diagnostic Controls -->
        <div class="footer-controls">
          <button class="btn-secondary" id="btn-next-cust">
            ${phase === 'day_rush' ? `▶ NEXT FEATURED CUSTOMER (${state.currentCustomerIndex + 1}/10)` : `▶ NEXT CUSTOMER (${state.currentCustomerIndex + 1}/${state.totalCustomersServed} Served)`}
          </button>
          ${phase === 'day_rush' ? '' : `<button class="btn-secondary" id="btn-open-ledger" style="border-color: var(--brass); color: var(--brass);">📖 AUNTIE'S LEDGER</button>`}
          <div style="display: flex; gap: 6px;">
            <button class="btn-secondary" id="btn-mute">
              ${soundFx.isMuted ? '🔇' : '🔊'}
            </button>
            <button class="btn-secondary" id="btn-reset">
              ↺
            </button>
          </div>
        </div>

        <!-- 2:30 The Ledger Modal -->
        ${
          this.showLedgerModal
            ? `
          <div class="ledger-modal-backdrop">
            <div class="ledger-book-wrap">
              <div class="ledger-parchment">
                <div class="ledger-header-title">AUNTIE JOKE'S DISPENSARY LEDGER • PAGE 1</div>
                <div class="ledger-date-sub">Handwritten notes in blue & red biro ink</div>
                <p>"Listen before you sell. Same story, different houses. It is not just ordinary weather."</p>
                <div class="ledger-callout-red">
                  <span>CHECK THE SUPPLIER BATCH NUMBER:</span>
                  <span class="ledger-batch-highlight">BATCH #MG-204</span>
                  <span style="font-size: 10px; font-weight: normal;">Circled three times in thick red ink. Do not dispense without verifying source.</span>
                </div>
                <p>"If you cut corners on stock, the neighborhood remembers longer than your debt."</p>
              </div>
              <button class="btn-close-ledger" id="btn-close-ledger-day">
                CLOSE LEDGER & PULL DOWN SHUTTERS FOR EVENING
              </button>
            </div>
          </div>
          `
            : ''
        }

        <!-- 3:15 Evening Tally & Dilemma Screen -->
        ${
          isEveningOrLater
            ? `
          <div class="evening-stage">
            <div class="evening-banner">
              <span>PHARM CHRIS • DAY 1 EVENING TALLY</span>
              <span>SHUTTERS CLOSED</span>
            </div>

            <div class="tally-card">
              <div style="font-family: var(--font-pixel); font-size: 10px; color: var(--brass); margin-bottom: 4px;">
                DAILY RECONCILIATION
              </div>
              <div class="tally-grid">
                <div class="tally-box">
                  <div class="tally-label">CASH EARNED TODAY</div>
                  <div class="tally-val" style="color: #55D48A;">+₦${state.day1Stats.cashEarned.toLocaleString()}</div>
                </div>
                <div class="tally-box">
                  <div class="tally-label">CURRENT TRUST</div>
                  <div class="tally-val" style="color: #D49826;">${state.trust}%</div>
                </div>
                <div class="tally-box">
                  <div class="tally-label">DEBT OUTSTANDING</div>
                  <div class="tally-val" style="color: #FF7777;">₦4,200,000</div>
                </div>
                <div class="tally-box">
                  <div class="tally-label">FLIGHT WINDOW</div>
                  <div class="tally-val" style="color: #79AEFF;">90 Days</div>
                </div>
              </div>
            </div>

            <!-- Incoming Dele Audio Card -->
            <div class="voice-note-card">
              <div class="voice-note-header">
                <span>📱 WHATSAPP AUDIO • MR. DELE (PRIME STAR)</span>
                <span style="font-size: 9px; opacity: 0.75;">7:14 PM</span>
              </div>
              <div class="voice-note-player">
                <button class="voice-note-btn" id="btn-play-voicenote">
                  ${this.voiceNotePlaying ? '■' : '▶'}
                </button>
                <div class="voice-waveform">
                  ${this.voiceNotePlaying ? ' ▂▃▅▆▇▆▅▃▂ ▂▃▅' : '▅ ▂ ▃ ▅ █ ▅ ▃ ▂'}
                </div>
                <span style="font-size: 10px; color: #7BE0A0;">0:14</span>
              </div>
              <div class="voice-quote-text">
                "Pharmacist, I hear you now own the place. Malaria stock, half price, tonight only."
              </div>
            </div>

            <!-- Supplier Comparison -->
            <div class="comparison-container">
              <div class="comparison-title">MALARIA RESTOCK OPTIONS</div>
              <div class="comparison-grid">
                <div class="supplier-box highlight">
                  <span class="supplier-name" style="color: var(--terracotta);">Mr. Dele (Prime Star)</span>
                  <span class="supplier-price">₦1,200 / pack</span>
                  <span class="supplier-tag" style="background: #4A1E1E; color: #FFAAAA;">Half Price • Cash Now</span>
                  <span style="font-size: 9px; color: #B0A89A; margin-top: 4px;">Grey import. Batch #MG-204? High profit margin.</span>
                </div>
                <div class="supplier-box">
                  <span class="supplier-name" style="color: #79AEFF;">Chief Okonkwo</span>
                  <span class="supplier-price">₦2,400 / pack</span>
                  <span class="supplier-tag" style="background: #1C2D4A; color: #AAD4FF;">14-Day Credit • Verified</span>
                  <span style="font-size: 9px; color: #B0A89A; margin-top: 4px;">Certified NAFDAC authentic stock. Leaner margin.</span>
                </div>
              </div>
            </div>

            <!-- Dilemma Decision Buttons -->
            ${
              !state.day1SupplierChoice
                ? `
            <div class="choice-actions-row">
              <button class="btn-dilemma-accept" id="btn-choose-dele">
                <span>ACCEPT DELE'S CHEAP STOCK (₦1,200)</span>
                <span class="btn-choice-subtext">Pocket immediate margin to clear debt faster</span>
              </button>
              <button class="btn-dilemma-refuse" id="btn-choose-okonkwo">
                <span>REFUSE & STICK WITH CHIEF OKONKWO</span>
                <span class="btn-choice-subtext">Protect patient safety & community trust</span>
              </button>
            </div>
            `
                : `
            <div class="teaser-card">
              <div class="teaser-headline">
                <span>🌅 DAY 2 • 7:50 AM</span>
              </div>
              <div class="teaser-quote">
                "Sade says three people came before you opened to ask if your malaria tablets are the real ones."
              </div>
              <div class="teaser-consequence">
                You chose <strong>${state.day1SupplierChoice === 'dele' ? "Dele's cheap stock" : "Chief Okonkwo's certified stock"}</strong>. 
                ${
                  state.day1SupplierChoice === 'dele'
                    ? 'The rumor mill in the market is already whispering about Batch #MG-204.'
                    : 'Your conscience is clean, but the debt deadline ticks 89 days away.'
                }
              </div>
              <button class="btn-dilemma-accept" id="btn-advance-day2" style="background: var(--eucalyptus); border: 2px solid #000; color: #fff; padding: 12px; margin-top: 6px; text-align: center;">
                <span>🌅 ADVANCE TO DAY 2 MORNING (08:00 AM) →</span>
                <span class="btn-choice-subtext">The delivery van arrives outside your shop counter</span>
              </button>
              <button class="btn-secondary" id="btn-replay-day1" style="border-color: var(--brass); color: var(--brass); padding: 10px; font-weight: bold; margin-top: 4px;">
                ↺ REPLAY DAY 1 SEQUENCE
              </button>
            </div>
            `
            }
          </div>
          `
            : ''
        }
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    // Mount & Sync Three.js In-Store 3D Simulation
    const host = this.rootEl.querySelector('#three-canvas-host') as HTMLElement | null;
    if (host) {
      if (!this.store3D) {
        this.store3D = new PharmacyStore3D(host, this.engine.getAllProducts(), {
          onSelectProduct: (p) => {
            this.selectedProduct = p;
            this.updatePriceForSelection();
            this.updatePriceDisplayOnly();
          },
          onPopTablet: (poppedCount) => {
            if (this.selectedProduct.fractionalAllowed) {
              this.setFractional(true, poppedCount);
            }
          },
          onScratchMas: (code) => {
            this.spawnFloatingDelta(`MAS: ${code}`, '#D49826');
          },
        });
      } else {
        if (this.store3D.renderer.domElement.parentElement !== host) {
          host.appendChild(this.store3D.renderer.domElement);
        }
      }

      const currentCust = this.engine.getCurrentCustomer();
      this.store3D.setCustomer(currentCust);
      this.store3D.updateCustomerSpeech(currentCust.initialQuote, currentCust.mood);
      this.store3D.setBlackout(this.engine.getState().blackout ?? false);
      this.store3D.cashRegister.updateDisplay(this.offeredPrice);

      // 3D View Toggles
      const btnCounter = this.rootEl.querySelector('#btn-view-counter');
      const btnShelves = this.rootEl.querySelector('#btn-view-shelves');
      const btnInspect = this.rootEl.querySelector('#btn-view-inspect');
      const btnRegister = this.rootEl.querySelector('#btn-view-register');
      const inspectBar = this.rootEl.querySelector('#three-inspect-bar') as HTMLElement | null;

      const setActiveViewBtn = (activeEl: Element | null) => {
        [btnCounter, btnShelves, btnInspect, btnRegister].forEach((b) => b?.classList.remove('active'));
        activeEl?.classList.add('active');
      };

      btnCounter?.addEventListener('click', () => {
        this.store3D?.setViewMode('COUNTER');
        setActiveViewBtn(btnCounter);
        if (inspectBar) inspectBar.style.display = 'none';
        soundFx.playTap();
      });

      btnShelves?.addEventListener('click', () => {
        this.store3D?.setViewMode('SHELVES');
        setActiveViewBtn(btnShelves);
        if (inspectBar) inspectBar.style.display = 'none';
        soundFx.playTap();
      });

      btnInspect?.addEventListener('click', () => {
        this.store3D?.inspectProduct(this.selectedProduct.id);
        setActiveViewBtn(btnInspect);
        if (inspectBar) inspectBar.style.display = 'flex';
        soundFx.playTap();
      });

      btnRegister?.addEventListener('click', () => {
        this.store3D?.setViewMode('REGISTER');
        setActiveViewBtn(btnRegister);
        if (inspectBar) inspectBar.style.display = 'none';
        soundFx.playTap();
      });

      // 3D In-Hand Inspect Bar Actions
      this.rootEl.querySelector('#btn-3d-scratch')?.addEventListener('click', () => {
        if (this.store3D?.activeInspectedBox) {
          this.store3D.activeInspectedBox.scratchFoil();
          soundFx.playFoilScratch();
          this.spawnFloatingDelta(`MAS: ${this.store3D.activeInspectedBox.masCode}`, '#D49826');
        }
      });

      this.rootEl.querySelector('#btn-3d-blister')?.addEventListener('click', () => {
        if (this.store3D?.activeInspectedBox) {
          this.store3D.activeInspectedBox.toggleBlisterSlide();
          soundFx.playTap();
        }
      });

      this.rootEl.querySelector('#btn-3d-place-counter')?.addEventListener('click', () => {
        if (this.store3D?.activeInspectedBox) {
          this.store3D.placeBoxOnCounter(this.store3D.activeInspectedBox);
          setActiveViewBtn(btnCounter);
          if (inspectBar) inspectBar.style.display = 'none';
          soundFx.playTap();
        }
      });
    }

    // Season Progression Controls (Stage 5)
    this.rootEl.querySelector('#btn-sim-next-day')?.addEventListener('click', () => {
      try {
        const events = this.engine.fastForwardDays(1);
        if (events.length > 0 && events[0].milestone) {
          alert(`Milestone Day ${events[0].day}: ${events[0].milestone.title}\n\n${events[0].milestone.description}`);
        }
        this.render();
      } catch (err: any) {
        alert(err.message || 'Error advancing calendar');
      }
    });

    this.rootEl.querySelector('#btn-sim-day15')?.addEventListener('click', () => {
      try {
        const daysToAdvance = Math.max(1, 15 - this.engine.getState().day);
        this.engine.fastForwardDays(daysToAdvance);
        alert('Advanced to Day 15! Naira FX Import Shock activated: Antimalarials & Antibiotics cost +80%.');
        this.render();
      } catch (err: any) {
        alert(err.message);
      }
    });

    this.rootEl.querySelector('#btn-sim-day45')?.addEventListener('click', () => {
      try {
        const daysToAdvance = Math.max(1, 45 - this.engine.getState().day);
        this.engine.fastForwardDays(daysToAdvance);
        const audit = this.engine.conductBoardInspection();
        alert(`Day 45 Pharmacy Board Regulatory Audit:\n\nInspector Danjuma: ${audit.inspectorDialogue}\n\nResult: ${audit.passed ? 'PASSED' : 'DEFECT DETECTED'}\nFine: ₦${audit.fine.toLocaleString()}\nTotal Violations: ${audit.totalViolations}/2`);
        if (audit.sealed) {
          this.engine.triggerSeasonFinale('stay');
        }
        this.render();
      } catch (err: any) {
        alert(err.message);
      }
    });

    this.rootEl.querySelector('#btn-sim-day70')?.addEventListener('click', () => {
      try {
        const daysToAdvance = Math.max(1, 70 - this.engine.getState().day);
        this.engine.fastForwardDays(daysToAdvance);
        const st = this.engine.getState();
        while ((st.clues || []).length < 7) {
          st.clues.push(`Counterfeit Batch Dossier Clue #${st.clues.length + 1}`);
        }
        alert('Advanced to Day 70! You have collected 7 evidence clues tracking Prime Star illicit batches.');
        this.render();
      } catch (err: any) {
        alert(err.message);
      }
    });

    this.rootEl.querySelector('#btn-action-agency-raid')?.addEventListener('click', () => {
      try {
        const raid = this.engine.executeAgencyRaid();
        soundFx.playSuccessChime();
        alert(`🚨 ${raid.headline}\n\n${raid.message}\n\nTrust Bonus: +${raid.trustBonus}% | Debt Relief: ₦${raid.debtRelief.toLocaleString()}`);
        this.render();
      } catch (err: any) {
        alert(err.message);
      }
    });

    this.rootEl.querySelector('#btn-sim-day90')?.addEventListener('click', () => {
      const st = this.engine.getState();
      if (st.day < 90) {
        try {
          this.engine.fastForwardDays(90 - st.day);
        } catch (e) {}
      }
      const decision = window.confirm('Final Day 90 Reached! British Airways flight BA 074 departs tonight for London Heathrow.\n\nClick OK to STAY in Lagos (Commit to Community Dispensary)\nClick CANCEL to BOARD FLIGHT for UK (Diaspora Route)') ? 'stay' : 'leave';
      this.engine.triggerSeasonFinale(decision);
      this.render();
    });

    // 0:00 Shutters Pull Button
    this.rootEl.querySelector('#btn-pull-shutter')?.addEventListener('click', () => {
      this.openShutters();
    });

    this.rootEl.querySelector('#btn-generator-fuel')?.addEventListener('click', () => {
      this.engine.decideGeneratorFuel(true);
      this.render();
    });

    // Shelf taps
    const shelfGrid = this.rootEl.querySelector('#shelf-grid');
    shelfGrid?.querySelectorAll('.medicine-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        const id = tile.getAttribute('data-id');
        if (id) {
          const prod = this.engine.getProduct(id);
          if (prod) this.selectProduct(prod);
        }
      });
    });

    // Fractional toggles (1:30 unit dispensing)
    this.rootEl.querySelector('#btn-mode-full')?.addEventListener('click', () => {
      this.setFractional(false);
    });
    this.rootEl.querySelector('#btn-mode-unit')?.addEventListener('click', () => {
      this.setFractional(true, 4);
    });

    // Range slider
    const rangeInput = this.rootEl.querySelector('#margin-range') as HTMLInputElement | null;
    if (rangeInput) {
      rangeInput.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        this.setPrice(parseInt(target.value, 10));
      });
    }

    // Payment buttons
    this.rootEl.querySelector('#btn-cash-pay')?.addEventListener('click', () => {
      this.submitTransaction('cash');
    });

    this.rootEl.querySelector('#btn-pos-pay')?.addEventListener('click', () => {
      this.submitTransaction('pos_transfer');
    });

    // Ledger buttons
    this.rootEl.querySelector('#btn-open-ledger')?.addEventListener('click', () => {
      this.openLedgerModal();
    });
    this.rootEl.querySelector('#btn-close-ledger-day')?.addEventListener('click', () => {
      this.closeLedgerAndCloseDay();
    });

    // Voice note button
    this.rootEl.querySelector('#btn-play-voicenote')?.addEventListener('click', () => {
      this.playDeleVoiceNote();
    });

    // Supplier choices
    this.rootEl.querySelector('#btn-choose-dele')?.addEventListener('click', () => {
      this.makeSupplierChoice('dele');
    });
    this.rootEl.querySelector('#btn-choose-okonkwo')?.addEventListener('click', () => {
      this.makeSupplierChoice('okonkwo');
    });

    // Replay
    this.rootEl.querySelector('#btn-replay-day1')?.addEventListener('click', () => {
      this.resetSim();
    });

    // Advance to Day 2 Morning Delivery
    this.rootEl.querySelector('#btn-advance-day2')?.addEventListener('click', () => {
      this.startDay2Delivery();
    });

    // Footer controls
    this.rootEl.querySelector('#btn-next-cust')?.addEventListener('click', () => {
      this.nextCustomer();
    });

    this.rootEl.querySelector('#btn-mute')?.addEventListener('click', () => {
      this.toggleMute();
    });

    this.rootEl.querySelector('#btn-reset')?.addEventListener('click', () => {
      this.resetSim();
    });
  }

  private startDay2Delivery(): void {
    soundFx.playVanArrive();
    setTimeout(() => soundFx.playCrateDrop(), 400);
    this.engine.advanceToDay2Morning();
    this.render();
  }

  private renderEveningLedger(): void {
    const state = this.engine.getState();
    const totals = state.rushRevenue ?? { walkInRevenue: 0, walkInCost: 0, featuredRevenue: 0, featuredCost: 0 };
    const walkInNet = totals.walkInRevenue - totals.walkInCost;
    const featuredProfit = totals.featuredRevenue - totals.featuredCost;
    const streets = this.engine.getStreetHealthMap();
    this.rootEl.innerHTML = `<div class="mobile-container"><header class="pharm-header"><div class="brand-title">PHARM CHRIS • DAY ${state.day} EVENING LEDGER</div><div class="stat-capsules"><div class="stat-pill cash">CASH ₦${state.cash.toLocaleString()}</div><div class="stat-pill trust">TRUST ${state.trust}%</div><div class="stat-pill debt">DEBT ₦${state.debt.toLocaleString()}</div></div></header><section class="evening-stage"><div class="tally-card"><h2>DAILY RECONCILIATION</h2><div class="tally-grid"><div class="tally-box"><div class="tally-label">WALK-IN NET</div><div class="tally-val">₦${walkInNet.toLocaleString()}</div></div><div class="tally-box"><div class="tally-label">FEATURED SALES PROFIT</div><div class="tally-val">₦${featuredProfit.toLocaleString()}</div></div><div class="tally-box"><div class="tally-label">FIXED OVERHEAD</div><div class="tally-val">−₦8,000</div></div><div class="tally-box"><div class="tally-label">NET TODAY</div><div class="tally-val">₦${(walkInNet + featuredProfit - 8000).toLocaleString()}</div></div></div></div><div class="tally-card"><h2>FOLLOW-UP CALLS</h2>${(state.followUpOutcomes ?? []).map(o => `<div class="tally-box">${o.customerName}: ${o.cured ? 'RECOVERING' : 'STILL UNWELL'} • ${Math.round(o.probability * 100)}% cure odds${o.counterfeit ? ' • COUNTERFEIT BATCH TRACED (−10 TRUST, +1 CLUE)' : ''}</div>`).join('') || '<div class="tally-box">No follow-up reports logged today.</div>'}</div><div class="tally-card"><h2>STREET HEALTH MAP • COMPLAINT CLUSTERS</h2><div class="tally-grid">${streets.map(s => `<div class="tally-box"><div class="tally-label">${s.street}</div><div class="tally-val" style="color:${s.complaints ? '#FF7777' : '#55D48A'}">${s.complaints} complaints</div></div>`).join('')}</div></div><div class="tally-card"><label for="debt-payment">PAY CHIEF OKONKWO</label><div class="action-buttons-row"><input id="debt-payment" type="number" min="0" max="${state.cash}" value="0" /><button class="pixel-btn btn-cash" id="btn-pay-debt">MAKE DEBT PAYMENT</button></div><button class="pixel-btn btn-pos" id="btn-next-day">🌅 ADVANCE TO DAY ${state.day + 1} MORNING</button></div></section></div>`;
    this.rootEl.querySelector('#btn-pay-debt')?.addEventListener('click', () => {
      const amount = Number((this.rootEl.querySelector('#debt-payment') as HTMLInputElement | null)?.value ?? 0);
      this.engine.payDebt(amount);
      this.renderEveningLedger();
    });
    this.rootEl.querySelector('#btn-next-day')?.addEventListener('click', () => {
      this.engine.advanceToNextDay();
      this.render();
    });
  }

  private renderDeliveryInspectionScreen(): void {
    const state = this.engine.getState();
    let crate = state.activeDelivery;
    if (!crate) {
      crate = this.engine.advanceToDay2Morning();
    }

    const quota = state.dailyScratchQuota;
    const isScratchRevealed = crate.masScratched;
    const resolution = state.deliveryResolution;

    const cashFormatted = `₦${state.cash.toLocaleString()}`;
    const debtFormatted = `₦${state.debt.toLocaleString()}`;
    const trustPct = `${state.trust}%`;

    this.rootEl.innerHTML = `
      <div class="mobile-container" style="max-width: 900px;">
        <!-- Top Bar with Stats -->
        <header class="pharm-header">
          <div class="brand-title">
            <span class="brand-plus">+</span> PHARM CHRIS • DAY 2 (08:00 AM)
          </div>
          <div class="stat-capsules">
            <div class="stat-pill cash">
              <span class="stat-label">CASH</span>
              <span class="stat-val">${cashFormatted}</span>
            </div>
            <div class="stat-pill trust">
              <span class="stat-label">TRUST</span>
              <span class="stat-val">${trustPct}</span>
            </div>
            <div class="stat-pill debt">
              <span class="stat-label">DEBT</span>
              <span class="stat-val">${debtFormatted}</span>
            </div>
          </div>
        </header>

        <!-- Delivery Screen Wrapper -->
        <div class="delivery-screen" style="position: relative; z-index: 10;">
          <div class="delivery-header">
            <div class="delivery-header-title">
              📦 COUNTER DELIVERY: ${crate.productName}
            </div>
            <div class="delivery-header-badges">
              <div class="quota-badge">
                🔍 THE AGENCY SCRATCH CHECKS: ${quota}/3 REMAINING TODAY
              </div>
            </div>
          </div>

          <!-- Courier Origin Banner -->
          <div class="courier-banner">
            <div class="courier-avatar">${crate.supplier === 'dele' ? '🏍️' : '🚐'}</div>
            <div class="courier-info">
              <div class="courier-title">COURIER ORIGIN: ${crate.supplierName}</div>
              <div class="courier-desc">${crate.courierDescription}</div>
            </div>
          </div>

          ${crate.agencyRegWarning ? `
            <div class="ledger-warning-box">
              ⚠️ <strong>LEDGER WARNING:</strong> ${crate.agencyRegWarning}
            </div>
          ` : ''}

          <!-- Inspection Workspace: Carton vs Blister Pack -->
          <div class="delivery-workspace">
            <!-- Carton Inspection Card -->
            <div class="inspection-card">
              <div class="card-header-bar">
                <div class="card-title">📦 OUTER SHIPPING CARTON & INVOICE</div>
                <span class="prop-val ${crate.tamperSeal}">SEAL: ${crate.tamperSeal.toUpperCase()}</span>
              </div>

              <div class="crate-pixel-view">
                <div class="crate-prop-row">
                  <span class="prop-label">Carton Batch #</span>
                  <span class="prop-val">${crate.batchNumber}</span>
                </div>
                <div class="crate-prop-row">
                  <span class="prop-label">Carton Expiry</span>
                  <span class="prop-val">${crate.cartonExpiry}</span>
                </div>
                <div class="crate-prop-row">
                  <span class="prop-label">Registered Reg #</span>
                  <span class="prop-val">${crate.agencyRegNumber}</span>
                </div>
                <div class="crate-prop-row">
                  <span class="prop-label">Quantity / Unit Price</span>
                  <span class="prop-val">${crate.quantity} Units @ ₦${crate.unitPrice.toLocaleString()}</span>
                </div>
                <div class="crate-prop-row">
                  <span class="prop-label">Total Delivery Bill</span>
                  <span class="prop-val">₦${crate.totalCost.toLocaleString()} (${crate.paymentTerms === 'cash_on_delivery' ? 'Cash on Delivery' : '14-Day Net Credit'})</span>
                </div>
                <div class="crate-prop-row">
                  <span class="prop-label">Tamper-Evident Seal</span>
                  <span class="prop-val ${crate.tamperSeal}">${crate.tamperSealDescription}</span>
                </div>
                <div class="crate-prop-row">
                  <span class="prop-label">Invoice Slip</span>
                  <span class="prop-val">#${crate.invoice.number} (${crate.invoice.hasFormalStamp ? 'Formal Stamp Attached' : 'Unstamped Rough Slip'})</span>
                </div>
              </div>
            </div>

            <!-- Blister Pack & MAS Scratch-Code Card -->
            <div class="inspection-card">
              <div class="card-header-bar">
                <div class="card-title">💊 BLISTER FOIL & THE AGENCY MAS SCRATCH PANEL</div>
                <span class="prop-val ${crate.batchMatches ? 'intact' : 'mismatch'}">
                  ${crate.batchMatches ? 'BATCH MATCH' : 'BATCH / EXPIRY MISMATCH!'} 
                </span>
              </div>

              <div class="blister-visual-container">
                <div class="blister-pills-grid">
                  <div class="blister-pill-slot">AL 80</div>
                  <div class="blister-pill-slot">AL 80</div>
                  <div class="blister-pill-slot">AL 80</div>
                  <div class="blister-pill-slot">AL 80</div>
                </div>

                <div class="crate-pixel-view" style="width: 100%;">
                  <div class="crate-prop-row">
                    <span class="prop-label">Blister Foil Expiry</span>
                    <span class="prop-val ${crate.cartonExpiry !== crate.blisterExpiry ? 'mismatch' : 'intact'}">
                      ${crate.blisterExpiry} ${crate.cartonExpiry !== crate.blisterExpiry ? '(MISMATCHES CARTON!)' : '✓'} 
                    </span>
                  </div>
                </div>

                <div class="mas-scratch-panel-wrapper">
                  <div style="display: flex; justify-content: space-between; font-size: 11px; font-family: var(--font-mono); color: #c4b5d6;">
                    <span>MAS SCRATCH COATING (${crate.scratchPercentage}%)</span>
                    <span>${isScratchRevealed ? 'CODE EXPOSED' : 'RUB TO REVEAL PIN'}</span>
                  </div>

                  <div class="scratch-card-canvas-box" id="scratch-panel-box" title="Click or drag to scratch foil">
                    <div class="scratch-underlying-code">
                      ${crate.masCode}
                    </div>
                    <div class="scratch-silver-overlay ${isScratchRevealed ? 'scratched' : ''}" id="scratch-silver-overlay" style="width: ${100 - crate.scratchPercentage}%;">
                      🪙 [CLICK OR SCRATCH WITH COIN]
                    </div>
                  </div>

                  <div class="scratch-actions-bar">
                    <button class="btn-scratch-coin" id="btn-scratch-step">
                      🪙 Rub With Naira Coin
                    </button>
                    <button class="btn-sms-agency" id="btn-sms-verify" ${(!isScratchRevealed || quota <= 0) ? 'disabled' : ''}>
                      📱 Send SMS to 38353 (${quota}/3)
                    </button>
                  </div>
                </div>

                <!-- Agency SMS Notification Feed -->
                ${this.lastSmsResponse ? `
                  <div class="sms-agency-phone-box ${this.lastSmsResponse.isGenuine ? '' : 'fake-alert'}">
                    <div class="sms-header-line">
                      <span>FROM: THE AGENCY (38353)</span>
                      <span>JUST NOW</span>
                    </div>
                    <div class="sms-body-text">
                      ${this.lastSmsResponse.smsMessage}
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- Action Decision Dock -->
          <div class="delivery-actions-dock">
            <div class="delivery-dock-title">DISPENSARY GATEWAY DECISION:</div>
            <div class="delivery-buttons-row">
              <button class="btn-delivery-action accept" id="btn-action-accept">
                <span>✅ ACCEPT SHIPMENT</span>
                <span class="btn-sub-caption">Add 20 packs to pharmacy shelves (${crate.paymentTerms === 'cash_on_delivery' ? 'Pay ₦44,000 cash' : 'Record ₦76,000 debt'})</span>
              </button>
              <button class="btn-delivery-action reject" id="btn-action-reject">
                <span>❌ REJECT SHIPMENT</span>
                <span class="btn-sub-caption">Refuse delivery and send courier away</span>
              </button>
              <button class="btn-delivery-action quarantine" id="btn-action-quarantine">
                <span>🔒 QUARANTINE CRATE</span>
                <span class="btn-sub-caption">Lock in back room as regulatory evidence (Zero payment)</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Modal Outcome Dialog (when resolved) -->
        ${resolution ? `
          <div class="delivery-resolution-overlay">
            <div class="delivery-resolution-modal">
              <div class="modal-outcome-header ${resolution.action}">
                <span>${resolution.action.toUpperCase()} COMPLETED</span>
                <span>DAY 2 — 08:30 AM</span>
              </div>

              <div style="font-family: var(--font-mono); font-size: 13px; color: #f4ebdd; line-height: 1.5;">
                ${resolution.feedbackMessage}
              </div>

              <div class="resolution-stat-deltas">
                <div class="stat-delta-chip">
                  <span class="label">CASH CHANGE</span>
                  <span class="value ${resolution.cashDelta < 0 ? 'negative' : (resolution.cashDelta > 0 ? 'positive' : 'neutral')}">
                    ${resolution.cashDelta !== 0 ? `₦${resolution.cashDelta.toLocaleString()}` : '₦0'}
                  </span>
                </div>
                <div class="stat-delta-chip">
                  <span class="label">DEBT CHANGE</span>
                  <span class="value ${resolution.debtDelta > 0 ? 'negative' : 'neutral'}">
                    ${resolution.debtDelta !== 0 ? `+₦${resolution.debtDelta.toLocaleString()}` : '₦0'}
                  </span>
                </div>
                <div class="stat-delta-chip">
                  <span class="label">COMMUNITY TRUST</span>
                  <span class="value ${resolution.trustDelta > 0 ? 'positive' : (resolution.trustDelta < 0 ? 'negative' : 'neutral')}">
                    ${resolution.trustDelta > 0 ? `+${resolution.trustDelta}%` : (resolution.trustDelta < 0 ? `${resolution.trustDelta}%` : '0%')}
                  </span>
                </div>
              </div>

              <div class="resolution-narrative-quote">
                <span class="quote-speaker">CHRIS TOLA (PHARMACIST'S LOG):</span>
                <span class="quote-text">"${resolution.tolaMonologue}"</span>
              </div>

              <div class="resolution-narrative-quote">
                <span class="quote-speaker">SADE (DISPENSARY ASSISTANT):</span>
                <span class="quote-text">"${resolution.sadeComment}"</span>
              </div>

              <button class="btn-primary" id="btn-continue-day2" style="padding: 12px; font-family: var(--font-pixel); font-size: 12px; background: var(--eucalyptus); border: 2px solid #000; cursor: pointer; color: #fff;">
                OPEN SHUTTERS FOR DAY 2 CUSTOMERS →
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    this.bindDeliveryEvents();
  }

  private bindDeliveryEvents(): void {
    const state = this.engine.getState();
    const crate = state.activeDelivery;
    if (!crate) return;

    // Scratch interactions
    const btnScratch = this.rootEl.querySelector('#btn-scratch-step');
    const scratchBox = this.rootEl.querySelector('#scratch-panel-box');

    const handleScratch = () => {
      if (crate.masScratched) return;
      soundFx.playFoilScratch();
      const res = this.engine.scratchMasCode(35);
      if (res.isRevealed) {
        soundFx.playSuccessChime();
      }
      this.renderDeliveryInspectionScreen();
    };

    btnScratch?.addEventListener('click', handleScratch);
    scratchBox?.addEventListener('click', handleScratch);

    // SMS Verification button
    const btnSms = this.rootEl.querySelector('#btn-sms-verify');
    btnSms?.addEventListener('click', () => {
      try {
        const response = this.engine.verifyMasCode();
        this.lastSmsResponse = response;
        soundFx.playSmsChime();
        if (!response.isGenuine) {
          setTimeout(() => soundFx.playBuzz(), 200);
        }
        this.renderDeliveryInspectionScreen();
      } catch (err: any) {
        alert(err.message || 'Verification error');
      }
    });

    // Gatekeeper Action Buttons
    const btnAccept = this.rootEl.querySelector('#btn-action-accept');
    btnAccept?.addEventListener('click', () => {
      soundFx.playCashRegister();
      this.engine.resolveDelivery('accept');
      this.renderDeliveryInspectionScreen();
    });

    const btnReject = this.rootEl.querySelector('#btn-action-reject');
    btnReject?.addEventListener('click', () => {
      soundFx.playBuzz();
      this.engine.resolveDelivery('reject');
      this.renderDeliveryInspectionScreen();
    });

    const btnQuarantine = this.rootEl.querySelector('#btn-action-quarantine');
    btnQuarantine?.addEventListener('click', () => {
      soundFx.playPageFlip();
      this.engine.resolveDelivery('quarantine');
      this.renderDeliveryInspectionScreen();
    });

    // Continue to Day 2 trading
    const btnContinue = this.rootEl.querySelector('#btn-continue-day2');
    btnContinue?.addEventListener('click', () => {
      soundFx.playShutter();
      this.beginDayRush();
    });
  }

  private renderEpilogueScreen(): void {
    const state = this.engine.getState();
    const report = state.endgameReport || this.engine.triggerSeasonFinale('stay');

    this.rootEl.innerHTML = `
      <div class="mobile-container" style="max-width: 800px; padding: 16px;">
        <div class="retro-newspaper-card">
          <div class="retro-newspaper-header">
            <div class="retro-paper-name">${report.newspaperName}</div>
            <div class="retro-paper-meta">EDITION NO. 90 • LAGOS STATE • SPECIAL SEASON EPILOGUE DISPATCH</div>
          </div>

          <div class="retro-headline">${report.headline}</div>
          <div class="retro-subheadline">${report.subheadline}</div>

          <div class="retro-body-text">
            ${report.narrativeText}
          </div>

          <div class="retro-quote-box">
            <strong>Sade (Attendant):</strong> ${report.sadeFinalQuote}
          </div>

          <div class="retro-quote-box" style="border-left-color: var(--brass);">
            <strong>Pharmacist Chris Tola:</strong> ${report.tolaMonologue}
          </div>

          <!-- Financial Balance Sheet -->
          <div class="retro-financial-grid">
            <div class="retro-stat-box">
              <div class="retro-stat-label">FINAL OUTCOME</div>
              <div class="retro-stat-value" style="font-size: 11px; color: #b83a24;">${report.outcome}</div>
            </div>
            <div class="retro-stat-box">
              <div class="retro-stat-label">FINAL CASH</div>
              <div class="retro-stat-value">₦${report.finalCash.toLocaleString()}</div>
            </div>
            <div class="retro-stat-box">
              <div class="retro-stat-label">DEBT REPAID</div>
              <div class="retro-stat-value" style="color: #27ae60;">₦${report.debtRepaid.toLocaleString()}</div>
            </div>
            <div class="retro-stat-box">
              <div class="retro-stat-label">REMAINING DEBT</div>
              <div class="retro-stat-value" style="color: ${report.finalDebt === 0 ? '#27ae60' : '#e74c3c'};">₦${report.finalDebt.toLocaleString()}</div>
            </div>
            <div class="retro-stat-box">
              <div class="retro-stat-label">COMMUNITY TRUST</div>
              <div class="retro-stat-value">${report.trust}%</div>
            </div>
            <div class="retro-stat-box">
              <div class="retro-stat-label">TRUST BADGE</div>
              <div class="retro-stat-value" title="${report.trustBadgeTitle}">${report.trustBadge}</div>
            </div>
          </div>

          <div style="margin-top: 20px; text-align: center;">
            <button class="btn-primary" id="btn-restart-season" style="font-family: var(--font-pixel); font-size: 13px; padding: 12px 24px; cursor: pointer; background: #2B2118; color: #F4E8C1; border: 2px solid #000;">
              ↺ PLAY AGAIN / START NEW 90-DAY SEASON
            </button>
          </div>
        </div>
      </div>
    `;

    this.rootEl.querySelector('#btn-restart-season')?.addEventListener('click', () => {
      this.engine = new PharmChrisEngine();
      this.shutterOpen = false;
      this.selectedProduct = this.engine.getAllProducts()[0];
      this.offeredPrice = this.selectedProduct.baseRetail;
      this.isFractional = false;
      this.fractionalUnits = 4;
      this.render();
    });
  }
}

// Initialize application on DOM ready with prominent Mode Switcher
let currentActiveApp: ArcadeApp | FirstPersonApp | null = null;

function renderModeSwitcher(activeMode: '3d' | 'arcade'): void {
  let switcherEl = document.getElementById('sim-mode-switcher');
  if (!switcherEl) {
    switcherEl = document.createElement('div');
    switcherEl.id = 'sim-mode-switcher';
    document.body.appendChild(switcherEl);
  }

  switcherEl.style.position = 'fixed';
  switcherEl.style.top = '12px';
  switcherEl.style.right = '12px';
  switcherEl.style.zIndex = '50';
  switcherEl.style.display = 'flex';
  switcherEl.style.gap = '8px';
  switcherEl.style.alignItems = 'center';
  switcherEl.style.background = 'rgba(12, 15, 13, 0.92)';
  switcherEl.style.border = '2px solid #00ffcc';
  switcherEl.style.borderRadius = '24px';
  switcherEl.style.padding = '4px 8px';
  switcherEl.style.boxShadow = '0 6px 20px rgba(0, 255, 204, 0.35)';
  switcherEl.style.fontFamily = "'Space Grotesk', sans-serif";

  switcherEl.innerHTML = `
    <button id="btn-mode-arcade" style="background: ${activeMode === 'arcade' ? '#00ffcc' : 'transparent'}; color: ${activeMode === 'arcade' ? '#0c0f0d' : '#90a4ae'}; border: none; min-height: 44px; padding: 8px 16px; border-radius: 22px; font-weight: 800; font-size: 12px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; font-family: monospace; display: flex; align-items: center; gap: 6px; touch-action: manipulation;">
      🕹️ 3D Arcade Mode
    </button>
    <button id="btn-mode-3d" style="background: ${activeMode === '3d' ? '#00ffcc' : 'transparent'}; color: ${activeMode === '3d' ? '#0c0f0d' : '#90a4ae'}; border: none; min-height: 44px; padding: 8px 16px; border-radius: 22px; font-weight: 800; font-size: 12px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; font-family: monospace; display: flex; align-items: center; gap: 6px; touch-action: manipulation;">
      👁️ First-Person Mode
    </button>
  `;

  switcherEl.querySelector('#btn-mode-3d')?.addEventListener('click', (e) => {
    e.stopPropagation();
    switchMode('3d');
  });

  switcherEl.querySelector('#btn-mode-arcade')?.addEventListener('click', (e) => {
    e.stopPropagation();
    switchMode('arcade');
  });
}

function switchMode(mode: '3d' | 'arcade'): void {
  const root = document.getElementById('app-root');
  if (!root) return;

  if (currentActiveApp) {
    if ('dispose' in currentActiveApp && typeof currentActiveApp.dispose === 'function') {
      currentActiveApp.dispose();
    } else if ('destroy' in currentActiveApp && typeof (currentActiveApp as any).destroy === 'function') {
      (currentActiveApp as any).destroy();
    }
    currentActiveApp = null;
  }

  root.innerHTML = '';
  localStorage.setItem('pharm_chris_sim_mode', mode);

  const url = new URL(window.location.href);
  url.searchParams.set('mode', mode);
  window.history.replaceState({}, '', url.toString());

  if (mode === '3d') {
    const fpApp = new FirstPersonApp(root);
    currentActiveApp = fpApp;
    (window as any).app = fpApp;
    (window as any).firstPersonApp = fpApp;
  } else {
    const arcadeApp = new ArcadeApp(root);
    currentActiveApp = arcadeApp;
    (window as any).app = arcadeApp;
    (window as any).arcadeApp = arcadeApp;
  }

  renderModeSwitcher(mode);
}

function bootstrapApp(): void {
  const params = new URLSearchParams(window.location.search);
  const paramMode = params.get('mode');
  const savedMode = localStorage.getItem('pharm_chris_sim_mode');
  // Option 2 Default: 3D third-person arcade mode is the mobile-first primary landscape launcher;
  // First-person mode is the accessible secondary toggle
  const targetMode = (paramMode === '3d' || (savedMode === '3d' && paramMode !== 'arcade')) ? '3d' : 'arcade';

  switchMode(targetMode);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}

export { PharmChrisUIApp, FirstPersonApp, ArcadeApp };
