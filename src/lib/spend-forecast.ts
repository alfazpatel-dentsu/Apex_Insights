import { addMonths, format, parse } from 'date-fns';
import type { MonthlySpend } from '@/lib/types';

export const FORECAST_HORIZON_MONTHS = 12;
export const CHURN_INACTIVE_MONTHS = 2;
export const CHURN_AVG_LOOKBACK_MONTHS = 6;
/** Churn monthly loss applies for this many months after the exit month (inclusive end = exit + 12). */
export const CHURN_IMPACT_MONTHS = 12;

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
  /**
   * First month the monthly loss applies (month after exit).
   * Example: exit Sep-25 → impact Oct-25 … Sep-26.
   */
  impactStartMonth: string;
  /** Last month the monthly loss applies (exit + 12 months). */
  impactEndMonth: string;
  /** Six-month average spend before inactivity started. */
  monthlyChurnLoss: number;
  lookbackMonths: MonthAmount[];
}

export interface ForecastMonthRow {
  month: string;
  label: string;
  /** Model prediction (book trajectory; historical actuals unchanged). */
  grossForecast: number;
  /** Churn losses whose 12-month post-exit window covers this month. */
  churnImpact: number;
  /** max(0, grossForecast - churnImpact) — planning figure after remaining churn. */
  netForecast: number;
  /** What spend could have been if churned clients were still active. */
  potential: number;
  /** Share of potential missing due to churn (0–100). */
  missingPct: number;
  isForecast: true;
}

export interface HistoryMonthRow {
  month: string;
  label: string;
  /** Recorded actual — never rewritten by the model. */
  actual: number;
  /** Opportunity cost from churned clients still inside their impact window. */
  churnImpact: number;
  /** actual + churnImpact */
  potential: number;
  /** churnImpact / potential * 100 */
  missingPct: number;
  isForecast: false;
}

/** Unified MoM row for tables / exports (actual history + forecast horizon). */
export interface MomComparisonRow {
  month: string;
  label: string;
  kind: 'actual' | 'forecast';
  /** Actual spend, or net forecast after time-boxed churn. */
  spend: number;
  /** Gross model forecast (forecast rows only). */
  grossForecast: number | null;
  churnImpact: number;
  potential: number;
  missingPct: number;
}

export type SpendSeriesPoint = HistoryMonthRow | ForecastMonthRow;

export interface SpendForecastResult {
  history: HistoryMonthRow[];
  forecast: ForecastMonthRow[];
  series: SpendSeriesPoint[];
  /** Combined MoM actual + forecast comparison (recent history + horizon). */
  momComparison: MomComparisonRow[];
  model: ForecastModelKind;
  modelLabel: string;
  latestDataMonth: string | null;
  /**
   * Sum of monthly losses for churned clients whose impact window still
   * overlaps at least one forecast month (not a flat drag on every month).
   */
  activeChurnMonthlyCapacity: number;
  churnedClients: ChurnedClient[];
  /** Clients whose impact window still covers at least one forecast month. */
  activeImpactClients: ChurnedClient[];
  netYearTotal: number;
  grossYearTotal: number;
  /** Sum of per-month churn impact over the forecast horizon only. */
  forecastChurnImpactTotal: number;
  /** Sum of potential (gross) over forecast horizon. */
  forecastPotentialTotal: number;
  /** Weighted missing % across forecast horizon. */
  forecastMissingPct: number;
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

export function churnImpactWindow(exitMonth: string): {
  impactStartMonth: string;
  impactEndMonth: string;
} {
  return {
    impactStartMonth: shiftMonth(exitMonth, 1),
    impactEndMonth: shiftMonth(exitMonth, CHURN_IMPACT_MONTHS),
  };
}

/** Whether a calendar month falls inside a client's post-exit impact window. */
export function monthInChurnWindow(
  month: string,
  impactStartMonth: string,
  impactEndMonth: string
): boolean {
  return month >= impactStartMonth && month <= impactEndMonth;
}

export function churnImpactForMonth(
  month: string,
  churnedClients: ChurnedClient[]
): number {
  return churnedClients.reduce((sum, c) => {
    if (monthInChurnWindow(month, c.impactStartMonth, c.impactEndMonth)) {
      return sum + c.monthlyChurnLoss;
    }
    return sum;
  }, 0);
}

function missingPct(churnImpact: number, potential: number): number {
  if (potential <= 0) return 0;
  return (churnImpact / potential) * 100;
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
    if (n >= seasonLength) {
      const values = Array.from({ length: horizon }, (_, i) => {
        const idx = n - seasonLength + (i % seasonLength);
        return Math.max(0, y[idx] ?? y[n - 1] ?? 0);
      });
      return { values, model: 'seasonal-naive' };
    }

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
      sum += y[s * seasonLength + i] - seasonAverages[s];
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
    if (row.brandName) entry.brandName = row.brandName;
    if (row.industry) entry.industry = row.industry;
    if (row.type) entry.type = row.type;
    if (row.team) entry.team = row.team;
  }
  return Array.from(map.values());
}

