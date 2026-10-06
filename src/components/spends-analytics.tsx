
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Bar, 
  BarChart, 
  CartesianGrid, 
  Legend, 
  LabelList,
  Line, 
  LineChart, 
  ResponsiveContainer, 
  Tooltip, 
  XAxis, 
  YAxis 
} from 'recharts';
import { 
  Loader2, 
  ArrowUpRight, 
  ArrowDownRight,
  ArrowUp,
  ArrowDown,
  Download,
} from 'lucide-react';
import { format, parse, subMonths, subWeeks, isValid } from 'date-fns';
import { where } from 'firebase/firestore';

import { useCollection, useUser, useDoc } from '@/firebase';
import { MonthlySpend, WeeklySpend, UserProfile } from '@/lib/types';
import { getActiveAgency, agencyCollectionPath } from '@/lib/agencies';
import { canonicalizeChannel } from '@/lib/normalize';
import {
  aggregateBrandSpendBreakdown,
  buildWowSpendsTrend,
  dominantImpactSpendType,
  isMyntraOrOlaClient,
  rankBrandPeriodMovers,
  rowSpendAmount,
  toSpendNumber,
  type BrandPeriodMover,
} from '@/lib/spend-week';
import {
  listPeriodOptions,
  monthInPeriod,
  periodYearsAgo,
  pickExistingPeriod,
  priorPeriod,
  weekInPeriod,
  buildClientCompareRows,
  buildCompareProgression,
  COMPARE_GRAINS,
  type SpendCompareGrain,
} from '@/lib/spend-compare';
import { PageHeader } from '@/components/page-header';
import { SpendMoversPanel } from '@/components/spend-movers-panel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type Dimension = 'overall' | 'team' | 'channelVendor' | 'industry' | 'type' | 'brandName';

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: 'overall', label: 'Overall' },
  { value: 'team', label: 'Team' },
  { value: 'channelVendor', label: 'Channel' },
  { value: 'industry', label: 'Industry' },
  { value: 'type', label: 'Type' },
  { value: 'brandName', label: 'Client' },
];

const CHART_PALETTE = [
  'hsl(223 100% 33%)', // Brand Blue
  'hsl(163 100% 38%)', // Success Green
  'hsl(38 100% 57%)',  // Warning Amber
  'hsl(0 100% 60%)',   // Destructive Red
  'hsl(0 0% 32%)',     // Secondary Ink
  'hsl(280 40% 50%)',
  'hsl(140 40% 40%)',
  'hsl(340 50% 45%)',
  'hsl(200 60% 40%)',
  'hsl(35 80% 30%)',
];

interface GainerLoser {
  brand: string;
  type: string;
  team: string;
  diff: number;
  percentage: number;
}

const formatCurrency = (val: number) => {
    const absVal = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (absVal >= 10000000) return `₹${sign}${(absVal / 10000000).toFixed(2)}Cr`;
    if (absVal >= 100000) return `₹${sign}${(absVal / 100000).toFixed(2)}L`;
    return `₹${sign}${absVal.toLocaleString()}`;
};

const formatChartLabel = (val: number) => {
  if (val == null || Number.isNaN(val) || val === 0) return '';
  const absVal = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (absVal >= 10000000) return `${sign}${(absVal / 10000000).toFixed(1)}Cr`;
  if (absVal >= 100000) return `${sign}${(absVal / 100000).toFixed(1)}L`;
  if (absVal >= 1000) return `${sign}${(absVal / 1000).toFixed(0)}K`;
  return `${sign}${absVal.toFixed(0)}`;
};

/** Alternate above/below the line so neighboring labels don't collide. */
const SpendPointLabel = (props: {
  x?: number | string;
  y?: number | string;
  value?: number | string;
  index?: number;
  payload?: Record<string, any>;
}) => {
  const { x, y, value, index = 0, payload } = props;
  const numeric = typeof value === 'number' ? value : Number(value);
  const label = formatChartLabel(numeric);
  if (!label || x == null || y == null) return null;

  const cx = Number(x);
  const cy = Number(y);
  const placeAbove = index % 2 === 0;
  const dy = placeAbove ? -14 : 20;
  const delta = payload?.__delta;
  const deltaLabel =
    delta != null && !Number.isNaN(delta) && delta !== 0
      ? `${delta > 0 ? '+' : ''}${formatChartLabel(delta)}`
      : '';

  return (
    <text
      x={cx}
      y={cy + dy}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="hsl(var(--ink))"
      fontSize={9}
      fontWeight={700}
      fontFamily="var(--font-mono), IBM Plex Mono, monospace"
      style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}
    >
      <tspan x={cx} dy="0">{label}</tspan>
      {deltaLabel ? (
        <tspan
          x={cx}
          dy={placeAbove ? -11 : 11}
          fill={delta > 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
          fontSize={8}
        >
          {deltaLabel}
        </tspan>
      ) : null}
    </text>
  );
};

