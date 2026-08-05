import { addMonths, format, parse } from 'date-fns';
import type { MonthlySpend } from '@/lib/types';

export const FORECAST_HORIZON_MONTHS = 12;
export const CHURN_INACTIVE_MONTHS = 2;
export const CHURN_AVG_LOOKBACK_MONTHS = 6;

export type ForecastModelKind = 'holt-winters' | 'seasonal-naive' | 'trend';

export interface MonthAmount {
  month: string; // yyyy-MM
  amount: number;
}

export interface ChurnedClient {
  clientId: string;
  brandName: string;
  industry: string;
  type: string;
  team: string;
  /** Second consecutive zero-spend month that confirmed churn. */
  exitMonth: string;
  /** First month of the trailing inactivity streak. */
  inactivityStartMonth: string;
  lastActiveMonth: string | null;
  /** Six-month average spend before inactivity started. */
  monthlyChurnLoss: number;
  lookbackMonths: MonthAmount[];
}

export interface ForecastMonthRow {
  month: string;
  label: string;
  /** Gross model prediction before churn drag. */
  grossForecast: number;
  /** Sum of monthly churn losses applied to this month. */
  churnDrag: number;
  /** max(0, grossForecast - churnDrag). */
  netForecast: number;
  isForecast: true;
}

export interface HistoryMonthRow {
  month: string;
  label: string;
  actual: number;
  isForecast: false;
}

export type SpendSeriesPoint = HistoryMonthRow | ForecastMonthRow;

export interface SpendForecastResult {
  history: HistoryMonthRow[];
  forecast: ForecastMonthRow[];
  series: SpendSeriesPoint[];
  model: ForecastModelKind;
  modelLabel: string;
  latestDataMonth: string | null;
  monthlyChurnDrag: number;
  churnedClients: ChurnedClient[];
  /** Sum of net forecast over horizon. */
  netYearTotal: number;
  /** Sum of gross forecast over horizon. */
  grossYearTotal: number;
  /** monthlyChurnDrag * horizon. */
  churnYearImpact: number;
}

function parseMonth(month: string): Date {
  return parse(month, 'yyyy-MM', new Date());
}

export function formatMonthLabel(month: string): string {
  try {
    return format(parseMonth(month), 'MMM-yy');
  } catch {
    return month;
  }
}

export function shiftMonth(month: string, delta: number): string {
  return format(addMonths(parseMonth(month), delta), 'yyyy-MM');
}

function monthsBetweenInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = shiftMonth(cur, 1);
    if (out.length > 240) break;
  }
  return out;
}

/** Aggregate monthlySpends into a contiguous yyyy-MM → total map. */
export function aggregateMonthlyTotals(
  spends: MonthlySpend[],
  filter?: (row: MonthlySpend) => boolean
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of spends) {
    if (!row.month || typeof row.actualSpendsInr !== 'number') continue;
    if (filter && !filter(row)) continue;
    map.set(row.month, (map.get(row.month) || 0) + (row.actualSpendsInr || 0));
  }
  return map;
}

export function toContiguousSeries(
  totals: Map<string, number>
): MonthAmount[] {
  if (totals.size === 0) return [];
  const months = Array.from(totals.keys()).sort();
  const start = months[0];
  const end = months[months.length - 1];
  return monthsBetweenInclusive(start, end).map((month) => ({
    month,
    amount: totals.get(month) || 0,
  }));
}

/**
 * Holt-Winters additive seasonal forecast (period=12).
 * Falls back to seasonal-naive or linear trend for short series.
 */
