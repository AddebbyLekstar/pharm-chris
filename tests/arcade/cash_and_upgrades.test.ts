import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CashDropManager } from '../../src/ui/arcade/CashDropManager';
import { FloorUpgradePad } from '../../src/ui/arcade/FloorUpgradePad';
import { ArcadeJuice } from '../../src/ui/arcade/ArcadeJuice';
import { ArcadePlayer } from '../../src/ui/arcade/ArcadePlayer';

describe('Task 6: Cash Drops, Floor Upgrade Pads & Juice Effects', () => {
  let cashManager: CashDropManager;
  let upgradePad: FloorUpgradePad;
  let juice: ArcadeJuice;
  let player: ArcadePlayer;

  beforeEach(() => {
    cashManager = new CashDropManager();
    upgradePad = new FloorUpgradePad({
      id: 'upgrade_speed',
      title: 'Run Faster',
      cost: 2000,
      position: new THREE.Vector3(-2, 0, -2),
      radius: 1.5,
    });
    juice = new ArcadeJuice();
    player = new ArcadePlayer();
  });

  it('spawns cash bundles and collects them when player is near', () => {
    expect(cashManager.activeCashCount).toBe(0);
    const drop = cashManager.spawnCash(new THREE.Vector3(0, 1.2, 1.5), 2500);
    expect(cashManager.activeCashCount).toBe(1);
    expect(drop.amount).toBe(2500);

    // Move player close to cash drop
    player.position.set(0, 0, 1.5);
    const collected = cashManager.update(0.1, player.position);
    expect(collected).toBe(2500);
    expect(cashManager.activeCashCount).toBe(0);
  });

  it('charges upgrade pad as player stands on it when having sufficient funds', () => {
    player.position.copy(upgradePad.position);

    let purchased = false;
    upgradePad.onPurchased = () => {
      purchased = true;
    };

    // Step 0.5s with sufficient player funds
    let spent = upgradePad.update(0.5, player.position, 5000);
    expect(spent).toBeGreaterThan(0);
    expect(upgradePad.progress).toBeGreaterThan(0);
    expect(purchased).toBe(false);

    // Step remaining time to complete purchase
    spent += upgradePad.update(1.5, player.position, 5000);
    expect(upgradePad.progress).toBe(1);
    expect(purchased).toBe(true);
  });

  it('triggers juice effects for floating text and camera shakes', () => {
    expect(() => {
      juice.spawnFloatingText('+₦2,500', new THREE.Vector3(0, 2, 0), '#00E676');
      juice.triggerScreenShake(0.3);
    }).not.toThrow();

    expect(juice.shakeIntensity).toBeGreaterThan(0);
    juice.update(0.4);
    expect(juice.shakeIntensity).toBe(0);
  });
});
