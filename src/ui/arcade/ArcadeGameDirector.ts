import * as THREE from 'three';
import { PharmChrisEngine } from '../../sim/engine';
import { soundFx } from '../../audio/sfx';
import { ArcadeViewport } from './ArcadeViewport';
import { applyArtDirection, artVersion } from './art';
import { ArcadeScene } from './ArcadeScene';
import { InputController } from './InputController';
import { ArcadePlayer } from './ArcadePlayer';
import { MedicineStack } from './MedicineStack';
import { PharmacyShelves3D } from './PharmacyShelves3D';
import { TriggerZoneManager } from './TriggerZone';
import { ArcadeCustomerQueue } from './ArcadeCustomerQueue';
import { CashDropManager } from './CashDropManager';
import { FloorUpgradePad } from './FloorUpgradePad';
import { DialogueModal } from './DialogueModal';
import { ArcadeJuice } from './ArcadeJuice';
import { ArcadeStaff } from './ArcadeStaff';
import { DayReport, PRODUCTS_BY_ID, ShelfCategory, StoreRun, UPGRADES } from '../../sim/progression';
import { Customer, EndgameReport, InspectionResult } from '../../sim/types';
import { OnboardingKind } from '../../sim/onboarding';

export interface DirectorHooks {
  onDayEnded?: (report: DayReport) => void;
  onSeasonEnded?: (report: EndgameReport) => void;
  onEndingPrompt?: (run: StoreRun) => void;
  onInspection?: (result: InspectionResult) => void;
  onCounterfeit?: (crate: { productId: string; unitCost: number }) => void;
  onSave?: () => void;
  onOnboarding?: (kind: OnboardingKind) => void;
}

export interface ArcadeGameDirectorOptions {
  engine: PharmChrisEngine;
  run?: StoreRun;
  container?: HTMLElement;
  hooks?: DirectorHooks;
}

const SHELF_ZONES: Array<[string, ShelfCategory]> = [
  ['shelf_antimalarial', 'antimalarial'],
  ['shelf_analgesic', 'analgesic'],
  ['shelf_antibiotic', 'antibiotic'],
  ['shelf_cold_chain', 'cold_chain'],
];

export class ArcadeGameDirector {
  public engine: PharmChrisEngine;
  public run: StoreRun;
  public viewport: ArcadeViewport;
  public scene: ArcadeScene;
  public input: InputController;
  public player: ArcadePlayer;
  public stack: MedicineStack;
  public shelves: PharmacyShelves3D;
  public zoneManager: TriggerZoneManager;
  public customerQueue: ArcadeCustomerQueue;
  public cashManager: CashDropManager;
  public upgradePads: FloorUpgradePad[] = [];
  public dialogueModal: DialogueModal;
  public juice: ArcadeJuice;
  public staff: ArcadeStaff;
  public hooks: DirectorHooks;
  public isRunning: boolean = false;

  private animFrameId: number | null = null;
  private lastTimestamp: number = 0;
  private container: HTMLElement | null = null;
  private outOfStockCooldown: number = 0;
  private dockCooldown: number = 0;
  private shelfCooldown: number = 0;
  private serveCooldown: number = 0;
  private modalCooldown: number = 0;
  private endingPrompted = false;
  private expansionLevel = 0;
  private frameTimes: number[] = [];
  private cashSpawnPos = new THREE.Vector3(0, 1.25, 1.5);
  private cashTextPos = new THREE.Vector3(0, 1.75, 1.5);

