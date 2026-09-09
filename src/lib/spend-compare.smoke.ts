/**
 * Smoke checks for arbitrary spend period compares (e.g. Jul 2024 vs Jul 2026).
 * Run: npx tsx src/lib/spend-compare.smoke.ts
 */
import {
  listPeriodOptions,
  monthInPeriod,
  periodYearsAgo,
  priorPeriod,
} from './spend-compare';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const months = ['2024-07', '2024-08', '2025-07', '2026-06', '2026-07'];
const monthOpts = listPeriodOptions('month', months, []);
assert(monthOpts.some((o) => o.id === '2024-07' && o.label === 'Jul 2024'), 'jul 2024 option');
assert(monthOpts.some((o) => o.id === '2026-07' && o.label === 'Jul 2026'), 'jul 2026 option');

assert(monthInPeriod('2024-07', 'month', '2024-07'), 'exact month');
assert(!monthInPeriod('2024-08', 'month', '2024-07'), 'other month');
assert(monthInPeriod('2026-07', 'quarter', '2026-Q3'), 'jul in q3');
assert(!monthInPeriod('2026-06', 'quarter', '2026-Q3'), 'jun not q3');
assert(monthInPeriod('2024-03', 'ytd', '2024-07'), 'mar in jan-jul');
assert(!monthInPeriod('2024-08', 'ytd', '2024-07'), 'aug after jul ytd');
assert(monthInPeriod('2026-12', 'year', '2026'), 'year match');

assert(periodYearsAgo('2026-07', 'month', 2) === '2024-07', 'jul 2026 minus 2y');
assert(periodYearsAgo('2026-07', 'ytd', 2) === '2024-07', 'ytd through jul minus 2y');
assert(periodYearsAgo('2026-Q3', 'quarter', 2) === '2024-Q3', 'q3 minus 2y');
assert(periodYearsAgo('2026', 'year', 2) === '2024', 'year minus 2y');
assert(priorPeriod('2026-07', 'month') === '2026-06', 'prior month');
assert(priorPeriod('2026-Q1', 'quarter') === '2025-Q4', 'prior quarter wraps');

const ytdOpts = listPeriodOptions('ytd', months, []);
assert(ytdOpts.find((o) => o.id === '2026-07')?.label === 'Jan–Jul 2026', 'ytd label');

console.log('spend-compare.smoke.ts: OK');
