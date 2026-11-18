import rawProducts from '../content/products.json';
import { Product } from './types';
import { Mulberry32 } from './prng';
import { evaluateEndgame } from './endgame';
import { EndgameReport, GameState } from './types';

/**
 * StoreRun — the idle economy for the 3D arcade pharmacy.
 *
 * Pure, headless, deterministic. No THREE, no DOM, no localStorage. The 3D layer
 * is a *view* of this state; it calls the actions below and renders the events the
 * run emits. Everything that costs or earns money lives here so it can be tested
 * with a bot and replayed under a fixed seed.
 *
 * The loop it models (benchmark: Idle Lumberjack 3D):
 *   pay supplier -> carry to shelf -> customer pays -> reinvest in licences,
 *   capacity, staff, floor space -> repeat, with the 90-day debt clock running.
 */

export const PRODUCTS: Product[] = rawProducts as Product[];
export const PRODUCTS_BY_ID = new Map<string, Product>(PRODUCTS.map((p) => [p.id, p]));

export type ShelfCategory = 'analgesic' | 'antimalarial' | 'antibiotic' | 'cold_chain';

export function shelfCategoryOf(product: Product): ShelfCategory {
  if (product.isColdChain) return 'cold_chain';
  const c = (product.category || '').toLowerCase();
  if (c.includes('malar')) return 'antimalarial';
  if (c.includes('biotic')) return 'antibiotic';
  return 'analgesic';
}

export interface LicenseTier {
  tier: number;
  id: string;
  name: string;
  cost: number;
  description: string;
  productIds: string[];
  /** Extra basket items each customer buys once this tier is live. */
  basketBonus: number;
  /** Extra walk-ins a day: stocking a line is what makes people come to you. */
  customerBonus: number;
}

export const LICENSE_TIERS: LicenseTier[] = [
  {
    tier: 1,
    id: 'otc',
    name: 'General OTC Permit',
    cost: 0,
    description: 'Analgesics, antacids, vitamins and first aid. The bread and butter.',
    productIds: ['prd_painaway_500', 'prd_feverease_extra', 'prd_stomacare_susp', 'prd_wounda_seal', 'prd_vitaboost_complex'],
    basketBonus: 0,
    customerBonus: 0,
  },
  {
    tier: 2,
    id: 'antimalarial',
    name: 'Antimalarial Licence',
    cost: 60000,
    description: 'Malaguard Forte and cough elixirs: the fever rush that pays the rent.',
    productIds: ['prd_malaguard_forte', 'prd_coughcalm_elixir'],
    basketBonus: 0.2,
    customerBonus: 4,
  },
  {
    tier: 3,
    id: 'antibiotic',
    name: 'Antibiotic & Chronic Licence',
    cost: 110000,
    description: 'Prescription antibiotics and monthly BP refills. Big tickets, thin tempers.',
    productIds: ['prd_clavumed_625', 'prd_bpsteady_5'],
    basketBonus: 0.25,
    customerBonus: 6,
  },
  {
    tier: 4,
    id: 'paediatric',
    name: 'Paediatric Licence',
    cost: 240000,
    description: 'Mothers with crying babies buy three things at once. Basket gold.',
    productIds: ['prd_kidease_paediatric'],
    basketBonus: 0.28,
    customerBonus: 6,
  },
  {
    tier: 5,
    id: 'cold_chain',
    name: 'Cold Chain Licence',
    cost: 480000,
    description: 'Vaccines and biologics at 2-8C. Highest margin, zero forgiveness if the fridge fails.',
    productIds: ['prd_chillvial_safe'],
    basketBonus: 0.3,
    customerBonus: 8,
  },
];

export type EmployeeRole = 'stocker' | 'cashier' | 'cleaner';

export interface EmployeeSpec {
  role: EmployeeRole;
  name: string;
  hireCost: number;
  dailyWage: number;
  description: string;
  /** Units of work per second at morale 100. Interpretation per role. */
  rate: number;
  maxCount: number;
}

export const EMPLOYEES: Record<EmployeeRole, EmployeeSpec> = {
  stocker: {
    role: 'stocker',
    name: 'Tunde the Stocker',
    hireCost: 22000,
    dailyWage: 3500,
    description: 'Buys crates at the dock and walks them onto the shelves without you.',
    rate: 0.7, // crates per second
    maxCount: 2,
  },
  cashier: {
    role: 'cashier',
    name: 'Chinedu the Cashier',
    hireCost: 30000,
    dailyWage: 4000,
    description: 'Takes the register, serves the queue and banks the cash while you restock.',
    rate: 0.5, // customers per second
    maxCount: 2,
  },
  cleaner: {
    role: 'cleaner',
    name: 'Sade the Shop Assistant',
    hireCost: 12000,
    dailyWage: 1500,
    description: 'Keeps the floor clean: slower patience decay, steadier trust, fewer walk-outs.',
    rate: 1,
    maxCount: 1,
  },
};

export type UpgradeId = 'carry' | 'speed' | 'dock_rate' | 'marketing';

export interface UpgradeSpec {
  id: UpgradeId;
  name: string;
  description: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
  effectPerLevel: number;
}

export const UPGRADES: Record<UpgradeId, UpgradeSpec> = {
  carry: {
    id: 'carry',
    name: 'Carry Capacity',
    description: '+2 boxes per trip.',
    baseCost: 3000,
    costGrowth: 1.5,
    maxLevel: 30,
    effectPerLevel: 2,
  },
  speed: {
    id: 'speed',
    name: 'Running Speed',
    description: '+18% movement speed.',
    baseCost: 4500,
    costGrowth: 1.5,
    maxLevel: 20,
    effectPerLevel: 0.18,
  },
  dock_rate: {
    id: 'dock_rate',
    name: 'Dock Throughput',
    description: 'Crates load faster at the delivery dock.',
    baseCost: 6000,
    costGrowth: 1.5,
    maxLevel: 20,
    effectPerLevel: 0.25,
  },
  marketing: {
    id: 'marketing',
    name: 'Street Marketing',
    description: '+3 customers per day, faster arrivals.',
    baseCost: 8000,
    costGrowth: 1.5,
    maxLevel: 20,
    effectPerLevel: 2,
  },
};

export interface ExpansionSpec {
  level: number;
  name: string;
  cost: number;
  description: string;
  shelfCapacityBonus: number;
  customerBonus: number;
}

