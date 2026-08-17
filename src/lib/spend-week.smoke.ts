/**
 * Smoke checks for Snapshot / Spends Dashboard WoW spend aggregation.
 * Run: npx tsx src/lib/spend-week.smoke.ts
 */
import {
  aggregateSpendByWeekStart,
  buildChannelSpendPulse,
  buildWowSpendsTrend,
  parseSpendWeekDate,
  resolveWowWeekPair,
  spendWeekStartKey,
  toSpendNumber,
} from './spend-week';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

// String amounts must not concatenate
assert(toSpendNumber('5,000') === 5000, 'comma amount');
assert(toSpendNumber('₹3000') === 3000, 'rupee amount');
let acc = 0;
acc = acc + toSpendNumber('5000');
acc = acc + toSpendNumber('3000');
assert(acc === 8000, `numeric sum got ${acc}`);

// Mixed week labels for the same ISO week collapse to one Monday key
const mon = spendWeekStartKey('03-08-2026'); // Monday
const tue = spendWeekStartKey('04-08-2026'); // Tuesday same week
const sun = spendWeekStartKey('09-08-2026'); // Sunday same week (ISO)
assert(mon && mon === tue && tue === sun, `same-week keys ${mon}/${tue}/${sun}`);

const rows = [
  { week: '04-08-2026', spendsInr: '1000000', brandName: 'A' },
  { week: '03-08-2026', spendsInr: 500000, brandName: 'B' },
  { week: '27-07-2026', spendsInr: '2000000', brandName: 'A' }, // prior Monday
  { week: '28-07-2026', spendsInr: 100000, brandName: 'C' }, // prior Tuesday → same week
];

const { keys, totals, rowsByKey } = aggregateSpendByWeekStart(rows);
assert(keys.length === 2, `expected 2 week keys, got ${keys.length}`);
assert(totals['2026-08-03'] === 1500000, `latest week total ${totals['2026-08-03']}`);
assert(totals['2026-07-27'] === 2100000, `prev week total ${totals['2026-07-27']}`);

const { currentKey, previousKey } = resolveWowWeekPair(keys);
assert(currentKey === '2026-08-03', `current ${currentKey}`);
assert(previousKey === '2026-07-27', `previous ${previousKey}`);

// Week-start aggregation keeps both Mon/Tue labels for the prior ISO week
assert(rowsByKey[previousKey].some((r) => r.week === '27-07-2026'), 'includes Monday label');
assert(rowsByKey[previousKey].some((r) => r.week === '28-07-2026'), 'includes Tuesday label');
assert(rowsByKey[previousKey].length === 2, 'prev week row count');

// Spends Dashboard parity: raw week labels stay separate; last N weeks only
const trendRows = [
  { week: '11-05-2026', spendsInr: 1_00_00_000 },
  { week: '18-05-2026', spendsInr: 23_00_00_000 },
  { week: '25-05-2026', spendsInr: 30_20_00_000 },
  { week: '01-06-2026', spendsInr: 27_00_00_000 },
  { week: '08-06-2026', spendsInr: 26_70_00_000 },
  { week: '15-06-2026', spendsInr: 20_40_00_000 },
  { week: '22-06-2026', spendsInr: 20_40_00_000 },
  { week: '29-06-2026', spendsInr: 24_90_00_000 },
  { week: '06-07-2026', spendsInr: 25_90_00_000 },
  { week: '13-07-2026', spendsInr: 22_20_00_000 },
  { week: '20-07-2026', spendsInr: 21_00_00_000 },
  { week: '27-07-2026', spendsInr: 21_60_00_000 },
  { week: '03-08-2026', spendsInr: 20_60_00_000 },
  // Same ISO week, different label — Dashboard keeps this as its own bucket
  { week: '04-08-2026', spendsInr: 50_00_000 },
];
const trend = buildWowSpendsTrend(trendRows, 12);
assert(trend.length === 12, `trend length ${trend.length}`);
assert(trend[0].week === '25 May', `first label ${trend[0].week}`);
assert(trend[trend.length - 1].weekKey === '04-08-2026', `last key ${trend[trend.length - 1].weekKey}`);
assert(trend[trend.length - 1].spend === 50_00_000, `last spend ${trend[trend.length - 1].spend}`);
assert(trend[trend.length - 2].weekKey === '03-08-2026', 'penultimate is 03-08');
assert(trend[trend.length - 2].spend === 20_60_00_000, 'penultimate spend');

// Depletion Pulse must use the latest ISO week (not a single raw week label)
const pulseRows = [
  { week: '03-08-2026', spendsInr: 9_70_00_000, channelVendor: 'Meta' },
  { week: '04-08-2026', spendsInr: 10_00_000, channelVendor: 'meta ads' }, // same ISO week
  { week: '10-08-2026', spendsInr: 8_00_00_000, channelVendor: 'Google' },
  { week: '11-08-2026', spendsInr: 50_00_000, channelVendor: 'Google Ads' },
];
const pulse = buildChannelSpendPulse(pulseRows, (c) =>
  c?.toLowerCase().includes('meta') ? 'Meta' : 'Google'
);
assert(pulse.weekStartKey === '2026-08-10', `pulse week ${pulse.weekStartKey}`);
assert(pulse.channels.length === 1, `pulse channels ${pulse.channels.length}`);
assert(pulse.channels[0].name === 'Google', `pulse top ${pulse.channels[0].name}`);
assert(pulse.channels[0].value === 8_50_00_000, `pulse google ${pulse.channels[0].value}`);

const ts = { toDate: () => new Date(2026, 7, 12) }; // 12 Aug 2026
assert(parseSpendWeekDate(ts)?.getFullYear() === 2026, 'timestamp year');
assert(spendWeekStartKey(ts) === '2026-08-10', `timestamp week ${spendWeekStartKey(ts)}`);

console.log('spend-week.smoke.ts: OK');
