import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ArcadeGameDirector } from '../../src/ui/arcade/ArcadeGameDirector';
import { PharmChrisEngine } from '../../src/sim/engine';

describe('Task 7: ArcadeGameDirector Integration', () => {
  let engine: PharmChrisEngine;
  let director: ArcadeGameDirector;

  beforeEach(() => {
    engine = new PharmChrisEngine();
    director = new ArcadeGameDirector({ engine });
  });

  it('initializes all sub-modules coherently', () => {
    expect(director.viewport).toBeDefined();
    expect(director.scene).toBeDefined();
    expect(director.player).toBeDefined();
    expect(director.stack).toBeDefined();
    expect(director.shelves).toBeDefined();
    expect(director.zoneManager).toBeDefined();
    expect(director.customerQueue).toBeDefined();
    expect(director.cashManager).toBeDefined();
    expect(director.juice).toBeDefined();
  });

  it('runs game loop tick updating player, queue, and physics', () => {
    expect(() => {
      director.tick(0.016);
    }).not.toThrow();
  });

  it('handles cash drops from counter transactions into engine funds', () => {
    const initialFunds = engine.getState().cash;
    // Spawn cash at player position
    director.cashManager.spawnCash(director.player.position.clone(), 1500);
    director.tick(0.016);

    expect(engine.getState().cash).toBe(initialFunds + 1500);
  });

  it('executes floor upgrade application properly', () => {
    const initialMaxCapacity = director.stack.maxCapacity;
    director.applyUpgrade('upgrade_stack');
    expect(director.stack.maxCapacity).toBeGreaterThan(initialMaxCapacity);

    const initialSpeed = director.player.speedMultiplier;
    director.applyUpgrade('upgrade_speed');
    expect(director.player.speedMultiplier).toBeGreaterThan(initialSpeed);
  });

  it('shows floating text warning when shelf is empty at checkout counter', () => {
    // Move player to cashier counter zone
    const counterZone = director.zoneManager.getZone('counter_cashier')!;
    director.player.position.copy(counterZone.position);

    // Deplete antimalarial shelf stock
    const malarStock = director.shelves.getStock('antimalarial');
    director.shelves.consumeStock('antimalarial', malarStock);

    // Inject a non-story customer wanting antimalarial at counter
    const genericCust = {
      ...engine.getCurrentCustomer(),
      id: 'cust_rush_need_malar',
      matchedProductIds: ['prd_malaguard_forte'],
    };
    director.customerQueue.injectCustomer(genericCust, 'serving');

    // Tick director
    director.tick(0.016);

    // Check floating text in juice
    // Juice records floating text
    const texts = (director.juice as any).floatingTexts;
    expect(texts.length).toBeGreaterThan(0);
    expect(texts[0].text).toContain('SHELF EMPTY: ANTIMALARIAL!');
  });

  it('handles dialogue cancellation without stalling queue at counter', () => {
    const counterZone = director.zoneManager.getZone('counter_cashier')!;
    director.player.position.copy(counterZone.position);

    // Story customer at counter
    const storyCustData = { ...engine.getCurrentCustomer(), id: 'cust_mama_ngozi' };
    const storyCust = director.customerQueue.injectCustomer(storyCustData, 'serving');

    director.tick(0.016);
    expect(director.dialogueModal.isOpen).toBe(true);

    // Cancel/decline dialogue
    director.dialogueModal.close();
    expect(director.dialogueModal.isOpen).toBe(false);
    expect(storyCust.state).toBe('leaving');
  });
});
