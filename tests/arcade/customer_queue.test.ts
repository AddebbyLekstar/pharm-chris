import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ArcadeCustomer } from '../../src/ui/arcade/ArcadeCustomer';
import { ArcadeCustomerQueue } from '../../src/ui/arcade/ArcadeCustomerQueue';
import { DialogueModal } from '../../src/ui/arcade/DialogueModal';
import { PharmacyShelves3D } from '../../src/ui/arcade/PharmacyShelves3D';
import { PharmChrisEngine } from '../../src/sim/engine';

describe('Task 5: Customer Queuing & Hybrid Counter Interaction', () => {
  let engine: PharmChrisEngine;
  let shelves: PharmacyShelves3D;
  let queue: ArcadeCustomerQueue;

  beforeEach(() => {
    engine = new PharmChrisEngine();
    shelves = new PharmacyShelves3D(engine.getAllProducts());
    queue = new ArcadeCustomerQueue({ engine, shelves, maxQueue: 5 });
  });

  it('spawns customers and arranges them in queue order', () => {
    expect(queue.queueLength).toBe(0);
    queue.spawnCustomer();
    expect(queue.queueLength).toBe(1);

    const firstCust = queue.getFrontCustomer();
    expect(firstCust).toBeDefined();
    expect(firstCust?.state).toBe('walking');
  });

  it('advances customers along queue slots towards counter', () => {
    queue.spawnCustomer();
    queue.spawnCustomer();

    // Step queue forward by 3.0s to let customers arrive at counter positions
    for (let i = 0; i < 30; i++) {
      queue.update(0.1);
    }

    const front = queue.getFrontCustomer();
    expect(front?.state).toBe('serving');
    expect(front?.position.z).toBeCloseTo(2.8, 1);
  });

  it('identifies story customers for hybrid interaction modal', () => {
    // Engine day 1 first customer is Mama Ngozi (story)
    const custData = engine.getCurrentCustomer();
    const arcadeCust = new ArcadeCustomer(custData, 0);
    expect(arcadeCust.isStoryCustomer).toBe(true);

    // General random rush customer is not a story character
    const rushCustData = { ...custData, id: 'cust_rush_random_99' };
    const rushArcadeCust = new ArcadeCustomer(rushCustData, 1);
    expect(rushArcadeCust.isStoryCustomer).toBe(false);
  });

  it('auto-serves standard customer when cashier zone is active and stock is available', () => {
    // Spawn a standard non-story customer directly at counter
    const genericCust = { ...engine.getCurrentCustomer(), id: 'cust_standard_rush' };
    const cust = queue.injectCustomer(genericCust, 'serving');

    const initialShelvesAntimalarial = shelves.getStock('antimalarial');
    const res = queue.processCounterService(true); // Cashier player is present at counter

    expect(res).toBeDefined();
    expect(res?.success).toBe(true);
    expect(cust.state).toBe('leaving');
  });

  it('renders dialogue modal structure for story negotiations', () => {
    const modal = new DialogueModal();
    const container = { appendChild: () => {}, innerHTML: '' } as any;
    modal.mount(container);

    const mamaNgozi = engine.getCurrentCustomer();
    modal.open({
      customer: mamaNgozi,
      engine,
      onComplete: () => {},
    });

    expect(modal.isOpen).toBe(true);
    expect(modal.getOfferedPrice()).toBeGreaterThan(0);

    modal.close();
    expect(modal.isOpen).toBe(false);
  });
});
