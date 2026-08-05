/**
 * Lightweight smoke checks for spend forecast + churn rules.
 * Run: npx --yes tsx src/lib/spend-forecast.smoke.ts
 */
import {
  buildSpendForecast,
  detectChurnedClients,
  forecastHoltWinters,
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

// --- Holt-Winters / fallback ---
const shortHistory: MonthAmount[] = Array.from({ length: 8 }, (_, i) => ({
  month: `2025-${String(i + 1).padStart(2, '0')}`,
  amount: 1_00_00_000 + i * 10_00_000,
}));
const shortFc = forecastHoltWinters(shortHistory, 12);
assert(shortFc.values.length === 12, 'short forecast length');
assert(shortFc.model === 'trend', 'short series uses trend');

const seasonalHistory: MonthAmount[] = Array.from({ length: 24 }, (_, i) => {
  const monthIdx = i % 12;
  return {
    month: shiftMonth('2023-01', i),
    amount: 50_00_00_000 + monthIdx * 5_00_00_000 + Math.floor(i / 12) * 10_00_00_000,
  };
});
const hw = forecastHoltWinters(seasonalHistory, 12);
assert(hw.values.length === 12, 'hw length');
assert(hw.model === 'holt-winters', '24+ months uses holt-winters');
assert(hw.values.every((v) => v >= 0), 'non-negative forecasts');

// --- Churn: client averages 1 Cr for 6 months, then May+Jun zero ---
const CR = 1_00_00_000;
const rows: MonthlySpend[] = [];
// Portfolio baseline other client keeps spending through Jun
for (let i = 0; i < 12; i++) {
  rows.push(spend('KEEP', shiftMonth('2025-07', i), 100 * CR, 'Keeper'));
}
// Churn client: Nov-25..Apr-26 = 1 Cr, May-26 & Jun-26 = 0 (data ends Jun-26)
for (const m of ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04']) {
  rows.push(spend('CHURN1', m, CR, 'ChurnCo'));
}
// May/Jun: no rows for CHURN1 (zero spend)
rows.push(spend('KEEP', '2026-05', 100 * CR, 'Keeper'));
rows.push(spend('KEEP', '2026-06', 100 * CR, 'Keeper'));

const churned = detectChurnedClients(rows, '2026-06');
assert(churned.length === 1, `expected 1 churned, got ${churned.length}`);
assert(churned[0].clientId === 'CHURN1', 'churn client id');
assert(churned[0].exitMonth === '2026-06', `exit month ${churned[0].exitMonth}`);
assert(
  Math.abs(churned[0].monthlyChurnLoss - CR) < 1,
  `expected ~1Cr loss, got ${churned[0].monthlyChurnLoss}`
);

const result = buildSpendForecast(rows);
assert(result.monthlyChurnDrag > 0, 'monthly churn drag > 0');
assert(
  Math.abs(result.monthlyChurnDrag - CR) < 1,
  `drag should be 1Cr, got ${result.monthlyChurnDrag}`
);
assert(result.forecast.length === 12, '12 month horizon');
for (const f of result.forecast) {
  assert(
    Math.abs(f.grossForecast - f.churnDrag - f.netForecast) < 1 || f.netForecast === 0,
    'net = gross - churn (floored at 0)'
  );
  assert(f.churnDrag === result.monthlyChurnDrag, 'constant monthly drag');
}

console.log('spend-forecast smoke checks passed');
console.log({
  model: result.modelLabel,
  monthlyChurnDrag: result.monthlyChurnDrag,
  sampleNetDec: result.forecast[0],
  churnYearImpact: result.churnYearImpact,
});
