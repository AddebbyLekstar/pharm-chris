import { PharmChrisEngine } from '../../sim/engine';
import { soundFx } from '../../audio/sfx';
import { ArcadeGameDirector } from './ArcadeGameDirector';

export class ArcadeApp {
  public rootEl: HTMLElement;
  public engine: PharmChrisEngine;
  public director: ArcadeGameDirector;

  private hudDayEl!: HTMLElement;
  private hudCashEl!: HTMLElement;
  private hudDebtEl!: HTMLElement;
  private hudStackEl!: HTMLElement;
  private hudObjectiveEl!: HTMLElement;
  private hudMuteBtn!: HTMLButtonElement;
  private viewportContainer!: HTMLElement;
  private uiOverlayEl!: HTMLElement;
  private animFrameId: number | null = null;

  constructor(root: HTMLElement) {
    this.rootEl = root;
    this.engine = new PharmChrisEngine();

    this.buildDomShell();

    this.director = new ArcadeGameDirector({
      engine: this.engine,
      container: this.viewportContainer,
    });

    this.director.start();
    this.startHudLoop();
  }

  private buildDomShell(): void {
    this.rootEl.innerHTML = '';
    this.rootEl.style.position = 'relative';
    this.rootEl.style.width = '100vw';
    this.rootEl.style.height = '100vh';
    this.rootEl.style.overflow = 'hidden';
    this.rootEl.style.background = '#111714';
    this.rootEl.style.userSelect = 'none';
    this.rootEl.style.touchAction = 'none';

    // 3D Canvas Host
    this.viewportContainer = document.createElement('div');
    this.viewportContainer.id = 'arcade-viewport-container';
    this.viewportContainer.style.position = 'absolute';
    this.viewportContainer.style.inset = '0';
    this.viewportContainer.style.width = '100%';
    this.viewportContainer.style.height = '100%';
    this.viewportContainer.style.zIndex = '1';
    this.viewportContainer.style.touchAction = 'none';
    this.rootEl.appendChild(this.viewportContainer);

    // Responsive HUD Overlay
    this.uiOverlayEl = document.createElement('div');
    this.uiOverlayEl.className = 'arcade-hud-overlay';
    this.uiOverlayEl.style.position = 'absolute';
    this.uiOverlayEl.style.inset = '0';
    this.uiOverlayEl.style.pointerEvents = 'none';
    this.uiOverlayEl.style.zIndex = '10';
    this.uiOverlayEl.style.display = 'flex';
    this.uiOverlayEl.style.flexDirection = 'column';
    this.uiOverlayEl.style.justifyContent = 'space-between';
    this.uiOverlayEl.style.padding = '12px 16px';
    this.uiOverlayEl.style.fontFamily = 'system-ui, -apple-system, sans-serif';

    this.uiOverlayEl.innerHTML = `
      <style>
        @keyframes arcade-banner-pulse {
          0%, 100% {
            transform: translateX(-50%) scale(1);
            box-shadow: 0 4px 18px rgba(0, 230, 118, 0.35);
            border-color: #00E676;
          }
          50% {
            transform: translateX(-50%) scale(1.03);
            box-shadow: 0 4px 26px rgba(0, 230, 118, 0.65);
            border-color: #69F0AE;
          }
        }
        @media (pointer: coarse), (hover: none) {
          .desktop-hint { display: none !important; }
          .mobile-hint { display: inline !important; }
        }
      </style>

      <!-- Pulsing Objective Guide (Top Center) -->
      <div id="arcade-objective-banner" style="
        position: absolute;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, rgba(18, 28, 23, 0.94), rgba(10, 18, 14, 0.96));
        border: 2px solid #00E676;
        border-radius: 20px;
        padding: 8px 20px;
        color: #FFFFFF;
        font-size: 0.88rem;
        font-weight: 800;
        letter-spacing: 0.5px;
        box-shadow: 0 4px 18px rgba(0, 230, 118, 0.35);
        pointer-events: none;
        z-index: 15;
        white-space: nowrap;
        animation: arcade-banner-pulse 1.8s infinite ease-in-out;
        text-align: center;
      ">
        📦 WALK TO LOADING DOCK TO COLLECT MEDICINE
      </div>

      <!-- Top Bar -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; pointer-events: auto; gap: 8px; flex-wrap: wrap;">
        <div style="display: flex; gap: 8px; align-items: center;">
          <div style="background: rgba(18, 28, 23, 0.88); backdrop-filter: blur(8px); border: 1.5px solid #00E676; border-radius: 12px; padding: 8px 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-size: 0.7rem; color: #a2b7ac; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">CASH</div>
            <div id="arcade-hud-cash" style="font-size: 1.35rem; color: #00E676; font-weight: 900; line-height: 1.1;">₦0</div>
          </div>

          <div style="background: rgba(18, 28, 23, 0.88); backdrop-filter: blur(8px); border: 1.5px solid #2d3e35; border-radius: 12px; padding: 8px 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-size: 0.7rem; color: #a2b7ac; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">DAY</div>
            <div id="arcade-hud-day" style="font-size: 1.1rem; color: #fff; font-weight: 800; line-height: 1.1;">1 / 90</div>
          </div>

          <div style="background: rgba(18, 28, 23, 0.88); backdrop-filter: blur(8px); border: 1.5px solid #2d3e35; border-radius: 12px; padding: 8px 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-size: 0.7rem; color: #a2b7ac; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">STACK</div>
            <div id="arcade-hud-stack" style="font-size: 1.1rem; color: #ffd54f; font-weight: 800; line-height: 1.1;">0 / 5</div>
          </div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <div style="background: rgba(18, 28, 23, 0.88); backdrop-filter: blur(8px); border: 1.5px solid #e53935; border-radius: 12px; padding: 8px 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-size: 0.7rem; color: #ef9a9a; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">DEBT</div>
            <div id="arcade-hud-debt" style="font-size: 1.1rem; color: #ff5252; font-weight: 800; line-height: 1.1;">₦150,000</div>
          </div>

          <button id="arcade-btn-mute" style="background: rgba(18, 28, 23, 0.88); border: 1.5px solid #2d3e35; color: #fff; border-radius: 10px; padding: 10px 12px; font-weight: bold; cursor: pointer; backdrop-filter: blur(8px);">
            🔊
          </button>
        </div>
      </div>

      <!-- Bottom Controls Hint -->
      <div style="width: 100%; display: flex; justify-content: center; pointer-events: none;">
        <div style="background: rgba(12, 18, 15, 0.75); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 6px 16px; color: #c4d4cc; font-size: 0.82rem; font-weight: 500;">
          <span class="desktop-hint">⌨ WASD / Arrows / Mouse Drag to Move • Walk onto zones to restock & serve</span>
          <span class="mobile-hint" style="display: none;">📱 Drag anywhere on screen to run</span>
        </div>
      </div>
    `;

    this.rootEl.appendChild(this.uiOverlayEl);

    this.hudDayEl = this.uiOverlayEl.querySelector('#arcade-hud-day')!;
    this.hudCashEl = this.uiOverlayEl.querySelector('#arcade-hud-cash')!;
    this.hudDebtEl = this.uiOverlayEl.querySelector('#arcade-hud-debt')!;
    this.hudStackEl = this.uiOverlayEl.querySelector('#arcade-hud-stack')!;
    this.hudObjectiveEl = this.uiOverlayEl.querySelector('#arcade-objective-banner')!;
    this.hudMuteBtn = this.uiOverlayEl.querySelector('#arcade-btn-mute')!;

    const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || (navigator && (navigator.maxTouchPoints > 0)));
    if (isTouch) {
      const desktopHint = this.uiOverlayEl.querySelector('.desktop-hint') as HTMLElement | null;
      const mobileHint = this.uiOverlayEl.querySelector('.mobile-hint') as HTMLElement | null;
      if (desktopHint) desktopHint.style.display = 'none';
      if (mobileHint) mobileHint.style.display = 'inline';
    }