  constructor(options: ArcadeGameDirectorOptions) {
    this.engine = options.engine;
    this.run = options.run ?? StoreRun.create();
    this.hooks = options.hooks ?? {};
    this.container = options.container ?? null;

    // 1. Scene & Environment
    this.scene = new ArcadeScene();

    // 2. Viewport & Camera
    this.viewport = new ArcadeViewport({ scene: this.scene.scene });
    this.viewport.setRoomBounds(this.scene.getRoomBounds());
    this.viewport.setPlayableBounds(this.scene.getWalkableBounds());

    // 3. Input Controller
    this.input = new InputController();

    // 4. Player & Movement
    this.player = new ArcadePlayer({ bounds: this.scene.getWalkableBounds() });
    // Calibrate the camera to the character that actually exists, so the 80 px
    // floor survives any change to his proportions or scale.
    const extent = this.player.worldExtent();
    this.viewport.setCharacterHeight(extent.maxY - extent.minY);
    this.scene.group.add(this.player.mesh);

    // 5. Medicine Carrying Stack
    this.stack = new MedicineStack({ anchor: this.player.stackSocket, maxCapacity: this.run.carryCapacity });

    // 6. Shelves 3D (a view of the simulation's shelf levels)
    this.shelves = new PharmacyShelves3D(this.engine.getAllProducts());
    this.shelves.setCapacity(this.run.shelfCapacity);
    this.scene.group.add(this.shelves.group);

    // 7. Trigger Zones
    this.zoneManager = new TriggerZoneManager({ shelves: this.shelves, engine: this.engine });
    this.scene.group.add(this.zoneManager.group);

    // 8. Customers & Queue — the economy decides who walks in, not the queue.
    this.customerQueue = new ArcadeCustomerQueue({
      engine: this.engine,
      shelves: this.shelves,
      maxQueue: 6,
      initialSpawn: 0,
      autoSpawn: false,
    });
    this.scene.group.add(this.customerQueue.group);

    // 9. Cash Drops
    this.cashManager = new CashDropManager();
    this.scene.group.add(this.cashManager.group);

    // 10. Staff
    this.staff = new ArcadeStaff();
    this.scene.group.add(this.staff.group);

    // 11. Investment pads
    this.setupUpgradePads();

    // 12. Story Modal & Juice
    this.dialogueModal = new DialogueModal();
    this.juice = new ArcadeJuice();

    this.syncFromRun(true);

    if (this.container) {
      this.mount(this.container);
    }
  }

  // ------------------------------------------------------------------ setup

  private setupUpgradePads(): void {
    const carryCost = this.run.upgradeCost('carry');
    const carry = new FloorUpgradePad({
      id: 'upgrade_carry',
      title: '+2 Carry',
      cost: Number.isFinite(carryCost) ? carryCost : 0,
      position: new THREE.Vector3(-2.8, 0, -2.5),
    });
    carry.onPurchased = () => this.buyPadUpgrade('carry');
    this.upgradePads.push(carry);
    this.scene.group.add(carry.mesh);

    const speedCost = this.run.upgradeCost('speed');
    const speed = new FloorUpgradePad({
      id: 'upgrade_speed',
      title: 'Running speed',
      cost: Number.isFinite(speedCost) ? speedCost : 0,
      position: new THREE.Vector3(2.8, 0, -2.5),
    });
    speed.onPurchased = () => this.buyPadUpgrade('speed');
    this.upgradePads.push(speed);
    this.scene.group.add(speed.mesh);

    const licence = new FloorUpgradePad({
      id: 'upgrade_licence',
      title: 'Licence desk',
      cost: this.run.nextLicenseTier()?.cost ?? 0,
      position: new THREE.Vector3(-5.0, 0, 3.4),
    });
    licence.onPurchased = () => this.buyPadLicence();
    this.upgradePads.push(licence);
    this.scene.group.add(licence.mesh);

    const expansion = new FloorUpgradePad({
      id: 'upgrade_expansion',
      title: 'Knock down the wall',
      cost: this.run.nextExpansion()?.cost ?? 0,
      position: new THREE.Vector3(5.0, 0, 3.4),
    });
    expansion.onPurchased = () => this.buyPadExpansion();
    this.upgradePads.push(expansion);
    this.scene.group.add(expansion.mesh);
  }

  private buyPadUpgrade(id: 'carry' | 'speed'): void {
    const res = this.run.buyUpgrade(id);
    if (!res.ok) {
      this.juice.spawnFloatingText(res.reason === 'maxed' ? 'MAXED' : 'NEED CASH', this.player.position, '#FF5252');
      soundFx.playBuzz?.();
      this.refreshPads();
      return;
    }
    this.applyUpgrade(id === 'carry' ? 'upgrade_stack' : 'upgrade_speed');
    this.hooks.onOnboarding?.('upgrade');
    this.juice.spawnFloatingText(`${UPGRADES[id].name.toUpperCase()} LV ${res.level}`, this.player.position, '#00E676');
    this.hooks.onSave?.();
    this.refreshPads();
  }

