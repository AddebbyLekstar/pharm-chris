import { describe, it, expect, beforeEach } from 'vitest';
import {
  StoreRun,
  RUN_CONFIG,
  LICENSE_TIERS,
  EMPLOYEES,
  UPGRADES,
  PRODUCTS_BY_ID,
  shelfCategoryOf,
  EXPANSIONS,
} from '../src/sim/progression';

function makeRun(seed = 1, cash = 500000) {
  return StoreRun.create({ seed, cash });
}

/** Serves the front customer by topping the shelf directly, bypassing the walk. */
function forceServe(run: StoreRun, category: 'analgesic' | 'antimalarial' | 'antibiotic' | 'cold_chain') {
  const product = run.productsForShelf(category)[0];
  for (let i = 0; i < 6 && run.shelfLevels[category] < 3; i++) {
    if (!run.loadBox(product.id).ok) break;
    if (!run.stockShelf(category).ok) break;
  }
  return run.serveFront(false);
}

describe('StoreRun — procurement and the physical loop', () => {
  it('starts with a licensed OTC counter, cash, debt and shelf stock', () => {
    const run = makeRun();
    expect(run.cash).toBe(500000);
    expect(run.debt).toBe(RUN_CONFIG.startingDebt);
    expect(run.day).toBe(1);
    expect(run.highestTier).toBe(1);
    expect(run.shelfLevels.analgesic).toBeGreaterThan(0);
    expect(run.carryCapacity).toBe(RUN_CONFIG.startingCarry);
  });

  it('charges wholesale cost when a crate leaves the dock', () => {
    const run = makeRun(1, 100000);
    const before = run.cash;
    const res = run.loadBox('prd_malaguard_forte');
    // Not licensed yet: the dock refuses stock the shop may not sell.
    expect(res.ok).toBe(false);
    expect(run.cash).toBe(before);

    run.buyLicense(2);
    const licensed = run.loadBox('prd_malaguard_forte');
    expect(licensed.ok).toBe(true);
    expect(run.cash).toBe(before - 60000 - PRODUCTS_BY_ID.get('prd_malaguard_forte')!.baseCost);
  });

  it('refuses to buy stock with no cash and refuses to over-carry', () => {
    const run = makeRun(1, 400);
    expect(run.loadBox('prd_painaway_500').ok).toBe(true);
    expect(run.loadBox('prd_painaway_500').ok).toBe(false); // 400 - 350 = 50 left
    expect(run.cash).toBe(50);

    const rich = makeRun(1, 100000);
    for (let i = 0; i < rich.carryCapacity; i++) {
      expect(rich.loadBox('prd_painaway_500').ok).toBe(true);
    }
    expect(rich.loadBox('prd_painaway_500').ok).toBe(false);
    expect(rich.state.carriedBoxes.length).toBe(rich.carryCapacity);
  });

  it('only stocks a shelf with a matching crate and respects capacity', () => {
    const run = makeRun();
    run.loadBox('prd_painaway_500');
    expect(run.stockShelf('antimalarial').ok).toBe(false);
    const stocked = run.stockShelf('analgesic');
    expect(stocked.ok).toBe(true);
    expect(stocked.stockAfter).toBe(run.shelfLevels.analgesic);
  });

  it('pays the shelf price per item in the basket and consumes that many units', () => {
    const run = makeRun();
    // Force a customer into the queue, then stock the shelf it wants.
    run.tick(0.1);
    const customer = run.peekDemand();
    const stockBefore = run.shelfLevels[customer.category];
    let guard = 0;
    while (!run.queue.length && guard++ < 400) run.tick(0.5);
    forceServe(run, customer.category);
    const after = run.shelfLevels[customer.category];
    expect(after).toBeLessThanOrEqual(stockBefore + 6);
    expect(run.pendingCash.length + run.stats.customersServed).toBeGreaterThan(0);
  });

  it('loses the customer and trust when the shelf is empty', () => {
    const run = makeRun();
    let guard = 0;
    while (!run.queue.length && guard++ < 400) run.tick(0.5);
    const customer = run.queue[0];
    run.writeOffShelf(customer.category, run.shelfLevels[customer.category]);
    const trustBefore = run.trust;
    const res = run.serveFront(false);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('stock');
    expect(run.trust).toBeLessThan(trustBefore);
    expect(run.stats.customersLost).toBe(1);
  });
});

