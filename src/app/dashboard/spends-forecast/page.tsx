'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, Loader2, Info, TrendingUp, Users, AlertTriangle, LineChart } from 'lucide-react';

import { useCollection } from '@/firebase';
import { MonthlySpend } from '@/lib/types';
import {
  buildSpendForecast,
  formatMonthLabel,
  type SpendForecastResult,
} from '@/lib/spend-forecast';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type DimensionFilter = 'overall' | 'industry' | 'type' | 'team';

const formatCurrency = (val: number) => {
  const absVal = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (absVal >= 10000000) return `₹${sign}${(absVal / 10000000).toFixed(2)}Cr`;
  if (absVal >= 100000) return `₹${sign}${(absVal / 100000).toFixed(2)}L`;
  return `₹${sign}${absVal.toLocaleString('en-IN')}`;
};

const formatChartAxis = (val: number) => {
  if (val == null || Number.isNaN(val)) return '';
  const absVal = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (absVal >= 10000000) return `${sign}${(absVal / 10000000).toFixed(1)}Cr`;
  if (absVal >= 100000) return `${sign}${(absVal / 100000).toFixed(1)}L`;
  if (absVal >= 1000) return `${sign}${(absVal / 1000).toFixed(0)}K`;
  return `${sign}${absVal.toFixed(0)}`;
};