/** Bar top labels: total spend + period difference. */
const SpendBarLabel = (props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string;
  payload?: Record<string, any>;
}) => {
  const { x, y, width, payload } = props;
  if (x == null || y == null) return null;

  const total = typeof payload?.__total === 'number'
    ? payload.__total
    : typeof props.value === 'number'
      ? props.value
      : Number(props.value);
  const label = formatChartLabel(total);
  if (!label) return null;

  const cx = Number(x) + (Number(width) || 0) / 2;
  const cy = Number(y);
  const delta = payload?.__delta;
  const deltaLabel =
    delta != null && !Number.isNaN(delta) && delta !== 0
      ? `${delta > 0 ? '+' : ''}${formatChartLabel(delta)}`
      : '';

  return (
    <text
      x={cx}
      y={cy - (deltaLabel ? 16 : 8)}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="hsl(var(--ink))"
      fontSize={9}
      fontWeight={700}
      fontFamily="var(--font-mono), IBM Plex Mono, monospace"
      style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}
    >
      <tspan x={cx} dy="0">{label}</tspan>
      {deltaLabel ? (
        <tspan
          x={cx}
          dy="11"
          fill={delta > 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
          fontSize={8}
        >
          {deltaLabel}
        </tspan>
      ) : null}
    </text>
  );
};

const META_CHART_KEYS = new Set(['week', 'timestamp', 'month', 'label', 'quarter', '__total', '__delta']);

const getSeriesKeys = (row: Record<string, any> | undefined) =>
  Object.keys(row || {}).filter((k) => !META_CHART_KEYS.has(k) && typeof (row as any)[k] === 'number');

const withPeriodDeltas = (rows: Record<string, any>[]) =>
  rows.map((row, i) => {
    const keys = getSeriesKeys(row);
    const total = keys.reduce((sum, k) => sum + (Number(row[k]) || 0), 0);
    const prev = i > 0 ? rows[i - 1] : null;
    const prevTotal = prev
      ? getSeriesKeys(prev).reduce((sum, k) => sum + (Number(prev[k]) || 0), 0)
      : null;
    return {
      ...row,
      __total: total,
      __delta: prevTotal != null ? total - prevTotal : null,
    };
  });

/** Keep charts readable: top series by latest period, remainder rolled into Other. */
const collapseChartSeries = (rows: Record<string, any>[], maxSeries = 6) => {
  if (rows.length === 0) return rows;
  const keys = getSeriesKeys(rows[rows.length - 1]);
  if (keys.length <= maxSeries) return rows;
  const last = rows[rows.length - 1];
  const keep = [...keys]
    .sort((a, b) => (Number(last[b]) || 0) - (Number(last[a]) || 0))
    .slice(0, maxSeries);
  const keepSet = new Set(keep);
  return rows.map((row) => {
    const next: Record<string, any> = {};
    Object.keys(row).forEach((k) => {
      if (META_CHART_KEYS.has(k) || keepSet.has(k)) next[k] = row[k];
    });
    next.Other = keys.reduce((sum, k) => (keepSet.has(k) ? sum : sum + (Number(row[k]) || 0)), 0);
    return next;
  });
};

const renderVarianceRow = (growth: number, varianceAmount: number | undefined, label: string) => {
  const isUp = growth > 0 || (varianceAmount != null && varianceAmount > 0);
  const isDown = growth < 0 || (varianceAmount != null && varianceAmount < 0);
  const amountPrefix = varianceAmount != null && varianceAmount > 0 ? '+' : '';
  return (
    <div className={cn(
      "flex flex-wrap items-center gap-1.5 font-mono text-[10px] font-black uppercase",
      isDown ? "text-destructive" : "text-success"
    )}>
      {isUp ? <ArrowUpRight className="h-3 w-3 shrink-0" /> : isDown ? <ArrowDownRight className="h-3 w-3 shrink-0" /> : null}
      {varianceAmount != null && (
        <span className="break-all">{amountPrefix}{formatCurrency(varianceAmount)}</span>
      )}
      {varianceAmount != null && <span className="opacity-40">·</span>}
      <span>{Math.abs(growth).toFixed(1)}%</span>
      <span>{label}</span>
    </div>
  );
};

