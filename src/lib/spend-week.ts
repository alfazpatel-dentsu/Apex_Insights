/**
 * Weekly spend date helpers — normalize heterogeneous week labels and
 * coerce spend amounts so Snapshot / dashboard WoW charts aggregate correctly.
 */
import { addDays, format, isValid, parse, startOfWeek, subWeeks } from 'date-fns';

const WEEK_DATE_FORMATS = [
  'dd-MM-yyyy',
  'dd/MM/yyyy',
  'yyyy-MM-dd',
  'dd-MMM-yyyy',
  'dd-MMM-yy',
  'MM/dd/yyyy',
  'yyyy/MM/dd',
] as const;

/** Coerce Firestore/CSV spend values to a finite number (avoids string concat). */
export function toSpendNumber(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (val == null || val === '') return 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, '').trim();
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function isFirestoreTimestamp(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  );
}

/** Parse a weekly spend `week` label across common upload formats. */
export function parseSpendWeekDate(week: unknown): Date | null {
  if (week == null || week === '') return null;

  if (week instanceof Date) {
    return isValid(week) ? week : null;
  }

  if (isFirestoreTimestamp(week)) {
    try {
      const d = week.toDate();
      return isValid(d) ? d : null;
    } catch {
      return null;
    }
  }

  if (typeof week === 'number' && Number.isFinite(week)) {
    // Excel serial date
    if (week > 20000 && week < 100000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(excelEpoch.getTime() + week * 86400000);
      return isValid(d) ? d : null;
    }
    return null;
  }

  const s = String(week).trim();
  if (!s) return null;

  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000) {
    return parseSpendWeekDate(Number(s));
  }

  for (const f of WEEK_DATE_FORMATS) {
    try {
      const d = parse(s, f, new Date());
      if (isValid(d)) return d;
    } catch {
      // try next format
    }
  }

  const fallback = new Date(s);
  return isValid(fallback) ? fallback : null;
}

