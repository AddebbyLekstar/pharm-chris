import { describe, it, expect, beforeEach } from 'vitest';
import { Mulberry32 } from '../prng';
import { PharmChrisEngine, PRODUCTS_MAP } from '../engine';

describe('Mulberry32 PRNG', () => {
  it('produces deterministic pseudorandom sequences for same seed', () => {
    const rng1 = new Mulberry32(12345);
    const rng2 = new Mulberry32(12345);

    for (let i = 0; i < 20; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('generates values within bounds', () => {
    const rng = new Mulberry32(999);
    for (let i = 0; i < 100; i++) {
      const val = rng.range(5, 15);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThanOrEqual(15);
    }
  });
});

describe('PharmChrisEngine - Core Simulation', () => {
  let engine: PharmChrisEngine;

  beforeEach(() => {
    engine = new PharmChrisEngine();
  });

  it('initializes with Mama Ngozi as first customer', () => {
    const customer = engine.getCurrentCustomer();
    expect(customer.name).toBe('Mama Ngozi');
    expect(customer.budget).toBe(2500);
    expect(customer.matchedProductIds).toContain('prd_feverease_extra');
  });

  it('calculates fair band margins correctly (15% - 35%)', () => {
    const fev = PRODUCTS_MAP.get('prd_feverease_extra')!;
    expect(fev).toBeDefined();
    const band = engine.calculateFairBand(fev);
    // Cost 850: 1.15 * 850 = 977.5 -> 978, 1.35 * 850 = 1147.5 -> 1148
    expect(band.min).toBe(978);
    expect(band.max).toBe(1148);
  });

  it('completes successful sale when matched product is offered within budget and fair price', () => {
    const initialCash = engine.getState().cash;
    const initialTrust = engine.getState().trust;
    const initialStock = engine.getStock('prd_feverease_extra');

    const result = engine.executeTransaction({
      productId: 'prd_feverease_extra',
      offeredPrice: 1100,
      paymentMethod: 'cash',
    });

    expect(result.success).toBe(true);
    expect(result.cashDelta).toBe(1100);
    expect(result.trustDelta).toBeGreaterThan(0);
    expect(engine.getState().cash).toBe(initialCash + 1100);
    expect(engine.getState().trust).toBe(initialTrust + result.trustDelta);
    expect(engine.getStock('prd_feverease_extra')).toBe(initialStock - 1);
    expect(result.customerDialogue.tone).toBe('satisfied');
  });

  it('rejects overpriced attempts and docks trust without losing inventory', () => {
    const initialCash = engine.getState().cash;
    const initialStock = engine.getStock('prd_feverease_extra');
    const initialTrust = engine.getState().trust;

    const result = engine.executeTransaction({
      productId: 'prd_feverease_extra',
      offeredPrice: 1900, // Cost is 850, fair max is 1148
      paymentMethod: 'cash',
    });

    expect(result.success).toBe(false);
    expect(result.isOverpriced).toBe(true);
    expect(result.cashDelta).toBe(0);
    expect(result.trustDelta).toBeLessThan(0);
    expect(engine.getState().cash).toBe(initialCash);
    expect(engine.getStock('prd_feverease_extra')).toBe(initialStock);
    expect(engine.getState().trust).toBe(initialTrust + result.trustDelta);
    expect(result.customerDialogue.tone).toBe('scolded');
  });

  it('rejects wrong product recommendation with penalty', () => {
    // Offering Stomach mixture for fever
    const result = engine.executeTransaction({
      productId: 'prd_stomacare_susp',
      offeredPrice: 1400,
      paymentMethod: 'cash',
    });

    expect(result.success).toBe(false);
    expect(result.isWrongProduct).toBe(true);
    expect(result.trustDelta).toBe(-5);
  });

  it('rejects price when offered price exceeds customer budget', () => {
    // Mama Ngozi budget is 2500. Offer Malaguard at 4000
    const result = engine.executeTransaction({
      productId: 'prd_malaguard_forte',
      offeredPrice: 7000,
      paymentMethod: 'cash',
    });

    expect(result.success).toBe(false);
    expect(result.isAboveBudget).toBe(true);
  });

  it('cycles to next customer for replayability', () => {
    const c1 = engine.getCurrentCustomer();
    expect(c1.name).toBe('Mama Ngozi');
    const c2 = engine.nextCustomer();
    expect(c2.name).toBe('Emeka');
    const c3 = engine.nextCustomer();
    expect(c3.name).toBe('Bayo Driver');
    const c4 = engine.nextCustomer();
    expect(c4.name).toBe('Alabi Fintech');
  });
});