export const EXPANSIONS: ExpansionSpec[] = [
  {
    level: 1,
    name: 'Knock Down the Partition',
    cost: 90000,
    description: 'Adds a second aisle: +10 units per shelf bay, +4 customers a day.',
    shelfCapacityBonus: 10,
    customerBonus: 4,
  },
  {
    level: 2,
    name: 'Super Pharmacy & Consultation Corner',
    cost: 240000,
    description: 'The full store: +12 units per bay, +8 customers a day, rush hour pays double.',
    shelfCapacityBonus: 12,
    customerBonus: 6,
  },
];

export const RUN_CONFIG = {
  seasonLength: 90,
  startingCash: 150000,
  startingDebt: 4200000,
  startingTrust: 50,
  dailyOverhead: 6000,
  baseCustomersPerDay: 28,
  baseShelfCapacity: 24,
  baseSpawnInterval: 6.0,
  minSpawnInterval: 1.6,
  startingShelfStock: 4,
  startingCarry: 5,
  /** Fraction of the day's net profit paid to Chief Okonkwo. The rest is working capital. */
  debtServiceShare: 0.6,
  /** Every Nth day is a rush: arrivals double and prices carry a bonus. */
  rushEveryNthDay: 3,
  rushSpawnMultiplier: 0.55,
  rushRevenueMultiplier: 1.15,
  /** Counterfeit delivery arrives on these days (1-indexed season days). */
  counterfeitDays: [6, 22, 41, 63, 80],
  /** Offline earnings cap: storage-model, like the benchmark's sawmill. */
  offlineBaseHours: 4,
  offlineHoursPerStaff: 2,
  /** An absence may not burn the whole season: at most this many shifts bank. */
  offlineMaxDays: 3,
  offlineCapSeconds: 8 * 3600,
  /** Trust lost when a customer walks out because the shelf was empty. */
  outOfStockTrustPenalty: 2,
  /** Trust gained per completed sale. */
  saleTrustGain: 1,
  wageArrearsQuitMorale: 35,
} as const;

export interface EmployeeState {
  count: number;
  morale: number;
  arrearsDays: number;
}

export interface RunStats {
  customersServed: number;
  customersLost: number;
  revenue: number;
  cogs: number;
  wages: number;
  overhead: number;
  net: number;
  bestDayNet: number;
  licensesSpent: number;
  upgradesSpent: number;
  staffSpent: number;
  debtRepaid: number;
  rushHours: number;
  counterfeitAccepted: number;
}

export interface DayReport {
  day: number;
  served: number;
  revenue: number;
  cogs: number;
  wages: number;
  overhead: number;
  net: number;
  debtRepaid: number;
  cashAfter: number;
  debtAfter: number;
  trust: number;
  bankrupt: boolean;
}

export interface QueuedCustomer {
  id: string;
  name: string;
  title: string;
  productId: string;
  category: ShelfCategory;
  patience: number;
  patienceMax: number;
  budget: number;
  /** What the basket is worth if the shelf can fill all of it. */
  revenue: number;
  /** Items in the basket (1-3). Each one consumes a shelf unit. */
  items: number;
  unitPrice: number;
  isVip: boolean;
}

export interface PendingCash {
  id: string;
  amount: number;
}

export interface RunSnapshot {
  saveVersion: 2;
  createdAt: number;
  lastSeenAt: number;
  seed: number;
  day: number;
  seasonLength: number;
  cash: number;
  debt: number;
  originalDebt: number;
  trust: number;
  licenses: number[];
  expansions: number;
  upgrades: Record<UpgradeId, number>;
  employees: Record<EmployeeRole, EmployeeState>;
  shelves: Record<ShelfCategory, number>;
  pendingCash: PendingCash[];
  queue: QueuedCustomer[];
  servedToday: number;
  dailyQuota: number;
  /** Player's choice: what share of profit goes to Chief Okonkwo (0..1). */
  debtServiceShare: number;
  rushActive: boolean;
  carriedBoxes: { productId: string; cost: number }[];
  stats: RunStats;
  dayLog: DayReport[];
  ended: boolean;
  ending?: string;
  playerDecision?: 'stay' | 'leave';
  boardViolations: number;
  isPremisesSealed: boolean;
  sealedReason?: 'compliance' | 'debt';
  lastInspection?: { day: number; defectType: string; fine: number; trustDelta: number; notes: string[] } | null;
  onboardingStep: number;
  clues: number;
  counterfeitCrate?: { productId: string; unitCost: number; day: number } | null;
}

export type RunEvent =
  | { type: 'cash_dropped'; id: string; amount: number }
  | { type: 'customer_spawned'; customer: QueuedCustomer }
  | { type: 'customer_served'; customer: QueuedCustomer; revenue: number; productId: string }
  | { type: 'customer_lost'; customer: QueuedCustomer; reason: 'stock' | 'patience' }
  | { type: 'box_loaded'; productId: string; cost: number }
  | { type: 'shelf_stocked'; productId: string; category: ShelfCategory }
  | { type: 'day_ended'; report: DayReport }
  | { type: 'season_ended'; report: EndgameReport }
  | { type: 'save_due' };

const CUSTOMER_NAMES = [
  ['Mama Ngozi', 'Neighbourhood matriarch'],
  ['Emeka', 'Okada rider'],
  ['Baba Ibrahim', 'Retired schoolmaster'],
  ['Nurse Ify', 'Clinic nurse'],
  ['Bukola', 'Mother of two'],
  ['Alabi', 'Fintech transfer guy'],
  ['Bayo Driver', 'Danfo driver'],
  ['Iya Basira', 'Market trader'],
];

export class StoreRun {
  private s: RunSnapshot;
  private rng: Mulberry32;
  private events: RunEvent[] = [];
  private spawnTimer = 0;

  private constructor(snapshot: RunSnapshot, seed: number) {
    this.s = snapshot;
    this.rng = new Mulberry32(seed);
  }

