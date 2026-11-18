import { PharmChrisEngine } from './engine';
import { EndgameOutcome, InspectionResult } from './types';
import { EmployeeRole, LicenseTier, ShelfCategory, StoreRun } from './progression';

/**
 * Deterministic season bot.
 *
 * Plays a full 90-day season against the real economy and the real compliance
 * machinery, and reports what actually happened. It exists to prove the season
 * *resolves*: debt arithmetic, inspection strikes, the Agency raid, MAS checks and
 * the ending each policy reaches.
 */

export type BotStrategy = 'greedy' | 'casual' | 'idle';

export interface SeasonPolicy {
  seed: number;
  strategy: BotStrategy;
  decision: 'stay' | 'leave';
  /** Player shows the licence and stands behind the counter during an inspection. */
  compliant: boolean;
  /** Take the 40%-discount crate when Dele's courier turns up. */
  acceptCounterfeit: boolean;
  /** Verify scratch codes instead of shelving blind. */
  useMas: boolean;
  /** 0 = reinvest everything, 1 = throw every naira at the debt. */
  debtServiceShare: number;
  /** Buy higher licences when affordable. */
  buyLicenses: boolean;
  /**
   * Debt the player deliberately leaves outstanding at the deadline (they spent
   * the cash on the shop instead). 0 means "clear as much as the till allows".
   */
  targetDebtRemaining: number;
}

export const DEFAULT_POLICY: SeasonPolicy = {
  seed: 19980812,
  strategy: 'greedy',
  decision: 'stay',
  compliant: true,
  acceptCounterfeit: false,
  useMas: true,
  debtServiceShare: 0.6,
  buyLicenses: true,
  targetDebtRemaining: 0,
};

export interface SeasonTrace {
  seed: number;
  strategy: BotStrategy;
  ending: EndgameOutcome;
  daysPlayed: number;
  finalDebt: number;
  originalDebt: number;
  debtRepaid: number;
  repaymentRatio: number;
  finalCash: number;
  trust: number;
  customersServed: number;
  licences: number;
  expansions: number;
  staff: number;
  inspections: Array<{ day: number; defectType: string; fine: number; sealed: boolean }>;
  raid: { day: number; clues: number; debtRelief: number; cashReward: number } | null;
  masChecks: number;
  counterfeitsAccepted: number;
  counterfeitTrustDelta: number;
  dayEndNets: number[];
}

const CATEGORIES: ShelfCategory[] = ['analgesic', 'antimalarial', 'antibiotic', 'cold_chain'];

function playShift(run: StoreRun, strategy: BotStrategy): boolean {
  const startDay = run.day;
  let steps = 0;
  while (run.day === startDay && steps < 1200) {
    steps++;
    run.tick(0.25);
    if (run.day !== startDay) break; // the shift closed itself

    if (strategy === 'idle') continue;
    const lazy = strategy === 'casual';
    if (lazy && steps % 3 !== 0) continue;

    for (const cat of CATEGORIES) {
      const products = run.productsForShelf(cat);
      if (!products.length) continue;
      const cheapest = products[0];
      let guard = 0;
      while (run.shelfLevels[cat] < Math.min(run.shelfCapacity, lazy ? 4 : 8) && guard++ < 8) {
        if (run.cash < cheapest.baseCost + (lazy ? 5000 : 20000)) break;
        if (!run.loadBox(cheapest.id).ok) break;
        if (!run.stockShelf(cat).ok) break;
      }
    }
    while (run.queue.length > 0) {
      if (!run.serveFront(false).ok) break;
    }
    run.collectCash();
  }
  run.collectCash();
  return run.day !== startDay;
}

function invest(run: StoreRun, policy: SeasonPolicy): void {
  if (policy.buyLicenses) {
    const next: LicenseTier | null = run.nextLicenseTier();
    if (next && run.cash > next.cost + 40000) run.buyLicense(next.tier);
  }
  if (policy.strategy === 'greedy') {
    for (const id of ['marketing', 'carry', 'dock_rate', 'speed'] as const) {
      const cost = run.upgradeCost(id);
      if (Number.isFinite(cost) && run.cash > cost + 60000) run.buyUpgrade(id);
    }
    const expansion = run.nextExpansion();
    if (expansion && run.cash > expansion.cost + 80000) run.expand();
  }
  if (policy.strategy === 'greedy' && run.highestTier >= 2) {
    const roles: EmployeeRole[] = ['stocker', 'cashier'];
    for (const role of roles) {
      while (run.employeeCost(role).count < 1 && run.cash > 120000) {
        if (!run.hire(role).ok) break;
      }
    }
  }
}

