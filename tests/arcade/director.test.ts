import { describe, it, expect, beforeEach } from 'vitest';
import { ArcadeGameDirector } from '../../src/ui/arcade/ArcadeGameDirector';
import { PharmChrisEngine } from '../../src/sim/engine';
import { StoreRun, shelfCategoryOf, PRODUCTS_BY_ID } from '../../src/sim/progression';

/**
 * Integration tests for the arcade shell. The economy (StoreRun) owns every
 * number; the 3D layer is a view. These tests drive the real tick loop and
 * assert the view and the simulation agree.
 */
describe('ArcadeGameDirector — economy integration', () => {
  let engine: PharmChrisEngine;
  let run: StoreRun;
  let director: ArcadeGameDirector;

  const walkTo = (zoneId: string) => {
    const zone = director.zoneManager.getZone(zoneId)!;
    director.player.position.copy(zone.position);
  };

  const tickFor = (seconds: number, step = 0.1) => {
    for (let t = 0; t < seconds; t += step) director.tick(step);
  };

  beforeEach(() => {
    engine = new PharmChrisEngine();
    run = StoreRun.create({ seed: 3 });
    director = new ArcadeGameDirector({ engine, run });
  });

  it('initializes every subsystem against the supplied run', () => {
    expect(director.viewport).toBeDefined();
    expect(director.scene).toBeDefined();
    expect(director.player).toBeDefined();
    expect(director.stack).toBeDefined();
    expect(director.shelves).toBeDefined();
    expect(director.zoneManager).toBeDefined();
    expect(director.customerQueue).toBeDefined();
    expect(director.cashManager).toBeDefined();
    expect(director.juice).toBeDefined();
    expect(director.staff).toBeDefined();
    expect(director.run).toBe(run);
    expect(director.stack.maxCapacity).toBe(run.carryCapacity);
  });

  it('runs the loop without throwing when nothing is happening', () => {
    expect(() => tickFor(2)).not.toThrow();
  });

  it('banks a real sale into the economy once the player picks the cash up', () => {
    // Wait for a customer the run actually generated.
    let guard = 0;
    while (!run.queue.length && guard++ < 200) director.tick(0.1);
    expect(run.queue.length).toBeGreaterThan(0);
    const wanted = run.queue[0].category;

    // Stock the shelf so the sale can go through.
    const product = run.productsForShelf(wanted)[0];
    for (let i = 0; i < 3; i++) {
      if (!run.loadBox(product.id).ok) break;
      if (!run.stockShelf(wanted).ok) break;
    }

    // Stand at the register first: cash drops where the sale happened.
    walkTo('counter_cashier');
    const sale = run.serveFront(false);
    expect(sale.ok).toBe(true);
    const before = run.cash;

    // One tick drains the cash_dropped event into a 3D bundle beside the player.
    director.tick(0.1);
    expect(director.cashManager.activeCashCount).toBe(1);
    for (let i = 0; i < 60; i++) director.tick(0.05);

    expect(run.cash).toBe(before + (sale.revenue ?? 0));
    expect(run.pendingCash.length).toBe(0);
  });

  it('buys stock at the dock and puts the crate on the player stack', () => {
    walkTo('dock');
    const before = run.cash;
    tickFor(1.5);
    expect(run.cash).toBeLessThan(before);
    expect(director.stack.count).toBeGreaterThan(0);
    expect(run.state.carriedBoxes.length).toBe(director.stack.count);
  });

  it('stocks the matching shelf and mirrors the number into the 3D view', () => {
    walkTo('dock');
    tickFor(0.6);
    const carried = run.state.carriedBoxes[0];
    expect(carried).toBeDefined();
    const product = PRODUCTS_BY_ID.get(carried.productId)!;
    const category = shelfCategoryOf(product);
    const before = run.shelfLevels[category];

    walkTo(`shelf_${category === 'cold_chain' ? 'cold_chain' : category}`);
    tickFor(0.5);

    expect(run.shelfLevels[category]).toBeGreaterThan(before);
    expect(director.shelves.getStock(category)).toBe(run.shelfLevels[category]);
  });

  it('serves the queue at the counter and drops cash on the floor', () => {
    // Wait for a customer, then stand at the register.
    tickFor(9);
    expect(run.queue.length).toBeGreaterThan(0);
    const wanted = run.queue[0].category;
    // Make sure the shelf can fill the basket.
    for (let i = 0; i < 3; i++) {
      const product = run.productsForShelf(wanted)[0];
      run.loadBox(product.id);
      run.stockShelf(wanted);
    }
    walkTo('counter_cashier');
    tickFor(6);

    expect(run.stats.customersServed).toBeGreaterThan(0);
    expect(run.stats.revenue).toBeGreaterThan(0);
  });

  it('applies upgrades through the economy and the view', () => {
    const beforeCapacity = director.stack.maxCapacity;
    const beforeSpeed = director.player.speedMultiplier;
    run.buyUpgrade('carry');
    run.buyUpgrade('speed');
    director.applyUpgrade('upgrade_stack');
    director.applyUpgrade('upgrade_speed');
    expect(director.stack.maxCapacity).toBeGreaterThan(beforeCapacity);
    expect(director.player.speedMultiplier).toBeGreaterThan(beforeSpeed);
  });

  it('shows staff in the 3D scene only when they are actually hired', () => {
    expect(director.staff.group.children.length).toBe(0);
    run.hire('cashier');
    director.staff.sync(run);
    expect(director.staff.group.children.length).toBe(1);
    run.fire('cashier');
    director.staff.sync(run);
    expect(director.staff.group.children.length).toBe(0);
  });

  it('rebuilds expansion geometry without leaving the old meshes behind', () => {
    const before = director.scene.group.children.length;
    run.expand();
    director.syncFromRun();
    const afterFirst = director.scene.group.children.length;
    expect(afterFirst).toBeGreaterThan(before);
    director.syncFromRun();
    expect(director.scene.group.children.length).toBe(afterFirst);
  });

  it('reports renderer counters for the performance budget', () => {
    const perf = director.perfStats();
    expect(typeof perf.drawCalls).toBe('number');
    expect(typeof perf.frameMs).toBe('number');
  });
});
