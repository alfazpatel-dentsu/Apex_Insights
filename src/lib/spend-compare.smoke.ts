/**
 * Smoke checks for arbitrary spend period compares (e.g. Jul 2024 vs Jul 2026).
 * Run: npx tsx src/lib/spend-compare.smoke.ts
 */
import {
  buildCompareProgression,
  enumerateMonthKeys,
  enumerateQuarterKeys,
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
assert(monthInPeriod('2026-12', 'year', '2026'), 'year match');

assert(periodYearsAgo('2026-07', 'month', 2) === '2024-07', 'jul 2026 minus 2y');
assert(periodYearsAgo('2026-Q3', 'quarter', 2) === '2024-Q3', 'q3 minus 2y');
assert(periodYearsAgo('2026', 'year', 2) === '2024', 'year minus 2y');
assert(priorPeriod('2026-07', 'month') === '2026-06', 'prior month');
assert(priorPeriod('2026-Q1', 'quarter') === '2025-Q4', 'prior quarter wraps');

assert(enumerateMonthKeys('2024-07', '2026-07').length === 25, 'jul24-jul26 month count');
assert(enumerateMonthKeys('2026-07', '2024-07')[0] === '2024-07', 'range is ordered');
assert(enumerateQuarterKeys('2025-Q3', '2026-Q3').join(',') === '2025-Q3,2025-Q4,2026-Q1,2026-Q2,2026-Q3', 'q span');

const prog = buildCompareProgression({
  grain: 'month',
  periodA: '2024-07',
  periodB: '2026-07',
  monthly: [
    { month: '2024-07', actualSpendsInr: 100 },
    { month: '2025-07', actualSpendsInr: 80 },
    { month: '2026-07', actualSpendsInr: 90 },
  ],
  weekly: [],
});
assert(prog.length === 25, `progress len ${prog.length}`);
assert(prog[0].id === '2024-07' && prog[0].spend === 100, 'start spend');
assert(prog[12].id === '2025-07' && prog[12].spend === 80, 'mid spend');
assert(prog[24].id === '2026-07' && prog[24].spend === 90, 'end spend');
assert(prog[1].spend === 0, 'gap filled with 0');

const qProg = buildCompareProgression({
  grain: 'quarter',
  periodA: '2025-Q3',
  periodB: '2026-Q3',
  monthly: [
    { month: '2025-07', actualSpendsInr: 10 },
    { month: '2025-08', actualSpendsInr: 20 },
    { month: '2025-09', actualSpendsInr: 5 },
    { month: '2026-07', actualSpendsInr: 40 },
  ],
  weekly: [],
});
assert(qProg.length === 5, `q progress ${qProg.length}`);
assert(qProg[0].id === '2025-Q3' && qProg[0].label === '2025 Q3', 'q label');
assert(qProg[0].spend === 35, `q3 2025 ${qProg[0].spend}`);
assert(qProg[4].id === '2026-Q3' && qProg[4].spend === 40, 'q3 2026');
assert(qProg.every((p) => p.id.includes('-Q')), 'all points are quarters');

console.log('spend-compare.smoke.ts: OK');
