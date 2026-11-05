import { describe, it, expect, beforeEach } from 'vitest';
import { PharmChrisEngine } from '../src/sim/engine';

describe('Timed rush, follow-ups, and evening ledger', () => {
  let engine: PharmChrisEngine;
  beforeEach(() => { engine = new PharmChrisEngine(); });

  it('starts a 120-second rush with ten featured customers in order', () => {
    const rush = engine.startDayRush();
    expect(rush.secondsRemaining).toBe(120);
    expect(rush.queue).toHaveLength(10);
    expect(rush.queue.map(c => c.name)).toEqual([
      'Mama Ngozi', 'Baba Ibrahim', 'Emeka', 'Nurse Ify', 'Bukola',
      'The Skeptic', 'The Rush Buyer', 'The Price Hunter', 'Bayo Driver', 'Alabi Fintech',
    ]);
  });

  it('advances the timer to zero and ends the rush exactly at 120 seconds', () => {
    engine.startDayRush();
    expect(engine.tickDayRush(75).secondsRemaining).toBe(45);
    expect(engine.tickDayRush(60).secondsRemaining).toBe(0);
    expect(engine.getPhase()).toBe('evening_tally');
  });

  it('resolves genuine and counterfeit follow-ups with cure odds and traced counterfeit penalties', () => {
    engine.startDayRush();
    engine.recordFollowUp({ customerName: 'Ada', productId: 'prd_feverease_extra', counterfeit: false });
    engine.recordFollowUp({ customerName: 'Kunle', productId: 'prd_malaguard_forte', counterfeit: true });
    const outcomes = engine.resolveFollowUps([0.05, 0.5]);
    expect(outcomes.map(o => o.cured)).toEqual([true, false]);
    expect(engine.getState().trust).toBe(40);
    expect(engine.getState().clues).toHaveLength(1);
  });

  it('tallies walk-in net, featured profit, overhead and accepts debt payment', () => {
    engine.startDayRush();
    engine.recordRushRevenue({ walkInRevenue: 12000, walkInCost: 4000, featuredRevenue: 6000, featuredCost: 2000 });
    const ledger = engine.closeDayLedger();
    expect(ledger.walkInNet).toBe(8000);
    expect(ledger.featuredProfit).toBe(4000);
    expect(ledger.overhead).toBe(8000);
    expect(ledger.net).toBe(4000);
    expect(engine.payDebt(2500)).toBe(2500);
    expect(engine.getState().debt).toBe(4197500);
  });

  it('offers a fuel decision during a blackout and uses trust-scaled walk-in coverage', () => {
    engine.startDayRush();
    const state = engine.getState();
    if (state.blackout) {
      expect(engine.getBackgroundWalkInCount()).toBe(0);
      expect(engine.decideGeneratorFuel(true)).toBe(true);
      expect(engine.getBackgroundWalkInCount()).toBeGreaterThan(0);
      expect(engine.getState().generatorFuel).toBe(0);
    }
  });

  it('builds the five-street health map from counterfeit traces', () => {
    engine.startDayRush();
    engine.recordFollowUp({ customerName: 'Kunle', productId: 'prd_malaguard_forte', counterfeit: true });
    engine.resolveFollowUps([0.9]);
    expect(engine.getStreetHealthMap()).toHaveLength(5);
    expect(engine.getStreetHealthMap()[0].complaints).toBe(1);
  });

  it('starts next day and processes prior-day credit repayments at 85 percent expected rate', () => {
    engine.startDayRush();
    engine.recordCreditSale('Ada', 10000);
    engine.closeDayLedger();
    const day = engine.advanceToNextDay();
    expect(day.day).toBe(2);
    expect(day.creditRepaid).toBe(8500);
    expect(engine.getState().cash).toBe(150500);
  });
});