  private buyPadLicence(): void {
    const next = this.run.nextLicenseTier();
    if (!next) {
      this.juice.spawnFloatingText('ALL LICENCES OWNED', this.player.position, '#8fd6ff');
      return;
    }
    const res = this.run.buyLicense(next.tier);
    if (!res.ok) {
      this.juice.spawnFloatingText(
        res.reason === 'cash' ? `NEED ₦${next.cost.toLocaleString()}` : 'LOCKED',
        this.player.position,
        '#FF5252'
      );
      soundFx.playBuzz?.();
      this.refreshPads();
      return;
    }
    this.hooks.onOnboarding?.('license');
    this.juice.spawnFloatingText(`${next.name.toUpperCase()} UNLOCKED`, this.player.position, '#00E676');
    this.shelves.setCapacity(this.run.shelfCapacity);
    this.refreshPads();
    this.hooks.onSave?.();
  }

  private buyPadExpansion(): void {
    const res = this.run.expand();
    if (!res.ok) {
      const next = this.run.nextExpansion();
      this.juice.spawnFloatingText(
        res.reason === 'maxed' ? 'FULLY EXPANDED' : `NEED ₦${(next?.cost ?? 0).toLocaleString()}`,
        this.player.position,
        '#FF5252'
      );
      soundFx.playBuzz?.();
      this.refreshPads();
      return;
    }
    this.applyExpansion();
    this.juice.spawnFloatingText('FLOOR EXPANDED', this.player.position, '#00E676');
    soundFx.playChimeSuccess?.();
    this.hooks.onSave?.();
    this.refreshPads();
  }

  private refreshPads(): void {
    const carry = this.upgradePads.find((p) => p.id === 'upgrade_carry');
    const speed = this.upgradePads.find((p) => p.id === 'upgrade_speed');
    const licence = this.upgradePads.find((p) => p.id === 'upgrade_licence');
    const expansion = this.upgradePads.find((p) => p.id === 'upgrade_expansion');

    const carryCost = this.run.upgradeCost('carry');
    carry?.reset(carryCost, Number.isFinite(carryCost) ? `+2 Carry (${carryCost.toLocaleString()})` : 'Carry MAXED');
    if (carry) carry.mesh.visible = Number.isFinite(carryCost);

    const speedCost = this.run.upgradeCost('speed');
    speed?.reset(speedCost, Number.isFinite(speedCost) ? `Speed (${speedCost.toLocaleString()})` : 'Speed MAXED');
    if (speed) speed.mesh.visible = Number.isFinite(speedCost);

    const nextTier = this.run.nextLicenseTier();
    licence?.reset(nextTier?.cost ?? 0, nextTier ? `Licence: ${nextTier.name}` : 'All licences owned');
    if (licence) licence.mesh.visible = Boolean(nextTier);

    const nextExpansion = this.run.nextExpansion();
    expansion?.reset(nextExpansion?.cost ?? 0, nextExpansion?.name ?? 'Fully expanded');
    if (expansion) expansion.mesh.visible = Boolean(nextExpansion);
  }

  /** Keeps every 3D view in step with the economy (called after load and purchases). */
  public syncFromRun(full = false): void {
    this.stack.maxCapacity = this.run.carryCapacity;
    this.player.speedMultiplier = this.run.speedMultiplier;
    this.shelves.setCapacity(this.run.shelfCapacity);
    for (const cat of ['analgesic', 'antimalarial', 'antibiotic', 'cold_chain'] as ShelfCategory[]) {
      this.shelves.setStock(cat, this.run.shelfLevels[cat]);
    }
    this.staff.sync(this.run);
    if (full || this.run.state.expansions !== this.expansionLevel) {
      this.applyExpansion();
    }
    if (full) this.refreshPads();
  }

  private applyExpansion(): void {
    this.expansionLevel = this.run.state.expansions;
    this.scene.applyExpansion(this.expansionLevel);
    // The camera keeps its own idea of the room. Without this it still thinks the
    // shop is 8.4 m wide after a wing has been added, and refuses to pan into it.
    this.viewport.setRoomBounds(this.scene.getRoomBounds());
    this.viewport.setExpansionLevel(this.expansionLevel);
    this.viewport.setPlayableBounds(this.scene.getWalkableBounds());
    this.shelves.setCapacity(this.run.shelfCapacity);
  }

  public applyUpgrade(id: string): void {
    if (id === 'upgrade_stack' || id === 'upgrade_carry') {
      this.stack.maxCapacity = this.run.carryCapacity;
      this.juice.spawnFloatingText('STACK EXPANDED!', this.player.position, '#00E676');
      soundFx.playChimeSuccess?.();
    } else if (id === 'upgrade_speed') {
      this.player.speedMultiplier = this.run.speedMultiplier;
      this.juice.spawnFloatingText('SPEED BOOSTED!', this.player.position, '#FFD54F');
      soundFx.playChimeSuccess?.();
    }
  }

