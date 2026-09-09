'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, Search } from 'lucide-react';
import { BrandPeriodMover } from '@/lib/spend-week';
import {
  COMPARE_GRAINS,
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
import { cn } from '@/lib/utils';

const PAGE_SIZE = 12;

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
  excludeLargeClients,
  onExcludeChange,
  selectedBrand,
  onSelectBrand,
  formatCurrency,
  onShortcut,
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
  excludeLargeClients: boolean;
  onExcludeChange: (next: boolean) => void;
  selectedBrand?: string | null;
  onSelectBrand: (brand: string) => void;
  formatCurrency: (val: number) => string;
  onShortcut: (kind: 'prior' | 'lastYear' | 'twoYears') => void;
}) {
  const [query, setQuery] = useState('');
  const [side, setSide] = useState<'all' | 'up' | 'down'>('all');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return movers.filter((row) => {
      if (side === 'up' && row.diff <= 0) return false;
      if (side === 'down' && row.diff >= 0) return false;
      if (!q) return true;
      return (
        row.brand.toLowerCase().includes(q) ||
        row.type.toLowerCase().includes(q) ||
        row.team.toLowerCase().includes(q)
      );
    });
  }, [movers, query, side]);

  const shown = filtered.slice(0, visible);
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
              Month, quarter, YTD, year, or week — including Jul 2024 vs Jul 2026. Click a client to filter.
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
                onClick={() => {
                  setSide(id);
                  setVisible(PAGE_SIZE);
                }}
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
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(PAGE_SIZE);
              }}
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
          </span>
        </div>
        <div className="overflow-x-auto border border-ink/10">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-cream/80 text-[9px] font-black uppercase tracking-widest text-secondary">
              <tr>
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">{baselineLabel || 'Baseline'}</th>
                <th className="px-3 py-2 text-right">{compareLabel || 'Compare'}</th>
                <th className="px-3 py-2 text-right">Change</th>
                <th className="px-3 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs italic text-secondary">
                    No clients match this comparison.
                  </td>
                </tr>
              ) : (
                shown.map((row, i) => {
                  const up = row.diff > 0;
                  const active = selectedBrand === row.brand;
                  return (
                    <tr
                      key={row.brand}
                      onClick={() => onSelectBrand(row.brand)}
                      className={cn(
                        'cursor-pointer border-t border-ink/5 text-xs hover:bg-cream/70',
                        active && 'bg-brand/5'
                      )}
                    >
                      <td className="px-3 py-2 font-mono text-[10px] text-secondary">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="font-black truncate max-w-[220px]" title={row.brand}>
                          {row.brand}
                        </div>
                        <div className="text-[9px] uppercase tracking-widest text-secondary">{row.team}</div>
                      </td>
                      <td className="px-3 py-2 text-[10px] font-bold uppercase text-secondary">{row.type}</td>
                      <td className="px-3 py-2 text-right font-mono text-[11px]">{formatCurrency(row.previous)}</td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] font-bold">{formatCurrency(row.current)}</td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right font-mono text-[11px] font-bold',
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
                          'px-3 py-2 text-right font-mono text-[11px]',
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
        {filtered.length > visible && (
          <div className="mt-3 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-none text-[10px] font-black uppercase tracking-widest"
              onClick={() => setVisible((n) => n + PAGE_SIZE)}
            >
              Show more ({filtered.length - visible} remaining)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
