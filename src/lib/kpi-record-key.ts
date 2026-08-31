import { canonicalizeChannel } from '@/lib/normalize';

/** Series identity: one KPI line across months (LOB must be included). */
export function kpiSeriesKey(item: {
  clientId?: string;
  clientName?: string;
  lob?: string;
  channel?: string;
  kpi?: string;
}): string {
  return [
    (item.clientId || '').trim().toLowerCase(),
    (item.clientName || '').trim().toLowerCase(),
    (item.lob || '').trim().toLowerCase(),
    canonicalizeChannel(item.channel),
    (item.kpi || '').trim().toLowerCase(),
  ].join('|');
}