export function forecastHoltWinters(
  history: MonthAmount[],
  horizon = FORECAST_HORIZON_MONTHS,
  seasonLength = 12
): { values: number[]; model: ForecastModelKind } {
  const y = history.map((h) => Math.max(0, h.amount));
  const n = y.length;

  if (n === 0) {
    return { values: Array(horizon).fill(0), model: 'trend' };
  }

  if (n < seasonLength * 1.5) {
    // Seasonal naive when we have at least one full prior year point for that offset
    if (n >= seasonLength) {
      const values = Array.from({ length: horizon }, (_, i) => {
        const idx = n - seasonLength + (i % seasonLength);
        return Math.max(0, y[idx] ?? y[n - 1] ?? 0);
      });
      return { values, model: 'seasonal-naive' };
    }

    // Linear trend on short series
    const last = y[n - 1] ?? 0;
    let slope = 0;
    if (n >= 2) {
      const k = Math.min(6, n - 1);
      slope = (y[n - 1] - y[n - 1 - k]) / k;
    }
    const values = Array.from({ length: horizon }, (_, i) =>
      Math.max(0, last + slope * (i + 1))
    );
    return { values, model: 'trend' };
  }

  const alpha = 0.35;
  const beta = 0.1;
  const gamma = 0.25;

  // Initialize level, trend, seasonals from first two seasons when possible
  const seasons = Math.floor(n / seasonLength);
  const seasonals = new Array(seasonLength).fill(0);
  const seasonAverages: number[] = [];
  for (let s = 0; s < seasons; s++) {
    let sum = 0;
    for (let i = 0; i < seasonLength; i++) {
      sum += y[s * seasonLength + i];
    }
    seasonAverages.push(sum / seasonLength);
  }

  for (let i = 0; i < seasonLength; i++) {
    let sum = 0;
    for (let s = 0; s < seasons; s++) {
      const denom = seasonAverages[s] || 1;
      sum += y[s * seasonLength + i] - seasonAverages[s];
      // keep additive init even if denom unused — avoids multiplicative blow-ups
      void denom;
    }
    seasonals[i] = sum / seasons;
  }

  let level = seasonAverages[0] ?? y[0];
  let trend =
    seasons >= 2
      ? (seasonAverages[1] - seasonAverages[0]) / seasonLength
      : (y[Math.min(seasonLength, n - 1)] - y[0]) / Math.min(seasonLength, n - 1 || 1);

  for (let t = 0; t < n; t++) {
    const value = y[t];
    const sIdx = t % seasonLength;
    const lastLevel = level;
    const seasonal = seasonals[sIdx];
    level = alpha * (value - seasonal) + (1 - alpha) * (level + trend);
    trend = beta * (level - lastLevel) + (1 - beta) * trend;
    seasonals[sIdx] = gamma * (value - level) + (1 - gamma) * seasonal;
  }

  const values = Array.from({ length: horizon }, (_, i) => {
    const sIdx = (n + i) % seasonLength;
    return Math.max(0, level + (i + 1) * trend + seasonals[sIdx]);
  });

  return { values, model: 'holt-winters' };
}

export function modelLabel(kind: ForecastModelKind): string {
  switch (kind) {
    case 'holt-winters':
      return 'Holt-Winters (seasonal)';
    case 'seasonal-naive':
      return 'Seasonal naive (YoY)';
    case 'trend':
      return 'Linear trend';
  }
}

interface ClientMonthMeta {
  clientId: string;
  brandName: string;
  industry: string;
  type: string;
  team: string;
  byMonth: Map<string, number>;
}

function buildClientSeries(spends: MonthlySpend[]): ClientMonthMeta[] {
  const map = new Map<string, ClientMonthMeta>();
  for (const row of spends) {
    if (!row.clientId || !row.month) continue;
    let entry = map.get(row.clientId);
    if (!entry) {
      entry = {
        clientId: row.clientId,
        brandName: row.brandName || row.clientId,
        industry: row.industry || 'N/A',
        type: row.type || 'N/A',
        team: row.team || 'N/A',
        byMonth: new Map(),
      };
      map.set(row.clientId, entry);
    }
    entry.byMonth.set(
      row.month,
      (entry.byMonth.get(row.month) || 0) + (row.actualSpendsInr || 0)
    );
    // Prefer non-empty metadata when later rows fill it in
    if (row.brandName) entry.brandName = row.brandName;
    if (row.industry) entry.industry = row.industry;
    if (row.type) entry.type = row.type;
    if (row.team) entry.team = row.team;
  }
  return Array.from(map.values());
}

/**
 * Churn rule:
 * - A client with historical spend who has no spends for 2 consecutive months
 *   ending at (or trailing through) the latest data month is churned.
 * - Monthly loss = average spend over the 6 months immediately before
 *   the inactivity streak started.
 * - That monthly loss is applied as drag on each of the next 12 forecast months.
 */