export function playSeason(policy: SeasonPolicy = DEFAULT_POLICY): SeasonTrace {
  const run = StoreRun.create({ seed: policy.seed });
  const engine = new PharmChrisEngine();
  run.setDebtServiceShare(policy.debtServiceShare);

  const inspections: SeasonTrace['inspections'] = [];
  let raid: SeasonTrace['raid'] = null;
  let masChecks = 0;
  let counterfeitsAccepted = 0;
  let counterfeitTrustDelta = 0;

  const inspect = (day: number): InspectionResult => {
    const result = engine.conductBoardInspection({
      hasLicenseDisplayed: policy.compliant,
      superintendentPresent: policy.compliant,
      hasPoisonRegisterLogged: policy.compliant,
      hasColdChainLogs: policy.compliant,
      hasUnsegregatedFakeStock: !policy.compliant && counterfeitsAccepted > 0,
    });
    const applied = run.applyInspection({ ...result, day });
    inspections.push({ day, defectType: result.defectType, fine: applied.fine, sealed: applied.sealed });
    return result;
  };

  while (!run.ended && run.day <= 90) {
    const shiftClosed = playShift(run, policy.strategy);

    if (run.ended) break;

    // Morning delivery. Dele's couriers turn up every fifth day with a 40%-off
    // crate; the pharmacist either verifies the scratch code or shelves it blind.
    if (run.day % 5 === 0) {
      engine.beginTradingDay();
      engine.receiveDelivery(policy.acceptCounterfeit || run.day % 10 === 0 ? 'dele' : 'okonkwo');
      if (policy.useMas) {
        engine.scratchMasCode(100);
        const response = engine.verifyMasCode();
        masChecks++;
        if (!response.isGenuine) {
          run.addClue(1);
          engine.resolveDelivery('quarantine');
        }
      }
    }

    // The counterfeit temptation.
    if (run.counterfeitCrate) {
      const res = run.resolveCounterfeitCrate(policy.acceptCounterfeit ? 'accept' : 'refuse');
      counterfeitTrustDelta += res.trustDelta;
      if (policy.acceptCounterfeit) counterfeitsAccepted++;
      if (res.clue) run.addClue(1);
    }

    // Board inspections: day 45, plus a follow-up on day 75 if a strike is live.
    if (run.day >= 45 && !inspections.some((i) => i.day === 45)) inspect(45);
    if (run.day >= 75 && run.state.boardViolations > 0 && !inspections.some((i) => i.day === 75)) inspect(75);

    // Agency raid window.
    if (run.day >= 70 && !raid && run.clues >= 7) {
      const result = engine.executeAgencyRaid(run.clues);
      const reward = run.applyAgencyReward(result.debtRelief);
      run.adjustTrust(result.trustBonus);
      raid = {
        day: run.day,
        clues: result.cluesSubmitted,
        debtRelief: reward.toDebt,
        cashReward: reward.toCash,
      };
    }

    if (run.ended) break;

    // A player protecting a cash position stops overpaying the debt once it is
    // within the band they plan to leave outstanding.
    if (policy.targetDebtRemaining > 0 && run.debt <= policy.targetDebtRemaining * 1.2) {
      run.setDebtServiceShare(0);
    }

    if (!shiftClosed) run.endDay();
    if (run.ended) break;
    invest(run, policy);
  }

  // Day 90: cover what the player intends to cover, then make the choice.
  if (!run.ended) {
    const payable = Math.max(0, run.debt - policy.targetDebtRemaining);
    run.payDebt(Math.min(run.cash, payable));
    run.chooseEnding(policy.decision);
    if (!run.ended) run.finishSeason(policy.decision);
  }

  const report = engine.getState().endgameReport;
  const ending = (run.state.ending ?? report?.outcome ?? 'SEALED_DEBT') as EndgameOutcome;
  const finalDebt = run.debt;
  const originalDebt = run.state.originalDebt;

  return {
    seed: policy.seed,
    strategy: policy.strategy,
    ending,
    daysPlayed: Math.min(run.day, 90),
    finalDebt,
    originalDebt,
    debtRepaid: Math.max(0, originalDebt - finalDebt),
    repaymentRatio: Math.max(0, originalDebt - finalDebt) / originalDebt,
    finalCash: run.cash,
    trust: run.trust,
    customersServed: run.stats.customersServed,
    licences: run.highestTier,
    expansions: run.state.expansions,
    staff: (Object.keys(run.state.employees) as EmployeeRole[]).reduce(
      (sum, role) => sum + run.state.employees[role].count,
      0
    ),
    inspections,
    raid,
    masChecks,
    counterfeitsAccepted,
    counterfeitTrustDelta,
    dayEndNets: run.dayLog.map((d) => d.net),
  };
}

/** The five policies used to prove every ending is reachable. */
export const ENDING_POLICIES: Array<{ label: string; policy: SeasonPolicy }> = [
  {
    // Plays the full loop, services the debt every night, clears it and stays.
    label: 'STAYED_SOLVENT',
    policy: { ...DEFAULT_POLICY, seed: 19980812, strategy: 'greedy', decision: 'stay' },
  },
  {
    // Same shop, but the last of the cash went into the expansion instead of the debt.
    label: 'STAYED_BARELY',
    policy: { ...DEFAULT_POLICY, seed: 19980812, strategy: 'greedy', decision: 'stay', targetDebtRemaining: 1200000 },
  },
  {
    // Debt cleared, then the visa flight is taken and Sade gets the keys.
    label: 'LEFT_SHOP_TO_SADE',
    policy: { ...DEFAULT_POLICY, seed: 4242, strategy: 'greedy', decision: 'leave' },
  },
  {
    // Flies out with 1.2M still owed; the shopfront is liquidated to cover it.
    label: 'LEFT_SHOP_SOLD',
    policy: { ...DEFAULT_POLICY, seed: 4242, strategy: 'greedy', decision: 'leave', targetDebtRemaining: 1200000 },
  },
  {
    // Never invests, never services the debt: Okonkwo forecloses on day 90.
    label: 'SEALED_DEBT',
    policy: {
      ...DEFAULT_POLICY,
      seed: 99,
      strategy: 'idle',
      decision: 'stay',
      debtServiceShare: 0,
      buyLicenses: false,
      useMas: false,
    },
  },
  {
    // Runs the shop with no pharmacist on the premises and shelves Dele's fakes.
    label: 'SEALED_COMPLIANCE',
    policy: {
      ...DEFAULT_POLICY,
      seed: 11,
      strategy: 'casual',
      decision: 'stay',
      compliant: false,
      acceptCounterfeit: true,
    },
  },
];
