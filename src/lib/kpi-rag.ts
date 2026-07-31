import type { RagStatus } from './types';

export type ClientPath = 'on-path' | 'off-path' | 'no-signal';

/** Coerce Firestore number | string fields used in KPI RAG math. */
export function coerceKpiNumber(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val == null || val === '') return 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, '').trim();
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/** ASC = higher is better; DESC = lower is better. */
export function meetsTarget(
  achieved: number,
  target: number,
  direction: 'ASC' | 'DESC' = 'ASC'
): boolean {
  if (direction === 'DESC') return achieved <= target;
  return achieved >= target;
}

/** Monthly / MTD RAG: achieved vs monthly target, direction-aware. */
export function getMonthlyStatus(
  achieved: number,
  target: number,
  direction: 'ASC' | 'DESC' = 'ASC'
): RagStatus {
  if (target === 0 && achieved === 0) return 'N/A';
  return meetsTarget(achieved, target, direction) ? 'Green' : 'Red';
}

export function isExplicitPrimaryKpiType(kpiType: unknown): boolean {
  return String(kpiType ?? '')
    .trim()
    .toUpperCase()
    .replace(/_/g, '-') === 'PRIMARY';
}

/** Missing kpiType defaults to PRIMARY (legacy rows). */
export function isPrimaryKpiType(kpiType: unknown): boolean {
  if (kpiType == null || String(kpiType).trim() === '') return true;
  return isExplicitPrimaryKpiType(kpiType);
}

type PrimaryKpiLike = {
  kpiType?: string;
  kpi?: string;
  channel?: string;
  achievedMonthTillYesterday?: unknown;
  targetMonth?: unknown;
  direction?: 'ASC' | 'DESC';
};

/**
 * Choose Primary KPI rows for path rollup.
 * Prefer explicitly marked PRIMARY so unmarked legacy KPIs do not steal the path
 * when the client already has a designated Primary.
 */
export function selectPrimaryKpisForPath<T extends PrimaryKpiLike>(kpis: T[]): T[] {
  const primaries = kpis.filter((k) => isPrimaryKpiType(k.kpiType));
  if (!primaries.length) return [];
  const explicit = primaries.filter((k) => isExplicitPrimaryKpiType(k.kpiType));
  return explicit.length > 0 ? explicit : primaries;
}

function statusSeverity(status: RagStatus): number {
  if (status === 'Red') return 0;
  if (status === 'Amber') return 1;
  if (status === 'Green') return 2;
  return 3;
}

/**
 * Client path from Primary KPI MTD statuses (same formula as KPI Tracker).
 * Any Red → Off Path; else any Green → On Path; else No Signal.
 */
export function clientPathFromPrimaryKpis<T extends PrimaryKpiLike>(
  kpis: T[]
): {
  path: ClientPath;
  pathStatus: RagStatus;
  representative: T | null;
  achieved: number;
  target: number;
  direction: 'ASC' | 'DESC';
} {
  const pool = selectPrimaryKpisForPath(kpis);
  if (!pool.length) {
    return {
      path: 'no-signal',
      pathStatus: 'N/A',
      representative: null,
      achieved: 0,
      target: 0,
      direction: 'ASC',
    };
  }

  const scored = pool.map((kpi) => {
    const achieved = coerceKpiNumber(kpi.achievedMonthTillYesterday);
    const target = coerceKpiNumber(kpi.targetMonth);
    const direction: 'ASC' | 'DESC' = kpi.direction === 'DESC' ? 'DESC' : 'ASC';
    const pathStatus = getMonthlyStatus(achieved, target, direction);
    return { kpi, achieved, target, direction, pathStatus };
  });

  const hasRed = scored.some((s) => s.pathStatus === 'Red');
  const hasGreen = scored.some((s) => s.pathStatus === 'Green');
  const path: ClientPath = hasRed ? 'off-path' : hasGreen ? 'on-path' : 'no-signal';
  const pathStatus: RagStatus = hasRed ? 'Red' : hasGreen ? 'Green' : 'N/A';

  // Representative row for labels: prefer matching path status, then name.
  scored.sort((a, b) => {
    const aMatch = a.pathStatus === pathStatus ? 0 : 1;
    const bMatch = b.pathStatus === pathStatus ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    const sev = statusSeverity(a.pathStatus) - statusSeverity(b.pathStatus);
    if (sev !== 0) return sev;
    return String(a.kpi.kpi || '').localeCompare(String(b.kpi.kpi || ''));
  });
  const best = scored[0];

  return {
    path,
    pathStatus,
    representative: best.kpi,
    achieved: best.achieved,
    target: best.target,
    direction: best.direction,
  };
}

export function formatKpiNumber(val: number, currency?: string): string {
  if (val == null || Number.isNaN(val)) return '—';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (currency && currency !== 'INR' && currency !== 'UNITS') {
    if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
    return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
  }
  if (abs >= 10000000) return `${sign}${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
}

export function kpiAttainmentPct(
  achieved: number,
  target: number,
  direction: 'ASC' | 'DESC' = 'ASC'
): number | null {
  if (!target || target <= 0) return null;
  if (direction === 'DESC') {
    // Lower is better: 100% when at/under target
    if (achieved <= 0) return 100;
    return Math.min(100, (target / achieved) * 100);
  }
  return Math.min(150, (achieved / target) * 100);
}