/**
 * Churn vs pause:
 * - **Churn**: ≥2 consecutive months with no spend, and the client is still
 *   inactive through the latest data month (never came back).
 * - **Pause**: same gap of ≥2 months, but the client later recorded spend
 *   again → not churned; no impact window is applied.
 *
 * Exit month = second month of the *current trailing* inactivity streak.
 * Monthly loss = avg spend over up to 6 months before that streak started.
 * Impact window = exit+1 … exit+12 (e.g. exit Sep-25 → through Sep-26).
 * Historical actuals are never rewritten; impact is an overlay only.
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

    const positiveMonths = Array.from(client.byMonth.entries())
      .filter(([, amt]) => amt > 0)
      .map(([m]) => m)
      .sort();
    if (positiveMonths.length === 0) continue;

    const lastPositive = positiveMonths[positiveMonths.length - 1];
    const firstActivityMonth = positiveMonths[0];

    // Still spending in the latest portfolio month → active (or resumed) = not churn.
    if ((client.byMonth.get(latestDataMonth) || 0) > 0) continue;

    // Any spend on/after the latest data month's window means they are not trailing-inactive.
    // If last positive spend is too recent to form a 2-month gap, treat as pause / active.
    if (lastPositive >= latestDataMonth) continue;
    const earliestExitMonth = shiftMonth(lastPositive, inactiveMonths);
    if (earliestExitMonth > latestDataMonth) continue;

    const timeline = monthsBetweenInclusive(firstActivityMonth, latestDataMonth);
    if (timeline.length < inactiveMonths) continue;

    // Trailing zero streak must run all the way to latestDataMonth.
    // If they spent again after an earlier gap, lastPositive is recent and
    // zeroStreak < inactiveMonths → pause, not churn.
    let zeroStreak = 0;
    for (let i = timeline.length - 1; i >= 0; i--) {
      const amt = client.byMonth.get(timeline[i]) || 0;
      if (amt > 0) break;
      zeroStreak++;
    }

    if (zeroStreak < inactiveMonths) continue;

    // Confirm there is no positive spend after the streak started (resume = pause).
    const inactivityStartMonth = shiftMonth(latestDataMonth, -(zeroStreak - 1));
    const resumedAfterGap = positiveMonths.some((m) => m >= inactivityStartMonth);
    if (resumedAfterGap) continue;

    const exitMonth = shiftMonth(inactivityStartMonth, inactiveMonths - 1);
    const { impactStartMonth, impactEndMonth } = churnImpactWindow(exitMonth);

    const lookback: MonthAmount[] = [];
    for (let i = lookbackMonths; i >= 1; i--) {
      const m = shiftMonth(inactivityStartMonth, -i);
      if (m < firstActivityMonth) continue;
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
      impactStartMonth,
      impactEndMonth,
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

  const latestDataMonth =
    contiguous.length > 0 ? contiguous[contiguous.length - 1].month : null;

  const churnedClients = latestDataMonth
    ? detectChurnedClients(filtered, latestDataMonth)
    : [];

  // Historical actuals stay as recorded; churn is an overlay for potential / %.
  const history: HistoryMonthRow[] = contiguous.map((h) => {
    const impact = churnImpactForMonth(h.month, churnedClients);
    const potential = h.amount + impact;
    return {
      month: h.month,
      label: formatMonthLabel(h.month),
      actual: h.amount,
      churnImpact: impact,
      potential,
      missingPct: missingPct(impact, potential),
      isForecast: false as const,
    };
  });

  const { values, model } = forecastHoltWinters(contiguous, horizon);

  const forecast: ForecastMonthRow[] = values.map((gross, i) => {
    const month = latestDataMonth
      ? shiftMonth(latestDataMonth, i + 1)
      : format(addMonths(new Date(), i + 1), 'yyyy-MM');
    // Only clients whose impact window still covers this forecast month.
    const churnImpact = churnImpactForMonth(month, churnedClients);
    const netForecast = Math.max(0, gross - churnImpact);
    // Could've been = book forecast + remaining churn opportunity.
    const potential = gross + churnImpact;
    return {
      month,
      label: formatMonthLabel(month),
      grossForecast: gross,
      churnImpact,
      netForecast,
      potential,
      missingPct: missingPct(churnImpact, potential),
      isForecast: true as const,
    };
  });

  const firstForecastMonth = forecast[0]?.month ?? null;
  const lastForecastMonth = forecast[forecast.length - 1]?.month ?? null;

  const activeImpactClients = churnedClients.filter((c) => {
    if (!firstForecastMonth || !lastForecastMonth) return false;
    // Window overlaps the forecast horizon at all
    return c.impactStartMonth <= lastForecastMonth && c.impactEndMonth >= firstForecastMonth;
  });

  const activeChurnMonthlyCapacity = activeImpactClients.reduce(
    (s, c) => s + c.monthlyChurnLoss,
    0
  );

  const grossYearTotal = forecast.reduce((s, f) => s + f.grossForecast, 0);
  const netYearTotal = forecast.reduce((s, f) => s + f.netForecast, 0);
  const forecastChurnImpactTotal = forecast.reduce((s, f) => s + f.churnImpact, 0);
  const forecastPotentialTotal = forecast.reduce((s, f) => s + f.potential, 0);
  const forecastMissingPct = missingPct(forecastChurnImpactTotal, forecastPotentialTotal);

  const momComparison: MomComparisonRow[] = [
    ...history.slice(-18).map((h) => ({
      month: h.month,
      label: h.label,
      kind: 'actual' as const,
      spend: h.actual,
      grossForecast: null,
      churnImpact: h.churnImpact,
      potential: h.potential,
      missingPct: h.missingPct,
    })),
    ...forecast.map((f) => ({
      month: f.month,
      label: f.label,
      kind: 'forecast' as const,
      spend: f.netForecast,
      grossForecast: f.grossForecast,
      churnImpact: f.churnImpact,
      potential: f.potential,
      missingPct: f.missingPct,
    })),
  ];

  return {
    history,
    forecast,
    series: [...history, ...forecast],
    momComparison,
    model,
    modelLabel: modelLabel(model),
    latestDataMonth,
    activeChurnMonthlyCapacity,
    churnedClients,
    activeImpactClients,
    netYearTotal,
    grossYearTotal,
    forecastChurnImpactTotal,
    forecastPotentialTotal,
    forecastMissingPct,
  };
}

export function listDataMonths(spends: MonthlySpend[]): string[] {
  return Array.from(new Set(spends.map((s) => s.month).filter(Boolean))).sort();
}

export function monthsEndingAt(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    shiftMonth(endMonth, -(count - 1 - i))
  );
}
