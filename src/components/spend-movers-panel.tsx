'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronsUpDown, Search } from 'lucide-react';
import { BrandPeriodMover } from '@/lib/spend-week';
import {
  COMPARE_GRAINS,
  type ClientCompareRow,
  type CompareProgressPoint,
  type SpendCompareGrain,
  type SpendPeriodOption,
} from '@/lib/spend-compare';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';

type SortKey = 'change' | 'pct';
type SortDir = 'asc' | 'desc';

function periodDeltaClass(current: number, previous: number | undefined, isFirst: boolean) {
  if (isFirst || previous == null) return 'text-ink';
  if (current === previous) return 'text-secondary';
  return current > previous ? 'text-success' : 'text-destructive';
}

export function SpendMoversPanel({
  grain,
  onGrainChange,
  periodA,
  periodB,
  onPeriodAChange,
  onPeriodBChange,
  periodOptions,
  baselineLabel,
  compareLabel,
  baselineTotal,
  compareTotal,
  movers,
  clientRows,
  excludeLargeClients,
  onExcludeChange,
  selectedBrand,
  onSelectBrand,
  formatCurrency,
  onShortcut,
  progression,
}: {
  grain: SpendCompareGrain;
  onGrainChange: (grain: SpendCompareGrain) => void;
  periodA: string;
  periodB: string;
  onPeriodAChange: (id: string) => void;
  onPeriodBChange: (id: string) => void;
  periodOptions: SpendPeriodOption[];
  baselineLabel: string;
  compareLabel: string;
  baselineTotal: number;
  compareTotal: number;
  movers: BrandPeriodMover[];
  clientRows?: ClientCompareRow[];
  excludeLargeClients: boolean;
  onExcludeChange: (next: boolean) => void;
  selectedBrand?: string | null;
  onSelectBrand: (brand: string) => void;
  formatCurrency: (val: number) => string;
  onShortcut: (kind: 'prior' | 'lastYear' | 'twoYears') => void;
  progression: CompareProgressPoint[];
}) {
  const [query, setQuery] = useState('');
  const [side, setSide] = useState<'all' | 'up' | 'down'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('change');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows: ClientCompareRow[] = useMemo(() => {
    if (clientRows && clientRows.length > 0) return clientRows;
    return movers.map((row) => ({
      ...row,
      series: { [periodA]: row.previous, [periodB]: row.current },
    }));
  }, [clientRows, movers, periodA, periodB]);

  const periodCols = progression.length > 0 ? progression : [
    { id: periodA, label: baselineLabel || 'Baseline', spend: 0, isEndpoint: true },
    { id: periodB, label: compareLabel || 'Compare', spend: 0, isEndpoint: true },
  ].filter((p) => p.id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const next = rows.filter((row) => {
      if (side === 'up' && row.diff <= 0) return false;
      if (side === 'down' && row.diff >= 0) return false;
      if (!q) return true;
      return (
        row.brand.toLowerCase().includes(q) ||
        row.type.toLowerCase().includes(q) ||
        row.team.toLowerCase().includes(q)
      );
    });
    const mul = sortDir === 'desc' ? -1 : 1;
    next.sort((a, b) => {
      const primary = sortKey === 'pct' ? a.percentage - b.percentage : a.diff - b.diff;
      if (primary !== 0) return mul * primary;
      return Math.abs(b.diff) - Math.abs(a.diff);
    });
    return next;
  }, [rows, query, side, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortKey(key);
    setSortDir('desc');
  };

  const SortBtn = ({ column, label }: { column: SortKey; label: string }) => {
    const active = sortKey === column;
    return (
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className="inline-flex items-center justify-end gap-1 w-full uppercase tracking-widest"
        aria-label={`Sort by ${label}`}
      >
        {label}
        {active ? (
          sortDir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    );
  };
  const net = compareTotal - baselineTotal;
  const pct = baselineTotal > 0 ? (net / baselineTotal) * 100 : compareTotal > 0 ? 100 : 0;

  const swap = () => {
    onPeriodAChange(periodB);
    onPeriodBChange(periodA);
  };

  return (
    <Card className="glass-card" data-testid="spend-movers-panel">
      <CardHeader className="gap-4 space-y-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-bold font-headline">Compare any two periods</CardTitle>
            <CardDescription className="text-xs uppercase font-black tracking-widest opacity-50 mt-1">
              Month, quarter, year, or week. Table lists every client with in-between periods. Click a row to filter the rest of the dashboard.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 border border-ink/10 bg-cream/60 px-3 py-2">
            <Switch
              id="exclude-spends-large-clients"
              checked={excludeLargeClients}
              onCheckedChange={onExcludeChange}
              className="rounded-none data-[state=checked]:bg-brand data-[state=unchecked]:bg-ink/20"
            />
            <Label
              htmlFor="exclude-spends-large-clients"
              className="cursor-pointer text-[9px] font-black uppercase tracking-widest text-secondary leading-tight"
            >
              Exclude Myntra &amp; OLA
            </Label>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2" data-testid="spend-compare-controls">
          <div className="space-y-1">
            <div className="text-[9px] font-black uppercase tracking-widest text-secondary">Grain</div>
            <Select value={grain} onValueChange={(v) => onGrainChange(v as SpendCompareGrain)}>
              <SelectTrigger className="h-9 w-[120px] rounded-none text-[10px] font-black uppercase tracking-widest">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                {COMPARE_GRAINS.map((g) => (
                  <SelectItem key={g.value} value={g.value} className="text-[10px] font-bold uppercase">
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 min-w-[140px]">
            <div className="text-[9px] font-black uppercase tracking-widest text-secondary">Baseline</div>
            <Select value={periodA} onValueChange={onPeriodAChange}>
              <SelectTrigger className="h-9 rounded-none text-[10px] font-black uppercase tracking-widest">
                <SelectValue placeholder="From" />
              </SelectTrigger>
              <SelectContent className="rounded-none max-h-72">
                {periodOptions.map((o) => (
                  <SelectItem key={`a-${o.id}`} value={o.id} className="text-[10px] font-bold uppercase">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-none"
            onClick={swap}
            title="Swap periods"
            aria-label="Swap periods"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          <div className="space-y-1 min-w-[140px]">
            <div className="text-[9px] font-black uppercase tracking-widest text-secondary">Compare</div>
            <Select value={periodB} onValueChange={onPeriodBChange}>
              <SelectTrigger className="h-9 rounded-none text-[10px] font-black uppercase tracking-widest">
                <SelectValue placeholder="To" />
              </SelectTrigger>
              <SelectContent className="rounded-none max-h-72">
                {periodOptions.map((o) => (
                  <SelectItem key={`b-${o.id}`} value={o.id} className="text-[10px] font-bold uppercase">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex h-9 border border-ink/15">
            <button
              type="button"
              onClick={() => onShortcut('prior')}
              className="px-3 text-[9px] font-black uppercase tracking-widest text-secondary hover:text-ink"
            >
              Prior
            </button>
            <button
              type="button"
              onClick={() => onShortcut('lastYear')}
              className="px-3 text-[9px] font-black uppercase tracking-widest text-secondary hover:text-ink border-l border-ink/15"
            >
              Last year
            </button>
            <button
              type="button"
              onClick={() => onShortcut('twoYears')}
              className="px-3 text-[9px] font-black uppercase tracking-widest text-secondary hover:text-ink border-l border-ink/15"
              data-testid="spend-compare-two-years"
            >
              2 years ago
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border border-ink/10 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-secondary">{baselineLabel || 'Baseline'}</div>
            <div className="font-headline text-xl font-black">{formatCurrency(baselineTotal)}</div>
          </div>
          <div className="border border-ink/10 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-secondary">{compareLabel || 'Compare'}</div>
            <div className="font-headline text-xl font-black">{formatCurrency(compareTotal)}</div>
          </div>
          <div className="border border-ink/10 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-secondary">Change</div>
            <div className={cn('font-headline text-xl font-black', net >= 0 ? 'text-success' : 'text-destructive')}>
              {net >= 0 ? '+' : ''}
              {formatCurrency(net)}
              <span className="ml-2 text-sm font-mono">
                {pct > 0 ? '+' : ''}
                {pct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {progression.length > 1 && (
          <div className="border border-ink/10 p-3" data-testid="spend-compare-progression">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[9px] font-black uppercase tracking-widest text-secondary">
                {grain === 'week'
                  ? 'Weekly spends'
                  : grain === 'quarter'
                    ? 'Quarterly spends'
                    : grain === 'year'
                      ? 'Yearly spends'
                      : 'Monthly spends'}{' '}
                · {progression[0]?.label} → {progression[progression.length - 1]?.label}
              </div>
              <div className="text-[9px] font-black uppercase tracking-widest text-secondary">
                {progression.length}{' '}
                {grain === 'week' ? 'weeks' : grain === 'quarter' ? 'quarters' : grain === 'year' ? 'years' : 'months'}
              </div>
            </div>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progression} margin={{ top: 18, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--foreground))" opacity={0.08} />
                  <XAxis
                    dataKey="label"
                    fontSize={9}
                    fontWeight={700}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis
                    fontSize={9}
                    fontWeight={700}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={(v: number) => {
                      const abs = Math.abs(v);
                      if (abs >= 10000000) return `${(v / 10000000).toFixed(0)}Cr`;
                      if (abs >= 100000) return `${(v / 100000).toFixed(0)}L`;
                      return String(v);
                    }}
                  />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: 0, border: '1px solid #000' }}
                    formatter={(val: number) => [formatCurrency(val), 'Spend']}
                    labelFormatter={(label) => String(label)}
                  />
                  <Line
                    type="monotone"
                    dataKey="spend"
                    stroke="hsl(var(--brand))"
                    strokeWidth={3}
                    dot={(props: { cx?: number; cy?: number; payload?: CompareProgressPoint; index?: number }) => {
                      const { cx, cy, payload, index } = props;
                      if (cx == null || cy == null) return <g key={index} />;
                      const endpoint = payload?.isEndpoint;
                      return (
                        <circle
                          key={payload?.id || index}
                          cx={cx}
                          cy={cy}
                          r={endpoint ? 5 : 3}
                          fill={endpoint ? 'hsl(var(--brand))' : 'white'}
                          stroke="hsl(var(--brand))"
                          strokeWidth={2}
                        />
                      );
                    }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 border border-ink/15">
            {([
              ['all', 'All'],
              ['up', 'Gainers'],
              ['down', 'Losers'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSide(id)}
                className={cn(
                  'px-3 text-[10px] font-black uppercase tracking-widest',
                  side === id ? 'bg-ink text-cream' : 'text-secondary hover:text-ink'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search client, type, team…"
              className="pl-8 h-9 rounded-none text-xs"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-black uppercase tracking-widest text-secondary">
          <span>
            {filtered.length} client{filtered.length === 1 ? '' : 's'}
            {excludeLargeClients ? ' · excluding Myntra & OLA' : ''}
            {periodCols.length > 2 ? ` · ${periodCols.length} periods` : ''}
            {selectedBrand ? ` · dashboard filtered to ${selectedBrand}` : ''}
          </span>
          <span className="normal-case tracking-normal font-bold opacity-70">
            Sorted by {sortKey === 'pct' ? 'change %' : 'change amount'} ({sortDir === 'desc' ? 'high → low' : 'low → high'})
          </span>
        </div>
        <div className="max-h-[70vh] overflow-auto border border-ink/10">
          <table className="w-full text-left" style={{ minWidth: Math.max(720, 280 + periodCols.length * 88) }}>
            <thead className="sticky top-0 z-20 bg-cream text-[9px] font-black uppercase tracking-widest text-secondary">
              <tr>
                <th className="px-3 py-2 w-10 sticky left-0 z-30 bg-cream">#</th>
                <th className="px-3 py-2 sticky left-10 z-30 bg-cream min-w-[140px]">Client</th>
                <th className="px-3 py-2">Type</th>
                {periodCols.map((col) => (
                  <th
                    key={col.id}
                    className={cn(
                      'px-2 py-2 text-right whitespace-nowrap',
                      col.isEndpoint && 'text-ink'
                    )}
                    title={col.label}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right sticky right-[88px] z-30 bg-cream min-w-[112px]">
                  <SortBtn column="change" label="Change" />
                </th>
                <th className="px-3 py-2 text-right sticky right-0 z-30 bg-cream min-w-[88px]">
                  <SortBtn column="pct" label="%" />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5 + periodCols.length} className="px-3 py-8 text-center text-xs italic text-secondary">
                    No clients match this comparison.
                  </td>
                </tr>
              ) : (
                filtered.map((row, i) => {
                  const up = row.diff > 0;
                  const active = selectedBrand === row.brand;
                  const rowBg = active ? 'bg-brand/10' : 'bg-card';
                  return (
                    <tr
                      key={row.brand}
                      onClick={() => onSelectBrand(row.brand)}
                      className={cn(
                        'cursor-pointer border-t border-ink/5 text-xs hover:bg-cream/70',
                        active && 'bg-brand/5'
                      )}
                    >
                      <td className={cn('px-3 py-2 font-mono text-[10px] text-secondary sticky left-0 z-10', rowBg)}>
                        {i + 1}
                      </td>
                      <td className={cn('px-3 py-2 sticky left-10 z-10', rowBg)}>
                        <div className="font-black truncate max-w-[180px]" title={row.brand}>
                          {row.brand}
                        </div>
                        <div className="text-[9px] uppercase tracking-widest text-secondary">{row.team}</div>
                      </td>
                      <td className="px-3 py-2 text-[10px] font-bold uppercase text-secondary">{row.type}</td>
                      {periodCols.map((col, colIdx) => {
                        const value = row.series?.[col.id] || 0;
                        const prevId = periodCols[colIdx - 1]?.id;
                        const prevVal = prevId ? row.series?.[prevId] || 0 : undefined;
                        return (
                          <td
                            key={col.id}
                            className={cn(
                              'px-2 py-2 text-right font-mono text-[11px] whitespace-nowrap',
                              col.isEndpoint && 'font-bold',
                              value === 0 ? 'text-secondary/50' : periodDeltaClass(value, prevVal, colIdx === 0)
                            )}
                          >
                            {value === 0 ? '—' : formatCurrency(value)}
                          </td>
                        );
                      })}
                      <td
                        className={cn(
                          'px-3 py-2 text-right font-mono text-[11px] font-bold sticky right-[88px] z-10 whitespace-nowrap',
                          rowBg,
                          up ? 'text-success' : 'text-destructive'
                        )}
                      >
                        <span className="inline-flex items-center justify-end gap-1">
                          {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                          {up ? '+' : ''}
                          {formatCurrency(row.diff)}
                        </span>
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right font-mono text-[11px] sticky right-0 z-10 whitespace-nowrap',
                          rowBg,
                          up ? 'text-success' : 'text-destructive'
                        )}
                      >
                        {row.percentage > 0 ? '+' : ''}
                        {row.percentage.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
