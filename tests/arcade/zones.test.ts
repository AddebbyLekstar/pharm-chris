import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { TriggerZone, TriggerZoneManager } from '../../src/ui/arcade/TriggerZone';
import { PharmacyShelves3D } from '../../src/ui/arcade/PharmacyShelves3D';
import { ArcadePlayer } from '../../src/ui/arcade/ArcadePlayer';
import { MedicineStack } from '../../src/ui/arcade/MedicineStack';
import { PharmChrisEngine } from '../../src/sim/engine';

describe('Task 4: TriggerZone & PharmacyShelves3D', () => {
  let engine: PharmChrisEngine;
  let player: ArcadePlayer;
  let stack: MedicineStack;
  let shelves: PharmacyShelves3D;
  let zoneManager: TriggerZoneManager;

  beforeEach(() => {
    engine = new PharmChrisEngine();
    player = new ArcadePlayer();
    stack = new MedicineStack({ anchor: player.stackSocket, maxCapacity: 5 });
    shelves = new PharmacyShelves3D(engine.getAllProducts());
    zoneManager = new TriggerZoneManager({ shelves, engine });
  });

  it('detects player proximity within trigger radius', () => {
    const dockZone = zoneManager.getZone('dock');
    expect(dockZone).toBeDefined();

    // Move player right onto dock zone center
    player.position.copy(dockZone!.position);
    expect(dockZone!.isInside(player.position)).toBe(true);

    // Move player 10 units away
    player.position.set(10, 0, 10);
    expect(dockZone!.isInside(player.position)).toBe(false);
  });

  it('transfers stock from delivery dock to player stack with rate limit', () => {
    const dockZone = zoneManager.getZone('dock')!;
    player.position.copy(dockZone.position);

    expect(stack.count).toBe(0);
    // Step 0.25s (transfer cooldown is ~0.2s)
    zoneManager.update(0.25, player, stack);
    expect(stack.count).toBe(1);

    // Step another 0.25s
    zoneManager.update(0.25, player, stack);
    expect(stack.count).toBe(2);
  });

  it('restocks matching shelf when player stands in shelf zone', () => {
    // Put an antimalarial onto player stack
    const antimalarial = engine.getAllProducts().find((p) => p.category.toLowerCase().includes('malar'))!;
    stack.push(antimalarial);
    expect(stack.count).toBe(1);

    const malarShelfZone = zoneManager.getZone('shelf_antimalarial')!;
    player.position.copy(malarShelfZone.position);

    const initialShelfCount = shelves.getStock('antimalarial');
    zoneManager.update(0.25, player, stack);

    expect(stack.count).toBe(0);
    expect(shelves.getStock('antimalarial')).toBe(initialShelfCount + 1);
  });

  it('provides visual 3D shelf meshes and pulsing floor rings', () => {
    expect(shelves.group.children.length).toBeGreaterThan(0);
    const dockZone = zoneManager.getZone('dock')!;
    expect(dockZone.ringMesh).toBeDefined();
  });
});
