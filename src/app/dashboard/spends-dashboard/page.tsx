
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Bar, 
  BarChart, 
  CartesianGrid, 
  Legend, 
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
  Filter,
  Search,
  Check,
  X
} from 'lucide-react';
import { format, parse, subMonths, subWeeks, isValid } from 'date-fns';
import { where } from 'firebase/firestore';

import { useCollection } from '@/firebase';
import { MonthlySpend, WeeklySpend } from '@/lib/types';
import { canonicalizeChannel } from '@/lib/normalize';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
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
    if (absVal >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`;
    if (absVal >= 100000) return `₹${(val / 100000).toFixed(2)}L`;
    return `₹${val.toLocaleString()}`;
};

function SearchableFilterContent({ 
  placeholder, 
  options, 
  selected, 
  onToggle 
}: { 
  placeholder: string, 
  options: string[], 
  selected: string[], 
  onToggle: (val: string) => void 
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => 
    options.filter(o => (o || '').toString().toLowerCase().includes(search.toLowerCase())), 
    [options, search]
  );
  
  return (
    <>
      <div className="p-2 border-b border-foreground/5 mb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input 
            placeholder={placeholder} 
            className="pl-8 h-9 rounded-none text-xs bg-foreground/5 border-none focus-visible:ring-1 focus-visible:ring-primary/30" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
        </div>
      </div>
      <div className="max-h-[300px] overflow-y-auto space-y-1 custom-scrollbar">
        {filtered.length > 0 ? filtered.map(option => (
          <div 
            key={option} 
            className="flex items-center gap-2 p-2 rounded-none hover:bg-foreground/5 cursor-pointer text-xs font-bold" 
            onClick={() => onToggle(option)}
          >
            <div className={cn(
              "h-4 w-4 border rounded-md flex items-center justify-center transition-colors", 
              selected.includes(option) ? "bg-primary border-primary text-white" : "border-foreground/20"
            )}>
              {selected.includes(option) && <Check className="h-3 w-3" />}
            </div>
            {option}
          </div>
        )) : <div className="p-4 text-center text-[10px] text-muted-foreground italic">No results found</div>}
      </div>
    </>
  );
}

export default function SpendsAnalyticsPage() {
  const [mounted, setMounted] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const { toast } = useToast();

  const [wowDimension, setWowDimension] = useState<Dimension>('overall');
  const [momDimension, setMomDimension] = useState<Dimension>('overall');
  const [qoqDimension, setQoqDimension] = useState<Dimension>('overall');

  // Multi-select Filter State
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  
  useEffect(() => {
    setMounted(true);
    const cy = new Date().getFullYear();
    const fixedBase = ["2024", "2025", "2026"];
    setAvailableYears(Array.from(new Set([...fixedBase, cy.toString()])).sort().reverse());
  }, []);

  const queryConstraints = useMemo(() => {
    const prevYear = (parseInt(selectedYear) - 1).toString();
    return [
      where('month', '>=', `${prevYear}-01`),
      where('month', '<=', `${selectedYear}-12`)
    ];
  }, [selectedYear]);

  const { data: rawMonthlyData, loading: monthlyLoading } = useCollection<MonthlySpend>('monthlySpends', queryConstraints);
  const { data: rawWeeklyData, loading: weeklyLoading } = useCollection<WeeklySpend>('weeklySpends', queryConstraints);

  useEffect(() => {
    if (rawMonthlyData && rawMonthlyData.length > 0) {
      const dataYears = rawMonthlyData.map(d => d.month.split('-')[0]);
      setAvailableYears(prev => Array.from(new Set([...prev, ...dataYears])).sort().reverse());
    }
  }, [rawMonthlyData]);

  // Filtered Datasets (channel names normalized so Meta/LinkedIn variants collapse)
  const monthlyData = useMemo(() => {
    if (!rawMonthlyData) return [];
    return rawMonthlyData
      .map(item => ({ ...item, channelVendor: canonicalizeChannel(item.channelVendor) }))
      .filter(item => {
        const channelMatch = selectedChannels.length === 0 || selectedChannels.includes(item.channelVendor);
        const clientMatch = selectedClients.length === 0 || selectedClients.includes(item.brandName);
        const teamMatch = selectedTeams.length === 0 || selectedTeams.includes(item.team);
        const typeMatch = selectedTypes.length === 0 || selectedTypes.includes(item.type);
        return channelMatch && clientMatch && teamMatch && typeMatch;
      });
  }, [rawMonthlyData, selectedChannels, selectedClients, selectedTeams, selectedTypes]);

  const weeklyData = useMemo(() => {
    if (!rawWeeklyData) return [];
    return rawWeeklyData
      .map(item => ({ ...item, channelVendor: canonicalizeChannel(item.channelVendor) }))
      .filter(item => {
        const channelMatch = selectedChannels.length === 0 || selectedChannels.includes(item.channelVendor);
        const clientMatch = selectedClients.length === 0 || selectedClients.includes(item.brandName);
        const teamMatch = selectedTeams.length === 0 || selectedTeams.includes(item.team);
        const typeMatch = selectedTypes.length === 0 || selectedTypes.includes(item.type);
        return channelMatch && clientMatch && teamMatch && typeMatch;
      });
  }, [rawWeeklyData, selectedChannels, selectedClients, selectedTeams, selectedTypes]);

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

    const getBrandDetails = (data: (MonthlySpend | WeeklySpend)[]) => {
      const spendMap: Record<string, number> = {};
      const metadataMap: Record<string, { type: string, team: string }> = {};
      data.forEach(d => { 
        const spend = 'actualSpendsInr' in d ? d.actualSpendsInr : d.spendsInr;
        spendMap[d.brandName] = (spendMap[d.brandName] || 0) + spend;
        if (!metadataMap[d.brandName]) {
          metadataMap[d.brandName] = { type: d.type || 'N/A', team: d.team || 'N/A' };
        }
      });
      return { spendMap, metadataMap };
    };

    const calcGainersLosers = (curr: { spendMap: Record<string, number>, metadataMap: Record<string, any> }, prev: { spendMap: Record<string, number>, metadataMap: Record<string, any> }) => {
      const allBrands = Array.from(new Set([...Object.keys(curr.spendMap), ...Object.keys(prev.spendMap)]));
      const diffs = allBrands.map(brand => {
        const c = curr.spendMap[brand] || 0;
        const p = prev.spendMap[brand] || 0;
        const meta = curr.metadataMap[brand] || prev.metadataMap[brand] || { type: 'N/A', team: 'N/A' };
        const diff = c - p;
        return { 
          brand, 
          type: meta.type,
          team: meta.team,
          diff, 
          percentage: p > 0 ? (diff / p) * 100 : (c > 0 ? 100 : 0)
        };
      });
      return {
        gainers: [...diffs].sort((a, b) => b.diff - a.diff).slice(0, 3).filter(x => x.diff > 0),
        losers: [...diffs].sort((a, b) => a.diff - b.diff).slice(0, 3).filter(x => x.diff < 0),
      };
    };

    const yearlyCurrent = getBrandDetails(monthlyData.filter(d => d.month.startsWith(currentYearStr)));
    const yearlyPrev = getBrandDetails(monthlyData.filter(d => d.month.startsWith(prevYearStr)));

    const yearlySpends = Object.values(yearlyCurrent.spendMap).reduce((a, b) => a + b, 0);
    const prevYearSpends = Object.values(yearlyPrev.spendMap).reduce((a, b) => a + b, 0);

    const monthsInYear = Array.from(new Set(monthlyData.filter(d => d.month.startsWith(currentYearStr)).map(d => d.month))).sort().reverse();
    const lastMonthKey = monthsInYear[0] || '';
    let prevMonthKey = '';
    if (lastMonthKey) {
      prevMonthKey = format(subMonths(parse(lastMonthKey, 'yyyy-MM', new Date()), 1), 'yyyy-MM');
    }

    const lastMonth = getBrandDetails(monthlyData.filter(d => d.month === lastMonthKey));
    const prevMonth = getBrandDetails(monthlyData.filter(d => d.month === prevMonthKey));
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

    const lastWeek = getBrandDetails(weeklyData.filter(d => d.week === lastWeekKey));
    const prevWeek = getBrandDetails(weeklyData.filter(d => d.week === prevWeekKey));
    const lastWeekSpends = Object.values(lastWeek.spendMap).reduce((a, b) => a + b, 0);
    const prevWeekSpends = Object.values(prevWeek.spendMap).reduce((a, b) => a + b, 0);

    return {
      yearly: { total: yearlySpends, growth: prevYearSpends > 0 ? ((yearlySpends - prevYearSpends) / prevYearSpends) * 100 : 0, gainers: calcGainersLosers(yearlyCurrent, yearlyPrev).gainers, losers: calcGainersLosers(yearlyCurrent, yearlyPrev).losers },
      monthly: { total: lastMonthSpends, growth: prevMonthSpends > 0 ? ((lastMonthSpends - prevMonthSpends) / prevMonthSpends) * 100 : 0, monthName: lastMonthKey ? format(parse(lastMonthKey, 'yyyy-MM', new Date()), 'MMMM') : 'Latest', gainers: calcGainersLosers(lastMonth, prevMonth).gainers, losers: calcGainersLosers(lastMonth, prevMonth).losers },
      weekly: { total: lastWeekSpends, growth: prevWeekSpends > 0 ? ((lastWeekSpends - prevWeekSpends) / prevWeekSpends) * 100 : 0, weekDate: lastWeekKey, gainers: calcGainersLosers(lastWeek, prevWeek).gainers, losers: calcGainersLosers(lastWeek, prevWeek).losers }
    };
  }, [monthlyData, weeklyData, selectedYear, mounted]);

  const wowChartData = useMemo(() => {
    if (!weeklyData) return [];
    const groups: Record<string, Record<string, number>> = {};
    weeklyData.forEach(item => {
      const week = item.week;
      const dimKey = wowDimension === 'overall' ? 'Total' : (item[wowDimension as keyof WeeklySpend] as string || 'N/A');
      if (!groups[week]) groups[week] = {};
      groups[week][dimKey] = (groups[week][dimKey] || 0) + item.spendsInr;
    });
    return Object.entries(groups).map(([week, values]) => {
      let label = week;
      try {
        const d = parse(week, 'dd-MM-yyyy', new Date());
        if (isValid(d)) label = format(d, 'dd MMM');
      } catch {}
      return { week: label, timestamp: parse(week, 'dd-MM-yyyy', new Date()).getTime(), ...values };
    }).sort((a, b) => a.timestamp - b.timestamp).slice(-12);
  }, [weeklyData, wowDimension]);

  const momChartData = useMemo(() => {
    if (!monthlyData) return [];
    const groups: Record<string, Record<string, number>> = {};
    monthlyData.forEach(item => {
      const month = item.month;
      const dimKey = momDimension === 'overall' ? 'Total' : (item[momDimension as keyof MonthlySpend] as string || 'N/A');
      if (!groups[month]) groups[month] = {};
      groups[month][dimKey] = (groups[month][dimKey] || 0) + item.actualSpendsInr;
    });
    return Object.entries(groups).map(([month, values]) => ({ month, label: format(parse(month, 'yyyy-MM', new Date()), 'MMM yy'), ...values })).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [monthlyData, momDimension]);

  const qoqChartData = useMemo(() => {
    if (!monthlyData) return [];
    const groups: Record<string, Record<string, number>> = {};
    monthlyData.forEach(item => {
      const date = parse(item.month, 'yyyy-MM', new Date());
      const q = Math.floor(date.getMonth() / 3) + 1;
      const qKey = `${date.getFullYear()}-Q${q}`;
      const dimKey = qoqDimension === 'overall' ? 'Total' : (item[qoqDimension as keyof MonthlySpend] as string || 'N/A');
      if (!groups[qKey]) groups[qKey] = {};
      groups[qKey][dimKey] = (groups[qKey][dimKey] || 0) + item.actualSpendsInr;
    });
    return Object.entries(groups).map(([quarter, values]) => ({ quarter, ...values })).sort((a, b) => a.quarter.localeCompare(b.quarter));
  }, [monthlyData, qoqDimension]);

  const handleExportCsv = (data: any[], title: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).filter(k => k !== 'timestamp');
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

  const clearAllFilters = () => {
    setSelectedChannels([]);
    setSelectedClients([]);
    setSelectedTeams([]);
    setSelectedTypes([]);
  };

  const isAnyFilterActive = selectedChannels.length > 0 || selectedClients.length > 0 || selectedTeams.length > 0 || selectedTypes.length > 0;

  if (!mounted || monthlyLoading || weeklyLoading) return <div className="flex flex-1 items-center justify-center p-20"><Loader2 className="h-8 w-8 animate-spin text-primary/40" /></div>;

  const renderGainerLoserList = (gainers: GainerLoser[], losers: GainerLoser[]) => (
    <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-foreground/5 min-w-0">
      <div className="space-y-2 min-w-0">
        <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-success">
          <ArrowUp className="h-2 w-2 shrink-0" /> Top 3 Gainers (Vol)
        </span>
        {gainers.length > 0 ? gainers.map(g => (
          <div key={g.brand} className="flex flex-col border-b border-foreground/5 last:border-none pb-1 min-w-0">
            <span className="text-[10px] font-black truncate" title={g.brand}>{g.brand}</span>
            <div className="flex flex-wrap items-center gap-1 opacity-60"><span className="text-[8px] font-bold uppercase truncate">{g.type}</span></div>
            <span className="text-[9px] font-bold text-success leading-none flex items-center justify-between gap-1 mt-0.5 min-w-0">
                <span className="truncate">+{formatCurrency(g.diff)}</span>
                <span className="text-[7px] opacity-60 shrink-0">({g.percentage.toFixed(1)}%)</span>
            </span>
          </div>
        )) : <span className="text-[9px] italic text-secondary">No gains</span>}
      </div>
      <div className="space-y-2 min-w-0">
        <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-destructive">
          <ArrowDown className="h-2 w-2 shrink-0" /> Top 3 Losers (Vol)
        </span>
        {losers.length > 0 ? losers.map(l => (
          <div key={l.brand} className="flex flex-col border-b border-foreground/5 last:border-none pb-1 min-w-0">
            <span className="text-[10px] font-black truncate" title={l.brand}>{l.brand}</span>
            <div className="flex flex-wrap items-center gap-1 opacity-60"><span className="text-[8px] font-bold uppercase truncate">{l.type}</span></div>
            <span className="text-[9px] font-bold text-destructive leading-none flex items-center justify-between gap-1 mt-0.5 min-w-0">
                <span className="truncate">{formatCurrency(l.diff)}</span>
                <span className="text-[7px] opacity-60 shrink-0">({l.percentage.toFixed(1)}%)</span>
            </span>
          </div>
        )) : <span className="text-[9px] italic text-secondary">No losses</span>}
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col gap-8 pb-10">
      <PageHeader title="SPENDS DASHBOARD" description="Strategic analytical insights and spending trends.">
        <div className="flex flex-wrap items-center gap-3">
          {/* MULTI-SELECT FILTERS */}
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("flex items-center gap-2 h-9 px-4 rounded-none glass  text-[10px] font-black uppercase tracking-widest transition-all", selectedChannels.length > 0 ? "bg-primary text-white" : "text-foreground/60 hover:text-foreground")}>
                  <Filter className="h-3 w-3" />
                  Channel {selectedChannels.length > 0 && `(${selectedChannels.length})`}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-2 rounded-none glass " align="start">
                <SearchableFilterContent 
                  placeholder="Search channels..." 
                  options={filterOptions.channels} 
                  selected={selectedChannels} 
                  onToggle={(val) => setSelectedChannels(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val])} 
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("flex items-center gap-2 h-9 px-4 rounded-none glass  text-[10px] font-black uppercase tracking-widest transition-all", selectedClients.length > 0 ? "bg-primary text-white" : "text-foreground/60 hover:text-foreground")}>
                  <Filter className="h-3 w-3" />
                  Client {selectedClients.length > 0 && `(${selectedClients.length})`}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-2 rounded-none glass " align="start">
                <SearchableFilterContent 
                  placeholder="Search clients..." 
                  options={filterOptions.clients} 
                  selected={selectedClients} 
                  onToggle={(val) => setSelectedClients(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val])} 
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("flex items-center gap-2 h-9 px-4 rounded-none glass  text-[10px] font-black uppercase tracking-widest transition-all", selectedTeams.length > 0 ? "bg-primary text-white" : "text-foreground/60 hover:text-foreground")}>
                  <Filter className="h-3 w-3" />
                  Team {selectedTeams.length > 0 && `(${selectedTeams.length})`}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-2 rounded-none glass " align="start">
                <SearchableFilterContent 
                  placeholder="Search teams..." 
                  options={filterOptions.teams} 
                  selected={selectedTeams} 
                  onToggle={(val) => setSelectedTeams(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val])} 
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("flex items-center gap-2 h-9 px-4 rounded-none glass  text-[10px] font-black uppercase tracking-widest transition-all", selectedTypes.length > 0 ? "bg-primary text-white" : "text-foreground/60 hover:text-foreground")}>
                  <Filter className="h-3 w-3" />
                  Type {selectedTypes.length > 0 && `(${selectedTypes.length})`}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-2 rounded-none glass " align="start">
                <SearchableFilterContent 
                  placeholder="Search types..." 
                  options={filterOptions.types} 
                  selected={selectedTypes} 
                  onToggle={(val) => setSelectedTypes(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val])} 
                />
              </PopoverContent>
            </Popover>

            {isAnyFilterActive && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-9 px-2 text-[10px] font-black uppercase text-destructive hover:bg-destructive/10">
                <X className="h-3 w-3 mr-1" /> Clear All
              </Button>
            )}
          </div>

          <div className="h-8 w-px bg-foreground/10 mx-2" />

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
            <CardDescription className="text-[10px] font-black uppercase text-primary">Annual Spends ({selectedYear})</CardDescription>
            <CardTitle className="text-2xl md:text-3xl xl:text-4xl font-black font-headline break-all leading-none">₹{((stats?.yearly.total || 0) / 10000000).toFixed(2)}Cr</CardTitle>
            <div className={cn("flex flex-wrap items-center gap-1 text-[10px] font-black", (stats?.yearly.growth || 0) >= 0 ? "text-success" : "text-destructive")}>
              {(stats?.yearly.growth || 0) >= 0 ? <ArrowUpRight className="h-3 w-3 shrink-0" /> : <ArrowDownRight className="h-3 w-3 shrink-0" />}
              {Math.abs(stats?.yearly.growth || 0).toFixed(1)}% VS PREV YEAR
            </div>
          </CardHeader>
          <CardContent className="min-w-0">{stats && renderGainerLoserList(stats.yearly.gainers, stats.yearly.losers)}</CardContent>
        </Card>
        
        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2 min-w-0">
            <CardDescription className="text-[10px] font-black uppercase text-primary">{stats?.monthly.monthName} Performance</CardDescription>
            <CardTitle className="text-2xl md:text-3xl xl:text-4xl font-black font-headline break-all leading-none">₹{((stats?.monthly.total || 0) / 10000000).toFixed(2)}Cr</CardTitle>
            <div className={cn("flex flex-wrap items-center gap-1 text-[10px] font-black", (stats?.monthly.growth || 0) >= 0 ? "text-success" : "text-destructive")}>
              {(stats?.monthly.growth || 0) >= 0 ? <ArrowUpRight className="h-3 w-3 shrink-0" /> : <ArrowDownRight className="h-3 w-3 shrink-0" />}
              {Math.abs(stats?.monthly.growth || 0).toFixed(1)}% MOM
            </div>
          </CardHeader>
          <CardContent className="min-w-0">{stats && renderGainerLoserList(stats.monthly.gainers, stats.monthly.losers)}</CardContent>
        </Card>

        <Card className="glass-card min-w-0 overflow-hidden">
          <CardHeader className="pb-2 min-w-0">
            <CardDescription className="text-[10px] font-black uppercase text-primary truncate" title={`Weekly Pulse (${stats?.weekly.weekDate})`}>Weekly Pulse ({stats?.weekly.weekDate})</CardDescription>
            <CardTitle className="text-2xl md:text-3xl xl:text-4xl font-black font-headline break-all leading-none">₹{((stats?.weekly.total || 0) / 10000000).toFixed(2)}Cr</CardTitle>
            <div className={cn("flex flex-wrap items-center gap-1 text-[10px] font-black", (stats?.weekly.growth || 0) >= 0 ? "text-success" : "text-destructive")}>
              {(stats?.weekly.growth || 0) >= 0 ? <ArrowUpRight className="h-3 w-3 shrink-0" /> : <ArrowDownRight className="h-3 w-3 shrink-0" />}
              {Math.abs(stats?.weekly.growth || 0).toFixed(1)}% WOW
            </div>
          </CardHeader>
          <CardContent className="min-w-0">{stats && renderGainerLoserList(stats.weekly.gainers, stats.weekly.losers)}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ChartCard 
          title="WoW Spends Trend" 
          description="Weekly trend tracking" 
          dimension={wowDimension} 
          setDimension={setWowDimension} 
          onExport={() => handleExportCsv(wowChartData, 'WoW_Spends')}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={wowChartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--foreground))" opacity={0.05} />
              <XAxis dataKey="week" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip 
                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} 
                formatter={(val: number) => [`₹${(val / 10000000).toFixed(3)}Cr`, 'Spend']} 
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
              {Object.keys(wowChartData[0] || {}).filter(k => k !== 'week' && k !== 'timestamp').map((key, i) => (
                <Line 
                  key={key} 
                  type="monotone" 
                  dataKey={key} 
                  stroke={CHART_PALETTE[i % CHART_PALETTE.length]} 
                  strokeWidth={3} 
                  dot={{ r: 4, strokeWidth: 2, fill: 'white' }} 
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard 
          title="MoM Spends Trend" 
          description="Monthly trend comparison" 
          dimension={momDimension} 
          setDimension={setMomDimension} 
          onExport={() => handleExportCsv(momChartData, 'MoM_Spends')}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={momChartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--foreground))" opacity={0.05} />
              <XAxis dataKey="label" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip 
                contentStyle={{ borderRadius: '1rem', border: 'none' }} 
                formatter={(val: number) => [`₹${(val / 10000000).toFixed(2)}Cr`, 'Spend']} 
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
              {Object.keys(momChartData[0] || {}).filter(k => k !== 'month' && k !== 'label').map((key, i) => (
                <Bar 
                  key={key} 
                  dataKey={key} 
                  stackId="a" 
                  fill={CHART_PALETTE[i % CHART_PALETTE.length]} 
                  radius={i === 0 ? [0, 0, 4, 4] : [4, 4, 0, 0]} 
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard 
        title="Quarter on Quarter Trend" 
        description="Strategic fiscal trend review" 
        dimension={qoqDimension} 
        setDimension={setQoqDimension} 
        onExport={() => handleExportCsv(qoqChartData, 'QoQ_Spends')} 
        height="400px"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={qoqChartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--foreground))" opacity={0.05} />
            <XAxis dataKey="quarter" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none' }} formatter={(val: number) => `₹${(val / 10000000).toFixed(2)}Cr`} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
            {Object.keys(qoqChartData[0] || {}).filter(k => k !== 'quarter').map((key, i) => (
              <Bar 
                key={key} 
                dataKey={key} 
                stackId="a" 
                fill={CHART_PALETTE[i % CHART_PALETTE.length]} 
                radius={i === 0 ? [0, 0, 4, 4] : [4, 4, 0, 0]} 
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
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
  height = "350px" 
}: { 
  title: string; 
  description: string; 
  dimension: Dimension; 
  setDimension: (d: Dimension) => void; 
  onExport: () => void; 
  children: React.ReactNode; 
  height?: string 
}) {
  return (
    <Card className="glass-card ">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl font-bold font-headline">{title}</CardTitle>
          <CardDescription className="text-xs uppercase font-black tracking-widest opacity-50">{description}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
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
