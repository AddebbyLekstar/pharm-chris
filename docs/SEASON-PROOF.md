# Season proof — all six endings, under fixed seeds

`src/sim/seasonBot.ts` plays a complete 90-day season against the *real* economy and
the *real* compliance machinery (delivery crates, MAS scratch codes, Pharmacy Board
inspections, Agency raid), then reports what happened. `tests/season_bot.test.ts`
asserts the results below on every run.

Re-run:

```bash
npx vite-node scripts/season_report.ts     # prints the trace table
npx vitest run tests/season_bot.test.ts    # asserts it
```

## Results (current build)

| Policy | Seed | Strategy | Ending | Debt repaid | Cash at day 90 | Trust | Served | Tier | Staff | Inspections | Raid | MAS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| play well, service the debt | 19980812 | greedy | `STAYED_SOLVENT` | ₦4,200,000 (100 %) | ₦424,566 | 100 | 4,776 | 5 | 2 | 1 (pass) | ✅ | 18 |
| reinvest, leave ₦1.2M outstanding | 19980812 | greedy | `STAYED_BARELY` | ₦3,033,015 (72 %) | ₦526,872 | 100 | 4,994 | 5 | 2 | 1 (pass) | ✅ | 18 |
| clear it, then fly | 4242 | greedy | `LEFT_SHOP_TO_SADE` | ₦4,200,000 (100 %) | ₦439,928 | 100 | 4,790 | 5 | 2 | 1 (pass) | ✅ | 18 |
| fly with a balance | 4242 | greedy | `LEFT_SHOP_SOLD` | ₦3,038,730 (72 %) | ₦564,152 | 100 | 4,876 | 5 | 2 | 1 (pass) | ✅ | 18 |
| never invest, never pay | 99 | idle | `SEALED_DEBT` | ₦250,000 (6 %) | ₦0 | 0 | 0 | 1 | 0 | 1 (pass) | — | 0 |
| no pharmacist, shelf the fakes | 11 | casual | `SEALED_COMPLIANCE` | — (sealed at day 75) | ₦7,128,552 | 90 | 3,548 | 5 | 0 | **2 (2nd seals)** | ✅ | 15 |

What each row actually exercises:

- **Debt arithmetic** — `debtRepaid === originalDebt − finalDebt` for every run; the
  day-end service pays `debtServiceShare × net` (player-controlled 0–100 % in the HUD),
  never more than the till holds.
- **Day 90 decision** — the season does *not* auto-resolve: `endDay()` past day 90 sets
  `needsEndingDecision` and waits for `chooseEnding('stay' | 'leave')`. The bot makes the
  same choice the player's modal does.
- **Inspection consequences** — a compliant shop passes on day 45 (fine ₦0, trust +5).
  A shop with no pharmacist on the premises and counterfeit stock on the shelf fails on
  day 45, then fails the day-75 follow-up: **two strikes → `applyInspection` seals the
  premises and resolves `SEALED_COMPLIANCE` immediately** (₦300,000 fine, −10 trust).
- **Agency raid** — 5 counterfeit temptations plus MAS checks on Dele's crates build the
  clue docket; at the day-70 window with ≥7 clues, `executeAgencyRaid()` fires, applies
  its ₦250,000 relief (debt first, then cash) and +15 trust. The safering bot reaches it.
- **MAS checks** — each delivery day resets the 3-check allowance (`beginTradingDay()`),
  the crate is scratched then verified; a duplicate/invalid response adds a clue instead
  of silently passing. 18 checks across the season, never exceeding the allowance.
- **Determinism** — same seed + policy ⇒ identical ending, debt, served count and day
  history (asserted).

## Why the bots differ

The policies are *play styles*, not cheats:

- `greedy` — stocks the cheapest item per bay, serves every customer, buys licences
  first, then upgrades, expansion, staff last. Reaches tier 5.
- `casual` — acts on roughly one frame in three, keeps a small cash buffer. Slower, and
  in the compliance run it also accepts Dele's crates.
- `idle` — never touches the floor; the shop earns nothing without staff.

`targetDebtRemaining` is the one explicit lever: a player who plans to fly out (or to
renegotiate) stops overpaying the debt once it is inside the band they intend to leave
outstanding. That is the `STAYED_BARELY` / `LEFT_SHOP_SOLD` trade — more cash in hand,
less debt cleared.

## Not proven here

- The arcade HUD's endgame modal is exercised by the same `chooseEnding` path but is not
  covered by an automated UI test (manual playtest only).
- No real-device session has run a full 90-day season; the bot compresses each shift to
  120 s of simulated time, so wall-clock pacing of a full season (≈3 h of active play
  plus offline) is a design target, not a measurement.