export function detectChurnedClients(
  spends: MonthlySpend[],
  latestDataMonth: string,
  inactiveMonths = CHURN_INACTIVE_MONTHS,
  lookbackMonths = CHURN_AVG_LOOKBACK_MONTHS
): ChurnedClient[] {
  const clients = buildClientSeries(spends);
  const churned: ChurnedClient[] = [];

  for (const client of clients) {
    const months = Array.from(client.byMonth.keys()).sort();
    if (months.length === 0) continue;

    const lastPositive = [...months].reverse().find((m) => (client.byMonth.get(m) || 0) > 0);
    if (!lastPositive) continue;

    // Build contiguous months from first activity through latest portfolio month
    const firstMonth = months[0];
    const timeline = monthsBetweenInclusive(firstMonth, latestDataMonth);
    if (timeline.length < inactiveMonths) continue;

    // Trailing zero streak length at end of timeline
    let zeroStreak = 0;
    for (let i = timeline.length - 1; i >= 0; i--) {
      const amt = client.byMonth.get(timeline[i]) || 0;
      if (amt > 0) break;
      zeroStreak++;
    }

    if (zeroStreak < inactiveMonths) continue;

    const inactivityStartMonth = shiftMonth(latestDataMonth, -(zeroStreak - 1));
    const exitMonth = shiftMonth(inactivityStartMonth, inactiveMonths - 1);

    // Up to 6 calendar months immediately before inactivity started.
    // Ignore months before the client first appeared so short histories
    // are not diluted by pre-existence zeros.
    const firstActivityMonth = lastPositive
      ? Array.from(client.byMonth.entries())
          .filter(([, amt]) => amt > 0)
          .map(([m]) => m)
          .sort()[0]
      : null;

    const lookback: MonthAmount[] = [];
    for (let i = lookbackMonths; i >= 1; i--) {
      const m = shiftMonth(inactivityStartMonth, -i);
      if (firstActivityMonth && m < firstActivityMonth) continue;
      lookback.push({ month: m, amount: client.byMonth.get(m) || 0 });
    }
    if (lookback.length === 0) continue;

    const monthlyChurnLoss =
      lookback.reduce((s, x) => s + x.amount, 0) / lookback.length;

    if (monthlyChurnLoss <= 0) continue;

    churned.push({
      clientId: client.clientId,
      brandName: client.brandName,
      industry: client.industry,
      type: client.type,
      team: client.team,
      exitMonth,
      inactivityStartMonth,
      lastActiveMonth: lastPositive,
      monthlyChurnLoss,
      lookbackMonths: lookback,
    });
  }

  return churned.sort((a, b) => b.monthlyChurnLoss - a.monthlyChurnLoss);
}

export function buildSpendForecast(
  spends: MonthlySpend[],
  options?: {
    horizon?: number;
    filter?: (row: MonthlySpend) => boolean;
  }
): SpendForecastResult {
  const horizon = options?.horizon ?? FORECAST_HORIZON_MONTHS;
  const filtered = options?.filter ? spends.filter(options.filter) : spends;
  const totals = aggregateMonthlyTotals(filtered);
  const contiguous = toContiguousSeries(totals);

  const history: HistoryMonthRow[] = contiguous.map((h) => ({
    month: h.month,
    label: formatMonthLabel(h.month),
    actual: h.amount,
    isForecast: false as const,
  }));

  const latestDataMonth =
    contiguous.length > 0 ? contiguous[contiguous.length - 1].month : null;

  const { values, model } = forecastHoltWinters(contiguous, horizon);

  const churnedClients = latestDataMonth
    ? detectChurnedClients(filtered, latestDataMonth)
    : [];
  const monthlyChurnDrag = churnedClients.reduce(
    (s, c) => s + c.monthlyChurnLoss,
    0
  );

  const forecast: ForecastMonthRow[] = values.map((gross, i) => {
    const month = latestDataMonth
      ? shiftMonth(latestDataMonth, i + 1)
      : format(addMonths(new Date(), i + 1), 'yyyy-MM');
    const churnDrag = monthlyChurnDrag;
    return {
      month,
      label: formatMonthLabel(month),
      grossForecast: gross,
      churnDrag,
      netForecast: Math.max(0, gross - churnDrag),
      isForecast: true as const,
    };
  });

  const grossYearTotal = forecast.reduce((s, f) => s + f.grossForecast, 0);
  const netYearTotal = forecast.reduce((s, f) => s + f.netForecast, 0);
  const churnYearImpact = monthlyChurnDrag * horizon;

  return {
    history,
    forecast,
    series: [...history, ...forecast],
    model,
    modelLabel: modelLabel(model),
    latestDataMonth,
    monthlyChurnDrag,
    churnedClients,
    netYearTotal,
    grossYearTotal,
    churnYearImpact,
  };
}

/** Helper for UI: months available for reference / as-of selection. */
export function listDataMonths(spends: MonthlySpend[]): string[] {
  return Array.from(new Set(spends.map((s) => s.month).filter(Boolean))).sort();
}

export function monthsEndingAt(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    shiftMonth(endMonth, -(count - 1 - i))
  );
}