export function SpendsAnalytics() {
  const { user } = useUser();
  const { data: userProfile } = useDoc<UserProfile>(user ? `users/${user.uid}` : null);
  const activeAgency = getActiveAgency(userProfile);
  // Backward compatibility: Sokrati users read from root collections, others from agency-scoped
  const monthlyPath = activeAgency ? (activeAgency === 'sokrati' ? 'monthlySpends' : agencyCollectionPath(activeAgency, 'monthlySpends')) : null;
  const weeklyPath = activeAgency ? (activeAgency === 'sokrati' ? 'weeklySpends' : agencyCollectionPath(activeAgency, 'weeklySpends')) : null;

  const [mounted, setMounted] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const { toast } = useToast();

  const [wowDimension, setWowDimension] = useState<Dimension>('overall');
  const [momDimension, setMomDimension] = useState<Dimension>('overall');
  const [qoqDimension, setQoqDimension] = useState<Dimension>('overall');

  const [excludeLargeClients, setExcludeLargeClients] = useState(false);
  const [compareGrain, setCompareGrain] = useState<SpendCompareGrain>('month');
  const [periodA, setPeriodA] = useState('');
  const [periodB, setPeriodB] = useState('');
  const [compareClients, setCompareClients] = useState<string[]>([]);
  const [compareTypes, setCompareTypes] = useState<string[]>([]);
  const [compareChannels, setCompareChannels] = useState<string[]>([]);
  const [compareTeams, setCompareTeams] = useState<string[]>([]);

  useEffect(() => {
    if (!COMPARE_GRAINS.some((g) => g.value === compareGrain)) {
      setCompareGrain('month');
      setPeriodA('');
      setPeriodB('');
    }
  }, [compareGrain]);

  useEffect(() => {
    setMounted(true);
    const cy = new Date().getFullYear();
    const fixedBase = ["2024", "2025", "2026"];
    setAvailableYears(Array.from(new Set([...fixedBase, cy.toString()])).sort().reverse());
  }, []);

  const queryConstraints = useMemo(() => {
    const cy = new Date().getFullYear();
    const endYear = Math.max(cy, parseInt(selectedYear, 10) || cy);
    return [
      where('month', '>=', '2023-01'),
      where('month', '<=', `${endYear}-12`)
    ];
  }, [selectedYear]);

  const { data: rawMonthlyData, loading: monthlyLoading } = useCollection<MonthlySpend>(monthlyPath, queryConstraints);
  const { data: rawWeeklyData, loading: weeklyLoading } = useCollection<WeeklySpend>(weeklyPath, queryConstraints);

  useEffect(() => {
    if (rawMonthlyData && rawMonthlyData.length > 0) {
      const dataYears = rawMonthlyData.map(d => d.month.split('-')[0]);
      setAvailableYears(prev => Array.from(new Set([...prev, ...dataYears])).sort().reverse());
    }
  }, [rawMonthlyData]);

  const monthlyDataAllClients = useMemo(() => {
    if (!rawMonthlyData) return [];
    return rawMonthlyData.map(item => ({ ...item, channelVendor: canonicalizeChannel(item.channelVendor) }));
  }, [rawMonthlyData]);

  const weeklyDataAllClients = useMemo(() => {
    if (!rawWeeklyData) return [];
    return rawWeeklyData.map(item => ({ ...item, channelVendor: canonicalizeChannel(item.channelVendor) }));
  }, [rawWeeklyData]);

  const monthlyData = monthlyDataAllClients;
  const weeklyData = weeklyDataAllClients;

  const monthlyTrendData = useMemo(
    () => (excludeLargeClients ? monthlyData.filter((row) => !isMyntraOrOlaClient(row)) : monthlyData),
    [monthlyData, excludeLargeClients]
  );
  const weeklyTrendData = useMemo(
    () => (excludeLargeClients ? weeklyData.filter((row) => !isMyntraOrOlaClient(row)) : weeklyData),
    [weeklyData, excludeLargeClients]
  );
  const compareMonthlyData = useMemo(() => {
    const base = excludeLargeClients
      ? monthlyDataAllClients.filter((row) => !isMyntraOrOlaClient(row))
      : monthlyDataAllClients;
    return base.filter((row) => {
      if (compareChannels.length > 0 && !compareChannels.includes(row.channelVendor)) return false;
      if (compareTypes.length > 0 && !compareTypes.includes(row.type)) return false;
      if (compareClients.length > 0 && !compareClients.includes(row.brandName)) return false;
      if (compareTeams.length > 0 && !compareTeams.includes(row.team)) return false;
      return true;
    });
  }, [monthlyDataAllClients, excludeLargeClients, compareChannels, compareTypes, compareClients, compareTeams]);
  const compareWeeklyData = useMemo(() => {
    const base = excludeLargeClients
      ? weeklyDataAllClients.filter((row) => !isMyntraOrOlaClient(row))
      : weeklyDataAllClients;
    return base.filter((row) => {
      if (compareChannels.length > 0 && !compareChannels.includes(row.channelVendor)) return false;
      if (compareTypes.length > 0 && !compareTypes.includes(row.type)) return false;
      if (compareClients.length > 0 && !compareClients.includes(row.brandName)) return false;
      if (compareTeams.length > 0 && !compareTeams.includes(row.team)) return false;
      return true;
    });
  }, [weeklyDataAllClients, excludeLargeClients, compareChannels, compareTypes, compareClients, compareTeams]);

  // Unique Options for Filters
  const filterOptions = useMemo(() => {
    if (!rawMonthlyData) return { channels: [], clients: [], teams: [], types: [] };
    return {
      channels: Array.from(new Set(rawMonthlyData.map(d => canonicalizeChannel(d.channelVendor)))).filter(Boolean).sort(),
      clients: Array.from(new Set(rawMonthlyData.map(d => d.brandName))).filter(Boolean).sort(),
      teams: Array.from(new Set(rawMonthlyData.map(d => d.team))).filter(Boolean).sort(),
      types: Array.from(new Set(rawMonthlyData.map(d => d.type))).filter(Boolean).sort(),
    };
  }, [rawMonthlyData]);

  const stats = useMemo(() => {
    if (!monthlyData || !weeklyData || !mounted) return null;

    const currentYearStr = selectedYear;
    const prevYearStr = (parseInt(selectedYear) - 1).toString();

    const calcGainersLosers = (curr: ReturnType<typeof aggregateBrandSpendBreakdown>, prev: ReturnType<typeof aggregateBrandSpendBreakdown>) => {
      const allBrands = Array.from(new Set([...Object.keys(curr.spendMap), ...Object.keys(prev.spendMap)]));
      const diffs = allBrands.map(brand => {
        const c = curr.spendMap[brand] || 0;
        const p = prev.spendMap[brand] || 0;
        const diff = c - p;
        const type = dominantImpactSpendType(curr.typeSpendMap[brand], prev.typeSpendMap[brand], diff);
        const team = curr.teamByType[brand]?.[type] || prev.teamByType[brand]?.[type] || 'N/A';
        return { 
          brand, 
          type,
          team,
          diff, 
          percentage: p > 0 ? (diff / p) * 100 : (c > 0 ? 100 : 0)
        };
      });
      return {
        gainers: [...diffs].sort((a, b) => b.diff - a.diff).slice(0, 3).filter(x => x.diff > 0),
        losers: [...diffs].sort((a, b) => a.diff - b.diff).slice(0, 3).filter(x => x.diff < 0),
      };
    };

    const monthsInYear = Array.from(new Set(monthlyData.filter(d => d.month.startsWith(currentYearStr)).map(d => d.month))).sort().reverse();
    // Prefer latest month that actually has spend (same approach as Snapshot)
    let lastMonthKey = '';
    for (const m of monthsInYear) {
      const monthTotal = monthlyData
        .filter((d) => d.month === m)
        .reduce((a, b) => a + (b.actualSpendsInr || 0), 0);
      if (monthTotal > 0) {
        lastMonthKey = m;
        break;
      }
    }
    if (!lastMonthKey) lastMonthKey = monthsInYear[0] || '';

    let prevMonthKey = '';
    if (lastMonthKey) {
      prevMonthKey = format(subMonths(parse(lastMonthKey, 'yyyy-MM', new Date()), 1), 'yyyy-MM');
    }

    const throughMonth = lastMonthKey ? parseInt(lastMonthKey.split('-')[1], 10) : 12;
    const isSamePeriodYtd = (monthKey: string, y: string) => {
      if (!monthKey.startsWith(`${y}-`)) return false;
      const m = parseInt(monthKey.split('-')[1], 10);
      return m >= 1 && m <= throughMonth;
    };
    // Fair YoY: YTD through latest uploaded month vs same months last year
    const ytdCurrRows = monthlyData.filter((d) => isSamePeriodYtd(d.month, currentYearStr));
    const ytdPrevRows = monthlyData.filter((d) => isSamePeriodYtd(d.month, prevYearStr));
    const yearlyCurrent = aggregateBrandSpendBreakdown(ytdCurrRows);
    const yearlyPrev = aggregateBrandSpendBreakdown(ytdPrevRows);

    const yearlySpends = Object.values(yearlyCurrent.spendMap).reduce((a, b) => a + b, 0);
    const prevYearSpends = Object.values(yearlyPrev.spendMap).reduce((a, b) => a + b, 0);
    const ytdThroughLabel = lastMonthKey
      ? format(parse(lastMonthKey, 'yyyy-MM', new Date()), 'MMM').toUpperCase()
      : '';

    const lastMonth = aggregateBrandSpendBreakdown(monthlyData.filter(d => d.month === lastMonthKey));
    const prevMonth = aggregateBrandSpendBreakdown(monthlyData.filter(d => d.month === prevMonthKey));
    const lastMonthSpends = Object.values(lastMonth.spendMap).reduce((a, b) => a + b, 0);
    const prevMonthSpends = Object.values(prevMonth.spendMap).reduce((a, b) => a + b, 0);

    const weeksInYear = Array.from(new Set(weeklyData.filter(d => d.month?.startsWith(currentYearStr)).map(d => d.week))).sort((a, b) => {
      try {
        return parse(b, 'dd-MM-yyyy', new Date()).getTime() - parse(a, 'dd-MM-yyyy', new Date()).getTime();
      } catch (e) {
        return 0;
      }
    });
    const lastWeekKey = weeksInYear[0] || '';
    const prevWeekKey = lastWeekKey ? format(subWeeks(parse(lastWeekKey, 'dd-MM-yyyy', new Date()), 1), 'dd-MM-yyyy') : '';

    const lastWeek = aggregateBrandSpendBreakdown(weeklyData.filter(d => d.week === lastWeekKey));
    const prevWeek = aggregateBrandSpendBreakdown(weeklyData.filter(d => d.week === prevWeekKey));
    const lastWeekSpends = Object.values(lastWeek.spendMap).reduce((a, b) => a + b, 0);
    const prevWeekSpends = Object.values(prevWeek.spendMap).reduce((a, b) => a + b, 0);

    return {
      yearly: {
        total: yearlySpends,
        prevTotal: prevYearSpends,
        varianceAmount: prevYearSpends > 0 ? yearlySpends - prevYearSpends : undefined,
        growth: prevYearSpends > 0 ? ((yearlySpends - prevYearSpends) / prevYearSpends) * 100 : 0,
        ytdThroughLabel,
        gainers: calcGainersLosers(yearlyCurrent, yearlyPrev).gainers,
        losers: calcGainersLosers(yearlyCurrent, yearlyPrev).losers,
      },
      monthly: {
        total: lastMonthSpends,
        prevTotal: prevMonthSpends,
        varianceAmount: lastMonthSpends - prevMonthSpends,
        growth: prevMonthSpends > 0 ? ((lastMonthSpends - prevMonthSpends) / prevMonthSpends) * 100 : 0,
        monthName: lastMonthKey ? format(parse(lastMonthKey, 'yyyy-MM', new Date()), 'MMMM') : 'Latest',
        gainers: calcGainersLosers(lastMonth, prevMonth).gainers,
        losers: calcGainersLosers(lastMonth, prevMonth).losers,
      },
      weekly: {
        total: lastWeekSpends,
        prevTotal: prevWeekSpends,
        varianceAmount: lastWeekSpends - prevWeekSpends,
        growth: prevWeekSpends > 0 ? ((lastWeekSpends - prevWeekSpends) / prevWeekSpends) * 100 : 0,
        weekDate: lastWeekKey,
        gainers: calcGainersLosers(lastWeek, prevWeek).gainers,
        losers: calcGainersLosers(lastWeek, prevWeek).losers,
      },
      keys: { lastMonthKey, prevMonthKey, lastWeekKey, prevWeekKey },
    };
  }, [monthlyData, weeklyData, selectedYear, mounted]);

  const wowChartData = useMemo(() => {
    if (!weeklyTrendData) return [];
    // Overall: shared helper keeps Snapshot 12-Week Momentum in lockstep.
    if (wowDimension === 'overall') {
      const rows = buildWowSpendsTrend(weeklyTrendData, 12).map((row) => ({
        week: row.week,
        timestamp: row.timestamp,
        Total: row.spend,
      }));
      return withPeriodDeltas(rows);
    }

    const groups: Record<string, Record<string, number>> = {};
    weeklyTrendData.forEach(item => {
      const week = item.week;
      const dimKey = (item[wowDimension as keyof WeeklySpend] as string || 'N/A');
      if (!groups[week]) groups[week] = {};
      groups[week][dimKey] = (groups[week][dimKey] || 0) + toSpendNumber(item.spendsInr);
    });
    const rows = Object.entries(groups).map(([week, values]) => {
      let label = week;
      try {
        const d = parse(week, 'dd-MM-yyyy', new Date());
        if (isValid(d)) label = format(d, 'dd MMM');
      } catch {}
      return { week: label, timestamp: parse(week, 'dd-MM-yyyy', new Date()).getTime(), ...values };
    }).sort((a, b) => a.timestamp - b.timestamp).slice(-12);
    return withPeriodDeltas(collapseChartSeries(rows, wowDimension === 'brandName' ? 5 : 6));
  }, [weeklyTrendData, wowDimension]);

  const momChartData = useMemo(() => {
    if (!monthlyTrendData) return [];
    const groups: Record<string, Record<string, number>> = {};
    monthlyTrendData.forEach(item => {
      const month = item.month;
      const dimKey = momDimension === 'overall' ? 'Total' : (item[momDimension as keyof MonthlySpend] as string || 'N/A');
      if (!groups[month]) groups[month] = {};
      groups[month][dimKey] = (groups[month][dimKey] || 0) + item.actualSpendsInr;
    });
    const rows = Object.entries(groups)
      .map(([month, values]) => ({ month, label: format(parse(month, 'yyyy-MM', new Date()), 'MMM yy'), ...values }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
    return withPeriodDeltas(collapseChartSeries(rows, momDimension === 'brandName' ? 5 : 6));
  }, [monthlyTrendData, momDimension]);

  const qoqChartData = useMemo(() => {
    if (!monthlyTrendData) return [];
    const groups: Record<string, Record<string, number>> = {};
    monthlyTrendData.forEach(item => {
      const date = parse(item.month, 'yyyy-MM', new Date());
      const q = Math.floor(date.getMonth() / 3) + 1;
      const qKey = `${date.getFullYear()}-Q${q}`;
      const dimKey = qoqDimension === 'overall' ? 'Total' : (item[qoqDimension as keyof MonthlySpend] as string || 'N/A');
      if (!groups[qKey]) groups[qKey] = {};
      groups[qKey][dimKey] = (groups[qKey][dimKey] || 0) + item.actualSpendsInr;
    });
    const rows = Object.entries(groups)
      .map(([quarter, values]) => ({ quarter, ...values }))
      .sort((a, b) => a.quarter.localeCompare(b.quarter));
    return withPeriodDeltas(collapseChartSeries(rows, qoqDimension === 'brandName' ? 5 : 6));
  }, [monthlyTrendData, qoqDimension]);

  const monthKeys = useMemo(
    () => Array.from(new Set(monthlyDataAllClients.map((d) => d.month).filter(Boolean))),
    [monthlyDataAllClients]
  );
  const weekKeys = useMemo(
    () => Array.from(new Set(weeklyDataAllClients.map((d) => d.week).filter(Boolean))) as string[],
    [weeklyDataAllClients]
  );
  const periodOptions = useMemo(
    () => listPeriodOptions(compareGrain, monthKeys, weekKeys),
    [compareGrain, monthKeys, weekKeys]
  );

  useEffect(() => {
    if (periodB || !stats?.keys.lastMonthKey) return;
    const opts = listPeriodOptions('month', monthKeys, weekKeys);
    const latest = stats.keys.lastMonthKey;
    if (!opts.some((o) => o.id === latest)) return;
    setCompareGrain('month');
    setPeriodB(latest);
    setPeriodA(
      pickExistingPeriod(periodYearsAgo(latest, 'month', 1), opts)
        || pickExistingPeriod(stats.keys.prevMonthKey, opts)
        || ''
    );
  }, [stats?.keys.lastMonthKey, stats?.keys.prevMonthKey, monthKeys, weekKeys, periodB]);

  const handleGrainChange = (grain: SpendCompareGrain) => {
    setCompareGrain(grain);
    const opts = listPeriodOptions(grain, monthKeys, weekKeys);
    const latest = opts[opts.length - 1];
    if (!latest) {
      setPeriodA('');
      setPeriodB('');
      return;
    }
    setPeriodB(latest.id);
    setPeriodA(
      pickExistingPeriod(periodYearsAgo(latest.id, grain, 1), opts)
        || pickExistingPeriod(priorPeriod(latest.id, grain), opts)
        || opts[0]?.id
        || ''
    );
  };

  const handleCompareShortcut = (kind: 'prior' | 'lastYear' | 'twoYears') => {
    if (!periodB) return;
    const candidate =
      kind === 'prior'
        ? priorPeriod(periodB, compareGrain)
        : periodYearsAgo(periodB, compareGrain, kind === 'twoYears' ? 2 : 1);
    const existing = pickExistingPeriod(candidate, periodOptions);
    if (existing) setPeriodA(existing);
  };

  const toggleCompareValue = (
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => (value: string) => {
    setter((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));
  };

  const compareSlice = useMemo(() => {
    if (!periodA || !periodB) return { baseline: [] as typeof compareMonthlyData, compare: [] as typeof compareMonthlyData };
    if (compareGrain === 'week') {
      return {
        baseline: compareWeeklyData.filter((row) => weekInPeriod(row.week || '', periodA)),
        compare: compareWeeklyData.filter((row) => weekInPeriod(row.week || '', periodB)),
      };
    }
    return {
      baseline: compareMonthlyData.filter((row) => monthInPeriod(row.month, compareGrain, periodA)),
      compare: compareMonthlyData.filter((row) => monthInPeriod(row.month, compareGrain, periodB)),
    };
  }, [compareGrain, periodA, periodB, compareMonthlyData, compareWeeklyData]);

  const compareMovers = useMemo<BrandPeriodMover[]>(() => {
    return rankBrandPeriodMovers(
      aggregateBrandSpendBreakdown(compareSlice.compare),
      aggregateBrandSpendBreakdown(compareSlice.baseline)
    );
  }, [compareSlice]);

  const baselineTotal = useMemo(
    () => compareSlice.baseline.reduce((sum, row) => sum + rowSpendAmount(row), 0),
    [compareSlice]
  );
  const compareTotal = useMemo(
    () => compareSlice.compare.reduce((sum, row) => sum + rowSpendAmount(row), 0),
    [compareSlice]
  );
  const baselineLabel = periodOptions.find((o) => o.id === periodA)?.label || periodA;
  const compareLabel = periodOptions.find((o) => o.id === periodB)?.label || periodB;

  const compareProgression = useMemo(
    () =>
      buildCompareProgression({
        grain: compareGrain,
        periodA,
        periodB,
        monthly: compareMonthlyData,
        weekly: compareWeeklyData,
      }),
    [compareGrain, periodA, periodB, compareMonthlyData, compareWeeklyData]
  );

  const compareClientRows = useMemo(
    () =>
      periodA && periodB
        ? buildClientCompareRows({
            grain: compareGrain,
            periodA,
            periodB,
            monthly: compareMonthlyData,
            weekly: compareWeeklyData,
          })
        : [],
    [compareGrain, periodA, periodB, compareMonthlyData, compareWeeklyData]
  );

  const wowSeriesKeys = useMemo(() => getSeriesKeys(wowChartData[0]), [wowChartData]);
  const momSeriesKeys = useMemo(() => getSeriesKeys(momChartData[0]), [momChartData]);
  const qoqSeriesKeys = useMemo(() => getSeriesKeys(qoqChartData[0]), [qoqChartData]);

  const handleExportCsv = (data: any[], title: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).filter(k => k !== 'timestamp' && !k.startsWith('__'));
    const rows = data.map(row => headers.map(h => row[h]).join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}_${selectedYear}.csv`;
    a.click();
    toast({ title: "Export Complete", description: `${title} data has been saved.` });
  };

  const focusClient = (brand: string) => {
    document.getElementById('spend-movers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!mounted || monthlyLoading || weeklyLoading) return <div className="flex flex-1 items-center justify-center p-20"><Loader2 className="h-8 w-8 animate-spin text-primary/40" /></div>;

  const renderGainerLoserList = (gainers: GainerLoser[], losers: GainerLoser[]) => (
    <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-foreground/5 min-w-0">
      <div className="space-y-2 min-w-0">
        <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-success">
          <ArrowUp className="h-2 w-2 shrink-0" /> Top 3 Gainers (Vol)
        </span>
        {gainers.length > 0 ? gainers.map(g => (
          <button
            type="button"
            key={g.brand}
            onClick={() => focusClient(g.brand)}
            className="flex flex-col border-b border-foreground/5 last:border-none pb-1 min-w-0 w-full text-left hover:bg-cream/80"
            title={`Filter to ${g.brand}`}
          >
            <span className="text-[10px] font-black truncate" title={g.brand}>{g.brand}</span>
            <div className="flex flex-wrap items-center gap-1 opacity-60"><span className="text-[8px] font-bold uppercase truncate" title={g.type}>{g.type}</span></div>
            <span className="text-[9px] font-bold text-success leading-none flex items-center justify-between gap-1 mt-0.5 min-w-0">
                <span className="truncate">+{formatCurrency(g.diff)}</span>
                <span className="text-[7px] opacity-60 shrink-0">({g.percentage.toFixed(1)}%)</span>
            </span>
          </button>
        )) : <span className="text-[9px] italic text-secondary">No gains</span>}
      </div>
      <div className="space-y-2 min-w-0">
        <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-destructive">
          <ArrowDown className="h-2 w-2 shrink-0" /> Top 3 Losers (Vol)
        </span>
        {losers.length > 0 ? losers.map(l => (
          <button
            type="button"
            key={l.brand}
            onClick={() => focusClient(l.brand)}
            className="flex flex-col border-b border-foreground/5 last:border-none pb-1 min-w-0 w-full text-left hover:bg-cream/80"
            title={`Filter to ${l.brand}`}
          >
            <span className="text-[10px] font-black truncate" title={l.brand}>{l.brand}</span>
            <div className="flex flex-wrap items-center gap-1 opacity-60"><span className="text-[8px] font-bold uppercase truncate" title={l.type}>{l.type}</span></div>
            <span className="text-[9px] font-bold text-destructive leading-none flex items-center justify-between gap-1 mt-0.5 min-w-0">
                <span className="truncate">{formatCurrency(l.diff)}</span>
                <span className="text-[7px] opacity-60 shrink-0">({l.percentage.toFixed(1)}%)</span>
            </span>
          </button>
        )) : <span className="text-[9px] italic text-secondary">No losses</span>}
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col gap-8 pb-10">
      <PageHeader title="SPENDS DASHBOARD" description="Strategic analytical insights and spending trends.">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white/40 dark:bg-white/5 rounded-none p-1 backdrop-blur-md shadow-inner border border-white/20">
            <span className="text-[10px] font-black uppercase tracking-widest pl-3 opacity-50">Year:</span>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="h-8 w-24 rounded-none glass text-[10px] font-black uppercase tracking-widest focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none glass ">
                {availableYears.map(y => (
                  <SelectItem key={y} value={y} className="text-[10px] font-bold">{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-w-0">
        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2 min-w-0">
            <CardDescription className="text-[10px] font-black uppercase text-primary">
              {stats?.yearly.ytdThroughLabel
                ? `ANNUAL SPENDS YTD (${selectedYear} · JAN–${stats.yearly.ytdThroughLabel})`
                : `ANNUAL SPENDS YTD (${selectedYear})`}
            </CardDescription>
            <CardTitle className="text-2xl md:text-3xl xl:text-4xl font-black font-headline break-all leading-[1.05] py-0.5">
              {formatCurrency(stats?.yearly.total || 0)}
            </CardTitle>
            {renderVarianceRow(
              stats?.yearly.growth || 0,
              stats?.yearly.varianceAmount,
              (stats?.yearly.prevTotal || 0) > 0 ? 'YTD YOY' : 'YTD TOTAL'
            )}
          </CardHeader>
          <CardContent className="min-w-0">{stats && renderGainerLoserList(stats.yearly.gainers, stats.yearly.losers)}</CardContent>
        </Card>
        
        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2 min-w-0">
            <CardDescription className="text-[10px] font-black uppercase text-primary">{stats?.monthly.monthName} Performance</CardDescription>
            <CardTitle className="text-2xl md:text-3xl xl:text-4xl font-black font-headline break-all leading-[1.05] py-0.5">
              {formatCurrency(stats?.monthly.total || 0)}
            </CardTitle>
            {renderVarianceRow(stats?.monthly.growth || 0, stats?.monthly.varianceAmount, 'MOM')}
          </CardHeader>
          <CardContent className="min-w-0">{stats && renderGainerLoserList(stats.monthly.gainers, stats.monthly.losers)}</CardContent>
        </Card>

        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2 min-w-0">
            <CardDescription className="text-[10px] font-black uppercase text-primary truncate" title={`Weekly Pulse (${stats?.weekly.weekDate})`}>Weekly Pulse ({stats?.weekly.weekDate})</CardDescription>
            <CardTitle className="text-2xl md:text-3xl xl:text-4xl font-black font-headline break-all leading-[1.05] py-0.5">
              {formatCurrency(stats?.weekly.total || 0)}
            </CardTitle>
            {renderVarianceRow(stats?.weekly.growth || 0, stats?.weekly.varianceAmount, 'WOW')}
          </CardHeader>
          <CardContent className="min-w-0">{stats && renderGainerLoserList(stats.weekly.gainers, stats.weekly.losers)}</CardContent>
        </Card>
      </div>

      <div id="spend-movers">
        <SpendMoversPanel
          key={`${compareGrain}-${periodA}-${periodB}`}
          grain={compareGrain}
          onGrainChange={handleGrainChange}
          periodA={periodA}
          periodB={periodB}
          onPeriodAChange={setPeriodA}
          onPeriodBChange={setPeriodB}
          periodOptions={periodOptions}
          baselineLabel={baselineLabel}
          compareLabel={compareLabel}
          baselineTotal={baselineTotal}
          compareTotal={compareTotal}
          movers={compareMovers}
          clientRows={compareClientRows}
          excludeLargeClients={excludeLargeClients}
          onExcludeChange={setExcludeLargeClients}
          selectedBrand={null}
          onSelectBrand={focusClient}
          formatCurrency={formatCurrency}
          onShortcut={handleCompareShortcut}
          progression={compareProgression}
          clientOptions={filterOptions.clients}
          typeOptions={filterOptions.types}
          channelOptions={filterOptions.channels}
          teamOptions={filterOptions.teams}
          compareClients={compareClients}
          compareTypes={compareTypes}
          compareChannels={compareChannels}
          compareTeams={compareTeams}
          onToggleCompareClient={toggleCompareValue(setCompareClients)}
          onToggleCompareType={toggleCompareValue(setCompareTypes)}
          onToggleCompareChannel={toggleCompareValue(setCompareChannels)}
          onToggleCompareTeam={toggleCompareValue(setCompareTeams)}
          onClearCompareFilters={() => {
            setCompareClients([]);
            setCompareTypes([]);
            setCompareChannels([]);
            setCompareTeams([]);
          }}
        />
      </div>

    </div>
  );
}

function ChartCard({ 
  title, 
  description, 
  dimension, 
  setDimension, 
  onExport, 
  children, 
  extra,
  height = "350px" 
}: { 
  title: string; 
  description: string; 
  dimension: Dimension; 
  setDimension: (d: Dimension) => void; 
  onExport: () => void; 
  children: React.ReactNode; 
  extra?: React.ReactNode;
  height?: string 
}) {
  return (
    <Card className="glass-card ">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-xl font-bold font-headline">{title}</CardTitle>
          <CardDescription className="text-xs uppercase font-black tracking-widest opacity-50">{description}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {extra}
          <Select value={dimension} onValueChange={(v) => setDimension(v as Dimension)}>
            <SelectTrigger className="h-8 w-24 rounded-none glass text-[10px] font-black uppercase">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none glass ">
              {DIMENSIONS.map(d => (
                <SelectItem key={d.value} value={d.value} className="text-[10px] font-bold uppercase">
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-primary" onClick={onExport}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent style={{ height }} className="pt-4">{children}</CardContent>
    </Card>
  );
}
