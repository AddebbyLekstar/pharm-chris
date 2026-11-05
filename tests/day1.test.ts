import { describe, it, expect, beforeEach } from 'vitest';
import { PharmChrisEngine, PRODUCTS_MAP } from '../src/sim/engine';

describe('Day 1 Script & Sequence - Full Verification', () => {
  let engine: PharmChrisEngine;

  beforeEach(() => {
    engine = new PharmChrisEngine();
  });

  it('0:00 Shutters Up: initializes with exact Day 1 baseline values', () => {
    const state = engine.getState();
    expect(state.day).toBe(1);
    expect(state.debt).toBe(4200000); // Chief Okonkwo ₦4.2M
    expect(state.daysRemaining).toBe(90); // UK Visa clock
    expect(state.cash).toBe(150000); // ₦150k start cash
    expect(state.trust).toBe(50); // Trust starts at 50
    expect(state.day1Phase).toBe('shutters');
    expect(engine.getPhase()).toBe('shutters');
  });

  it('0:30 First Sale: Mama Ngozi buys FeverEase Extra (Trust +1, Cash +₦1,200)', () => {
    const cust1 = engine.getCurrentCustomer();
    expect(cust1.id).toBe('cust_mama_ngozi');
    expect(cust1.name).toBe('Mama Ngozi');
    expect(cust1.symptomLabel).toBe('Headache, body hot since yesterday');

    const feverEase = PRODUCTS_MAP.get('prd_feverease_extra')!;
    expect(feverEase).toBeDefined();
    expect(cust1.matchedProductIds).toContain('prd_feverease_extra');

    const fairBand = engine.calculateFairBand(feverEase);
    expect(fairBand.standard).toBe(1200);

    const result = engine.executeTransaction({
      productId: 'prd_feverease_extra',
      offeredPrice: 1200,
      paymentMethod: 'pos_transfer',
    });

    expect(result.success).toBe(true);
    expect(result.cashDelta).toBe(1200);
    expect(result.trustDelta).toBe(1); // Brief: Mama Ngozi First Sale gives Trust +1
    expect(result.customerDialogue.text).toContain("Auntie's hand");

    const state = engine.getState();
    expect(state.cash).toBe(151200);
    expect(state.trust).toBe(51);
    expect(state.inventory['prd_feverease_extra']).toBe(14);
    expect(state.day1Stats.mamaNgoziServed).toBe(true);
  });

  it('1:30 Wallet Limit & Unit Dispensing: Emeka buys 4 tablets of Painaway 500 (Trust +2, Cash +₦200)', () => {
    // Move to Emeka
    const emeka = engine.nextCustomer();
    expect(emeka.id).toBe('cust_emeka');
    expect(emeka.name).toBe('Emeka');
    expect(emeka.symptoms).toContain('waist_pain');

    const painaway = PRODUCTS_MAP.get('prd_painaway_500')!;
    expect(painaway.fractionalAllowed).toBe(true);

    // Calculate fair band for 4 tablets
    const unitFairBand = engine.calculateFairBand(painaway, 4);
    expect(unitFairBand.standard).toBe(200); // 4 tabs * 50 = 200
    expect(unitFairBand.min).toBe(161); // 4 * 35 = 140 * 1.15 = 161
    expect(unitFairBand.max).toBe(210); // 140 * 1.50 = 210

    const initialStock = engine.getStock('prd_painaway_500'); // 24
    const initialCash = engine.getState().cash;
    const initialTrust = engine.getState().trust;

    const result = engine.executeTransaction({
      productId: 'prd_painaway_500',
      offeredPrice: 200,
      paymentMethod: 'cash',
      isFractional: true,
      fractionalUnits: 4,
    });

    expect(result.success).toBe(true);
    expect(result.isFractional).toBe(true);
    expect(result.fractionalUnits).toBe(4);
    expect(result.cashDelta).toBe(200);
    expect(result.trustDelta).toBe(2); // Brief: Fitted to wallet / unit dispensing gives Trust +2
    expect(result.customerDialogue.text).toContain('correct guy');

    const state = engine.getState();
    expect(state.cash).toBe(initialCash + 200);
    expect(state.trust).toBe(initialTrust + 2);
    expect(state.inventory['prd_painaway_500']).toBe(Number((initialStock - 0.4).toFixed(2)));
    expect(state.day1Stats.emekaServed).toBe(true);
  });

  it('rejects unit dispensing on non-fractional medicines like antibiotics or syrups', () => {
    const coughSyrup = PRODUCTS_MAP.get('prd_coughcalm_elixir')!;
    expect(coughSyrup.fractionalAllowed).toBe(false);

    const result = engine.executeTransaction({
      productId: 'prd_coughcalm_elixir',
      offeredPrice: 500,
      paymentMethod: 'cash',
      isFractional: true,
      fractionalUnits: 2,
    });

    expect(result.success).toBe(false);
    expect(result.customerDialogue.text).toContain('cannot cut');
  });

  it('rejects unit dispensing if price exceeds fair band margin', () => {
    const emeka = engine.nextCustomer();
    expect(emeka.id).toBe('cust_emeka');

    const result = engine.executeTransaction({
      productId: 'prd_painaway_500',
      offeredPrice: 450, // Way above fair max (210) and above Emeka budget (250)
      paymentMethod: 'cash',
      isFractional: true,
      fractionalUnits: 4,
    });

    expect(result.success).toBe(false);
  });

  it('2:30 The Ledger: can record Auntie Joke ledger open event', () => {
    engine.openLedger();
    expect(engine.getPhase()).toBe('ledger');
    expect(engine.getState().day1Stats.ledgerOpened).toBe(true);
  });

  it('3:15 Evening Tally: balances day 1 finances exactly to ₦151,400 Cash and 53 Trust', () => {
    // Step 1: Mama Ngozi sale
    engine.executeTransaction({
      productId: 'prd_feverease_extra',
      offeredPrice: 1200,
      paymentMethod: 'pos_transfer',
    });

    // Step 2: Emeka unit sale
    engine.nextCustomer();
    engine.executeTransaction({
      productId: 'prd_painaway_500',
      offeredPrice: 200,
      paymentMethod: 'cash',
      isFractional: true,
      fractionalUnits: 4,
    });

    const summary = engine.getDay1Summary();
    expect(summary.startingCash).toBe(150000);
    expect(summary.cashEarned).toBe(1400);
    expect(summary.cash).toBe(151400);
    expect(summary.trust).toBe(53);
    expect(summary.debt).toBe(4200000);
    expect(summary.daysRemaining).toBe(90);
  });

  it('4:15 The Choice & Day 2 Teaser: records supplier choice correctly', () => {
    engine.recordDay1Choice('dele');
    expect(engine.getDay1Choice()).toBe('dele');
    expect(engine.getPhase()).toBe('day2_teaser');

    engine.recordDay1Choice('okonkwo');
    expect(engine.getDay1Choice()).toBe('okonkwo');
    expect(engine.getPhase()).toBe('day2_teaser');
  });
});
