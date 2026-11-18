/**
 * Season proof runner: plays every ending policy and prints the trace.
 *   npx vite-node scripts/season_report.ts
 */
import { ENDING_POLICIES, playSeason, SeasonTrace } from '../src/sim/seasonBot';

const rows: SeasonTrace[] = [];
for (const { label, policy } of ENDING_POLICIES) {
  const trace = playSeason(policy);
  rows.push(trace);
  console.log(
    [
      label.padEnd(18),
      String(trace.ending).padEnd(18),
      `debt ${Math.round(trace.finalDebt).toLocaleString()}`.padEnd(20),
      `repaid ${Math.round(trace.repaymentRatio * 100)}%`.padEnd(12),
      `cash ${Math.round(trace.finalCash).toLocaleString()}`.padEnd(18),
      `trust ${Math.round(trace.trust)}`.padEnd(10),
      `served ${trace.customersServed}`.padEnd(14),
      `tier ${trace.licences} staff ${trace.staff}`.padEnd(16),
      `inspections ${trace.inspections.length} raid ${trace.raid ? 'yes' : 'no'} mas ${trace.masChecks}`,
    ].join('| ')
  );
}

console.log('\nsummary');
for (const row of rows) {
  console.log(`- ${row.ending} (seed ${row.seed}, ${row.strategy}) debt ${Math.round(row.finalDebt)} repaid ${Math.round(row.repaymentRatio * 100)}%`);
}
