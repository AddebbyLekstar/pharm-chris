import { PharmChrisEngine } from '../../sim/engine';
import { StoreRun } from '../../sim/progression';
import { loadRun, saveRun, clearSave, settleOffline, OfflineResult } from '../../sim/save';
import { Telemetry, downloadFunnel } from '../../sim/telemetry';
import { Onboarding, OnboardingKind, ONBOARDING_STEPS } from '../../sim/onboarding';
import { ArcadeGameDirector } from './ArcadeGameDirector';
import { ArcadeStoreHud } from './ArcadeStoreHud';

/**
 * The arcade shell: owns the save, the economy, the HUD and the renderer, and
 * keeps them in step. Everything the player sees is a view of StoreRun.
 */
export class ArcadeApp {
  public rootEl: HTMLElement;
  public engine: PharmChrisEngine;
  public run: StoreRun;
  public director: ArcadeGameDirector;
  public hud: ArcadeStoreHud;
  public telemetry: Telemetry;
  public onboarding: Onboarding;
  public offline: OfflineResult | null = null;

  private viewportContainer!: HTMLElement;
  private hudRafId: number | null = null;
  private lastHudPaint = 0;
  private startedAt = Date.now();
  private saveTimer: number | null = null;
  private debug = false;
  private onHide = () => this.persist(true);

  constructor(root: HTMLElement) {
    this.rootEl = root;
    this.rootEl.innerHTML = '';
    this.rootEl.style.position = 'relative';
    this.rootEl.style.width = '100%';
    this.rootEl.style.height = '100%';
    this.rootEl.style.overflow = 'hidden';
    this.rootEl.style.background = '#0b1210';
    this.rootEl.style.userSelect = 'none';
    this.rootEl.style.touchAction = 'none';

    const params = new URLSearchParams(window.location.search);
    this.debug = params.get('debug') === '1' || params.get('debug') === 'true';

    // 1. Save -> run
    const loaded = loadRun();
    this.run = loaded.run ?? StoreRun.create();
    if (loaded.run && loaded.savedAt) {
      this.offline = settleOffline(this.run, loaded.savedAt);
    }

    this.telemetry = new Telemetry();
    this.onboarding = new Onboarding(this.run.onboardingStep, Date.now());

    // 2. DOM shell
    this.viewportContainer = document.createElement('div');
    this.viewportContainer.id = 'arcade-viewport-container';
    this.viewportContainer.style.position = 'absolute';
    this.viewportContainer.style.inset = '0';
    this.viewportContainer.style.zIndex = '1';
    this.viewportContainer.style.touchAction = 'none';
    this.rootEl.appendChild(this.viewportContainer);

    // 3. Engine + director (economy already loaded)
    this.engine = new PharmChrisEngine();
    this.director = new ArcadeGameDirector({
      engine: this.engine,
      run: this.run,
      container: this.viewportContainer,
      hooks: {
        onDayEnded: (report) => {
          this.telemetry.track('day_complete', report.day, report.net);
          if (this.run.day === 2) this.telemetry.track('day_2_start', 2);
          if (this.debug) this.hud?.renderDebug();
          this.persist();
        },
        onSeasonEnded: (report) => {
          this.telemetry.track('run_ended', report.playerDecision ? 90 : this.run.day, undefined, {
            outcome: report.outcome,
          });
          this.hud?.showEndgame(report);
        },
        onEndingPrompt: (run) => {
          this.hud?.showEndingChoice(run, (decision) => {
            const report = this.run.chooseEnding(decision);
            if (report) {
              this.telemetry.track('run_ended', 90, undefined, { outcome: report.outcome });
              this.hud?.showEndgame(report);
            }
            this.persist();
          });
        },
        onInspection: (result) => {
          this.hud?.showInspection(result);
          this.telemetry.track('inspection', this.run.day, result.fine, { defect: result.defectType });
        },
        onCounterfeit: (crate) => {
          this.hud?.showCounterfeit(crate, (accept) => this.director.resolveCounterfeit(accept));
        },
        onSave: () => this.persist(),
        onOnboarding: (kind) => this.advanceOnboarding(kind),
      },
    });

    // 4. HUD
    this.hud = new ArcadeStoreHud({
      root: this.rootEl,
      run: this.run,
      telemetry: this.telemetry,
      onboarding: this.onboarding,
      debug: this.debug,
      callbacks: {
        onPurchase: () => {
          this.director.syncFromRun();
          this.persist();
        },
        onSave: () => this.persist(),
        onNewGame: () => this.newGame(),
        onSkipTutorial: () => {
          this.run.setOnboardingStep(6);
          this.persist();
          this.telemetry.track('onboarding_skipped', this.run.day);
        },
        onEnding: (decision) => {
          const report = this.run.chooseEnding(decision);
          if (report) {
            this.telemetry.track('run_ended', 90, undefined, { outcome: report.outcome });
            this.hud.showEndgame(report);
          }
          this.persist();
        },
      },
    });

    // 5. Start
    this.director.start();
    this.startHudLoop();
    this.bindKeys();
    window.addEventListener('pagehide', this.onHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.persist(true);
    });