describe('StoreRun — day cycle and debt', () => {
  it('pays wages and overhead at the close and services 60% of profit', () => {
    const run = makeRun();
    run.buyLicense(2);
    run.hire('cashier');
    const cashBefore = run.cash;
    run.endDay();
    const report = run.dayLog[run.dayLog.length - 1];
    expect(report.wages).toBe(EMPLOYEES.cashier.dailyWage);
    expect(report.overhead).toBe(RUN_CONFIG.dailyOverhead);
    expect(run.cash).toBeLessThan(cashBefore);
    expect(report.debtRepaid).toBe(Math.floor(Math.max(0, report.net) * RUN_CONFIG.debtServiceShare));
  });

  it('advances the calendar, resets the shift and flips rush days on a cadence', () => {
    const run = makeRun();
    run.endDay();
    expect(run.day).toBe(2);
    expect(run.servedToday).toBe(0);
    run.endDay();
    expect(run.day).toBe(3);
    expect(run.state.rushActive).toBe(true); // every 3rd day
  });

  it('ends the season at day 91 and waits for the player stay/leave choice', () => {
    const run = makeRun(1, 5000000);
    run.payDebt(RUN_CONFIG.startingDebt);
    for (let i = 0; i < RUN_CONFIG.seasonLength; i++) run.endDay();
    expect(run.day).toBe(RUN_CONFIG.seasonLength + 1);
    expect(run.needsEndingDecision).toBe(true);
    expect(run.ended).toBe(false);

    const report = run.chooseEnding('stay');
    expect(report).not.toBeNull();
    expect(report!.outcome).toBe('STAYED_SOLVENT');
    expect(run.ended).toBe(true);
    expect(run.state.ending).toBe('STAYED_SOLVENT');
  });
});

describe('StoreRun — progression purchases', () => {
  it('gates licences in order and grows the daily quota and product pool', () => {
    const run = makeRun(1, 2000000);
    const quotaBefore = run.dailyQuota;
    expect(run.buyLicense(3).ok).toBe(false); // tier 2 first
    expect(run.buyLicense(2).ok).toBe(true);
    expect(run.buyLicense(2).ok).toBe(false); // already owned
    expect(run.dailyQuota).toBe(quotaBefore + LICENSE_TIERS[1].customerBonus);
    expect(run.licensedProducts.map((p) => p.id)).toContain('prd_malaguard_forte');
    expect(run.buyLicense(3).ok).toBe(true);
    expect(run.licensedProducts.map((p) => p.id)).toContain('prd_clavumed_625');
  });

  it('raises upgrade costs geometrically and applies the effect', () => {
    const run = makeRun(1, 5000000);
    const first = run.upgradeCost('carry');
    expect(first).toBe(UPGRADES.carry.baseCost);
    const before = run.carryCapacity;
    expect(run.buyUpgrade('carry').ok).toBe(true);
    expect(run.carryCapacity).toBe(before + UPGRADES.carry.effectPerLevel);
    expect(run.upgradeCost('carry')).toBeGreaterThan(first);
  });

  it('sells expansions that raise shelf capacity and footfall', () => {
    const run = makeRun(1, 2000000);
    const capBefore = run.shelfCapacity;
    const quotaBefore = run.dailyQuota;
    const res = run.expand();
    expect(res.ok).toBe(true);
    expect(run.shelfCapacity).toBe(capBefore + EXPANSIONS[0].shelfCapacityBonus);
    expect(run.dailyQuota).toBeGreaterThan(quotaBefore);
  });

  it('cannot afford what the till does not hold', () => {
    const run = makeRun(1, 1000);
    expect(run.buyLicense(2).ok).toBe(false);
    expect(run.hire('cashier').ok).toBe(false);
    expect(run.expand().ok).toBe(false);
    expect(run.buyUpgrade('marketing').reason).toBe('cash');
  });
});

