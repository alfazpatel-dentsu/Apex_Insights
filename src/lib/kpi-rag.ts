import type { RagStatus } from './types';

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
