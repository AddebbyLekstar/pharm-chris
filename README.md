# PHARM CHRIS — 3D arcade-idle pharmacy

Run a Lagos community pharmacy for 90 days. Buy stock at the dock, carry it to the
shelves, serve the queue, then reinvest in licences, staff and floor space before
Chief Okonkwo's ₦4.2M comes due.

**Live:** https://pharm-chris.vercel.app · **Stack:** TypeScript · Three.js · Vite · Vitest
**Benchmark:** *Idle Lumberjack 2/3D* — APK teardown in [`docs/BENCHMARK-IDLE-LUMBERJACK.md`](docs/BENCHMARK-IDLE-LUMBERJACK.md)

---

## The loop

```
DOCK (pay wholesale) → CARRY (stack on your back) → SHELF (match the bay)
        ↑                                                    ↓
   INVEST: licence · staff · capacity · floor  ←  COUNTER (customer pays, cash drops)
```

- **Dock** — crates cost real money. Every trip is a cash decision, not free stock.
- **Stack** — up to N boxes, spring-damped physics that leans as you run.
- **Shelf** — analgesic / antimalarial / antibiotic / cold-chain bays. Empty shelf = lost customer + trust hit.
- **Counter** — the front customer pays for their basket; the cash lands at your feet and must be picked up.
- **Day end** — wages + overhead out, a share of profit to the debt (the rest is working capital), then the calendar advances. 28 customers a day at the start, up to 68 as the shop grows.
- **Season end** — day 90 asks stay-or-fly and resolves into one of six endings.

Progression levers (every track grows ×1.5 per level — the benchmark's cost-parity idea):

| Lever | Effect | Cost range |
|---|---|---|
| Licences (5 tiers) | new product lines, +4…+8 walk-ins a day, bigger baskets | ₦60k → ₦480k |
| Upgrades | carry, speed, dock throughput, street marketing | 8–10 levels each |
| Staff | stocker buys+stocks, cashier serves+banks, cleaner protects trust | 2/2/1 |
| Floor expansion | +10/+12 units per bay, +4/+6 customers a day, a visible new aisle | 2 levels |

## Architecture

```
src/sim/                     pure, deterministic, no DOM — all the money lives here
  progression.ts             StoreRun: the idle economy (licences, staff, days, debt, save shape)
  engine.ts                  narrative engine: deliveries, MAS scratch codes, inspections, raids
  endgame.ts                 the six-outcome matrix (single source of truth)
  save.ts                    versioned localStorage, migration, corrupt-save quarantine, offline settle
  telemetry.ts               local-only funnel + export
  onboarding.ts              one objective at a time
  seasonBot.ts               deterministic 90-day bot used to prove every ending resolves
  prng.ts                    Mulberry32

src/ui/arcade/               the 3D view + HUD (default mode)
  ArcadeGameDirector.ts      tick loop; the view reacts to StoreRun events
  ArcadeStoreHud.ts          cash/day/debt chips, objective banner, investment drawer, modals
  ArcadeStaff.ts             visible staff NPCs
  quality.ts                 low/high device tier (shadows, pixel ratio)
  mergeMeshes.ts             rig merging to keep draw calls down
  ArcadeScene / PharmacyShelves3D / MedicineStack / CashDropManager / FloorUpgradePad / …

src/ui/three/                first-person mode (secondary, ?mode=3d)
src/content/products.json    11 fictional products with real Lagos price bands
```

The 3D layer is a **view**: `StoreRun` decides who walks in, what they buy, what it
costs and what it pays. The renderer never owns a number.

## Run it

```bash
npm install
npm run dev        # http://localhost:3030
npm run build      # tsc + vite build
npm test           # 140 tests: sim, save, telemetry, arcade integration, season proof
```

Useful scripts (all run against the real economy):

```bash
npx vite-node scripts/balance.ts --seeds=1,7,42 --verbose   # economy curve for a greedy player
npx vite-node scripts/season_report.ts                      # play every ending, print the trace
node scripts/playtest-gpu.mjs                               # real-GPU playthrough + screenshots
QUALITY=low node scripts/perf-probe.mjs                     # 6x-throttled perf probe
```

## Controls

| | Desktop | Phone |
|---|---|---|
| Move | WASD / arrows / drag | drag anywhere (virtual joystick) |
| Act | walk onto a zone | walk onto a zone |
| Invest | `I` / `B` or the INVEST button | INVEST button |
| Debug overlay | `F2` or `?debug=1` | — |
| First-person mode | button, bottom-left | button, bottom-left |

Zones do the work: stand on the dock to buy, on a shelf bay to stock, at the counter
to serve. Upgrade pads charge while you stand on them.

## Save, offline, telemetry

- **Save** `pharm_chris_run_v2` in localStorage: versioned, migrated from the old
  `saveVersion: 1` payload, corrupt blobs quarantined to `….corrupt` instead of wiping
  progress. Autosaves on day close, on purchase, and on page hide.
- **Offline** the staff keep trading: 4h base + 2h per staffed role, hard cap 8h, paid
  from a real headless simulation of the same economy — never a fabricated number.
  No staff, no earnings.
- **Telemetry** is local-only (no PII, no network): session start/end, each tutorial
  beat, day closes, purchases, inspections, endings, plus 24h/7d return counters.
  Export from the investment drawer or `window.pharmChris.exportFunnel()`.

## Season resolution

`src/sim/seasonBot.ts` plays full 90-day seasons under fixed seeds. Every ending is
reachable and asserted in `tests/season_bot.test.ts`; the trace and seeds are written
up in [`docs/SEASON-PROOF.md`](docs/SEASON-PROOF.md).

## Performance target

The player device is a 2GB Tecno/Infinix at 360×800, not a desktop. `quality.ts`
detects it (`deviceMemory`, cores, reduced-motion) and drops the shadow pass and pixel
ratio; the rig merge and the removed transmission pass keep the frame under budget.
Numbers, method and the remaining gaps: [`docs/PERF-BUDGET.md`](docs/PERF-BUDGET.md).

## Docs

- [`docs/STORE_SIMULATOR_SYSTEMS_BLUEPRINT.md`](docs/STORE_SIMULATOR_SYSTEMS_BLUEPRINT.md) — original systems blueprint (licences 4.1, expansions 4.3, staff 4.4)
- [`docs/3D_VISUAL_JUICE_SPEC.md`](docs/3D_VISUAL_JUICE_SPEC.md) — the tactile spec the 3D layer implements
- [`docs/SEASON-PROOF.md`](docs/SEASON-PROOF.md) — endings, seeds, assertions
- [`docs/PERF-BUDGET.md`](docs/PERF-BUDGET.md) — device profile, draw-call budget, fixes
- [`docs/BENCHMARK-IDLE-LUMBERJACK.md`](docs/BENCHMARK-IDLE-LUMBERJACK.md) — APK teardown of the benchmark, and what we took from it
