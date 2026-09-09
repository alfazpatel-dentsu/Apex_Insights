import { addMonths, format, isValid, parse, subMonths, subWeeks, subYears } from 'date-fns';
import { parseSpendWeekDate, rowSpendAmount } from './spend-week';

export type SpendCompareGrain = 'month' | 'quarter' | 'ytd' | 'year' | 'week';

export type SpendPeriodOption = {
  id: string;
  label: string;
  sortKey: string;
};

export const COMPARE_GRAINS: { value: SpendCompareGrain; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'ytd', label: 'YTD' },
  { value: 'year', label: 'Year' },
  { value: 'week', label: 'Week' },
];

export function monthQuarterKey(month: string): string | null {
  const d = parse(month, 'yyyy-MM', new Date());
  if (!isValid(d)) return null;
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

export function formatMonthLabel(month: string): string {
  const d = parse(month, 'yyyy-MM', new Date());
  return isValid(d) ? format(d, 'MMM yyyy') : month;
}

export function formatYtdLabel(month: string): string {
  const d = parse(month, 'yyyy-MM', new Date());
  if (!isValid(d)) return month;
  return `Jan–${format(d, 'MMM yyyy')}`;
}

export function formatQuarterLabel(quarterId: string): string {
  return quarterId.replace('-', ' ');
}

export function formatWeekLabel(week: string): string {
  const d = parseSpendWeekDate(week);
  return d ? format(d, 'dd MMM yyyy') : week;
}

export function listPeriodOptions(
  grain: SpendCompareGrain,
  months: string[],
  weeks: string[]
): SpendPeriodOption[] {
  const uniqueMonths = Array.from(new Set(months.filter(Boolean))).sort();
  const uniqueWeeks = Array.from(new Set(weeks.filter(Boolean)));

  if (grain === 'month') {
    return uniqueMonths.map((id) => ({ id, label: formatMonthLabel(id), sortKey: id }));
  }
  if (grain === 'quarter') {
    const qs = new Set<string>();
    uniqueMonths.forEach((m) => {
      const q = monthQuarterKey(m);
      if (q) qs.add(q);
    });
    return Array.from(qs)
      .sort()
      .map((id) => ({ id, label: formatQuarterLabel(id), sortKey: id }));
  }
  if (grain === 'ytd') {
    return uniqueMonths.map((id) => ({ id, label: formatYtdLabel(id), sortKey: id }));
  }
  if (grain === 'year') {
    const years = Array.from(new Set(uniqueMonths.map((m) => m.slice(0, 4)).filter(Boolean))).sort();
    return years.map((id) => ({ id, label: id, sortKey: id }));
  }
  return uniqueWeeks
    .map((id) => {
      const d = parseSpendWeekDate(id);
      return {
        id,
        label: formatWeekLabel(id),
        sortKey: d ? format(d, 'yyyy-MM-dd') : id,
      };
    })
    .filter((row) => row.sortKey)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export function monthInPeriod(month: string, grain: SpendCompareGrain, periodId: string): boolean {
  if (!month || !periodId) return false;
  if (grain === 'month') return month === periodId;
  if (grain === 'year') return month.startsWith(`${periodId}-`);
  if (grain === 'quarter') return monthQuarterKey(month) === periodId;
  if (grain === 'ytd') {
    const year = periodId.slice(0, 4);
    const through = periodId.slice(5, 7);
    if (!year || !through) return false;
    if (!month.startsWith(`${year}-`)) return false;
    return month.slice(5, 7) <= through;
  }
  return false;
}

export function weekInPeriod(week: string, periodId: string): boolean {
  return (week || '').trim() === (periodId || '').trim();
}

export function periodYearsAgo(periodId: string, grain: SpendCompareGrain, years: number): string | null {
  if (!periodId || years === 0) return periodId || null;
  if (grain === 'month' || grain === 'ytd') {
    const d = parse(periodId, 'yyyy-MM', new Date());
    if (!isValid(d)) return null;
    return format(subYears(d, years), 'yyyy-MM');
  }
  if (grain === 'year') {
    const y = parseInt(periodId, 10);
    if (!Number.isFinite(y)) return null;
    return String(y - years);
  }
  if (grain === 'quarter') {
    const match = periodId.match(/^(\d{4})-Q([1-4])$/);
    if (!match) return null;
    return `${parseInt(match[1], 10) - years}-Q${match[2]}`;
  }
  const d = parseSpendWeekDate(periodId);
  if (!d) return null;
  return format(subYears(d, years), 'dd-MM-yyyy');
}

export function priorPeriod(periodId: string, grain: SpendCompareGrain): string | null {
  if (!periodId) return null;
  if (grain === 'month' || grain === 'ytd') {
    const d = parse(periodId, 'yyyy-MM', new Date());
    if (!isValid(d)) return null;
    return format(subMonths(d, 1), 'yyyy-MM');
  }
  if (grain === 'year') {
    const y = parseInt(periodId, 10);
    if (!Number.isFinite(y)) return null;
    return String(y - 1);
  }
  if (grain === 'quarter') {
    const match = periodId.match(/^(\d{4})-Q([1-4])$/);
    if (!match) return null;
    let year = parseInt(match[1], 10);
    let q = parseInt(match[2], 10) - 1;
    if (q < 1) {
      q = 4;
      year -= 1;
    }
    return `${year}-Q${q}`;
  }
  const d = parseSpendWeekDate(periodId);
  if (!d) return null;
  return format(subWeeks(d, 1), 'dd-MM-yyyy');
}

export function pickExistingPeriod(candidate: string | null, options: SpendPeriodOption[]): string | null {
  if (!candidate) return null;
  return options.some((o) => o.id === candidate) ? candidate : null;
}

export type CompareProgressPoint = {
  id: string;
  label: string;
  spend: number;
  isEndpoint: boolean;
};

export function enumerateMonthKeys(fromMonth: string, toMonth: string): string[] {
  const a = parse(fromMonth, 'yyyy-MM', new Date());
  const b = parse(toMonth, 'yyyy-MM', new Date());
  if (!isValid(a) || !isValid(b)) return [];
  const start = a <= b ? a : b;
  const end = a <= b ? b : a;
  const keys: string[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    keys.push(format(cursor, 'yyyy-MM'));
    cursor = addMonths(cursor, 1);
  }
  return keys;
}

function quarterMonthBounds(periodId: string): { start: string; end: string } | null {
  const match = periodId.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return null;
  const year = match[1];
  const q = parseInt(match[2], 10);
  const startM = (q - 1) * 3 + 1;
  return {
    start: `${year}-${String(startM).padStart(2, '0')}`,
    end: `${year}-${String(startM + 2).padStart(2, '0')}`,
  };
}

/** Calendar months covering the two selected periods (ordered start → end). */
export function compareSpanMonthKeys(
  grain: SpendCompareGrain,
  periodA: string,
  periodB: string
): string[] {
  if (!periodA || !periodB) return [];
  if (grain === 'month' || grain === 'ytd') return enumerateMonthKeys(periodA, periodB);
  if (grain === 'year') {
    const years = [periodA, periodB].map((y) => parseInt(y, 10)).filter((n) => Number.isFinite(n));
    if (years.length === 1) return enumerateMonthKeys(`${periodA}-01`, `${periodA}-12`);
    if (years.length < 1) return [];
    const minY = Math.min(...years);
    const maxY = Math.max(...years);
    return enumerateMonthKeys(`${minY}-01`, `${maxY}-12`);
  }
  if (grain === 'quarter') {
    const a = quarterMonthBounds(periodA);
    const b = quarterMonthBounds(periodB);
    if (!a || !b) return [];
    const start = a.start < b.start ? a.start : b.start;
    const end = a.end > b.end ? a.end : b.end;
    return enumerateMonthKeys(start, end);
  }
  return [];
}

export function buildCompareProgression(params: {
  grain: SpendCompareGrain;
  periodA: string;
  periodB: string;
  monthly: Array<{ month?: string; actualSpendsInr?: unknown; spendsInr?: unknown }>;
  weekly: Array<{ week?: string; actualSpendsInr?: unknown; spendsInr?: unknown }>;
}): CompareProgressPoint[] {
  const { grain, periodA, periodB, monthly, weekly } = params;
  if (!periodA || !periodB) return [];

  if (grain === 'week') {
    const da = parseSpendWeekDate(periodA);
    const db = parseSpendWeekDate(periodB);
    if (!da || !db) return [];
    const start = da <= db ? da.getTime() : db.getTime();
    const end = da <= db ? db.getTime() : da.getTime();
    const totals: Record<string, number> = {};
    weekly.forEach((row) => {
      const week = (row.week || '').trim();
      const d = parseSpendWeekDate(week);
      if (!d) return;
      const t = d.getTime();
      if (t < start || t > end) return;
      totals[week] = (totals[week] || 0) + rowSpendAmount(row);
    });
    return Object.entries(totals)
      .map(([id, spend]) => {
        const d = parseSpendWeekDate(id);
        return {
          id,
          label: d ? format(d, 'dd MMM yy') : id,
          spend,
          isEndpoint: id === periodA || id === periodB,
          sort: d ? d.getTime() : 0,
        };
      })
      .sort((a, b) => a.sort - b.sort)
      .map(({ sort: _sort, ...row }) => row);
  }

  const monthKeys = compareSpanMonthKeys(grain, periodA, periodB);
  const totals: Record<string, number> = {};
  monthly.forEach((row) => {
    const month = row.month || '';
    if (!month) return;
    totals[month] = (totals[month] || 0) + rowSpendAmount(row);
  });
  const startId = monthKeys[0];
  const endId = monthKeys[monthKeys.length - 1];
  return monthKeys.map((id) => {
    const d = parse(id, 'yyyy-MM', new Date());
    return {
      id,
      label: isValid(d) ? format(d, "MMM yy") : id,
      spend: totals[id] || 0,
      isEndpoint: id === periodA || id === periodB || id === startId || id === endId,
    };
  });
}
