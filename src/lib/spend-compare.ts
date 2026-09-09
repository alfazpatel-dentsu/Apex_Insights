import { format, isValid, parse, subMonths, subWeeks, subYears } from 'date-fns';
import { parseSpendWeekDate } from './spend-week';

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