    this.hudMuteBtn.addEventListener('click', () => {
      soundFx.isMuted = !soundFx.isMuted;
      this.hudMuteBtn.textContent = soundFx.isMuted ? '🔇' : '🔊';
    });
  }

  private startHudLoop(): void {
    const updateHud = () => {
      const state = this.engine.getState();
      const cashFormatted = new Intl.NumberFormat('en-NG').format(Math.floor(state.cash));
      const debtFormatted = new Intl.NumberFormat('en-NG').format(Math.floor(state.debt));

      this.hudCashEl.textContent = `₦${cashFormatted}`;
      this.hudDebtEl.textContent = `₦${debtFormatted}`;
      this.hudDayEl.textContent = `${state.day} / 90`;
      this.hudStackEl.textContent = `${this.director.stack.count} / ${this.director.stack.maxCapacity}`;

      // Update objective banner
      const cashDrops = this.director.cashManager.activeCashCount;
      const stackCount = this.director.stack.count;
      const shelvesStocked = this.director.shelves.getTotalStock() > 0;
      const customersWaiting = this.director.customerQueue.queueLength > 0;

      let objectiveText = '';
      if (cashDrops > 0) {
        objectiveText = '💰 COLLECT ₦ CASH & UPGRADE';
      } else if (stackCount > 0) {
        objectiveText = '🚚 RESTOCK THE SHELVES';
      } else if (shelvesStocked && customersWaiting) {
        objectiveText = '🛒 SERVE CUSTOMERS AT COUNTER';
      } else {
        objectiveText = '📦 WALK TO LOADING DOCK TO COLLECT MEDICINE';
      }

      if (this.hudObjectiveEl && this.hudObjectiveEl.textContent !== objectiveText) {
        this.hudObjectiveEl.textContent = objectiveText;
      }

      this.animFrameId = requestAnimationFrame(updateHud);
    };

    this.animFrameId = requestAnimationFrame(updateHud);
  }

  public dispose(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.director.dispose();
  }
}
