import { describe, it, expect, beforeEach } from 'vitest';
import { PharmChrisEngine } from '../src/sim/engine';
import { ORIGINAL_DEBT, RENEGOTIATE_THRESHOLD } from '../src/sim/endgame';

describe('Stage 5: 90-Day Season Progression, Regulatory Inspections, & Endgame Matrix', () => {
  let engine: PharmChrisEngine;

  beforeEach(() => {
    engine = new PharmChrisEngine();
  });

  describe('Milestones & Fast-Forward Calendar Progression', () => {
    it('identifies milestone events for key season days (15, 30, 45, 70, 90)', () => {
      expect(engine.getMilestoneForDay(15)?.type).toBe('fx_shock');
      expect(engine.getMilestoneForDay(30)?.type).toBe('prime_star_ultimatum');
      expect(engine.getMilestoneForDay(45)?.type).toBe('board_inspection');
      expect(engine.getMilestoneForDay(70)?.type).toBe('agency_raid_window');
      expect(engine.getMilestoneForDay(90)?.type).toBe('season_finale');
      expect(engine.getMilestoneForDay(10)).toBeNull();
    });

    it('advances days cleanly and triggers Day 15 FX shock', () => {
      expect(engine.getState().day).toBe(1);
      const events = engine.fastForwardDays(15);

      expect(engine.getState().day).toBe(16);
      expect(engine.getState().daysRemaining).toBe(74);
      expect(events.some(e => e.day === 15 && e.milestone?.type === 'fx_shock')).toBe(true);
      expect(engine.getState().activeShocks.some(s => s.id === 'fx_shock_day15')).toBe(true);
    });

    it('applies macroeconomic shock multiplier to affected categories', () => {
      const initialPainCost = engine.getProductEffectiveCost('prd_painaway_500');
      const initialAmoxilCost = engine.getProductEffectiveCost('prd_amoxil_500');

      engine.applyMacroeconomicShock({
        id: 'fx_test_shock',
        name: 'Test FX Surge',
        description: 'Antimalarials & Antibiotics cost +80%',
        startDay: 10,
        durationDays: 30,
        costMultiplier: 1.8,
        affectedCategories: ['Antimalarial', 'Antibiotic'],
        active: true,
      });

      expect(engine.getProductEffectiveCost('prd_painaway_500')).toBe(initialPainCost);
      expect(engine.getProductEffectiveCost('prd_amoxil_500')).toBe(Math.round(initialAmoxilCost * 1.8));
    });
  });

  describe('Inspector Danjuma Board Regulatory Inspection (Day 45)', () => {
    it('passes inspection when compliance standards are met', () => {
      const res = engine.conductBoardInspection({
        hasLicenseDisplayed: true,
        superintendentPresent: true,
        hasPoisonRegisterLogged: true,
        hasColdChainLogs: true,
        hasUnsegregatedFakeStock: false,
      });

      expect(res.passed).toBe(true);
      expect(res.defectType).toBe('none');
      expect(res.fine).toBe(0);
      expect(res.trustDelta).toBeGreaterThan(0);
      expect(res.sealed).toBe(false);
      expect(engine.getState().boardViolations).toBe(0);
    });

    it('issues minor defect penalty (₦150,000 fine) on missing cold chain or license', () => {
      const initialCash = engine.getState().cash;
      const res = engine.conductBoardInspection({
        hasLicenseDisplayed: false,
        superintendentPresent: true,
        hasPoisonRegisterLogged: true,
        hasColdChainLogs: true,
        hasUnsegregatedFakeStock: false,
      });

      expect(res.passed).toBe(false);
      expect(res.defectType).toBe('minor');
      expect(res.fine).toBe(150000);
      expect(engine.getState().cash).toBe(initialCash - 150000);
      expect(engine.getState().boardViolations).toBe(1);
      expect(res.sealed).toBe(false);
    });

    it('issues major defect penalty (₦300,000 fine) when superintendent is absent or fake stock is unsegregated', () => {
      const res = engine.conductBoardInspection({
        hasLicenseDisplayed: true,
        superintendentPresent: false,
        hasPoisonRegisterLogged: true,
        hasColdChainLogs: true,
        hasUnsegregatedFakeStock: false,
      });

      expect(res.passed).toBe(false);
      expect(res.defectType).toBe('major');
      expect(res.fine).toBe(300000);
      expect(engine.getState().boardViolations).toBe(1);
      expect(res.sealed).toBe(false);
    });

    it('seals premises upon second violation (Two-strike rule)', () => {
      engine.conductBoardInspection({ hasLicenseDisplayed: false });
      expect(engine.getState().boardViolations).toBe(1);
      expect(engine.getState().isPremisesSealed).toBe(false);

      const res2 = engine.conductBoardInspection({ hasPoisonRegisterLogged: false });
      expect(engine.getState().boardViolations).toBe(2);
      expect(res2.sealed).toBe(true);
      expect(engine.getState().isPremisesSealed).toBe(true);
      expect(engine.getState().sealedReason).toBe('compliance');

      expect(() => engine.fastForwardDays(5)).toThrow(/pharmacy premises are sealed/);
    });
  });

  describe('The Agency Anti-Counterfeiting Raid', () => {
    it('requires at least 7 clues to trigger Agency raid', () => {
      const state = engine.getState();
      // clone state modification via test
      (engine as any).state.clues = ['clue1', 'clue2', 'clue3', 'clue4'];
      expect(() => engine.executeAgencyRaid()).toThrow(/Need at least 7 clues/);
    });

    it('successfully executes raid when 7+ clues are held, granting trust and debt relief', () => {
      (engine as any).state.clues = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
      const initialTrust = engine.getState().trust;
      const initialDebt = engine.getState().debt;

      const raid = engine.executeAgencyRaid();

      expect(raid.success).toBe(true);
      expect(raid.cluesSubmitted).toBe(7);
      expect(engine.getState().agencyRaidCompleted).toBe(true);
      expect(engine.getState().primeStarNeutralized).toBe(true);
      expect(engine.getState().trust).toBe(initialTrust + raid.trustBonus);
      expect(engine.getState().debt).toBe(initialDebt - raid.debtRelief);
    });

    it('prevents duplicate raids in the same season', () => {
      (engine as any).state.clues = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
      engine.executeAgencyRaid();
      expect(() => engine.executeAgencyRaid()).toThrow(/already been conducted/);
    });
  });

  describe('Day 90 Endgame Matrix (6 Canonical Endings)', () => {
    it('1. STAYED_SOLVENT: Debt cleared (0) + Trust >= 50 + Stayed in Lagos', () => {
      const state = (engine as any).state;
      state.debt = 0;
      state.trust = 65;
      state.boardViolations = 0;

      const report = engine.triggerSeasonFinale('stay');
      expect(report.outcome).toBe('STAYED_SOLVENT');
      expect(report.isPremisesSealed).toBe(false);
      expect(report.debtRepaid).toBe(ORIGINAL_DEBT);
    });

    it('2. STAYED_BARELY: Debt renegotiated to <= 40% (debt <= 1.68M) + Stayed', () => {
      const state = (engine as any).state;
      state.debt = 1200000;
      state.trust = 48;
      state.boardViolations = 0;

      const report = engine.triggerSeasonFinale('stay');
      expect(report.outcome).toBe('STAYED_BARELY');
      expect(report.isPremisesSealed).toBe(false);
    });

    it('3. LEFT_SHOP_TO_SADE: Debt cleared (0) + Boarded flight + Shop handed to Sade', () => {
      const state = (engine as any).state;
      state.debt = 0;
      state.trust = 75;
      state.boardViolations = 0;

      const report = engine.triggerSeasonFinale('leave');
      expect(report.outcome).toBe('LEFT_SHOP_TO_SADE');
      expect(report.isPremisesSealed).toBe(false);
    });

    it('4. LEFT_SHOP_SOLD: Debt renegotiated (<= 40%) + Boarded flight + Shop liquidated', () => {
      const state = (engine as any).state;
      state.debt = 1500000;
      state.trust = 55;
      state.boardViolations = 0;

      const report = engine.triggerSeasonFinale('leave');
      expect(report.outcome).toBe('LEFT_SHOP_SOLD');
      expect(report.isPremisesSealed).toBe(false);
    });

    it('5. SEALED_DEBT: Over 40% debt remains unpaid on Day 90 -> Chief Okonkwo seizes premises', () => {
      const state = (engine as any).state;
      state.debt = 3000000;
      state.boardViolations = 0;

      const report = engine.triggerSeasonFinale('stay');
      expect(report.outcome).toBe('SEALED_DEBT');
      expect(report.isPremisesSealed).toBe(true);
    });

    it('6. SEALED_COMPLIANCE: 2 Board violations -> Board padlock & license revoked', () => {
      const state = (engine as any).state;
      state.boardViolations = 2;
      state.isPremisesSealed = true;
      state.sealedReason = 'compliance';

      const report = engine.triggerSeasonFinale('stay');
      expect(report.outcome).toBe('SEALED_COMPLIANCE');
      expect(report.isPremisesSealed).toBe(true);
    });
  });
});
