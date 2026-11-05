import * as THREE from 'three';
import { PharmChrisEngine } from '../../sim/engine';
import { soundFx } from '../../audio/sfx';
import { ArcadeViewport } from './ArcadeViewport';
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

export interface ArcadeGameDirectorOptions {
  engine: PharmChrisEngine;
  container?: HTMLElement;
}

export class ArcadeGameDirector {
  public engine: PharmChrisEngine;
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
  public isRunning: boolean = false;

  private animFrameId: number | null = null;
  private lastTimestamp: number = 0;
  private container: HTMLElement | null = null;

  constructor(options: ArcadeGameDirectorOptions) {
    this.engine = options.engine;
    this.container = options.container ?? null;

    // 1. Scene & Environment
    this.scene = new ArcadeScene();

    // 2. Viewport & Camera
    this.viewport = new ArcadeViewport({ scene: this.scene.scene });

    // 3. Input Controller
    this.input = new InputController();

    // 4. Player & Movement
    this.player = new ArcadePlayer({ bounds: this.scene.getWalkableBounds() });
    this.scene.group.add(this.player.mesh);

    // 5. Medicine Carrying Stack
    this.stack = new MedicineStack({ anchor: this.player.stackSocket, maxCapacity: 5 });

    // 6. Shelves 3D
    this.shelves = new PharmacyShelves3D(this.engine.getAllProducts());
    this.scene.group.add(this.shelves.group);

    // 7. Trigger Zones
    this.zoneManager = new TriggerZoneManager({
      shelves: this.shelves,
      engine: this.engine,
    });
    this.scene.group.add(this.zoneManager.group);

    // 8. Customers & Queue
    this.customerQueue = new ArcadeCustomerQueue({
      engine: this.engine,
      shelves: this.shelves,
      maxQueue: 5,
    });
    this.scene.group.add(this.customerQueue.group);

    // 9. Cash Drops
    this.cashManager = new CashDropManager();
    this.scene.group.add(this.cashManager.group);

    // 10. Upgrade Pads
    this.setupUpgradePads();

    // 11. Story Modal & Juice
    this.dialogueModal = new DialogueModal();
    this.juice = new ArcadeJuice();

    if (this.container) {
      this.mount(this.container);
    }
  }

  private setupUpgradePads(): void {
    const stackPad = new FloorUpgradePad({
      id: 'upgrade_stack',
      title: '+2 Stack Capacity',
      cost: 3000,
      position: new THREE.Vector3(-2.8, 0, -2.5),
    });
    stackPad.onPurchased = () => this.applyUpgrade('upgrade_stack');
    this.upgradePads.push(stackPad);
    this.scene.group.add(stackPad.mesh);

    const speedPad = new FloorUpgradePad({
      id: 'upgrade_speed',
      title: '+35% Running Speed',
      cost: 4500,
      position: new THREE.Vector3(2.8, 0, -2.5),
    });
    speedPad.onPurchased = () => this.applyUpgrade('upgrade_speed');
    this.upgradePads.push(speedPad);
    this.scene.group.add(speedPad.mesh);
  }

  public applyUpgrade(id: string): void {
    if (id === 'upgrade_stack') {
      this.stack.maxCapacity += 2;
      this.juice.spawnFloatingText('STACK EXPANDED!', this.player.position, '#00E676');
      soundFx.playChimeSuccess?.();
    } else if (id === 'upgrade_speed') {
      this.player.speedMultiplier *= 1.35;
      this.juice.spawnFloatingText('SPEED BOOSTED!', this.player.position, '#FFD54F');
      soundFx.playChimeSuccess?.();
    }
  }

  public mount(container: HTMLElement): void {
    this.container = container;
    this.viewport.mount(container);
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
    const delta = Math.min(0.1, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;

    this.tick(delta);

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  public tick(delta: number): void {
    const dir = this.input.getDirection();

    // 1. Move Player & Update Stack
    this.player.update(delta, dir);
    this.stack.update(delta, dir);

    // 2. Trigger Zones
    this.zoneManager.update(delta, this.player, this.stack);

    // 3. Customer Queue
    this.customerQueue.update(delta);

    // 4. Cashier Counter check
    const cashierZone = this.zoneManager.getZone('counter_cashier');
    const isPlayerAtCounter = cashierZone ? cashierZone.isInside(this.player.position) : false;

    if (isPlayerAtCounter) {
      const frontCust = this.customerQueue.getFrontCustomer();
      if (frontCust && frontCust.state === 'serving') {
        if (frontCust.isStoryCustomer) {
          if (!this.dialogueModal.isOpen) {
            this.dialogueModal.open({
              customer: frontCust.data,
              engine: this.engine,
              onComplete: (res) => {
                if (res.success) {
                  this.cashManager.spawnCash(new THREE.Vector3(0, 1.2, 1.5), res.cashEarned);
                  frontCust.setLeaving();
                  soundFx.playChimeSuccess?.();
                }
              },
            });
          }
        } else {
          const serviceRes = this.customerQueue.processCounterService(true);
          if (serviceRes && serviceRes.success) {
            this.cashManager.spawnCash(new THREE.Vector3(0, 1.2, 1.5), serviceRes.cashEarned);
            this.juice.spawnFloatingText(`+₦${serviceRes.cashEarned}`, new THREE.Vector3(0, 1.6, 1.5), '#00E676');
            soundFx.playCoin?.();
          }
        }
      }
    }

    // 5. Cash Collection
    const collectedCash = this.cashManager.update(delta, this.player.position);
    if (collectedCash > 0) {
      this.engine.addCash(collectedCash);
      this.juice.spawnFloatingText(`+₦${collectedCash}`, this.player.position, '#00E676');
      this.juice.triggerScreenShake(0.1);
      soundFx.playCoin?.();
    }

    // 6. Upgrade Pads
    const currentCash = this.engine.getState().cash;
    for (const pad of this.upgradePads) {
      const spent = pad.update(delta, this.player.position, currentCash);
      if (spent > 0) {
        this.engine.deductCash(spent);
      }
    }

    // 7. Juice Update
    this.juice.update(delta);

    // 8. Camera Follow & Render
    this.viewport.updateCameraFollow(this.player.position, delta);
    if (this.juice.shakeIntensity > 0) {
      this.viewport.camera.position.add(this.juice.shakeOffset);
    }
    this.viewport.render();
  }

  public dispose(): void {
    this.stop();
    this.viewport.dispose();
    this.input.dispose();
  }
}