/** Monday (ISO) week-start key: yyyy-MM-dd */
export function spendWeekStartKey(week: unknown): string | null {
  const d = parseSpendWeekDate(week);
  if (!d) return null;
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

export function formatWeekStartLabel(weekStartKey: string, pattern = 'dd MMM'): string {
  try {
    const d = parse(weekStartKey, 'yyyy-MM-dd', new Date());
    return isValid(d) ? format(d, pattern) : weekStartKey;
  } catch {
    return weekStartKey;
  }
}

/**
 * Aggregate weekly rows by Monday week-start.
 * Returns sorted ascending keys with totals.
 */
export function aggregateSpendByWeekStart<T extends { week?: string; spendsInr?: unknown }>(
  rows: T[] | null | undefined
): { keys: string[]; totals: Record<string, number>; rowsByKey: Record<string, T[]> } {
  const totals: Record<string, number> = {};
  const rowsByKey: Record<string, T[]> = {};

  (rows || []).forEach((row) => {
    const key = spendWeekStartKey(row.week);
    if (!key) return;
    totals[key] = (totals[key] || 0) + toSpendNumber(row.spendsInr);
    if (!rowsByKey[key]) rowsByKey[key] = [];
    rowsByKey[key].push(row);
  });

  const keys = Object.keys(totals).sort((a, b) => a.localeCompare(b));
  return { keys, totals, rowsByKey };
}

/**
 * Build a fixed-length WoW momentum series ending on the latest week that has
 * data (falls back to the current calendar week). Missing weeks are 0.
 * @deprecated Prefer {@link buildWowSpendsTrend} to match Spends Dashboard.
 */
export function buildWowMomentumSeries(
  spendByWeekStart: Record<string, number>,
  weekCount = 12
): { week: string; weekStartKey: string; spend: number }[] {
  const dataKeys = Object.keys(spendByWeekStart).sort((a, b) => a.localeCompare(b));
  let anchor: Date;
  if (dataKeys.length > 0) {
    const latest = parse(dataKeys[dataKeys.length - 1], 'yyyy-MM-dd', new Date());
    anchor = isValid(latest) ? latest : startOfWeek(new Date(), { weekStartsOn: 1 });
  } else {
    anchor = startOfWeek(new Date(), { weekStartsOn: 1 });
  }

  const series: { week: string; weekStartKey: string; spend: number }[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const weekStart = subWeeks(anchor, i);
    const weekStartKey = format(weekStart, 'yyyy-MM-dd');
    series.push({
      week: format(weekStart, 'dd MMM'),
      weekStartKey,
      spend: spendByWeekStart[weekStartKey] || 0,
    });
  }
  return series;
}

export type WowSpendTrendPoint = {
  /** Display label (dd MMM), same as Spends Dashboard WoW chart */
  week: string;
  /** Original week field value from weeklySpends */
  weekKey: string;
  timestamp: number;
  spend: number;
};

/**
 * Spends Dashboard WoW chart parity:
 * group by the raw `week` label (not Monday-normalized), sum spends, sort by
 * date, take the last N weeks that exist in the dataset (no zero-filled gaps).
 */
export function buildWowSpendsTrend<T extends { week?: string; spendsInr?: unknown }>(
  rows: T[] | null | undefined,
  weekCount = 12
): WowSpendTrendPoint[] {
  const groups: Record<string, number> = {};
  (rows || []).forEach((item) => {
    const week = (item.week || '').toString().trim();
    if (!week) return;
    groups[week] = (groups[week] || 0) + toSpendNumber(item.spendsInr);
  });

  return Object.entries(groups)
    .map(([weekKey, spend]) => {
      const d = parseSpendWeekDate(weekKey);
      const timestamp = d ? d.getTime() : Number.NaN;
      const label = d ? format(d, 'dd MMM') : weekKey;
      return { week: label, weekKey, timestamp, spend };
    })
    .filter((row) => Number.isFinite(row.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-weekCount);
}

export type ChannelSpendPoint = { name: string; value: number };

export type ChannelSpendPulse = {
  channels: ChannelSpendPoint[];
  weekStartKey: string | null;
};

/**
 * Depletion Pulse: spend by channel for the latest ISO week that has data.
 * Collapses mixed week labels (Mon dump + mid-week as-of dates) onto the same
 * Monday key — unlike {@link buildWowSpendsTrend}, which keeps raw labels.
 */
export function buildChannelSpendPulse<
  T extends { week?: unknown; spendsInr?: unknown; channelVendor?: string | null },
>(
  rows: T[] | null | undefined,
  canonicalize: (channel: string | null | undefined) => string
): ChannelSpendPulse {
  const { keys, rowsByKey } = aggregateSpendByWeekStart(rows);

  for (let i = keys.length - 1; i >= 0; i--) {
    const weekStartKey = keys[i];
    const channelTotals: Record<string, number> = {};
    (rowsByKey[weekStartKey] || []).forEach((row) => {
      const channel = canonicalize(row.channelVendor);
      channelTotals[channel] = (channelTotals[channel] || 0) + toSpendNumber(row.spendsInr);
    });
    const channels = Object.entries(channelTotals)
      .map(([name, value]) => ({ name, value }))
      .filter((row) => row.value !== 0)
      .sort((a, b) => b.value - a.value);
    if (channels.length > 0) {
      return { channels, weekStartKey };
    }
  }

  return { channels: [], weekStartKey: null };
}

/**
 * Resolve current + previous week-start keys from available weekly data
 * (newest first). Prefers consecutive ISO weeks present in the dataset.
 */
export function resolveWowWeekPair(weekStartKeysAsc: string[]): {
  currentKey: string;
  previousKey: string;
} {
  const keys = [...weekStartKeysAsc].sort((a, b) => b.localeCompare(a));
  const currentKey = keys[0] || '';
  if (!currentKey) return { currentKey: '', previousKey: '' };

  const expectedPrev = format(
    subWeeks(parse(currentKey, 'yyyy-MM-dd', new Date()), 1),
    'yyyy-MM-dd'
  );
  const previousKey = keys.includes(expectedPrev) ? expectedPrev : keys[1] || '';
  return { currentKey, previousKey };
}

/** Month key (yyyy-MM) for a weekly spend, using Thursday of the ISO week. */
export function spendWeekMonthKey(week: unknown): string {
  const d = parseSpendWeekDate(week);
  if (!d) return '';
  const monday = startOfWeek(d, { weekStartsOn: 1 });
  const thursday = addDays(monday, 3);
  return format(thursday, 'yyyy-MM');
}
