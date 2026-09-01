import type { MonthlySpend, WeeklySpend } from '@/lib/types';

/** Stable mock snapshot for the unauthenticated Spends Dashboard design preview. */

const BRANDS = [
  { brandName: 'Apex Bank', industry: 'BFSI', type: 'Performance', team: 'Team Alpha', clientId: 'c-apex' },
  { brandName: 'Helios Auto', industry: 'Auto', type: 'Branding', team: 'Team Beta', clientId: 'c-helios' },
  { brandName: 'Nova Retail', industry: 'Retail', type: 'Performance', team: 'Team Gamma', clientId: 'c-nova' },
  { brandName: 'Pulse Health', industry: 'Healthcare', type: 'Affiliates', team: 'Team Alpha', clientId: 'c-pulse' },
  { brandName: 'Orion Travel', industry: 'Travel', type: 'Performance', team: 'Team Beta', clientId: 'c-orion' },
] as const;

const CHANNELS = ['Google', 'Meta', 'Amazon', 'DV360'] as const;

const CHANNEL_WEIGHT: Record<(typeof CHANNELS)[number], number> = {
  Google: 1.15,
  Meta: 0.95,
  Amazon: 0.72,
  DV360: 0.58,
};

const BRAND_BASE: Record<string, number> = {
  'Apex Bank': 1_85_00_000,
  'Helios Auto': 1_42_00_000,
  'Nova Retail': 2_10_00_000,
  'Pulse Health': 98_00_000,
  'Orion Travel': 1_25_00_000,
};

function monthKeys(fromYear: number, fromMonth: number, toYear: number, toMonth: number) {
  const keys: string[] = [];
  let y = fromYear;
  let m = fromMonth;
  while (y < toYear || (y === toYear && m <= toMonth)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

function formatWeekLabel(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function mondayOnOrBefore(d: Date) {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? 6 : day - 1;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function seasonal(monthIndex: number) {
  // Slight Q4 lift + mid-year dip so charts have shape.
  const wave = 1 + 0.08 * Math.sin((monthIndex / 12) * Math.PI * 2);
  const festive = monthIndex >= 9 ? 1.12 : 1;
  return wave * festive;
}

function rowId(prefix: string, parts: string[]) {
  return `${prefix}-${parts.join('-').replace(/\s+/g, '').toLowerCase()}`;
}

export function getSpendsDashboardPreviewData(): {
  monthly: MonthlySpend[];
  weekly: WeeklySpend[];
} {
  const months = monthKeys(2025, 1, 2026, 8);
  const monthly: MonthlySpend[] = [];

  months.forEach((month, mi) => {
    const monthNum = parseInt(month.split('-')[1], 10);
    BRANDS.forEach((brand, bi) => {
      CHANNELS.forEach((channel, ci) => {
        const trend = 1 + mi * 0.012 - bi * 0.015;
        const noise = 1 + ((bi + ci + mi) % 5) * 0.03 - 0.06;
        const gainerBoost = brand.brandName === 'Nova Retail' && mi > 10 ? 1.22 : 1;
        const loserDrag = brand.brandName === 'Helios Auto' && mi > 12 ? 0.78 : 1;
        const amount = Math.round(
          BRAND_BASE[brand.brandName] *
            CHANNEL_WEIGHT[channel] *
            seasonal(monthNum - 1) *
            trend *
            noise *
            gainerBoost *
            loserDrag
        );
        monthly.push({
          id: rowId('m', [month, brand.clientId, channel]),
          clientId: brand.clientId,
          brandName: brand.brandName,
          industry: brand.industry,
          type: brand.type,
          subEntity: brand.brandName,
          channelVendor: channel,
          creditLine: 'Primary',
          currency: 'INR',
          team: brand.team,
          month,
          actualSpendsInr: amount,
        });
      });
    });
  });

  const weekly: WeeklySpend[] = [];
  const latestMonday = mondayOnOrBefore(new Date(2026, 7, 31));
  for (let w = 15; w >= 0; w--) {
    const weekStart = new Date(latestMonday);
    weekStart.setDate(latestMonday.getDate() - w * 7);
    const week = formatWeekLabel(weekStart);
    const month = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}`;
    BRANDS.forEach((brand, bi) => {
      CHANNELS.forEach((channel, ci) => {
        const weekFactor = 1 + (15 - w) * 0.008 + ((w + bi) % 3) * 0.04 - 0.05;
        const amount = Math.round(
          (BRAND_BASE[brand.brandName] / 4.3) * CHANNEL_WEIGHT[channel] * weekFactor
        );
        weekly.push({
          id: rowId('w', [week, brand.clientId, channel]),
          clientId: brand.clientId,
          brandName: brand.brandName,
          industry: brand.industry,
          type: brand.type,
          subEntity: brand.brandName,
          channelVendor: channel,
          creditLine: 'Primary',
          currency: 'INR',
          team: brand.team,
          week,
          month,
          spendsInr: amount,
        });
      });
    });
  }

  return { monthly, weekly };
}
