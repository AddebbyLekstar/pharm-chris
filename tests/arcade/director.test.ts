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
});
