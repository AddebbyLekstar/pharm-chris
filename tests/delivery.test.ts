import { describe, it, expect, beforeEach } from 'vitest';
import { PharmChrisEngine } from '../src/sim/engine';

describe('Stage 3: The Morning Delivery & Inspection Minigame - Sim Engine', () => {
  let engine: PharmChrisEngine;

  beforeEach(() => {
    engine = new PharmChrisEngine();
  });

  describe('Day 2 Morning Transition & Crate Origin Branching', () => {
    it('generates suspect Batch #MG-204 crate when Dele is chosen', () => {
      engine.recordDay1Choice('dele');
      const crate = engine.advanceToDay2Morning();

      expect(engine.getState().day).toBe(2);
      expect(engine.getState().time).toBe('08:00 AM');
      expect(engine.getState().day1Phase).toBe('day2_morning_arrival');
      expect(engine.getState().dailyScratchQuota).toBe(3);

      expect(crate.supplier).toBe('dele');
      expect(crate.batchNumber).toBe('MG-204');
      expect(crate.isFake).toBe(true);
      expect(crate.tamperSeal).toBe('tampered');
      expect(crate.batchMatches).toBe(false);
      expect(crate.cartonExpiry).toBe('11/2028');
      expect(crate.blisterExpiry).toBe('06/2026');
      expect(crate.unitPrice).toBe(2200);
      expect(crate.totalCost).toBe(44000);
      expect(crate.paymentTerms).toBe('cash_on_delivery');
      expect(crate.agencyRegWarning).toBeDefined();
    });

    it('generates certified Batch #MG-881 crate when Chief Okonkwo is chosen', () => {
      engine.recordDay1Choice('okonkwo');
      const crate = engine.advanceToDay2Morning();

      expect(engine.getState().day).toBe(2);
      expect(crate.supplier).toBe('okonkwo');
      expect(crate.batchNumber).toBe('MG-881');
      expect(crate.isFake).toBe(false);
      expect(crate.tamperSeal).toBe('intact');
      expect(crate.batchMatches).toBe(true);
      expect(crate.cartonExpiry).toBe(crate.blisterExpiry);
      expect(crate.unitPrice).toBe(3800);
      expect(crate.totalCost).toBe(76000);
      expect(crate.paymentTerms).toBe('14_day_credit');
      expect(crate.invoice.hasFormalStamp).toBe(true);
    });
  });

  describe('MAS Scratch-Code Mechanics', () => {
    it('progressively scratches the silver panel and reveals code at 60%', () => {
      engine.recordDay1Choice('dele');
      engine.advanceToDay2Morning();

      expect(engine.getState().activeDelivery?.scratchPercentage).toBe(0);
      expect(engine.getState().activeDelivery?.masScratched).toBe(false);

      const scratch1 = engine.scratchMasCode(25);
      expect(scratch1.scratchPercentage).toBe(25);
      expect(scratch1.isRevealed).toBe(false);

      const scratch2 = engine.scratchMasCode(25);
      expect(scratch2.scratchPercentage).toBe(50);
      expect(scratch2.isRevealed).toBe(false);

      const scratch3 = engine.scratchMasCode(25);
      expect(scratch3.scratchPercentage).toBe(75);
      expect(scratch3.isRevealed).toBe(true);
      expect(engine.getState().activeDelivery?.masScratched).toBe(true);
    });

    it('refuses SMS verification before scratch panel is revealed', () => {
      engine.recordDay1Choice('dele');
      engine.advanceToDay2Morning();

      expect(() => engine.verifyMasCode()).toThrow(/Scratch panel must be revealed/);
    });

    it('executes SMS verification to 38353 and deducts from daily 3-check quota', () => {
      engine.recordDay1Choice('dele');
      engine.advanceToDay2Morning();
      engine.scratchMasCode(100);

      expect(engine.getState().dailyScratchQuota).toBe(3);

      const response = engine.verifyMasCode();
      expect(response.status).toBe('duplicate_warning');
      expect(response.isGenuine).toBe(false);
      expect(response.queryCount).toBe(14);
      expect(response.smsMessage).toContain('14 TIMES');
      expect(engine.getState().dailyScratchQuota).toBe(2);
    });

    it('returns genuine first-time verification for Chief Okonkwo stock', () => {
      engine.recordDay1Choice('okonkwo');
      engine.advanceToDay2Morning();
      engine.scratchMasCode(100);

      const response = engine.verifyMasCode();
      expect(response.status).toBe('genuine');
      expect(response.isGenuine).toBe(true);
      expect(response.queryCount).toBe(1);
      expect(response.smsMessage).toContain('First-time verification');
      expect(engine.getState().dailyScratchQuota).toBe(2);
    });

    it('exhausts daily scratch check quota after 3 checks', () => {
      engine.recordDay1Choice('dele');
      engine.advanceToDay2Morning();
      engine.scratchMasCode(100);

      engine.verifyMasCode(); // 1st
      engine.verifyMasCode(); // 2nd
      engine.verifyMasCode(); // 3rd
      expect(engine.getState().dailyScratchQuota).toBe(0);

      expect(() => engine.verifyMasCode()).toThrow(/exhausted/);
    });
  });

  describe('Shipment Resolution: Accept, Reject, Quarantine', () => {
    it('Accepts Dele stock: deducts COD cash, adds stock, penalizes trust & reputation', () => {
      engine.recordDay1Choice('dele');
      engine.advanceToDay2Morning();
      const initialCash = engine.getState().cash;
      const initialStock = engine.getState().inventory['prd_malaguard_forte'];
      const initialTrust = engine.getState().trust;

      const res = engine.resolveDelivery('accept');
      expect(res.action).toBe('accept');
      expect(res.inventoryAdded).toBe(20);
      expect(engine.getState().inventory['prd_malaguard_forte']).toBe(initialStock + 20);
      expect(engine.getState().cash).toBe(initialCash - 44000);
      expect(engine.getState().trust).toBeLessThan(initialTrust);
      expect(engine.getState().day1Phase).toBe('day2_resolved');
      expect(engine.getState().clues).toContain("Accepted unverified Batch #MG-204 from Dele's courier");
    });

    it('Accepts Okonkwo stock: adds 14-day credit debt, boosts trust & reputation', () => {
      engine.recordDay1Choice('okonkwo');
      engine.advanceToDay2Morning();
      const initialCash = engine.getState().cash;
      const initialDebt = engine.getState().debt;
      const initialTrust = engine.getState().trust;

      const res = engine.resolveDelivery('accept');
      expect(res.action).toBe('accept');
      expect(engine.getState().cash).toBe(initialCash); // Cash untouched! Credit
      expect(engine.getState().debt).toBe(initialDebt + 76000);
      expect(engine.getState().trust).toBeGreaterThan(initialTrust);
      expect(res.cluesFound).toContain('Accepted certified Batch #MG-881 with formal 14-day invoice');
    });

    it('Rejects Dele shipment: courier departs, saves cash, rewards vigilance', () => {
      engine.recordDay1Choice('dele');
      engine.advanceToDay2Morning();
      const initialCash = engine.getState().cash;
      const initialStock = engine.getState().inventory['prd_malaguard_forte'];

      const res = engine.resolveDelivery('reject');
      expect(res.action).toBe('reject');
      expect(engine.getState().cash).toBe(initialCash);
      expect(engine.getState().inventory['prd_malaguard_forte']).toBe(initialStock);
      expect(res.cluesFound).toContain('Rejected suspect counterfeit Batch #MG-204 at the door');
    });

    it('Quarantines Dele shipment: locks in back room, zero cash paid, builds regulatory evidence', () => {
      engine.recordDay1Choice('dele');
      engine.advanceToDay2Morning();
      const initialCash = engine.getState().cash;
      const initialStock = engine.getState().inventory['prd_malaguard_forte'];

      const res = engine.resolveDelivery('quarantine');
      expect(res.action).toBe('quarantine');
      expect(engine.getState().cash).toBe(initialCash);
      expect(engine.getState().inventory['prd_malaguard_forte']).toBe(initialStock);
      expect(engine.getState().quarantinedStock['prd_malaguard_forte']).toBe(20);
      expect(res.cluesFound).toContain('Quarantined Batch #MG-204 in back-room lockup as regulatory evidence');
    });
  });
});