function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SpendsForecastPage() {
  const [mounted, setMounted] = useState(false);
  const [dimension, setDimension] = useState<DimensionFilter>('overall');
  const [dimensionValue, setDimensionValue] = useState<string>('all');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Full monthly history (~31 months) for model + churn detection
  const { data: rawMonthlyData, loading } = useCollection<MonthlySpend>('monthlySpends');

  const filterOptions = useMemo(() => {
    if (!rawMonthlyData) return { industries: [], types: [], teams: [] };
    return {
      industries: Array.from(new Set(rawMonthlyData.map((d) => d.industry).filter(Boolean))).sort(),
      types: Array.from(new Set(rawMonthlyData.map((d) => d.type).filter(Boolean))).sort(),
      teams: Array.from(new Set(rawMonthlyData.map((d) => d.team).filter(Boolean))).sort(),
    };
  }, [rawMonthlyData]);

  useEffect(() => {
    setDimensionValue('all');
  }, [dimension]);

  const result: SpendForecastResult | null = useMemo(() => {
    if (!rawMonthlyData || !mounted) return null;
    const filter =
      dimension === 'overall' || dimensionValue === 'all'
        ? undefined
        : (row: MonthlySpend) => {
            if (dimension === 'industry') return row.industry === dimensionValue;
            if (dimension === 'type') return row.type === dimensionValue;
            if (dimension === 'team') return row.team === dimensionValue;
            return true;
          };
    return buildSpendForecast(rawMonthlyData, { filter });
  }, [rawMonthlyData, mounted, dimension, dimensionValue]);

  const chartData = useMemo(() => {
    if (!result) return [];
    // Show last 18 history months + 12 forecast for readability
    const hist = result.history.slice(-18);
    return [
      ...hist.map((h) => ({
        label: h.label,
        month: h.month,
        actual: h.actual,
        grossForecast: null as number | null,
        netForecast: null as number | null,
        churnDrag: null as number | null,
      })),
      ...result.forecast.map((f) => ({
        label: f.label,
        month: f.month,
        actual: null as number | null,
        grossForecast: f.grossForecast,
        netForecast: f.netForecast,
        churnDrag: f.churnDrag,
      })),
    ];
  }, [result]);

  const dimensionChoices =
    dimension === 'industry'
      ? filterOptions.industries
      : dimension === 'type'
        ? filterOptions.types
        : dimension === 'team'
          ? filterOptions.teams
          : [];

  const exportForecast = () => {
    if (!result) return;
    downloadCsv(
      `spends-forecast-${result.latestDataMonth || 'export'}.csv`,
      result.forecast.map((f) => ({
        Month: f.month,
        Label: f.label,
        'Gross Forecast (INR)': Math.round(f.grossForecast),
        'Churn Drag (INR)': Math.round(f.churnDrag),
        'Net Forecast (INR)': Math.round(f.netForecast),
        Model: result.modelLabel,
      }))
    );
  };

  const exportChurn = () => {
    if (!result) return;
    downloadCsv(
      `churned-clients-${result.latestDataMonth || 'export'}.csv`,
      result.churnedClients.map((c) => ({
        'Client ID': c.clientId,
        Brand: c.brandName,
        Industry: c.industry,
        Type: c.type,
        Team: c.team,
        'Last Active Month': c.lastActiveMonth || '',
        'Inactivity Start': c.inactivityStartMonth,
        'Exit Month': c.exitMonth,
        'Monthly Churn Loss (INR)': Math.round(c.monthlyChurnLoss),
        'Annual Impact (INR)': Math.round(c.monthlyChurnLoss * 12),
      }))
    );
  };

  if (!mounted || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading spends history for forecast…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 min-w-0 pb-10">
      <PageHeader
        title="Spends Forecast"
        description="12-month MoM spend forecast using Holt-Winters seasonal modeling, adjusted for client churn (2 consecutive months with no spends; drag = 6-month average before exit)."
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-white/40 dark:bg-white/5 rounded-none p-1 border border-white/20">
            <span className="text-[10px] font-black uppercase tracking-widest pl-2 opacity-50">Slice</span>
            <Select
              value={dimension}
              onValueChange={(v) => setDimension(v as DimensionFilter)}
            >
              <SelectTrigger className="h-8 w-32 rounded-none text-[10px] font-black uppercase tracking-widest focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="overall" className="text-[10px] font-bold">Overall</SelectItem>
                <SelectItem value="industry" className="text-[10px] font-bold">Industry</SelectItem>
                <SelectItem value="type" className="text-[10px] font-bold">Type</SelectItem>
                <SelectItem value="team" className="text-[10px] font-bold">Team</SelectItem>
              </SelectContent>
            </Select>
            {dimension !== 'overall' && (
              <Select value={dimensionValue} onValueChange={setDimensionValue}>
                <SelectTrigger className="h-8 w-40 rounded-none text-[10px] font-black uppercase tracking-widest focus:ring-0">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent className="rounded-none max-h-64">
                  <SelectItem value="all" className="text-[10px] font-bold">All</SelectItem>
                  {dimensionChoices.map((v) => (
                    <SelectItem key={v} value={v} className="text-[10px] font-bold">
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-none text-[10px] font-black uppercase tracking-widest"
            onClick={exportForecast}
            disabled={!result?.forecast.length}
          >
            <Download className="h-3 w-3 mr-1" /> Forecast CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-none text-[10px] font-black uppercase tracking-widest"
            onClick={exportChurn}
            disabled={!result?.churnedClients.length}
          >
            <Download className="h-3 w-3 mr-1" /> Churn CSV
          </Button>
        </div>
      </PageHeader>

      <div className="flex items-start gap-2 rounded-none border border-foreground/15 bg-white/50 dark:bg-white/5 px-3 py-2 text-xs text-secondary">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <p>
          <span className="font-semibold text-foreground">Model:</span>{' '}
          {result?.modelLabel || '—'}
          {result?.latestDataMonth
            ? ` · History through ${formatMonthLabel(result.latestDataMonth)} (${result.history.length} months)`
            : ' · No monthly spends found'}
          . Churned clients (inactive ≥2 months) reduce each forecast month by their 6-month pre-exit average.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 min-w-0">
        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase text-primary flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Gross 12-mo Forecast
            </CardDescription>
            <CardTitle className="text-2xl md:text-3xl font-black font-headline break-all leading-[1.05]">
              {formatCurrency(result?.grossYearTotal || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-secondary">
            Before churn adjustment
          </CardContent>
        </Card>

        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Monthly Churn Drag
            </CardDescription>
            <CardTitle className="text-2xl md:text-3xl font-black font-headline break-all leading-[1.05] text-destructive">
              {formatCurrency(result?.monthlyChurnDrag || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-secondary">
            {formatCurrency(result?.churnYearImpact || 0)} potential loss over 12 months
          </CardContent>
        </Card>

        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase text-primary flex items-center gap-1.5">
              <LineChart className="h-3.5 w-3.5" /> Net 12-mo Forecast
            </CardDescription>
            <CardTitle className="text-2xl md:text-3xl font-black font-headline break-all leading-[1.05]">
              {formatCurrency(result?.netYearTotal || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-secondary">
            Gross − churn drag each month
          </CardContent>
        </Card>

        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase text-primary flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Churned Clients
            </CardDescription>
            <CardTitle className="text-2xl md:text-3xl font-black font-headline break-all leading-[1.05]">
              {result?.churnedClients.length || 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-secondary">
            No spends for 2 consecutive months
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-black uppercase tracking-widest">
            MoM Actual vs Forecast
          </CardTitle>
          <CardDescription className="text-xs">
            Bars = historical actuals · Dashed = gross forecast · Solid = net after churn
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[360px] min-w-0 pt-2">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No monthly spend data available to forecast.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--foreground) / 0.12)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fontWeight: 700 }}
                  interval="preserveStartEnd"
                />
                <YAxis tickFormatter={formatChartAxis} tick={{ fontSize: 10 }} width={56} />
                <Tooltip
                  contentStyle={{ borderRadius: 0, border: '1px solid #000', fontSize: 12 }}
                  formatter={(val: number, name: string) => [formatCurrency(val), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                <Bar
                  dataKey="actual"
                  name="Actual"
                  fill="hsl(223 100% 33%)"
                  maxBarSize={28}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="grossForecast"
                  name="Gross forecast"
                  stroke="hsl(38 100% 45%)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 3 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="netForecast"
                  name="Net after churn"
                  stroke="hsl(163 100% 32%)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-w-0">
        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest">
              12-Month Forecast Table
            </CardTitle>
            <CardDescription className="text-xs">
              Net = gross forecast − monthly churn drag ({formatCurrency(result?.monthlyChurnDrag || 0)}/mo)
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] font-black uppercase">Month</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-right">Gross</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-right">Churn</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(result?.forecast || []).map((f) => (
                  <TableRow key={f.month}>
                    <TableCell className="font-mono text-xs font-bold">{f.label}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatCurrency(f.grossForecast)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-destructive">
                      −{formatCurrency(f.churnDrag)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">
                      {formatCurrency(f.netForecast)}
                    </TableCell>
                  </TableRow>
                ))}
                {result?.forecast.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">
                      No forecast rows
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest">
              Churned Clients
            </CardTitle>
            <CardDescription className="text-xs">
              Exit confirmed after 2 consecutive zero-spend months · Loss = 6-month average before inactivity
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] font-black uppercase">Client</TableHead>
                  <TableHead className="text-[10px] font-black uppercase">Exit</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-right">Mo. Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(result?.churnedClients || []).map((c) => (
                  <TableRow key={c.clientId}>
                    <TableCell className="min-w-0">
                      <div className="font-bold text-xs truncate">{c.brandName}</div>
                      <div className="text-[10px] text-secondary font-mono truncate">
                        {c.clientId} · {c.industry} · {c.type}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {formatMonthLabel(c.exitMonth)}
                    </TableCell>
                    <TableCell
                      className={cn('text-right font-mono text-xs font-bold text-destructive')}
                    >
                      {formatCurrency(c.monthlyChurnLoss)}
                    </TableCell>
                  </TableRow>
                ))}
                {(result?.churnedClients.length || 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-8">
                      No clients currently match the 2-month inactivity churn rule.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
