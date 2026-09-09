'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { BrandPeriodMover } from '@/lib/spend-week';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 12;

export function SpendMoversPanel({
  wowMovers,
  momMovers,
  wowLabel,
  momLabel,
  excludeLargeClients,
  onExcludeChange,
  selectedBrand,
  onSelectBrand,
  formatCurrency,
}: {
  wowMovers: BrandPeriodMover[];
  momMovers: BrandPeriodMover[];
  wowLabel: string;
  momLabel: string;
  excludeLargeClients: boolean;
  onExcludeChange: (next: boolean) => void;
  selectedBrand?: string | null;
  onSelectBrand: (brand: string) => void;
  formatCurrency: (val: number) => string;
}) {
  const [tab, setTab] = useState<'wow' | 'mom'>('wow');
  const [query, setQuery] = useState('');
  const [side, setSide] = useState<'all' | 'up' | 'down'>('all');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const rows = tab === 'wow' ? wowMovers : momMovers;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (side === 'up' && row.diff <= 0) return false;
      if (side === 'down' && row.diff >= 0) return false;
      if (!q) return true;
      return (
        row.brand.toLowerCase().includes(q) ||
        row.type.toLowerCase().includes(q) ||
        row.team.toLowerCase().includes(q)
      );
    });
  }, [rows, query, side]);

  const shown = filtered.slice(0, visible);
  const net = rows.reduce((sum, r) => sum + r.diff, 0);

  return (
    <Card className="glass-card" data-testid="spend-movers-panel">
      <CardHeader className="gap-4 space-y-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-bold font-headline">Who moved the needle</CardTitle>
            <CardDescription className="text-xs uppercase font-black tracking-widest opacity-50 mt-1">
              Clients ranked by rupee change vs the prior period. Click a row to filter the dashboard.
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

        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as 'wow' | 'mom');
              setVisible(PAGE_SIZE);
            }}
          >
            <TabsList className="h-9">
              <TabsTrigger value="wow" className="text-[10px] font-black uppercase tracking-widest">
                WoW {wowLabel ? `· ${wowLabel}` : ''}
              </TabsTrigger>
              <TabsTrigger value="mom" className="text-[10px] font-black uppercase tracking-widest">
                MoM {momLabel ? `· ${momLabel}` : ''}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="wow" className="hidden" />
            <TabsContent value="mom" className="hidden" />
          </Tabs>

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
          <span className={cn(net >= 0 ? 'text-success' : 'text-destructive')}>
            Net {net >= 0 ? '+' : ''}
            {formatCurrency(net)}
          </span>
        </div>
        <div className="overflow-x-auto border border-ink/10">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-cream/80 text-[9px] font-black uppercase tracking-widest text-secondary">
              <tr>
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Previous</th>
                <th className="px-3 py-2 text-right">Current</th>
                <th className="px-3 py-2 text-right">Change</th>
                <th className="px-3 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs italic text-secondary">
                    No clients match this view.
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