  public static create(opts: { seed?: number; now?: number; cash?: number; debt?: number } = {}): StoreRun {
    const seed = opts.seed ?? 19980812;
    const now = opts.now ?? Date.now();
    const emptyEmployees: Record<EmployeeRole, EmployeeState> = {
      stocker: { count: 0, morale: 100, arrearsDays: 0 },
      cashier: { count: 0, morale: 100, arrearsDays: 0 },
      cleaner: { count: 0, morale: 100, arrearsDays: 0 },
    };
    const snapshot: RunSnapshot = {
      saveVersion: 2,
      createdAt: now,
      lastSeenAt: now,
      seed,
      day: 1,
      seasonLength: RUN_CONFIG.seasonLength,
      cash: opts.cash ?? RUN_CONFIG.startingCash,
      debt: opts.debt ?? RUN_CONFIG.startingDebt,
      originalDebt: RUN_CONFIG.startingDebt,
      trust: RUN_CONFIG.startingTrust,
      licenses: [1],
      expansions: 0,
      upgrades: { carry: 0, speed: 0, dock_rate: 0, marketing: 0 },
      employees: emptyEmployees,
      shelves: {
        analgesic: RUN_CONFIG.startingShelfStock,
        antimalarial: RUN_CONFIG.startingShelfStock,
        antibiotic: RUN_CONFIG.startingShelfStock,
        cold_chain: 0,
      },
      pendingCash: [],
      queue: [],
      servedToday: 0,
      dailyQuota: RUN_CONFIG.baseCustomersPerDay,
      debtServiceShare: RUN_CONFIG.debtServiceShare,
      rushActive: false,
      carriedBoxes: [],
      stats: {
        customersServed: 0,
        customersLost: 0,
        revenue: 0,
        cogs: 0,
        wages: 0,
        overhead: 0,
        net: 0,
        bestDayNet: 0,
        licensesSpent: 0,
        upgradesSpent: 0,
        staffSpent: 0,
        debtRepaid: 0,
        rushHours: 0,
        counterfeitAccepted: 0,
      },
      dayLog: [],
      ended: false,
      boardViolations: 0,
      isPremisesSealed: false,
      lastInspection: null,
      onboardingStep: 0,
      clues: 0,
      counterfeitCrate: null,
    };
    const run = new StoreRun(snapshot, seed);
    run.recomputeQuota();
    return run;
  }

  // ---------------------------------------------------------------- accessors

  public get state(): Readonly<RunSnapshot> {
    return this.s;
  }

  public get cash(): number {
    return this.s.cash;
  }

  public get debt(): number {
    return this.s.debt;
  }

  public get day(): number {
    return this.s.day;
  }

  public get trust(): number {
    return this.s.trust;
  }

  public get ended(): boolean {
    return this.s.ended;
  }

  /** True once the calendar is done but the player has not picked stay/leave yet. */
  public get needsEndingDecision(): boolean {
    return !this.s.ended && this.s.day > this.s.seasonLength;
  }

  public get queue(): QueuedCustomer[] {
    return this.s.queue;
  }

  public get shelfLevels(): Record<ShelfCategory, number> {
    return this.s.shelves;
  }

  public get pendingCash(): PendingCash[] {
    return this.s.pendingCash;
  }

  public get carryCapacity(): number {
    return RUN_CONFIG.startingCarry + this.s.upgrades.carry * UPGRADES.carry.effectPerLevel;
  }

  public get speedMultiplier(): number {
    return 1 + this.s.upgrades.speed * UPGRADES.speed.effectPerLevel;
  }

  public get shelfCapacity(): number {
    return RUN_CONFIG.baseShelfCapacity + this.s.expansions * 10;
  }

  public get spawnInterval(): number {
    const marketingCut = this.s.upgrades.marketing * 0.18;
    const base = RUN_CONFIG.baseSpawnInterval * (1 - Math.min(0.62, marketingCut));
    const rush = this.s.rushActive ? RUN_CONFIG.rushSpawnMultiplier : 1;
    return Math.max(RUN_CONFIG.minSpawnInterval, base * rush);
  }

  public get dailyQuota(): number {
    return this.s.dailyQuota;
  }

  public get servedToday(): number {
    return this.s.servedToday;
  }

  public get highestTier(): number {
    return this.s.licenses.reduce((max, t) => Math.max(max, t), 1);
  }

  public get hasStocker(): boolean {
    return this.s.employees.stocker.count > 0;
  }

  public get hasCashier(): boolean {
    return this.s.employees.cashier.count > 0;
  }

  public get isAutomated(): boolean {
    return this.hasStocker && this.hasCashier;
  }

  public get licensedProducts(): Product[] {
    const ids = new Set<string>();
    for (const t of LICENSE_TIERS) {
      if (this.s.licenses.includes(t.tier)) for (const id of t.productIds) ids.add(id);
    }
    return PRODUCTS.filter((p) => ids.has(p.id));
  }

  /** Licensed products that live on a given shelf bay, cheapest first. */
  public productsForShelf(category: ShelfCategory): Product[] {
    return this.licensedProducts
      .filter((p) => shelfCategoryOf(p) === category)
      .sort((a, b) => a.baseCost - b.baseCost);
  }

  public licenseCost(tier: number): number {
    const spec = LICENSE_TIERS.find((t) => t.tier === tier);
    return spec ? spec.cost : Number.POSITIVE_INFINITY;
  }

  public nextLicenseTier(): LicenseTier | null {
    for (const t of LICENSE_TIERS) {
      if (!this.s.licenses.includes(t.tier)) return t;
    }
    return null;
  }

  public upgradeCost(id: UpgradeId): number {
    const spec = UPGRADES[id];
    const level = this.s.upgrades[id];
    if (level >= spec.maxLevel) return Number.POSITIVE_INFINITY;
    return Math.round(spec.baseCost * Math.pow(spec.costGrowth, level));
  }

  public nextExpansion(): ExpansionSpec | null {
    return EXPANSIONS.find((e) => e.level === this.s.expansions + 1) ?? null;
  }

  public employeeCost(role: EmployeeRole): { hire: number; wage: number; count: number; max: number } {
    const spec = EMPLOYEES[role];
    return {
      hire: spec.hireCost,
      wage: spec.dailyWage,
      count: this.s.employees[role].count,
      max: spec.maxCount,
    };
  }

  public dailyWages(): number {
    return (Object.keys(EMPLOYEES) as EmployeeRole[]).reduce(
      (sum, role) => sum + this.s.employees[role].count * EMPLOYEES[role].dailyWage,
      0
    );
  }

  /** Average gross margin of one basket, used for UI hints and offline estimates. */
  public averageMargin(): number {
    const pool = this.licensedProducts;
    if (!pool.length) return 0;
    const total = pool.reduce((sum, p) => sum + (p.baseRetail - p.baseCost), 0);
    return Math.round(total / pool.length);
  }