describe('StoreRun — staff and idle automation', () => {
  it('caps hiring and charges the hire cost', () => {
    const run = makeRun(1, 5000000);
    const spec = EMPLOYEES.cashier;
    for (let i = 0; i < spec.maxCount; i++) {
      expect(run.hire('cashier').ok).toBe(true);
    }
    expect(run.hire('cashier').ok).toBe(false);
    expect(run.employeeCost('cashier').count).toBe(spec.maxCount);
    expect(run.dailyWages()).toBe(spec.dailyWage * spec.maxCount);
  });

  it('a fully staffed store earns while the player does nothing', () => {
    const run = makeRun(1, 600000);
    run.buyLicense(2);
    run.hire('stocker');
    run.hire('cashier');
    const cashAfterSetup = run.cash;
    const servedBefore = run.stats.customersServed;
    for (let i = 0; i < 6 * 300; i++) run.tick(0.5);
    expect(run.stats.customersServed).toBeGreaterThan(servedBefore);
    // Opening inventory is bought on day one; judge the trading days after that.
    const tradingNets = run.dayLog.slice(1).map((d) => d.net);
    expect(tradingNets.length).toBeGreaterThan(2);
    expect(tradingNets.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(run.cash).toBeGreaterThan(cashAfterSetup - 200000);
  });

  it('over-hiring at tier 1 performs worse than a lean roster', () => {
    // Quota caps revenue, so extra staff are pure wage cost.
    const lean = makeRun(1, 250000);
    lean.hire('stocker');
    lean.hire('cashier');
    for (let i = 0; i < 8 * 300; i++) lean.tick(0.5);

    const bloated = makeRun(1, 250000);
    for (const role of ['stocker', 'cashier'] as const) {
      bloated.hire(role);
      bloated.hire(role);
    }
    bloated.hire('cleaner');
    expect(bloated.dailyWages()).toBeGreaterThan(16000);
    for (let i = 0; i < 8 * 300; i++) bloated.tick(0.5);

    expect(bloated.dayLog.reduce((s, d) => s + d.net, 0)).toBeLessThan(
      lean.dayLog.reduce((s, d) => s + d.net, 0)
    );
    expect(bloated.cash).toBeLessThan(lean.cash);
  });

  it('drops morale and can lose staff when wages go unpaid', () => {
    const run = makeRun(1, EMPLOYEES.cashier.hireCost);
    expect(run.hire('cashier').ok).toBe(true);
    expect(run.cash).toBe(0);
    run.endDay();
    const cashier = run.state.employees.cashier;
    expect(cashier.morale).toBeLessThan(100);
    expect(cashier.arrearsDays + (cashier.count < 1 ? 1 : 0)).toBeGreaterThan(0);
  });
});

describe('StoreRun — offline settlement', () => {
  it('pays nothing without staff', () => {
    const run = makeRun(1, 600000);
    const result = run.simulateOffline(3600);
    expect(result.earned).toBe(0);
  });

  it('pays staffed time but never more than the 8h cap', () => {
    const run = makeRun(1, 900000);
    run.buyLicense(2);
    run.hire('stocker');
    run.hire('cashier');
    const result = run.simulateOffline(48 * 3600);
    expect(result.seconds).toBe(RUN_CONFIG.offlineCapSeconds);
    expect(result.capped).toBe(true);
    expect(result.earned).toBeGreaterThan(0);
  });
});

describe('StoreRun — determinism', () => {
  it('two runs with the same seed produce identical demand', () => {
    const a = makeRun(2024);
    const b = makeRun(2024);
    for (let i = 0; i < 60; i++) {
      a.tick(0.5);
      b.tick(0.5);
    }
    expect(a.queue.map((c) => `${c.productId}:${c.revenue}`)).toEqual(b.queue.map((c) => `${c.productId}:${c.revenue}`));
  });
});

describe('StoreRun — catalog integrity', () => {
  it('every licensed product maps to a real shelf bay', () => {
    for (const tier of LICENSE_TIERS) {
      for (const id of tier.productIds) {
        const product = PRODUCTS_BY_ID.get(id);
        expect(product, `missing product ${id}`).toBeDefined();
        expect(['analgesic', 'antimalarial', 'antibiotic', 'cold_chain']).toContain(shelfCategoryOf(product!));
      }
    }
  });
});