  public mount(container: HTMLElement): void {
    this.container = container;
    this.viewport.mount(container);
    // The renderer only exists after mount, so the environment map is built here.
    applyArtDirection(this.scene.scene, this.scene.group, this.viewport.renderer, artVersion());
    this.input.attach(container);
    this.dialogueModal.mount(container);
    this.juice.attach(container);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTimestamp = performance.now();
    this.animFrameId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private loop = (timestamp: number): void => {
    if (!this.isRunning) return;
    // Real elapsed time, not a clamped frame: on a 6fps device the shop must still
    // trade at wall-clock speed instead of sliding into slow motion.
    const delta = Math.min(1, Math.max(0, (timestamp - this.lastTimestamp) / 1000));
    this.lastTimestamp = timestamp;
    this.frameTimes.push(delta);
    if (this.frameTimes.length > 120) this.frameTimes.shift();

    this.tick(delta);

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  public get averageFrameMs(): number {
    if (!this.frameTimes.length) return 0;
    return (this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length) * 1000;
  }

  /** Renderer counters for the performance budget doc. */
  public perfStats(): { drawCalls: number; triangles: number; textures: number; geometries: number; frameMs: number } {
    const info = this.viewport.renderer?.info;
    return {
      drawCalls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
      textures: info?.memory.textures ?? 0,
      geometries: info?.memory.geometries ?? 0,
      frameMs: Number(this.averageFrameMs.toFixed(2)),
    };
  }

  // ------------------------------------------------------------------ loop

  public tick(delta: number): void {
    const simDelta = Math.min(1, Math.max(0, delta));
    // Physics stays stable on long frames; the economy never loses a second.
    const physDelta = Math.min(0.1, simDelta);

    this.outOfStockCooldown = Math.max(0, this.outOfStockCooldown - simDelta);
    this.dockCooldown = Math.max(0, this.dockCooldown - simDelta);
    this.shelfCooldown = Math.max(0, this.shelfCooldown - simDelta);
    this.serveCooldown = Math.max(0, this.serveCooldown - simDelta);
    this.modalCooldown = Math.max(0, this.modalCooldown - simDelta);

    const dir = this.input.getDirection();

    // 1. Movement & stack physics
    this.player.update(physDelta, dir);
    this.stack.update(physDelta, dir);

    // 2. Economy
    const events = this.run.tick(simDelta);
    this.handleRunEvents(events);

    // 3. Player interactions with the floor
    this.handleDock();
    this.handleShelf();
    this.handleCounter();

    // 4. Customer meshes
    this.customerQueue.update(simDelta);

    // 5. Cash on the floor
    const collected = this.cashManager.update(physDelta, this.player.position);
    if (collected > 0) {
      const ids = this.cashManager.collectedIds;
      if (ids.length) {
        for (const id of ids) this.run.collectCash(id);
      } else {
        this.run.collectCash();
      }
      this.juice.spawnFloatingText(`+₦${collected.toLocaleString()}`, this.player.position, '#00E676');
      this.juice.triggerScreenShake(0.08);
      soundFx.playCoin?.();
      this.hooks.onOnboarding?.('cash');
    }

    // 6. Staff visuals + pads
    this.staff.update(physDelta);
    for (const pad of this.upgradePads) {
      pad.update(physDelta, this.player.position, this.run.cash);
    }

    // 7. Seasonal beats
    this.maybeInspection();
    this.maybeCounterfeit();
    if (this.run.needsEndingDecision && !this.endingPrompted) {
      this.endingPrompted = true;
      this.hooks.onEndingPrompt?.(this.run);
    }

    // 8. Juice + camera
    this.juice.update(physDelta);
    this.viewport.updateCameraFollow(this.player.position, physDelta);
    // Sprites are billboards: place them after the camera moves, before the draw.
    this.customerQueue.syncSprites(this.viewport.camera);
    if (this.juice.shakeIntensity > 0) {
      this.viewport.camera.position.add(this.juice.shakeOffset);
    }
    this.viewport.render();
  }

  private handleRunEvents(events: ReturnType<StoreRun['tick']>): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'customer_spawned': {
          this.customerQueue.spawnFrom(this.toSimCustomer(ev.customer));
          soundFx.playTap?.();
          break;
        }
        case 'customer_lost': {
          this.juice.spawnFloatingText(
            ev.reason === 'stock' ? 'SHELF EMPTY — CUSTOMER LEFT' : 'CUSTOMER GAVE UP',
            new THREE.Vector3(0, 1.9, 2.4),
            '#FF5252'
          );
          if (this.outOfStockCooldown <= 0) {
            soundFx.playBuzz?.();
            this.outOfStockCooldown = 2;
          }
          break;
        }
        case 'cash_dropped': {
          // Drop it at the player's feet: a sale must feel collected, not lost.
          this.cashSpawnPos.set(this.player.position.x, 1.15, this.player.position.z + 0.7);
          this.cashManager.spawnCash(this.cashSpawnPos, ev.amount, true, ev.id);
          break;
        }
        case 'day_ended': {
          this.hooks.onDayEnded?.(ev.report);
          this.hooks.onSave?.();
          this.juice.spawnFloatingText(
            `DAY ${ev.report.day} CLOSED ${
              ev.report.net >= 0 ? `+₦${ev.report.net.toLocaleString()}` : `-₦${Math.abs(ev.report.net).toLocaleString()}`
            }`,
            new THREE.Vector3(0, 2.2, 1.2),
            ev.report.net >= 0 ? '#8fd6ff' : '#FF5252'
          );
          this.refreshPads();
          this.staff.sync(this.run);
          if (this.run.state.expansions !== this.expansionLevel) this.applyExpansion();
          break;
        }
        case 'season_ended': {
          this.hooks.onSeasonEnded?.(ev.report);
          break;
        }
        case 'save_due': {
          this.hooks.onSave?.();
          break;
        }
        default:
          break;
      }
    }
  }

  private handleDock(): void {
    const dock = this.zoneManager.getZone('dock');
    if (!dock || !dock.isInside(this.player.position)) return;
    if (this.dockCooldown > 0) return;
    if (this.stack.count >= this.stack.maxCapacity) return;

    const res = this.run.loadBox();
    this.dockCooldown = Math.max(0.12, 0.42 - this.run.state.upgrades.dock_rate * 0.04);

    if (!res.ok) {
      if (res.reason === 'cash') {
        this.juice.spawnFloatingText('NO CASH FOR STOCK', this.player.position, '#FF5252');
        soundFx.playBuzz?.();
        this.dockCooldown = 1.2;
      }
      return;
    }
    const product = res.productId ? PRODUCTS_BY_ID.get(res.productId) : undefined;
    if (product && this.stack.push(product)) {
      this.juice.spawnFloatingText(`-₦${(res.cost ?? 0).toLocaleString()}`, this.player.position, '#FFD54F');
      soundFx.playTick?.();
      this.hooks.onOnboarding?.('pickup');
    }
  }

  private handleShelf(): void {
    if (this.shelfCooldown > 0) return;
    for (const [zoneId, category] of SHELF_ZONES) {
      const zone = this.zoneManager.getZone(zoneId);
      if (!zone || !zone.isInside(this.player.position)) continue;
      const res = this.run.stockShelf(category);
      if (!res.ok) continue;
      this.stack.popMatching(category);
      this.shelves.setStock(category, this.run.shelfLevels[category]);
      this.shelfCooldown = 0.14;
      soundFx.playTap?.();
      this.hooks.onOnboarding?.('stock');
      return;
    }
  }

  private handleCounter(): void {
    const counter = this.zoneManager.getZone('counter_cashier');
    if (!counter || !counter.isInside(this.player.position)) return;
    if (this.dialogueModal.isOpen || this.modalCooldown > 0) return;
    if (this.serveCooldown > 0) return;

    const front = this.customerQueue.getFrontCustomer();
    if (!front || front.state !== 'serving') return;
    const runFront = this.run.queue[0];
    if (!runFront) return;

    // Story customers haggle through the dialogue modal; everyone else is a tap.
    if (front.isStoryCustomer && !front.hasNegotiated) {
      this.dialogueModal.open({
        customer: this.toSimCustomer(runFront),
        engine: this.engine,
        onComplete: () => {
          front.hasNegotiated = true;
          const served = this.run.serveFront(false);
          if (served.ok) {
            this.juice.spawnFloatingText(`+₦${(served.revenue ?? 0).toLocaleString()}`, this.cashTextPos, '#00E676');
            soundFx.playChimeSuccess?.();
            this.hooks.onOnboarding?.('serve');
          }
          front.setLeaving();
          this.customerQueue.reindexSlots();
          this.serveCooldown = 0.6;
          this.modalCooldown = 0.6;
        },
      });
      this.serveCooldown = 1.2;
      return;
    }

    const served = this.run.serveFront(false);
    this.serveCooldown = 0.45;
    if (!served.ok) {
      if (served.reason === 'stock' && this.outOfStockCooldown <= 0) {
        this.juice.spawnFloatingText('SHELF EMPTY!', this.cashTextPos, '#FF5252');
        soundFx.playBuzz?.();
        this.outOfStockCooldown = 2;
      }
      return;
    }
    this.shelves.setStock(runFront.category, this.run.shelfLevels[runFront.category]);
    this.juice.spawnFloatingText(`+₦${(served.revenue ?? 0).toLocaleString()}`, this.cashTextPos, '#00E676');
    soundFx.playCoin?.();
    this.hooks.onOnboarding?.('serve');
    front.setLeaving();
    this.customerQueue.reindexSlots();
  }

  private maybeInspection(): void {
    const day = this.run.day;
    const violations = this.run.state.boardViolations;
    const lastDay = this.run.state.lastInspection?.day ?? -1;
    const dueOriginal = day >= 45 && lastDay < 45;
    const dueFollowUp = day >= 75 && violations > 0 && lastDay < 75;
    if (!dueOriginal && !dueFollowUp) return;

    const result = this.engine.conductBoardInspection({
      hasLicenseDisplayed: true,
      superintendentPresent: true,
      hasPoisonRegisterLogged: true,
      hasColdChainLogs: this.run.highestTier >= 5 ? this.run.shelfLevels.cold_chain > 0 : true,
      hasUnsegregatedFakeStock: this.run.stats.counterfeitAccepted > 0,
    });
    const applied = this.run.applyInspection({ ...result, day });
    this.hooks.onInspection?.({ ...result, fine: applied.fine, sealed: applied.sealed });
    if (applied.fine > 0) {
      this.juice.spawnFloatingText(`FINE ₦${applied.fine.toLocaleString()}`, this.player.position, '#FF5252');
      this.juice.triggerScreenShake(0.25);
    }
  }

  private maybeCounterfeit(): void {
    const crate = this.run.counterfeitCrate;
    if (!crate || this.modalCooldown > 0) return;
    this.modalCooldown = 6;
    if (!this.hooks.onCounterfeit) {
      this.run.resolveCounterfeitCrate('refuse');
      return;
    }
    this.hooks.onCounterfeit(crate);
  }

  /** Called by the HUD when the player answers Dele's courier. */
  public resolveCounterfeit(accept: boolean): void {
    const res = this.run.resolveCounterfeitCrate(accept ? 'accept' : 'refuse');
    if (res.clue) this.run.addClue(1);
    for (const cat of ['analgesic', 'antimalarial', 'antibiotic', 'cold_chain'] as ShelfCategory[]) {
      this.shelves.setStock(cat, this.run.shelfLevels[cat]);
    }
    this.juice.spawnFloatingText(
      accept ? 'CHEAP STOCK SHELVED — TRUST HIT' : 'CLUE LOGGED, CRATE REFUSED',
      this.player.position,
      accept ? '#FF5252' : '#00E676'
    );
    this.modalCooldown = 2;
    this.hooks.onSave?.();
  }

  private toSimCustomer(c: {
    id: string;
    name: string;
    title: string;
    productId: string;
    patienceMax: number;
    budget: number;
    isVip: boolean;
  }): Customer {
    const product = PRODUCTS_BY_ID.get(c.productId);
    return {
      id: c.id,
      name: c.name,
      title: c.title,
      avatarKey: 'arcade',
      initialQuote: product
        ? `I need ${product.name}. ${c.isVip ? 'Make it quick, I have been waiting.' : 'Give me the correct one o.'}`
        : 'Good morning, Pharmacist.',
      symptoms: product ? product.symptomTags : [],
      symptomLabel: product ? product.name : 'Walk-in',
      matchedProductIds: [c.productId],
      budget: c.budget,
      mood: 'Patient',
      patienceMax: c.patienceMax,
      preferredPayment: 'cash',
      dialogue: {
        fairPrice: ['Thank you, Pharmacist. God bless your shop.'],
        overpriced: ['Ah-ah, that price is too much!'],
        wrongProduct: ['This is not what I asked for!'],
        exceedsBudget: ['My money no reach for that one.'],
      },
    };
  }

  public dispose(): void {
    this.stop();
    this.viewport.dispose();
    this.input.dispose();
    this.staff.dispose();
  }
}