    this.persist();
    // A refresh is not an absence: only report a real gap.
    if (this.offline && this.offline.seconds >= 60) {
      setTimeout(() => this.hud.showOffline(this.offline!), 350);
    }
    this.exposeDebugApi();
  }

  // ------------------------------------------------------------------ flows

  private advanceOnboarding(kind: OnboardingKind): void {
    const advanced = this.onboarding.notify(kind);
    if (!advanced) return;
    this.run.setOnboardingStep(this.onboarding.currentStep);
    const step = ONBOARDING_STEPS.find((s) => s.kind === kind);
    if (step) {
      this.telemetry.trackOnce(`onboarding_${kind}`, this.run.day);
      this.hud.toast(step.hint, '#4f6577');
      this.hud.pulseObjective();
    }
    if (this.onboarding.isComplete) this.telemetry.trackOnce('onboarding_license', this.run.day);
    this.persist();
  }

  public persist(silent = false): void {
    const ok = saveRun(this.run);
    if (!ok && !silent) this.hud?.toast('Could not write the save (storage blocked).', '#ff8a80');
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  public newGame(): void {
    clearSave();
    this.telemetry.track('run_restarted', this.run.day);
    this.director.dispose();
    this.hud.destroy();
    this.telemetry.endSession();
    new ArcadeApp(this.rootEl);
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        this.hud.closeModal();
        this.hud.toggleDrawer(false);
      }
      if (e.code === 'KeyI' || e.code === 'KeyB') this.hud.toggleDrawer();
      if (e.code === 'F2') this.hud.toggleDebug();
    });
  }

  private startHudLoop(): void {
    const paint = (ts: number) => {
      if (ts - this.lastHudPaint > 100) {
        this.lastHudPaint = ts;
        this.hud.update({
          stackCount: this.director.stack.count,
          stackCapacity: this.director.stack.maxCapacity,
          queueLength: this.run.queue.length,
          cashOnFloor: this.run.pendingCash.length,
          shelfStock: Object.values(this.run.shelfLevels).reduce((a, b) => a + b, 0),
          playerSpeedLevel: this.run.state.upgrades.speed,
        });
      }
      this.hudRafId = requestAnimationFrame(paint);
    };
    this.hudRafId = requestAnimationFrame(paint);
  }

  private exposeDebugApi(): void {
    (window as unknown as Record<string, unknown>).pharmChris = {
      run: this.run,
      director: this.director,
      telemetry: this.telemetry,
      funnel: () => this.telemetry.funnel(),
      exportFunnel: () => downloadFunnel(this.telemetry),
      perf: () => this.director.perfStats(),
      save: () => this.persist(),
      state: () => ({
        day: this.run.day,
        cash: this.run.cash,
        debt: this.run.debt,
        trust: this.run.trust,
        tier: this.run.highestTier,
        staff: this.run.state.employees,
        shelves: this.run.shelfLevels,
        served: this.run.stats.customersServed,
        queue: this.run.queue.length,
        onboarding: this.onboarding.currentStep,
        ended: this.run.ended,
        ending: this.run.state.ending ?? null,
      }),
    };
  }

  public dispose(): void {
    if (this.hudRafId !== null) cancelAnimationFrame(this.hudRafId);
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    window.removeEventListener('pagehide', this.onHide);
    this.persist(true);
    this.telemetry.track('session_end', this.run.day, Math.round((Date.now() - this.startedAt) / 1000));
    this.director.dispose();
    this.hud.destroy();
    this.rootEl.innerHTML = '';
  }
}