  public basketMultiplier(): number {
    // Loyalty compounds: a neighbourhood that trusts you buys the second item too.
    let bonus = (this.s.trust - 50) / 200; // -0.25 .. +0.25
    for (const t of LICENSE_TIERS) if (this.s.licenses.includes(t.tier)) bonus += t.basketBonus;
    return Math.max(0.7, 1 + bonus);
  }

  // ---------------------------------------------------------------- events

  public drainEvents(): RunEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private emit(e: RunEvent): void {
    this.events.push(e);
  }

  // ---------------------------------------------------------------- demand

  /** Cheap staples walk out ten times for every cold-chain vial. Demand is price-weighted. */
  private pickWeighted(pool: Product[]): Product {
    if (!pool.length) return PRODUCTS[0];
    const weights = pool.map((prod) => {
      const base = Math.pow(1000 / Math.max(200, prod.baseRetail), 0.9);
      const tier = LICENSE_TIERS.find((t) => t.productIds.includes(prod.id))?.tier ?? 1;
      // Stocking a line pulls its own customers in: cheaper staples still dominate,
      // but a licensed category is no longer a rounding error.
      return base * (1 + 0.45 * (tier - 1));
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = this.rng.next() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  private nextCustomer(): QueuedCustomer {
    const pool = this.licensedProducts;
    const product = this.pickWeighted(pool);
    const [name, title] = CUSTOMER_NAMES[Math.floor(this.rng.next() * CUSTOMER_NAMES.length)];
    const trustFactor = 1 + (this.s.trust - 50) / 400; // 0.875 .. 1.125
    const jitter = 0.9 + this.rng.next() * 0.2;
    // A loyal shop sells the second and third item, and every item is paid for.
    const basket = this.basketMultiplier() * jitter;
    const items = Math.max(1, Math.min(2, Math.round(basket)));
    const unitPrice = Math.round(product.baseRetail * trustFactor);
    const revenue = unitPrice * items;
    const budget = Math.round(revenue * 1.15);
    const isVip = this.rng.next() < 0.08 && this.s.licenses.length >= 2;
    return {
      id: `c_${this.s.day}_${Math.floor(this.rng.next() * 1e9).toString(36)}`,
      name,
      title,
      productId: product.id,
      category: shelfCategoryOf(product),
      patience: isVip ? 18 : 12,
      patienceMax: isVip ? 18 : 12,
      budget,
      revenue,
      items,
      unitPrice,
      isVip,
    };
  }

  /** Public demand probe for the 3D spawner: who wants what, and will pay how much. */
  public peekDemand(): QueuedCustomer {
    return this.s.queue[0] ?? this.nextCustomer();
  }

  // ---------------------------------------------------------------- loop

  /**
   * Advance the run. `dt` is wall-clock seconds. Returns events for the 3D layer.
   * Employees act automatically; the player's own actions come through the
   * explicit methods below.
   */
  public tick(dt: number): RunEvent[] {
    if (this.s.ended) return this.drainEvents();
    const step = Math.min(1, Math.max(0, dt));
    if (step <= 0) return this.drainEvents();

    // 1. Customer arrivals, capped by the day's quota and the queue.
    this.spawnTimer += step;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      const room = 6 - this.s.queue.length;
      if (room > 0 && this.s.servedToday + this.s.queue.length < this.s.dailyQuota) {
        const customer = this.nextCustomer();
        this.s.queue.push(customer);
        this.emit({ type: 'customer_spawned', customer });
      }
    }

    // 2. Patience decay and walk-outs.
    const cleanerDamping = this.s.employees.cleaner.count > 0 ? 0.6 : 1;
    for (let i = this.s.queue.length - 1; i >= 0; i--) {
      const c = this.s.queue[i];
      c.patience -= step * cleanerDamping;
      if (c.patience <= 0) {
        this.s.queue.splice(i, 1);
        this.s.stats.customersLost += 1;
        this.s.trust = Math.max(0, this.s.trust - 1);
        this.emit({ type: 'customer_lost', customer: c, reason: 'patience' });
      }
    }

    // 3. Staff automation.
    if (this.hasStocker) {
      const spec = EMPLOYEES.stocker;
      const morale = this.s.employees.stocker.morale / 100;
      const crates = this.s.employees.stocker.count * spec.rate * morale * step;
      this.autoStock(crates);
    }
    if (this.hasCashier) {
      const spec = EMPLOYEES.cashier;
      const morale = this.s.employees.cashier.morale / 100;
      const throughput = this.s.employees.cashier.count * spec.rate * morale * step;
      this.autoServe(throughput);
    }

    // 4. Shift ends when the day's quota is served.
    if (this.s.servedToday >= this.s.dailyQuota) this.endDay();

    return this.drainEvents();
  }

  /**
   * How deep staff keep each bay: enough for roughly half a day's walk-ins, not
   * the whole shelf. Filling to capacity ties up cash and is how a fresh hire
   * empties the till.
   */
  private get staffStockTarget(): number {
    return Math.max(8, Math.min(this.shelfCapacity, Math.ceil(this.s.dailyQuota / 2)));
  }

  /** Buy `amount` crates off the dock and put them on the shelves (stocker labour). */
  private autoStock(amount: number): void {
    // Staff must not spend the last naira: keep a day of wages plus a float.
    const reserve = this.dailyWages() + 10000;
    let remaining = amount;
    while (remaining > 0.0001) {
      const want = this.pickDockProduct();
      if (!want) return;
      const cost = want.baseCost;
      if (this.s.cash - cost < reserve) return;
      const category = shelfCategoryOf(want);
      if (this.s.shelves[category] >= this.staffStockTarget) return;
      const take = Math.min(1, remaining);
      this.s.cash -= cost;
      this.s.stats.cogs += cost;
      this.s.shelves[category] = Math.min(this.shelfCapacity, this.s.shelves[category] + 1);
      remaining -= take;
    }
  }

  /** Cashier labour: serve from the front of the queue. */
  private autoServe(amount: number): void {
    let remaining = amount;
    while (remaining > 0.0001) {
      const front = this.s.queue[0];
      if (!front) return;
      const served = this.serveFront(true);
      if (!served) return;
      remaining -= 1;
    }
  }

  /** Which product the dock should hand over next: licensed, and wanted by the queue. */
  public pickDockProduct(): Product | null {
    const wanted = this.s.queue[0];
    if (wanted) {
      const product = PRODUCTS_BY_ID.get(wanted.productId);
      if (product && this.s.shelves[wanted.category] < this.shelfCapacity) return product;
    }
    const pool = this.licensedProducts.filter((p) => this.s.shelves[shelfCategoryOf(p)] < this.shelfCapacity);
    if (!pool.length) return null;
    // Prefer the emptiest shelf so the store stays balanced.
    return pool.reduce((best, p) => {
      const a = this.s.shelves[shelfCategoryOf(p)];
      const b = this.s.shelves[shelfCategoryOf(best)];
      return a < b ? p : best;
    }, pool[0]);
  }

  /** Player collects a crate at the dock. Pays its wholesale cost immediately. */
  public loadBox(productId?: string): { ok: boolean; productId?: string; cost?: number; reason?: 'cash' | 'capacity' | 'none' } {
    if (this.s.ended) return { ok: false, reason: 'none' };
    if (this.s.carriedBoxes.length >= this.carryCapacity) return { ok: false, reason: 'capacity' };
    const product = productId ? PRODUCTS_BY_ID.get(productId) : this.pickDockProduct();
    if (!product) return { ok: false, reason: 'none' };
    if (!this.licensedProducts.some((p) => p.id === product.id)) return { ok: false, reason: 'none' };
    const category = shelfCategoryOf(product);
    if (this.s.shelves[category] >= this.shelfCapacity) return { ok: false, reason: 'capacity' };
    if (this.s.cash < product.baseCost) return { ok: false, reason: 'cash' };

    this.s.cash -= product.baseCost;
    this.s.stats.cogs += product.baseCost;
    this.s.carriedBoxes.push({ productId: product.id, cost: product.baseCost });
    this.emit({ type: 'box_loaded', productId: product.id, cost: product.baseCost });
    return { ok: true, productId: product.id, cost: product.baseCost };
  }

  /** Player drops the carried box matching `category` onto that shelf. */
  public stockShelf(category: ShelfCategory): { ok: boolean; productId?: string; stockAfter?: number } {
    if (this.s.ended) return { ok: false };
    const idx = this.s.carriedBoxes.findIndex((b) => shelfCategoryOf(PRODUCTS_BY_ID.get(b.productId)!) === category);
    if (idx < 0) return { ok: false };
    if (this.s.shelves[category] >= this.shelfCapacity) return { ok: false };
    const [box] = this.s.carriedBoxes.splice(idx, 1);
    this.s.shelves[category] = Math.min(this.shelfCapacity, this.s.shelves[category] + 1);
    this.emit({ type: 'shelf_stocked', productId: box.productId, category });
    return { ok: true, productId: box.productId, stockAfter: this.s.shelves[category] };
  }

  /**
   * Serve the front customer. When `viaStaff` is true the cash is banked directly
   * (the cashier walks it to the till); otherwise it drops on the floor for the
   * player to collect, which is the tactile part of the loop.
   */
  public serveFront(viaStaff = false): { ok: boolean; customer?: QueuedCustomer; revenue?: number; reason?: 'none' | 'stock' } {
    if (this.s.ended) return { ok: false, reason: 'none' };
    const front = this.s.queue[0];
    if (!front) return { ok: false, reason: 'none' };
    const available = this.s.shelves[front.category];
    if (available <= 0) {
      this.s.queue.shift();
      this.s.stats.customersLost += 1;
      this.s.trust = Math.max(0, this.s.trust - RUN_CONFIG.outOfStockTrustPenalty);
      this.emit({ type: 'customer_lost', customer: front, reason: 'stock' });
      return { ok: false, reason: 'stock' };
    }

    // A short shelf means a short basket: the customer buys what is actually there.
    const sold = Math.min(available, front.items);
    const revenue = front.unitPrice * sold;
    this.s.shelves[front.category] = available - sold;
    this.s.queue.shift();
    this.s.servedToday += 1;
    this.s.stats.customersServed += 1;
    this.s.stats.revenue += revenue;
    this.s.trust = Math.min(100, this.s.trust + RUN_CONFIG.saleTrustGain);

    if (viaStaff) {
      this.s.cash += revenue;
    } else {
      this.s.pendingCash.push({ id: front.id, amount: revenue });
      this.emit({ type: 'cash_dropped', id: front.id, amount: revenue });
    }
    this.emit({ type: 'customer_served', customer: front, revenue, productId: front.productId });

    return { ok: true, customer: front, revenue };
  }

  /** Wholesale value of everything on the shelves, at the cheapest licensed cost. */
   public shelfValue(): number {
     let total = 0;
     for (const category of ['analgesic', 'antimalarial', 'antibiotic', 'cold_chain'] as ShelfCategory[]) {
       const units = this.s.shelves[category] ?? 0;
       if (!units) continue;
       const products = this.productsForShelf(category);
       if (!products.length) continue;
       total += units * products[0].baseCost;
     }
     return Math.round(total);
   }

   /**
    * Spoiled, expired or damaged stock leaves the shelf with no sale. Used by the
    * cold-chain blackout event and by the "expired stock" compliance beat.
    */
  public writeOffShelf(category: ShelfCategory, amount: number): number {
    const removed = Math.max(0, Math.min(Math.floor(amount), this.s.shelves[category]));
    this.s.shelves[category] -= removed;
    return removed;
  }

  /** A blackout that the generator did not cover destroys 30% of cold stock. */
  public spoilColdChain(rate = 0.3): number {
    const lost = Math.round(this.s.shelves.cold_chain * rate);
    if (lost <= 0) return 0;
    this.s.shelves.cold_chain -= lost;
    this.s.trust = Math.max(0, this.s.trust - 3);
    return lost;
  }

  /** Player walks over a cash pile. */
  public collectCash(id?: string): number {
    if (!this.s.pendingCash.length) return 0;
    if (id) {
      const idx = this.s.pendingCash.findIndex((c) => c.id === id);
      if (idx < 0) return 0;
      const [entry] = this.s.pendingCash.splice(idx, 1);
      this.s.cash += entry.amount;
      return entry.amount;
    }
    const total = this.s.pendingCash.reduce((sum, c) => sum + c.amount, 0);
    this.s.pendingCash = [];
    this.s.cash += total;
    return total;
  }

  // ---------------------------------------------------------------- spending

  public buyLicense(tier: number): { ok: boolean; reason?: 'cash' | 'owned' | 'locked' } {
    const spec = LICENSE_TIERS.find((t) => t.tier === tier);
    if (!spec) return { ok: false, reason: 'locked' };
    if (this.s.licenses.includes(tier)) return { ok: false, reason: 'owned' };
    const previous = LICENSE_TIERS.filter((t) => t.tier < tier);
    if (previous.some((t) => !this.s.licenses.includes(t.tier))) return { ok: false, reason: 'locked' };
    if (this.s.cash < spec.cost) return { ok: false, reason: 'cash' };
    this.s.cash -= spec.cost;
    this.s.stats.licensesSpent += spec.cost;
    this.s.licenses.push(tier);
    this.recomputeQuota();
    return { ok: true };
  }

  public buyUpgrade(id: UpgradeId): { ok: boolean; level?: number; cost?: number; reason?: 'cash' | 'maxed' } {
    const cost = this.upgradeCost(id);
    if (!Number.isFinite(cost)) return { ok: false, reason: 'maxed' };
    if (this.s.cash < cost) return { ok: false, reason: 'cash' };
    this.s.cash -= cost;
    this.s.stats.upgradesSpent += cost;
    this.s.upgrades[id] += 1;
    if (id === 'marketing') this.recomputeQuota();
    return { ok: true, level: this.s.upgrades[id], cost };
  }

  public hire(role: EmployeeRole): { ok: boolean; reason?: 'cash' | 'maxed' } {
    const spec = EMPLOYEES[role];
    const current = this.s.employees[role];
    if (current.count >= spec.maxCount) return { ok: false, reason: 'maxed' };
    if (this.s.cash < spec.hireCost) return { ok: false, reason: 'cash' };
    this.s.cash -= spec.hireCost;
    this.s.stats.staffSpent += spec.hireCost;
    current.count += 1;
    current.morale = Math.max(current.morale, 80);
    current.arrearsDays = 0;
    return { ok: true };
  }

  public fire(role: EmployeeRole): boolean {
    const current = this.s.employees[role];
    if (current.count <= 0) return false;
    current.count -= 1;
    return true;
  }

  public expand(): { ok: boolean; level?: number; reason?: 'cash' | 'maxed' } {
    const next = this.nextExpansion();
    if (!next) return { ok: false, reason: 'maxed' };
    if (this.s.cash < next.cost) return { ok: false, reason: 'cash' };
    this.s.cash -= next.cost;
    this.s.stats.upgradesSpent += next.cost;
    this.s.expansions = next.level;
    this.recomputeQuota();
    return { ok: true, level: next.level };
  }

  /** Player lever: reinvest everything (0) vs clear the debt as fast as possible (1). */
  public setDebtServiceShare(share: number): void {
    this.s.debtServiceShare = Math.max(0, Math.min(1, share));
  }

  public get debtServiceShare(): number {
    return this.s.debtServiceShare ?? RUN_CONFIG.debtServiceShare;
  }

  public payDebt(amount: number): number {
    const paid = Math.min(Math.max(0, Math.floor(amount)), this.s.cash, this.s.debt);
    this.s.cash -= paid;
    this.s.debt -= paid;
    this.s.stats.debtRepaid += paid;
    return paid;
  }

  private recomputeQuota(): void {
    const marketing = this.s.upgrades.marketing * UPGRADES.marketing.effectPerLevel;
    const expansion = this.s.expansions > 0
      ? EXPANSIONS.filter((e) => e.level <= this.s.expansions).reduce((sum, e) => sum + e.customerBonus, 0)
      : 0;
    const tierBonus = LICENSE_TIERS.filter((t) => this.s.licenses.includes(t.tier)).reduce(
      (sum, t) => sum + t.customerBonus,
      0
    );
    this.s.dailyQuota = RUN_CONFIG.baseCustomersPerDay + marketing + expansion + tierBonus;
  }

  // ---------------------------------------------------------------- day cycle

  /** End the shift: pay wages and overhead, service debt, advance the day. */
  public endDay(): DayReport {
    if (this.s.ended) {
      return {
        day: this.s.day,
        served: 0,
        revenue: 0,
        cogs: 0,
        wages: 0,
        overhead: 0,
        net: 0,
        debtRepaid: 0,
        cashAfter: this.s.cash,
        debtAfter: this.s.debt,
        trust: this.s.trust,
        bankrupt: true,
      };
    }
    const wages = this.dailyWages();
    const overhead = RUN_CONFIG.dailyOverhead;
    const revenue = this.s.stats.revenue;
    const cogs = this.s.stats.cogs;
    const net = revenue - cogs - wages - overhead;

    this.s.cash -= wages + overhead;
    this.s.stats.wages += wages;
    this.s.stats.overhead += overhead;
    this.s.stats.net = net;
    if (net > this.s.stats.bestDayNet) this.s.stats.bestDayNet = net;

    // Unpaid wages: morale drops, staff may quit.
    const arrears = this.s.cash < 0;
    for (const role of Object.keys(EMPLOYEES) as EmployeeRole[]) {
      const emp = this.s.employees[role];
      if (emp.count <= 0) continue;
      if (arrears) {
        emp.arrearsDays += 1;
        emp.morale = Math.max(0, emp.morale - 18);
        if (emp.morale < RUN_CONFIG.wageArrearsQuitMorale) {
          emp.count = Math.max(0, emp.count - 1);
          emp.arrearsDays = 0;
        }
      } else {
        emp.arrearsDays = 0;
        emp.morale = Math.min(100, emp.morale + 4);
      }
    }
    if (this.s.cash < 0) this.s.cash = 0;

    // Debt service: Chief Okonkwo takes a share of profit, not the whole till.
    // The rest stays as working capital — the player has to choose stock vs debt.
    const profit = Math.max(0, net);
    const debtRepaid = this.payDebt(Math.floor(profit * (this.s.debtServiceShare ?? RUN_CONFIG.debtServiceShare)));

    const report: DayReport = {
      day: this.s.day,
      served: this.s.servedToday,
      revenue,
      cogs,
      wages,
      overhead,
      net,
      debtRepaid,
      cashAfter: this.s.cash,
      debtAfter: this.s.debt,
      trust: this.s.trust,
      bankrupt: this.s.cash <= 0 && this.s.debt > 0 && !this.isAutomated,
    };
    this.s.dayLog.push(report);
    this.emit({ type: 'day_ended', report });
    this.emit({ type: 'save_due' });

    // Advance the calendar.
    this.s.day += 1;
    this.s.servedToday = 0;
    this.s.stats.revenue = 0;
    this.s.stats.cogs = 0;
    this.s.rushActive =
      RUN_CONFIG.rushEveryNthDay > 0 && this.s.day % RUN_CONFIG.rushEveryNthDay === 0;
    if (this.s.rushActive) this.s.stats.rushHours += 1;
    this.spawnTimer = 0;
    this.s.counterfeitCrate = this.maybeCounterfeitCrate();

    // Day 90 closes the season, but the stay/leave choice belongs to the player:
    // wait for it instead of guessing on their behalf.
    if (this.s.day > this.s.seasonLength && !this.s.ended && this.s.playerDecision) {
      this.finishSeason(this.s.playerDecision);
    }
    return report;
  }

  private maybeCounterfeitCrate(): RunSnapshot['counterfeitCrate'] {
    if (!(RUN_CONFIG.counterfeitDays as readonly number[]).includes(this.s.day)) return null;
    const pool = this.licensedProducts.filter((p) => shelfCategoryOf(p) !== 'cold_chain');
    if (!pool.length) return null;
    const product = pool[Math.floor(this.rng.next() * pool.length)];
    return { productId: product.id, unitCost: Math.round(product.baseCost * 0.6), day: this.s.day };
  }

  /** Accepting a cut-price crate is cheap stock and a trust bomb waiting to go off. */
  public resolveCounterfeitCrate(action: 'accept' | 'refuse'): { cashDelta: number; trustDelta: number; clue: boolean } {
    const crate = this.s.counterfeitCrate;
    if (!crate) return { cashDelta: 0, trustDelta: 0, clue: false };
    this.s.counterfeitCrate = null;
    if (action === 'refuse') {
      this.s.clues += 1;
      this.s.trust = Math.min(100, this.s.trust + 2);
      return { cashDelta: 0, trustDelta: 2, clue: true };
    }
    const product = PRODUCTS_BY_ID.get(crate.productId);
    if (!product) return { cashDelta: 0, trustDelta: 0, clue: false };
    const units = 6;
    const cost = crate.unitCost * units;
    if (this.s.cash < cost) return { cashDelta: 0, trustDelta: 0, clue: false };
    this.s.cash -= cost;
    this.s.stats.cogs += cost;
    const category = shelfCategoryOf(product);
    this.s.shelves[category] = Math.min(this.shelfCapacity, this.s.shelves[category] + units);
    this.s.trust = Math.max(0, this.s.trust - 6);
    this.s.stats.counterfeitAccepted += 1;
    return { cashDelta: -cost, trustDelta: -6, clue: false };
  }

  public finishSeason(decision: 'stay' | 'leave' = 'stay'): EndgameReport {
    const report = evaluateEndgame(this.toEndgameState(), decision);
    this.s.ended = true;
    this.s.ending = report.outcome;
    this.s.playerDecision = decision;
    this.emit({ type: 'season_ended', report });
    return report;
  }

  /** The player's day-90 choice. Ignored once the season is already resolved. */
  public adjustTrust(delta: number): number {
    this.s.trust = Math.max(0, Math.min(100, this.s.trust + delta));
    return this.s.trust;
  }

  /** A new piece of evidence for the Agency docket. */
  public addClue(n = 1): number {
    this.s.clues = Math.min(10, this.s.clues + n);
    return this.s.clues;
  }

  /**
   * Enforcement reward from an Agency raid: it clears debt first and any surplus
   * lands in the till, so the raid is never worthless on a debt-free run.
   */
  public applyAgencyReward(amount: number): { toDebt: number; toCash: number } {
    const total = Math.max(0, Math.round(amount));
    const toDebt = Math.min(total, this.s.debt);
    this.s.debt -= toDebt;
    this.s.stats.debtRepaid += toDebt;
    const toCash = total - toDebt;
    this.s.cash += toCash;
    return { toDebt, toCash };
  }

  public chooseEnding(decision: 'stay' | 'leave'): EndgameReport | null {
    this.s.playerDecision = decision;
    if (!this.s.ended && this.s.day > this.s.seasonLength) return this.finishSeason(decision);
    return null;
  }

  /**
   * Applies a Pharmacy Board inspection (produced by PharmChrisEngine) to the run:
   * fine out of the till, trust hit, strikes, and the padlock on the second failure.
   */
  public applyInspection(result: {
    defectType: string;
    fine: number;
    trustDelta: number;
    violationsCount: number;
    sealed: boolean;
    notes?: string[];
    day?: number;
  }): { sealed: boolean; fine: number } {
    const fine = Math.max(0, Math.round(result.fine));
    this.s.cash = Math.max(0, this.s.cash - fine);
    this.s.trust = Math.max(0, Math.min(100, this.s.trust + result.trustDelta));
    this.s.boardViolations += Math.max(0, result.violationsCount);
    this.s.lastInspection = {
      day: result.day ?? this.s.day,
      defectType: result.defectType,
      fine,
      trustDelta: result.trustDelta,
      notes: result.notes ?? [],
    };
    const sealed = result.sealed || this.s.boardViolations >= 2;
    if (sealed && !this.s.ended) {
      this.s.isPremisesSealed = true;
      this.s.sealedReason = 'compliance';
      this.finishSeason(this.s.playerDecision ?? 'stay');
    }
    return { sealed, fine };
  }

  /** Adapter so the tested endgame matrix stays the single source of truth. */
  public toEndgameState(): GameState {
    return {
      saveVersion: 1,
      seed: this.s.seed,
      day: Math.min(this.s.day, this.s.seasonLength),
      daysRemaining: Math.max(0, this.s.seasonLength - this.s.day),
      seasonLength: this.s.seasonLength,
      cash: this.s.cash,
      trust: this.s.trust,
      debt: this.s.debt,
      originalDebt: this.s.originalDebt,
      inventory: {},
      quarantinedStock: {},
      clues: new Array(this.s.clues).fill('clue'),
      dailyScratchQuota: 3,
      currentCustomerIndex: 0,
      totalCustomersServed: this.s.stats.customersServed,
      successfulSales: this.s.stats.customersServed,
      reputationScore: this.s.trust,
      day1Phase: 'free_play',
      day1Stats: { mamaNgoziServed: false, emekaServed: false, ledgerOpened: false, cashEarned: 0 },
      boardViolations: this.s.boardViolations,
      isPremisesSealed: this.s.isPremisesSealed,
      sealedReason: this.s.sealedReason,
      activeShocks: [],
      agencyRaidCompleted: false,
      milestonesTriggered: [],
      inspectionHistory: [],
    };
  }

  // ---------------------------------------------------------------- offline

  /** How many hours of trade the shop can bank unattended (staff scale it). */
  public get offlineCapHours(): number {
    const staffed = (Object.keys(EMPLOYEES) as EmployeeRole[]).filter((r) => this.s.employees[r].count > 0).length;
    return Math.min(RUN_CONFIG.offlineCapSeconds / 3600, RUN_CONFIG.offlineBaseHours + staffed * RUN_CONFIG.offlineHoursPerStaff);
  }

  /**
   * Simulate a stretch of unattended time at the current staffing level.
   * Returns what the store actually earned, never a fabricated number.
   */
  public simulateOffline(secondsRaw: number): {
    seconds: number;
    earned: number;
    served: number;
    capped: boolean;
    days: number;
  } {
    const capSeconds = this.offlineCapHours * 3600;
    const seconds = Math.max(0, Math.min(capSeconds, secondsRaw));
    if (!this.isAutomated || seconds < 60) {
      return { seconds, earned: 0, served: 0, capped: secondsRaw > seconds, days: 0 };
    }
    const startCash = this.s.cash;
    const startStock = this.shelfValue();
    const startServed = this.s.stats.customersServed;
    const startDay = this.s.day;
    const step = 1;
    const steps = Math.floor(seconds / step);
    for (let i = 0; i < steps && !this.s.ended && this.s.day <= this.s.seasonLength; i++) {
      this.tick(step);
      this.drainEvents();
      if (this.s.day - startDay >= RUN_CONFIG.offlineMaxDays) break;
    }
    // Offline is not a place for loose cash; sweep the till.
    this.collectCash();
    // Net worth, not raw cash: stock bought overnight is still the shop's money.
    const earned = Math.round(this.s.cash - startCash + (this.shelfValue() - startStock));
    return {
      seconds,
      earned,
      served: this.s.stats.customersServed - startServed,
      capped: secondsRaw > seconds,
      days: this.s.day - startDay,
    };
  }

  // ---------------------------------------------------------------- save

  public toJSON(): RunSnapshot {
    return JSON.parse(JSON.stringify(this.s)) as RunSnapshot;
  }

  public static fromJSON(raw: unknown): StoreRun | null {
    if (!raw || typeof raw !== 'object') return null;
    const candidate = migrateToSnapshot(raw as Record<string, unknown>);
    if (!candidate) return null;
    const run = new StoreRun(candidate, candidate.seed);
    return run;
  }

  public touch(now = Date.now()): void {
    this.s.lastSeenAt = now;
  }

  public setOnboardingStep(step: number): void {
    this.s.onboardingStep = Math.max(this.s.onboardingStep, Math.min(6, step));
  }

  public get onboardingStep(): number {
    return this.s.onboardingStep;
  }

  public get stats(): RunStats {
    return this.s.stats;
  }

  public get clues(): number {
    return this.s.clues;
  }

  public get counterfeitCrate(): RunSnapshot['counterfeitCrate'] {
    return this.s.counterfeitCrate;
  }

  public get dayLog(): DayReport[] {
    return this.s.dayLog;
  }

  /** Net profit per second over the last N days, used for the idle-rate readout. */
  public recentNetPerSecond(dayWindow = 5): number {
    const log = this.s.dayLog.slice(-dayWindow);
    if (!log.length) return 0;
    const net = log.reduce((sum, d) => sum + d.net, 0) / log.length;
    // A shift is modelled as a 120s working day for pacing purposes.
    return net / 120;
  }
}

/**
 * Migrates any historical save shape into the v2 snapshot.
 * v1 was the narrative GameState (saveVersion 1) with no store economy, so its
 * cash/debt/day carry over and everything else starts fresh. Unknown or
 * malformed payloads return null so the caller starts a clean run.
 */
export function migrateToSnapshot(raw: Record<string, unknown>): RunSnapshot | null {
  const version = Number(raw.saveVersion ?? 1);
  if (version === 2) {
    const s = raw as unknown as RunSnapshot;
    if (typeof s.cash !== 'number' || typeof s.day !== 'number' || typeof s.debt !== 'number') return null;
    if (!s.employees || !s.upgrades || !s.shelves) return null;
    const base = StoreRun.create({ seed: s.seed ?? 19980812, now: s.createdAt ?? Date.now() });
    const merged = base.toJSON();
    return {
      ...merged,
      ...s,
      employees: { ...merged.employees, ...s.employees },
      upgrades: { ...merged.upgrades, ...s.upgrades },
      shelves: { ...merged.shelves, ...s.shelves },
      stats: { ...merged.stats, ...(s.stats ?? {}) },
      dayLog: Array.isArray(s.dayLog) ? s.dayLog.slice(-120) : [],
      licenses: Array.isArray(s.licenses) && s.licenses.length ? s.licenses : [1],
      saveVersion: 2,
    };
  }
  if (version === 1) {
    const cash = typeof raw.cash === 'number' && Number.isFinite(raw.cash) ? raw.cash : RUN_CONFIG.startingCash;
    const debt = typeof raw.debt === 'number' && Number.isFinite(raw.debt) ? raw.debt : RUN_CONFIG.startingDebt;
    const day = typeof raw.day === 'number' && raw.day >= 1 && raw.day <= RUN_CONFIG.seasonLength ? raw.day : 1;
    const base = StoreRun.create({ seed: Number(raw.seed) || 19980812, cash, debt });
    const snapshot = base.toJSON();
    snapshot.day = day;
    snapshot.trust = typeof raw.trust === 'number' ? Math.max(0, Math.min(100, raw.trust)) : RUN_CONFIG.startingTrust;
    snapshot.originalDebt = typeof raw.originalDebt === 'number' ? raw.originalDebt : RUN_CONFIG.startingDebt;
    return snapshot;
  }
  return null;
}
