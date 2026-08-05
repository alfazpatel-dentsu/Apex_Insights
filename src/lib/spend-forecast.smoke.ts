/**
 * Smoke checks for spend forecast + time-boxed churn impact.
 * Run: npx --yes tsx src/lib/spend-forecast.smoke.ts
 */
import {
  buildSpendForecast,
  churnImpactWindow,
  detectChurnedClients,
  forecastHoltWinters,
  monthInChurnWindow,
  shiftMonth,
  type MonthAmount,
} from './spend-forecast';
import type { MonthlySpend } from './types';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function spend(
  clientId: string,
  month: string,
  amount: number,
  brand = clientId
): MonthlySpend {
  return {
    id: `${clientId}-${month}`,
    clientId,
    brandName: brand,
    industry: 'Tech',
    type: 'Performance',
    subEntity: 'A',
    channelVendor: 'Meta',
    creditLine: 'CL',
    currency: 'INR',
    team: 'Team1',
    month,
    actualSpendsInr: amount,
  };
}

// --- Window helper: exit Sep-25 → Oct-25 … Sep-26 ---
const win = churnImpactWindow('2025-09');
assert(win.impactStartMonth === '2025-10', `start ${win.impactStartMonth}`);
assert(win.impactEndMonth === '2026-09', `end ${win.impactEndMonth}`);
assert(monthInChurnWindow('2026-09', win.impactStartMonth, win.impactEndMonth), 'Sep-26 in window');
assert(!monthInChurnWindow('2026-10', win.impactStartMonth, win.impactEndMonth), 'Oct-26 out of window');
assert(!monthInChurnWindow('2025-09', win.impactStartMonth, win.impactEndMonth), 'exit month itself not in window');

// --- Holt-Winters / fallback ---
const shortHistory: MonthAmount[] = Array.from({ length: 8 }, (_, i) => ({
  month: `2025-${String(i + 1).padStart(2, '0')}`,
  amount: 1_00_00_000 + i * 10_00_000,
}));
const shortFc = forecastHoltWinters(shortHistory, 12);
assert(shortFc.values.length === 12, 'short forecast length');
assert(shortFc.model === 'trend', 'short series uses trend');

const CR = 7.22 * 1_00_00_000; // 7.22 Cr — Zalora-style
const rows: MonthlySpend[] = [];

// Keeper spends every month Jul-24 … Jul-26
for (let i = 0; i < 25; i++) {
  rows.push(spend('KEEP', shiftMonth('2024-07', i), 100 * 1_00_00_000, 'Keeper'));
}

// Zalora-style: active Feb-25 … Jul-25 at 7.22 Cr, then Aug+Sep zero → exit Sep-25
for (const m of ['2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07']) {
  rows.push(spend('CLID0129', m, CR, 'Zalora'));
}
// Aug-25 / Sep-25 onwards: no rows for Zalora (zero). Data through Jul-26 via KEEP only.

const churned = detectChurnedClients(rows, '2026-07');
assert(churned.length === 1, `expected 1 churned, got ${churned.length}`);
assert(churned[0].clientId === 'CLID0129', 'churn client id');
assert(churned[0].exitMonth === '2025-09', `exit ${churned[0].exitMonth}`);
assert(churned[0].impactEndMonth === '2026-09', `impact end ${churned[0].impactEndMonth}`);
assert(Math.abs(churned[0].monthlyChurnLoss - CR) < 1, `loss ${churned[0].monthlyChurnLoss}`);

const result = buildSpendForecast(rows);
assert(result.latestDataMonth === '2026-07', `latest ${result.latestDataMonth}`);

// Historical Jul-26 actual unchanged, but potential includes Zalora overlay
const jul = result.history.find((h) => h.month === '2026-07');
assert(jul, 'jul history');
assert(Math.abs(jul!.actual - 100 * 1_00_00_000) < 1, 'Jul actual unchanged (keeper only)');
assert(Math.abs(jul!.churnImpact - CR) < 1, 'Jul still inside impact window');
assert(Math.abs(jul!.potential - (jul!.actual + CR)) < 1, 'Jul potential = actual + impact');
assert(jul!.missingPct > 0, 'Jul missing %');

// Forecast Aug-26 & Sep-26 still impacted; Oct-26 not
const aug = result.forecast.find((f) => f.month === '2026-08');
const sep = result.forecast.find((f) => f.month === '2026-09');
const oct = result.forecast.find((f) => f.month === '2026-10');
assert(aug && Math.abs(aug.churnImpact - CR) < 1, 'Aug-26 impacted');
assert(sep && Math.abs(sep.churnImpact - CR) < 1, 'Sep-26 impacted');
assert(oct && oct.churnImpact === 0, 'Oct-26 past impact window');

assert(sep!.potential === sep!.grossForecast + sep!.churnImpact, 'Sep potential');
assert(
  Math.abs(sep!.netForecast - Math.max(0, sep!.grossForecast - sep!.churnImpact)) < 1,
  'Sep net = gross - impact'
);

assert(result.momComparison.some((r) => r.kind === 'actual' && r.month === '2026-07'), 'mom has Jul');
assert(result.momComparison.some((r) => r.kind === 'forecast' && r.month === '2026-09'), 'mom has Sep fc');

console.log('spend-forecast smoke checks passed');
console.log({
  exit: churned[0].exitMonth,
  impactEnd: churned[0].impactEndMonth,
  julMissingPct: jul!.missingPct.toFixed(2) + '%',
  sepImpact: sep!.churnImpact,
  octImpact: oct!.churnImpact,
  forecastMissingPct: result.forecastMissingPct.toFixed(2) + '%',
});
