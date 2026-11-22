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
npm test           # 281 tests: sim, save, telemetry, arcade integration, characters, camera framing, season proof
```

Useful scripts (all run against the real economy):

```bash
npx vite-node scripts/balance.ts --seeds=1,7,42 --verbose   # economy curve for a greedy player
npx vite-node scripts/season_report.ts                      # play every ending, print the trace
node scripts/playtest-gpu.mjs                               # real-GPU playthrough + screenshots
QUALITY=low node scripts/perf-probe.mjs                     # 6x-throttled perf probe
node scripts/check-mobile.mjs                               # HUD/camera gate, 7 viewports (exit 1 on failure)
node scripts/check-android.mjs --cdp http://127.0.0.1:9222  # same gate on Android WebView over CDP
```

`check-mobile.mjs` is the regression gate for the two things a screenshot cannot
settle: overlapping HUD elements and geometry parked off screen. It fails the run if
any HUD boxes intersect, the page scrolls horizontally, the player renders under 38px
tall, or a trigger zone is off screen while the player stands in it.

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

## Camera and HUD

The camera solves its own framing instead of multiplying a fixed offset by the aspect
ratio (`src/ui/arcade/ArcadeViewport.ts`):

- **Wide viewports** frame the whole 16×18 m room with a 0.92 screen margin and trail
  the player by at most 2.2 m, so the shop stays centred.
- **Phones** cannot show the whole room *and* keep a 1.75 m character controllable —
  fitting the room on a 360px screen renders the player at about 20px. So the view
  zooms to a playable scale (player ≥ 40px) and trails the player, clamped 2.5 m
  inside the walls. Every zone is on screen by the time you stand in it.
- The solver projects the room corners and iterates the distance; the pan limits are
  measured, not guessed.

Below 560px the HUD switches to its phone layout: the control hint moves above the
action row, the INVEST badge shrinks to a price, the mode switcher collapses to two
icon buttons, and touch devices get touch copy instead of `WASD`.

## Art direction

The renderer ships two looks, switchable per URL so they can be compared from one
build: `?art=v1` (default, flat ambient) and `?art=v2`.

v2 is the environment-lighting pass in `src/ui/arcade/art.ts`: a PMREM environment
map instead of a 0.9 ambient wash, four lights instead of five, a matte-surface pass,
a baked per-vertex contact-AO gradient on static geometry, contact bands under the
counter and wall bases, and a floor pulled back from near-clipping.

`node scripts/art-ab.mjs` captures both at 360×800 and 1280×720;
`node scripts/art-stats.mjs` reports luminance percentiles per version, so a look
change gets numbers rather than adjectives.

The cast is drawn, not modelled: `src/ui/arcade/kit/charSprite.ts` emits a 64×128 SVG
figure — painted two-tone shading, ink outline, no draw calls, no texture memory.
`look.ts` derives every person from their id (skull, jaw, brows, eye gap, mouth,
cheekbones, age, posture, beard shape, hair mass), so a reload does not reshuffle the
crowd and the variety can be asserted in tests rather than eyeballed.

- `?art=sprites` renders the crowd as one alpha-tested quad batch from a single atlas
  (95 draws vs 105 for the rig at two customers). The rig stays the default: a
  billboard always faces the camera, and a customer walking away from you should not.
- `node scripts/char-svg-shots.mjs` (with `npx vite --port 5199`) renders the cast at
  80 px and 190 px; `char-variants.html` does the same for every hairstyle and beard
  shape side by side — the only way to see all eight at once.

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
- [`docs/VERIFICATION.md`](docs/VERIFICATION.md) — how a build is proven, and on which sandboxes
- [`docs/BENCHMARK-IDLE-LUMBERJACK.md`](docs/BENCHMARK-IDLE-LUMBERJACK.md) — APK teardown of the benchmark, and what we took from it
