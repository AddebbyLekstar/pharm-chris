import { describe, it, expect } from 'vitest';
import { ENDING_POLICIES, playSeason, SeasonTrace } from '../src/sim/seasonBot';
import { RUN_CONFIG } from '../src/sim/progression';

function traceFor(label: string): SeasonTrace {
  const entry = ENDING_POLICIES.find((e) => e.label === label);
  if (!entry) throw new Error(`no policy labelled ${label}`);
  return playSeason(entry.policy);
}

describe('90-day season proof', () => {
  const traces = ENDING_POLICIES.map((entry) => ({ label: entry.label, policy: entry.policy, trace: playSeason(entry.policy) }));

  it('reaches all six endings across the fixed policy seeds', () => {
    const reached = new Set(traces.map((t) => t.trace.ending));
    expect(reached.has('STAYED_SOLVENT')).toBe(true);
    expect(reached.has('STAYED_BARELY')).toBe(true);
    expect(reached.has('LEFT_SHOP_TO_SADE')).toBe(true);
    expect(reached.has('LEFT_SHOP_SOLD')).toBe(true);
    expect(reached.has('SEALED_DEBT')).toBe(true);
    expect(reached.has('SEALED_COMPLIANCE')).toBe(true);
  });

  it('each labelled policy reaches the ending it is named for', () => {
    for (const row of traces) {
      expect(row.trace.ending, `${row.label} ended as ${row.trace.ending}`).toBe(row.label);
    }
  });

  it('keeps the debt arithmetic exact', () => {
    for (const row of traces) {
      const t = row.trace;
      expect(t.debtRepaid).toBe(Math.max(0, t.originalDebt - t.finalDebt));
      expect(t.finalDebt).toBeGreaterThanOrEqual(0);
      expect(t.finalDebt).toBeLessThanOrEqual(t.originalDebt);
    }
  });

  it('a solvent run repays the full 4.2M and keeps a cash buffer', () => {
    const t = traceFor('STAYED_SOLVENT');
    expect(t.finalDebt).toBe(0);
    expect(t.debtRepaid).toBe(RUN_CONFIG.startingDebt);
    expect(t.finalCash).toBeGreaterThan(0);
    expect(t.customersServed).toBeGreaterThan(2000);
    expect(t.licences).toBeGreaterThanOrEqual(3);
  });

  it('fires the Agency raid and books its debt relief', () => {
    const t = traceFor('STAYED_SOLVENT');
    expect(t.raid).not.toBeNull();
    expect(t.raid!.clues).toBeGreaterThanOrEqual(7);
    expect(t.raid!.debtRelief + t.raid!.cashReward).toBeGreaterThan(0);
  });

  it('runs MAS checks against the 3-a-day allowance without throwing', () => {
    const t = traceFor('STAYED_SOLVENT');
    expect(t.masChecks).toBeGreaterThan(10);
    expect(t.masChecks).toBeLessThanOrEqual(18);
  });

  it('the compliant shop passes inspection; the sloppy one is sealed on the second strike', () => {
    const clean = traceFor('STAYED_SOLVENT');
    expect(clean.inspections.length).toBe(1);
    expect(clean.inspections[0].defectType).toBe('none');
    expect(clean.inspections[0].fine).toBe(0);

    const sloppy = traceFor('SEALED_COMPLIANCE');
    expect(sloppy.inspections.length).toBe(2);
    expect(sloppy.inspections[1].sealed).toBe(true);
    expect(sloppy.inspections.reduce((sum, i) => sum + i.fine, 0)).toBeGreaterThan(0);
    expect(sloppy.counterfeitsAccepted).toBeGreaterThan(0);
  });

  it('an idle, unlicensed shop never escapes the debt', () => {
    const t = traceFor('SEALED_DEBT');
    expect(t.customersServed).toBe(0);
    expect(t.finalDebt).toBeGreaterThan(RUN_CONFIG.startingDebt * 0.9);
  });

  it('is deterministic for a given seed and policy', () => {
    const entry = ENDING_POLICIES[0];
    const a = playSeason(entry.policy);
    const b = playSeason(entry.policy);
    expect(a.ending).toBe(b.ending);
    expect(a.finalDebt).toBe(b.finalDebt);
    expect(a.customersServed).toBe(b.customersServed);
    expect(a.dayEndNets.length).toBe(b.dayEndNets.length);
  });
});
