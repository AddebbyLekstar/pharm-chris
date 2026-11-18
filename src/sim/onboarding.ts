/**
 * First-60-seconds onboarding.
 *
 * One objective on screen at a time, each completed by doing the thing, not by
 * reading. The step lives in the run snapshot so a refresh does not restart the
 * tutorial from zero.
 */

export type OnboardingKind = 'pickup' | 'stock' | 'serve' | 'cash' | 'upgrade' | 'license';

export interface OnboardingStep {
  index: number;
  kind: OnboardingKind;
  banner: string;
  /** Where the arrow/glow should point. */
  target: 'dock' | 'shelf' | 'counter' | 'cash' | 'upgrade' | 'license';
  hint: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    index: 0,
    kind: 'pickup',
    banner: '1/5  WALK TO THE DOCK — PICK UP A CRATE',
    target: 'dock',
    hint: 'Crates cost wholesale cash. Buy low, sell at the counter.',
  },
  {
    index: 1,
    kind: 'stock',
    banner: '2/5  CARRY THE CRATE TO A SHELF',
    target: 'shelf',
    hint: 'Match the crate colour to the shelf label. Empty shelves lose customers.',
  },
  {
    index: 2,
    kind: 'serve',
    banner: '3/5  STAND AT THE COUNTER AND SERVE',
    target: 'counter',
    hint: 'The front customer pays when you reach the counter.',
  },
  {
    index: 3,
    kind: 'cash',
    banner: '4/5  GRAB THE CASH BEFORE IT SCROLLS AWAY',
    target: 'cash',
    hint: 'Cash on the floor is not in your pocket. Walk over it.',
  },
  {
    index: 4,
    kind: 'upgrade',
    banner: '5/5  HOLD AN UPGRADE PAD — BUY YOUR FIRST UPGRADE',
    target: 'upgrade',
    hint: 'Carry capacity and speed compound. So does street marketing.',
  },
  {
    index: 5,
    kind: 'license',
    banner: 'BONUS  UNLOCK A LICENCE AT THE LICENCE DESK',
    target: 'license',
    hint: 'Licences add higher-margin medicine, and bigger baskets.',
  },
];

export const ONBOARDING_DONE = ONBOARDING_STEPS.length;

export class Onboarding {
  private step: number;
  private startedAt: number;
  private firstSaleAt: number | null = null;
  private completed: OnboardingKind[] = [];

  constructor(initialStep = 0, startedAt = Date.now()) {
    this.step = Math.max(0, Math.min(ONBOARDING_DONE, initialStep));
    this.startedAt = startedAt;
  }

  public get currentStep(): number {
    return this.step;
  }

  public get isComplete(): boolean {
    return this.step >= ONBOARDING_DONE;
  }

  public current(): OnboardingStep | null {
    return this.step < ONBOARDING_DONE ? ONBOARDING_STEPS[this.step] : null;
  }

  /** Records the beat. Returns true when it advanced the tutorial. */
  public notify(kind: OnboardingKind, now = Date.now()): boolean {
    if (this.isComplete) return false;
    const active = this.current();
    if (active && active.kind === kind) {
      this.completed.push(kind);
      this.step += 1;
      if (kind === 'serve' && this.firstSaleAt === null) this.firstSaleAt = now;
      return true;
    }
    // Skipping ahead is allowed: the tutorial never blocks a player who already
    // did the thing out of order.
    const index = ONBOARDING_STEPS.findIndex((s) => s.kind === kind);
    if (index > this.step) {
      this.step = index + 1;
      this.completed.push(kind);
      if (kind === 'serve' && this.firstSaleAt === null) this.firstSaleAt = now;
      return true;
    }
    return false;
  }

  public skip(): void {
    this.step = ONBOARDING_DONE;
  }

  public get secondsToFirstSale(): number | null {
    return this.firstSaleAt === null ? null : Math.round((this.firstSaleAt - this.startedAt) / 1000);
  }

  public get completedKinds(): OnboardingKind[] {
    return [...this.completed];
  }
}

/**
 * The always-on objective banner once the tutorial is done. Keeps the player from
 * standing still without a text wall.
 */
export function nextObjective(input: {
  carried: number;
  shelfStock: number;
  shelfCapacity: number;
  queue: number;
  cashOnFloor: number;
  affordableUpgrade: boolean;
  nextLicenseCost: number | null;
  cash: number;
  rushActive: boolean;
}): string {
  // One verb, like the benchmark's CHOP -> SELL -> POWER UP banner.
  if (input.cashOnFloor > 0) return '💰 COLLECT CASH';
  if (input.rushActive && input.queue > 0) return '🔥 CLEAR THE RUSH';
  if (input.queue > 0 && input.shelfStock > 2) return '🛒 SERVE THE QUEUE';
  if (input.carried > 0) return '🚚 STOCK THE SHELVES';
  if (input.shelfStock <= 2) return '📦 BUY STOCK';
  if (input.affordableUpgrade) return '⬆️ UPGRADE';
  if (input.nextLicenseCost !== null && input.cash >= input.nextLicenseCost) return '📜 LICENCE DESK';
  return '🕒 PUSH SALES';
}
