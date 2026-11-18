import { describe, it, expect } from 'vitest';
import { StoreRun } from '../src/sim/progression';
import { SAVE_KEY, loadRun, saveRun, clearSave, settleOffline, formatDuration } from '../src/sim/save';
import { Telemetry, TELEMETRY_KEY } from '../src/sim/telemetry';
import { Onboarding, ONBOARDING_DONE, nextObjective } from '../src/sim/onboarding';

class MemoryStore {
  public map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

describe('Persistence', () => {
  it('round-trips a v2 save without losing the run', () => {
    const store = new MemoryStore();
    const run = StoreRun.create({ seed: 7, cash: 321000 });
    run.buyLicense(2);
    run.hire('cashier');
    run.loadBox('prd_malaguard_forte');
    run.endDay();

    expect(saveRun(run, store)).toBe(true);
    const loaded = loadRun(store);
    expect(loaded.status).toBe('ok');
    expect(loaded.run).not.toBeNull();
    const restored = loaded.run!;
    expect(restored.cash).toBe(run.cash);
    expect(restored.debt).toBe(run.debt);
    expect(restored.day).toBe(run.day);
    expect(restored.highestTier).toBe(2);
    expect(restored.state.employees.cashier.count).toBe(1);
    expect(restored.dailyQuota).toBe(run.dailyQuota);
    expect(restored.state.carriedBoxes.length).toBe(1);
  });

  it('migrates a v1 narrative save into a playable v2 run', () => {
    const store = new MemoryStore();
    store.setItem(
      'pharm_chris_run',
      JSON.stringify({ saveVersion: 1, cash: 210000, debt: 3900000, day: 24, trust: 61, originalDebt: 4200000, seed: 55 })
    );
    const loaded = loadRun(store);
    expect(loaded.status).toBe('migrated');
    expect(loaded.run!.cash).toBe(210000);
    expect(loaded.run!.debt).toBe(3900000);
    expect(loaded.run!.day).toBe(24);
    expect(loaded.run!.trust).toBe(61);
    expect(loaded.run!.dailyQuota).toBeGreaterThan(0);
  });

  it('quarantines a corrupt payload and starts clean instead of crashing', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, '{not json at all');
    const loaded = loadRun(store);
    expect(loaded.status).toBe('corrupt');
    expect(loaded.run).toBeNull();
    expect(store.getItem(`${SAVE_KEY}.corrupt`)).toBeTruthy();
    expect(store.getItem(SAVE_KEY)).toBeNull();
  });

  it('rejects an unknown future save version without wiping anything', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, JSON.stringify({ savedAt: 1, data: { saveVersion: 99, cash: 5 } }));
    const loaded = loadRun(store);
    expect(loaded.run).toBeNull();
    expect(loaded.status).toBe('corrupt');
  });

  it('clears every known key on request', () => {
    const store = new MemoryStore();
    saveRun(StoreRun.create(), store);
    clearSave(store);
    expect(store.getItem(SAVE_KEY)).toBeNull();
    expect(loadRun(store).status).toBe('empty');
  });
});

describe('Offline settlement', () => {
  it('pays nothing for a short absence', () => {
    const run = StoreRun.create({ seed: 1, cash: 500000 });
    const now = Date.now();
    const result = settleOffline(run, now - 30 * 1000, now);
    expect(result.earned).toBe(0);
  });

  it('pays a staffed store and reports the cap', () => {
    const run = StoreRun.create({ seed: 1, cash: 900000 });
    run.buyLicense(2);
    run.hire('stocker');
    run.hire('cashier');
    const now = Date.now();
    const result = settleOffline(run, now - 20 * 3600 * 1000, now);
    expect(result.capped).toBe(true);
    expect(result.seconds).toBe(8 * 3600);
    expect(result.earned).toBeGreaterThan(0);
    expect(result.ratePerHour).toBeGreaterThan(0);
    expect(formatDuration(result.seconds)).toBe('8h 0m');
  });
});

describe('Telemetry funnel', () => {
  it('records a session and computes funnel drop-off', () => {
    const store = new MemoryStore();
    const telemetry = new Telemetry(store as never);
    expect(telemetry.has('session_start')).toBe(true);

    telemetry.trackOnce('onboarding_pickup', 1);
    telemetry.trackOnce('onboarding_pickup', 1); // deduped
    telemetry.track('onboarding_stock', 1);
    telemetry.track('day_complete', 2, 1);
    telemetry.track('run_ended', 90, 1, { outcome: 'STAYED_SOLVENT' });

    const funnel = telemetry.funnel();
    const pickup = funnel.funnel.find((f) => f.step === 'onboarding_pickup')!;
    expect(pickup.count).toBe(1);
    expect(funnel.dropOff).toBe('onboarding_serve');
    expect(funnel.sessions).toBe(1);
    expect(JSON.parse(telemetry.exportJSON()).events.length).toBeGreaterThan(0);
  });

  it('survives a corrupt telemetry blob', () => {
    const store = new MemoryStore();
    store.setItem(TELEMETRY_KEY, 'garbage');
    const telemetry = new Telemetry(store as never);
    expect(telemetry.funnel().events).toBeGreaterThan(0);
  });

  it('debug lines expose every funnel row', () => {
    const telemetry = new Telemetry(new MemoryStore() as never);
    telemetry.track('onboarding_pickup', 1);
    const lines = telemetry.debugLines();
    expect(lines.some((l) => l.includes('session_start'))).toBe(true);
    expect(lines.some((l) => l.includes('drop-off'))).toBe(true);
  });
});

describe('Onboarding', () => {
  it('advances one objective at a time and records time to first sale', () => {
    const onboarding = new Onboarding(0, 1000);
    expect(onboarding.current()?.kind).toBe('pickup');
    expect(onboarding.notify('pickup', 2000)).toBe(true);
    expect(onboarding.current()?.kind).toBe('stock');
    expect(onboarding.notify('serve', 5000)).toBe(true); // completes out of order
    expect(onboarding.current()?.kind).toBe('cash');
    expect(onboarding.secondsToFirstSale).toBe(4);
  });

  it('can be skipped and then reports complete', () => {
    const onboarding = new Onboarding(0);
    onboarding.skip();
    expect(onboarding.isComplete).toBe(true);
    expect(onboarding.currentStep).toBe(ONBOARDING_DONE);
    expect(onboarding.current()).toBeNull();
  });

  it('objective banner always returns a single next action', () => {
    const base = {
      carried: 0,
      shelfStock: 10,
      shelfCapacity: 24,
      queue: 0,
      cashOnFloor: 0,
      affordableUpgrade: false,
      nextLicenseCost: null as number | null,
      cash: 0,
      rushActive: false,
    };
    expect(nextObjective({ ...base, cashOnFloor: 500 })).toContain('COLLECT');
    expect(nextObjective({ ...base, shelfStock: 1 })).toContain('BUY STOCK');
    expect(nextObjective({ ...base, queue: 2 })).toContain('SERVE');
    expect(nextObjective(base)).toContain('PUSH SALES');
  });
});
