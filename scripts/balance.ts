/**
 * Balance harness. Plays the store with a scripted greedy bot and prints the
 * economic curve so the numbers in RUN_CONFIG can be tuned against a real run
 * instead of a spreadsheet guess.
 *
 *   npx vite-node scripts/balance.ts [--seeds=1,2,3]
 */
import { StoreRun, UPGRADES, EMPLOYEES, RUN_CONFIG, ShelfCategory } from '../src/sim/progression';

interface BotOptions {
  seed: number;
  /** Seconds of simulated play per day. */
  daySeconds: number;
  /** How eagerly the bot hires: 0 none, 1 cashier+stocker, 2 everything. */
  hirePolicy: number;
  verbose: boolean;
}

interface DayRow {
  day: number;
  cash: number;
  debt: number;
  served: number;
  revenue: number;
  net: number;
  trust: number;
  tier: number;
  staff: number;
  shelf: number;
}

const CATEGORIES: ShelfCategory[] = ['analgesic', 'antimalarial', 'antibiotic', 'cold_chain'];

function stockShelfFor(run: StoreRun, category: ShelfCategory): boolean {
  return run.stockShelf(category).ok;
}

function playDay(run: StoreRun, opts: BotOptions): void {
  const maxSteps = Math.ceil(opts.daySeconds / 0.25);
  const startDay = run.day;
  for (let step = 0; step < maxSteps; step++) {
    run.tick(0.25);
    if (run.day !== startDay) return;

    // 1. Top up shelves that the queue actually wants, keeping a cash float.
    for (const cat of CATEGORIES) {
      const products = run.productsForShelf(cat);
      if (!products.length) continue;
      const cheapest = products[0];
      while (
        run.shelfLevels[cat] < Math.min(run.shelfCapacity, 8) &&
        run.cash > cheapest.baseCost + 20000
      ) {
        const loaded = run.loadBox(cheapest.id);
        if (!loaded.ok) break;
        if (!stockShelfFor(run, cat)) break;
      }
    }
    // 2. Serve whatever is waiting.
    while (run.queue.length > 0) {
      const res = run.serveFront(false);
      if (!res.ok) break;
    }
    // 3. Sweep the cash.
    run.collectCash();
    if (run.state.servedToday >= run.dailyQuota) break;
  }
  run.collectCash();
  if (run.day === startDay) {
    run.endDay();
    // Clear any cash the shift left on the floor before the next morning.
    run.collectCash();
  }
}

function invest(run: StoreRun, opts: BotOptions): void {
  // Priority: licences (basket) -> marketing/carry -> expansion -> staff last,
  // because wages are a daily drain the shop has to out-earn.
  const next = run.nextLicenseTier();
  if (next && run.cash > next.cost + 40000) run.buyLicense(next.tier);

  for (const id of ['marketing', 'carry', 'dock_rate', 'speed'] as const) {
    const cost = run.upgradeCost(id);
    if (Number.isFinite(cost) && run.cash > cost + 60000) run.buyUpgrade(id);
  }

  const expansion = run.nextExpansion();
  if (expansion && run.cash > expansion.cost + 80000) run.expand();

  if (opts.hirePolicy >= 1 && run.highestTier >= 2) {
    const stocker = run.employeeCost('stocker');
    if (stocker.count < 1 && run.cash > stocker.hire + 60000) run.hire('stocker');
    const cashier = run.employeeCost('cashier');
    if (cashier.count < 1 && run.cash > cashier.hire + 80000) run.hire('cashier');
  }
  if (opts.hirePolicy >= 2 && run.highestTier >= 3) {
    const cleaner = run.employeeCost('cleaner');
    if (cleaner.count < 1 && run.cash > cleaner.hire + 40000) run.hire('cleaner');
  }
}

export function runBot(opts: BotOptions): DayRow[] {
  const run = StoreRun.create({ seed: opts.seed });
  const rows: DayRow[] = [];
  let guard = 0;
  while (!run.ended && guard < 400) {
    guard++;
    const before = run.day;
    playDay(run, opts);
    const report = run.dayLog[run.dayLog.length - 1];
    rows.push({
      day: before,
      cash: Math.round(run.cash),
      debt: Math.round(run.debt),
      served: report?.served ?? 0,
      revenue: report?.revenue ?? 0,
      net: report?.net ?? 0,
      trust: Math.round(run.trust),
      tier: run.highestTier,
      staff: run.employeeCost('stocker').count + run.employeeCost('cashier').count + run.employeeCost('cleaner').count,
      shelf: CATEGORIES.reduce((sum, c) => sum + run.shelfLevels[c], 0),
    });
    if (run.day > run.state.seasonLength) break;
    invest(run, opts);
    if (run.day === before) break;
  }
  return rows;
}

function summarise(rows: DayRow[], seed: number): string {
  const last = rows[rows.length - 1];
  const peakNet = rows.reduce((max, r) => Math.max(max, r.net), 0);
  const totalNet = rows.reduce((sum, r) => sum + r.net, 0);
  const totalServed = rows.reduce((sum, r) => sum + r.served, 0);
  const badDays = rows.filter((r) => r.net < 0).length;
  const firstTier2 = rows.find((r) => r.tier >= 2)?.day ?? -1;
  const firstTier3 = rows.find((r) => r.tier >= 3)?.day ?? -1;
  const firstTier5 = rows.find((r) => r.tier >= 5)?.day ?? -1;
  return [
    `seed ${seed}: ended day ${last.day}, cash N${last.cash.toLocaleString()}, debt N${last.debt.toLocaleString()}`,
    `  repaid N${(RUN_CONFIG.startingDebt - last.debt).toLocaleString()} (${Math.round(((RUN_CONFIG.startingDebt - last.debt) / RUN_CONFIG.startingDebt) * 100)}%)`,
    `  total net N${totalNet.toLocaleString()}, peak day net N${peakNet.toLocaleString()}, loss days ${badDays}/${rows.length}`,
    `  customers served ${totalServed}, final tier ${last.tier}, staff ${last.staff}`,
    `  first tier2 day ${firstTier2}, tier3 day ${firstTier3}, tier5 day ${firstTier5}`,
  ].join('\n');
}

const seedArg = process.argv.find((a) => a.startsWith('--seeds='));
const seeds = (seedArg ? seedArg.split('=')[1] : '19980812').split(',').map(Number);
const daySeconds = Number((process.argv.find((a) => a.startsWith('--daySeconds=')) ?? '--daySeconds=120').split('=')[1]);
const hirePolicy = Number((process.argv.find((a) => a.startsWith('--hire=')) ?? '--hire=2').split('=')[1]);
const verbose = process.argv.includes('--verbose');

for (const seed of seeds) {
  const rows = runBot({ seed, daySeconds, hirePolicy, verbose });
  if (verbose) {
    console.log('day\tcash\tdebt\tserved\trevenue\tnet\ttrust\ttier\tstaff\tshelf');
    for (const r of rows) {
      console.log(
        [r.day, r.cash, r.debt, r.served, r.revenue, r.net, r.trust, r.tier, r.staff, r.shelf].join('\t')
      );
    }
  }
  console.log(summarise(rows, seed));
}
