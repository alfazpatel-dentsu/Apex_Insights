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
import { Download, Loader2, Info, TrendingUp, Users, AlertTriangle, LineChart, Percent } from 'lucide-react';

import { useCollection } from '@/firebase';
import { MonthlySpend } from '@/lib/types';
import {
  buildSpendForecast,
  formatMonthLabel,
  FORECAST_MODEL_OPTIONS,
  type ForecastModelId,
  type SpendForecastResult,
  modelDescription,
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

const formatPct = (val: number) => `${val.toFixed(1)}%`;

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
  const [forecastModel, setForecastModel] = useState<ForecastModelId>('holt-winters');

  useEffect(() => {
    setMounted(true);
  }, []);

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
    return buildSpendForecast(rawMonthlyData, { filter, model: forecastModel });
  }, [rawMonthlyData, mounted, dimension, dimensionValue, forecastModel]);

  const chartData = useMemo(() => {
    if (!result) return [];
    const hist = result.history.slice(-18);
    return [
      ...hist.map((h) => ({
        label: h.label,
        month: h.month,
        actual: h.actual,
        potential: h.potential,
        grossForecast: null as number | null,
        netForecast: null as number | null,
        churnImpact: h.churnImpact > 0 ? h.churnImpact : null,
      })),
      ...result.forecast.map((f) => ({
        label: f.label,
        month: f.month,
        actual: null as number | null,
        potential: f.potential,
        grossForecast: f.grossForecast,
        netForecast: f.netForecast,
        churnImpact: f.churnImpact > 0 ? f.churnImpact : null,
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

  const exportMom = () => {
    if (!result) return;
    downloadCsv(
      `spends-mom-churn-${result.latestDataMonth || 'export'}.csv`,
      result.momComparison.map((r) => ({
        Month: r.month,
        Label: r.label,
        Kind: r.kind === 'actual' ? 'Actual' : 'Forecast',
        'Actual / Net Forecast (INR)': Math.round(r.spend),
        'Gross Forecast (INR)': r.grossForecast != null ? Math.round(r.grossForecast) : '',
        'Churn Impact (INR)': Math.round(r.churnImpact),
        'Could Have Been (INR)': Math.round(r.potential),
        'Missing %': Number(r.missingPct.toFixed(2)),
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
        'Exit Month': c.exitMonth,
        'Impact Start': c.impactStartMonth,
        'Impact End': c.impactEndMonth,
        'Monthly Churn Loss (INR)': Math.round(c.monthlyChurnLoss),
        'Window Total (INR)': Math.round(c.monthlyChurnLoss * 12),
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
        description="12-month MoM forecast with switchable models. Historical actuals stay as uploaded. Churn applies only while a client stays inactive (2+ months with no spend); resumed spend = pause. Impact runs for 12 months after exit while still churned."
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-white/40 dark:bg-white/5 rounded-none p-1 border border-white/20">
            <span className="text-[10px] font-black uppercase tracking-widest pl-2 opacity-50">Model</span>
            <Select
              value={forecastModel}
              onValueChange={(v) => setForecastModel(v as ForecastModelId)}
            >
              <SelectTrigger className="h-8 w-[200px] rounded-none text-[10px] font-black uppercase tracking-widest focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none max-h-80">
                {FORECAST_MODEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id} className="text-[10px] font-bold">
                    {opt.shortLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            onClick={exportMom}
            disabled={!result?.momComparison.length}
          >
            <Download className="h-3 w-3 mr-1" /> MoM CSV
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

      <div className="flex flex-wrap gap-1.5">
        {FORECAST_MODEL_OPTIONS.map((opt) => {
          const active = forecastModel === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setForecastModel(opt.id)}
              className={cn(
                'h-8 px-3 text-[10px] font-black uppercase tracking-widest border transition-colors',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-white/40 dark:bg-white/5 border-foreground/15 text-foreground hover:border-primary/50'
              )}
              title={opt.description}
            >
              {opt.shortLabel}
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-2 rounded-none border border-foreground/15 bg-white/50 dark:bg-white/5 px-3 py-2 text-xs text-secondary">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <p>
          <span className="font-semibold text-foreground">Model:</span>{' '}
          {result?.modelLabel || '—'}
          {' — '}
          {modelDescription(forecastModel)}
          {result?.modelNote ? ` (${result.modelNote})` : ''}
          {result?.latestDataMonth
            ? ` · Actuals through ${formatMonthLabel(result.latestDataMonth)} (unchanged)`
            : ' · No monthly spends found'}
          . Churn = still inactive after ≥2 consecutive zero months (resumed spend = pause, not churn).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 min-w-0">
        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase text-primary flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Gross 12-mo Forecast
            </CardDescription>
            <CardTitle className="text-2xl md:text-3xl font-black font-headline break-all leading-[1.05]">
              {formatCurrency(result?.grossYearTotal || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-secondary">Model book trajectory</CardContent>
        </Card>

        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Horizon Churn Impact
            </CardDescription>
            <CardTitle className="text-2xl md:text-3xl font-black font-headline break-all leading-[1.05] text-destructive">
              {formatCurrency(result?.forecastChurnImpactTotal || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-secondary">
            Sum of time-boxed impact on forecast months only
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
            Gross − remaining in-window churn
          </CardContent>
        </Card>

        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase text-primary flex items-center gap-1.5">
              <Percent className="h-3.5 w-3.5" /> Missing vs Potential
            </CardDescription>
            <CardTitle className="text-2xl md:text-3xl font-black font-headline break-all leading-[1.05]">
              {formatPct(result?.forecastMissingPct || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-secondary">
            Of {formatCurrency(result?.forecastPotentialTotal || 0)} could-have-been
          </CardContent>
        </Card>

        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase text-primary flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Active Churn Windows
            </CardDescription>
            <CardTitle className="text-2xl md:text-3xl font-black font-headline break-all leading-[1.05]">
              {result?.activeImpactClients.length || 0}
              <span className="text-base font-bold text-secondary ml-1">
                / {result?.churnedClients.length || 0}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-secondary">
            Still impacting forecast · {formatCurrency(result?.activeChurnMonthlyCapacity || 0)}/mo capacity
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-black uppercase tracking-widest">
            MoM Actual / Forecast vs Potential
          </CardTitle>
          <CardDescription className="text-xs">
            Bars = actual · Amber dashed = gross forecast · Green = net after in-window churn · Violet = could’ve been if churned clients stayed
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[380px] min-w-0 pt-2">
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
                  dataKey="potential"
                  name="Could've been"
                  stroke="hsl(280 40% 45%)"
                  strokeWidth={2}
                  strokeDasharray="2 3"
                  dot={false}
                  connectNulls
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

      <Card className="glass-card min-w-0 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-black uppercase tracking-widest">
            MoM Spends · Churn Opportunity
          </CardTitle>
          <CardDescription className="text-xs">
            Actual months keep uploaded numbers. Forecast months apply churn only while each client’s impact window is open. Could’ve been = spend + in-window churn impact. Missing % = impact ÷ potential.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] font-black uppercase sticky top-0 bg-background">Month</TableHead>
                <TableHead className="text-[10px] font-black uppercase sticky top-0 bg-background">Kind</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-right sticky top-0 bg-background">
                  Actual / Forecast
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase text-right sticky top-0 bg-background">
                  Churn Impact
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase text-right sticky top-0 bg-background">
                  Could&apos;ve Been
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase text-right sticky top-0 bg-background">
                  Missing %
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase text-right sticky top-0 bg-background">
                  Net after Churn
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(result?.momComparison || []).map((r) => (
                <TableRow
                  key={`${r.kind}-${r.month}`}
                  className={cn(r.kind === 'forecast' && 'bg-primary/[0.03]')}
                >
                  <TableCell className="font-mono text-xs font-bold">{r.label}</TableCell>
                  <TableCell className="text-[10px] font-black uppercase tracking-wider text-secondary">
                    {r.kind === 'actual' ? 'Actual' : 'Forecast'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {r.kind === 'actual'
                      ? formatCurrency(r.spend)
                      : formatCurrency(r.grossForecast ?? r.spend)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-mono text-xs',
                      r.churnImpact > 0 ? 'text-destructive font-bold' : 'text-secondary'
                    )}
                  >
                    {r.churnImpact > 0 ? formatCurrency(r.churnImpact) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatCurrency(r.potential)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-mono text-xs',
                      r.missingPct > 0 ? 'text-destructive font-bold' : 'text-secondary'
                    )}
                  >
                    {r.missingPct > 0 ? formatPct(r.missingPct) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold">
                    {r.kind === 'forecast' ? formatCurrency(r.spend) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {(result?.momComparison.length || 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                    No MoM rows
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
            Exit after 2 consecutive zero-spend months with no return · Resumed spend = pause (excluded) · Loss = up to 6-month average before inactivity · Impact = 12 months after exit while still churned
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] font-black uppercase">Client</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Exit</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Impact Window</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-right">Mo. Loss</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-center">On Horizon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(result?.churnedClients || []).map((c) => {
                const onHorizon = (result?.activeImpactClients || []).some(
                  (a) => a.clientId === c.clientId
                );
                return (
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
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {formatMonthLabel(c.impactStartMonth)} → {formatMonthLabel(c.impactEndMonth)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold text-destructive">
                      {formatCurrency(c.monthlyChurnLoss)}
                    </TableCell>
                    <TableCell className="text-center text-[10px] font-black uppercase">
                      {onHorizon ? (
                        <span className="text-destructive">Yes</span>
                      ) : (
                        <span className="text-secondary">Ended</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(result?.churnedClients.length || 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                      No clients currently match churn (still inactive after ≥2 zero months). Resumed / paused clients are excluded.
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
