
'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Sparkle, 
  ArrowsClockwise, 
  CircleNotch, 
  FileText, 
  ArrowUpRight, 
  ArrowDownRight, 
  ArrowUp, 
  ArrowDown, 
  Globe, 
  ChartBar, 
  Calendar, 
  CaretRight, 
  Target, 
  Briefcase, 
  ListChecks, 
  Warning, 
  Clock 
} from "@phosphor-icons/react";
import { format, parse, subMonths, subWeeks, startOfWeek, addDays, isValid, isBefore, isAfter, startOfDay, endOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDoc, useFirestore, useUser, useCollection } from '@/firebase';
import { BusinessSnapshot, UserProfile, PerformanceShift, MonthlySpend, WeeklySpend, KpiData, WbrEntry, ActionItem, Client, Lead } from '@/lib/types';
import { refreshBusinessSnapshot } from '@/lib/firestore-actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { where, query, collection, getDocs, orderBy, limit } from 'firebase/firestore';
import { Separator } from '@/components/ui/separator';
import { exportToPdf } from '@/lib/pdf-export';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LabelList
} from 'recharts';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  // One decimal keeps labels short enough for dense 12-week charts
  if (absVal >= 10000000) return `${sign}${(absVal / 10000000).toFixed(1)}Cr`;
  if (absVal >= 100000) return `${sign}${(absVal / 100000).toFixed(1)}L`;
  if (absVal >= 1000) return `${sign}${(absVal / 1000).toFixed(0)}K`;
  return `${sign}${absVal.toFixed(0)}`;
};

/** Alternate above/below the line so neighboring labels don't collide. */
const MomentumSpendLabel = (props: {
  x?: number | string;
  y?: number | string;
  value?: number | string;
  index?: number;
}) => {
  const { x, y, value, index = 0 } = props;
  const numeric = typeof value === 'number' ? value : Number(value);
  const label = formatChartLabel(numeric);
  if (!label || x == null || y == null) return null;

  const cx = Number(x);
  const cy = Number(y);
  const placeAbove = index % 2 === 0;
  const dy = placeAbove ? -12 : 18;

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
      {label}
    </text>
  );
};

const CHART_PALETTE = [
  '#002FA7', // Brand Blue
  '#D92218', // Red
  '#00A675', // Green
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
];

export default function BusinessSnapshotPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { data: userProfile } = useDoc<UserProfile>(user ? `users/${user.uid}` : null);
  
  const [mounted, setMounted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [statsWindow, setStatsWindow] = useState<any[]>([]);
  const snapshotRef = useRef<HTMLDivElement>(null);

  // INTELLIGENCE STATE
  const [newsFeed, setNewsFeed] = useState<any[]>([]);
  const [momentumData, setMomentumData] = useState<any[]>([]);
  const [channelSpends, setChannelSpends] = useState<any[]>([]);
  const [channelSpendWeekLabel, setChannelSpendWeekLabel] = useState<string | null>(null);
  const [pipelineData, setPipelineData] = useState<any[]>([]);
  const [accountabilityPulse, setAccountabilityPulse] = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
    const start = format(subMonths(new Date(), 6), 'yyyy-MM');
    setStatsWindow([where('month', '>=', start)]);
  }, []);

  const { data: monthlySpends, loading: mLoading } = useCollection<MonthlySpend>('monthlySpends', statsWindow);
  const { data: weeklySpends, loading: wLoading } = useCollection<WeeklySpend>('weeklySpends', statsWindow);

  useEffect(() => {
    if (!mounted) return;

    const fetchIntelligence = async () => {
      try {
        // 1. Fetch Latest WBRs, Actions, and Leads (WITH LIMITS FOR PERFORMANCE)
        const wbrQ = query(collection(firestore, 'wbrEntries'), orderBy('wbrDate', 'desc'), limit(15));
        const wbrSnap = await getDocs(wbrQ);
        const wbrs = wbrSnap.docs.map(d => d.data() as WbrEntry);

        const actionsQ = query(collection(firestore, 'actionItems'), orderBy('updatedAt', 'desc'), limit(100));
        const actionsSnap = await getDocs(actionsQ);
        const actions = actionsSnap.docs.map(d => d.data() as ActionItem);

        const leadsSnap = await getDocs(query(collection(firestore, 'leads'), limit(100)));
        const leads = leadsSnap.docs.map(d => d.data() as Lead);

        // 2. NAME RESOLUTION — registry + KPI discovery, then targeted lookup for WBR clients
        const nameLookup: Record<string, string> = {};
        const looksLikeClientId = (value?: string | null, cid?: string) => {
          if (!value?.trim()) return true;
          const v = value.trim();
          if (cid && v === cid) return true;
          return /^CLID\d+$/i.test(v);
        };
        const rememberName = (cid?: string, name?: string) => {
          if (!cid || !name || looksLikeClientId(name, cid)) return;
          if (!nameLookup[cid] || looksLikeClientId(nameLookup[cid], cid)) {
            nameLookup[cid] = name;
          }
        };

        // Source A: Client registry (no low cap — pulse clients often sit outside first 100)
        const clientSnap = await getDocs(collection(firestore, 'clients'));
        clientSnap.forEach(d => {
          const data = d.data() as Client;
          rememberName(data.uniqueId, data.name);
        });

        // Source B: Recent KPI records
        const recentKpiQ = query(
          collection(firestore, 'kpis'), 
          where('month', '>=', format(subMonths(new Date(), 3), 'yyyy-MM')),
          limit(500)
        );
        const kpiRefSnap = await getDocs(recentKpiQ);
        kpiRefSnap.forEach(d => {
          const data = d.data() as KpiData;
          rememberName(data.clientId, data.clientName);
        });

        // Source C: Targeted resolve for WBR feed IDs still missing a real name
        const wbrClientIds = Array.from(new Set(wbrs.map(w => w.clientId).filter(Boolean)));
        const unresolvedIds = wbrClientIds.filter(cid => looksLikeClientId(nameLookup[cid], cid));
        await Promise.all(unresolvedIds.map(async (cid) => {
          if (!looksLikeClientId(nameLookup[cid], cid)) return;

          const byUniqueId = await getDocs(
            query(collection(firestore, 'clients'), where('uniqueId', '==', cid), limit(1))
          );
          if (!byUniqueId.empty) {
            const data = byUniqueId.docs[0].data() as Client;
            rememberName(cid, data.name);
            if (!looksLikeClientId(nameLookup[cid], cid)) return;
          }

          const byKpi = await getDocs(
            query(collection(firestore, 'kpis'), where('clientId', '==', cid), limit(1))
          );
          if (!byKpi.empty) {
            const data = byKpi.docs[0].data() as KpiData;
            rememberName(cid, data.clientName);
          }
        }));

        // 3. MOMENTUM & CHANNEL SPENDS
        const spendByWeekStart: Record<string, number> = {};
        const channelTotals: Record<string, number> = {};
        
        const weeksArr = Array.from(new Set(weeklySpends?.map(s => s.week))).sort((a,b) => {
          try { return parse(a, 'dd-MM-yyyy', new Date()).getTime() - parse(b, 'dd-MM-yyyy', new Date()).getTime(); } catch(e) { return 0; }
        });
        const lastWeekLabel = weeksArr[weeksArr.length - 1] || '';

        weeklySpends?.forEach(s => {
          try {
            const d = parse(s.week, 'dd-MM-yyyy', new Date());
            if (isValid(d)) {
              const weekStartKey = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
              spendByWeekStart[weekStartKey] = (spendByWeekStart[weekStartKey] || 0) + (s.spendsInr || 0);
              
              if (s.week === lastWeekLabel) {
                channelTotals[s.channelVendor] = (channelTotals[s.channelVendor] || 0) + (s.spendsInr || 0);
              }
            }
          } catch(e) {}
        });

        const momentum: any[] = [];
        for (let i = 11; i >= 0; i--) {
          const weekStart = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
          const weekStartKey = format(weekStart, 'yyyy-MM-dd');
          momentum.push({
            week: format(weekStart, 'dd MMM'),
            spend: spendByWeekStart[weekStartKey] || 0,
          });
        }
        setMomentumData(momentum);
        
        setChannelSpends(Object.entries(channelTotals).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value));
        if (lastWeekLabel) {
          try {
            const weekDate = parse(lastWeekLabel, 'dd-MM-yyyy', new Date());
            setChannelSpendWeekLabel(
              isValid(weekDate)
                ? `Week of ${format(startOfWeek(weekDate, { weekStartsOn: 1 }), 'dd MMM yyyy')}`
                : `Week of ${lastWeekLabel}`
            );
          } catch {
            setChannelSpendWeekLabel(`Week of ${lastWeekLabel}`);
          }
        } else {
          setChannelSpendWeekLabel(null);
        }

        // 4. SALES PIPELINE (FUNNEL)
        const statusOrder = ['Qualified', 'Pitch', 'Negotiation', 'Contract', 'Won'];
        const leadCounts = leads.reduce((acc, l) => {
          acc[l.status] = (acc[l.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const maxLead = Math.max(...Object.values(leadCounts), 1);
        setPipelineData(statusOrder.map(status => ({
          name: status.toUpperCase(),
          value: leadCounts[status] || 0,
          percent: ((leadCounts[status] || 0) / maxLead) * 100
        })));

        // 5. ACCOUNTABILITY PULSE
        const sections = ["OPERATIONS", "CLIENT ENGAGEMENT", "SALES", "MANAGEMENT", "HR", "AZTEC"];
        const today = startOfDay(new Date());
        const thresholdDate = addDays(today, 3);

        const pulse = sections.map(section => {
          const sectionActions = actions.filter(a => a.section === section && a.status !== 'Completed');
          let overdueCount = 0;
          let nearOverdueCount = 0;
          sectionActions.forEach(a => {
            if (!a.dueDate) return;
            try {
              const due = parse(a.dueDate, 'yyyy-MM-dd', new Date());
              if (!isValid(due)) return;
              if (isBefore(due, today)) overdueCount++;
              else if (isBefore(due, endOfDay(thresholdDate))) nearOverdueCount++;
            } catch(e) {}
          });
          return { section, overdue: overdueCount, soon: nearOverdueCount };
        }).filter(s => s.overdue > 0 || s.soon > 0).sort((a, b) => b.overdue - a.overdue);
        
        setAccountabilityPulse(pulse);

        // 6. NEWS FEED (Utilizing resolved names)
        const pulseFeed: any[] = [];
        Array.from(new Set(wbrs.map(w => w.clientId))).forEach(cid => {
          const clientWbr = wbrs.find(w => w.clientId === cid);
          if (clientWbr) {
            const displayName =
              (!looksLikeClientId(nameLookup[cid], cid) && nameLookup[cid]) ||
              (!looksLikeClientId(clientWbr.clientName, cid) && clientWbr.clientName) ||
              cid;
            pulseFeed.push({
              client: `${displayName} • ${clientWbr.cluster || 'UNASSIGNED'}`,
              rag: clientWbr.performanceRag,
              week: (() => {
                try {
                  const d = parse(clientWbr.wbrDate, 'yyyy-MM-dd', new Date());
                  return isValid(d) ? format(d, 'dd MMM') : clientWbr.wbrDate;
                } catch {
                  return clientWbr.wbrDate;
                }
              })(),
              intelligence: clientWbr.summary || clientWbr.financeIssues || 'Monitoring operational stability.'
            });
          }
        });
        setNewsFeed(pulseFeed.slice(0, 10));

      } catch (err) {
        console.error("Snapshot Fetch Failure:", err);
      }
    };

    fetchIntelligence();
  }, [mounted, firestore, weeklySpends]);

  const stats = useMemo(() => {
    if (!monthlySpends || !weeklySpends || !mounted) return null;
    const allMonths = Array.from(new Set(monthlySpends.map(d => d.month))).sort().reverse();
    let targetMonth = '';
    for (const m of allMonths) {
      if (monthlySpends.filter(d => d.month === m).reduce((a, b) => a + (b.actualSpendsInr || 0), 0) > 0) {
        targetMonth = m; break;
      }
    }
    if (!targetMonth) return null;

    const getDetails = (data: (MonthlySpend | WeeklySpend)[]) => {
      const spendMap: Record<string, number> = {};
      const metaMap: Record<string, any> = {};
      data.forEach(d => {
        const val = 'actualSpendsInr' in d ? d.actualSpendsInr : d.spendsInr;
        spendMap[d.brandName] = (spendMap[d.brandName] || 0) + val;
        if (!metaMap[d.brandName]) metaMap[d.brandName] = { type: d.type || 'PERFORMANCE', team: d.team || 'N/A' };
      });
      return { spendMap, metaMap };
    };

    const calcShifts = (curr: any, prev: any) => {
      const all = Array.from(new Set([...Object.keys(curr.spendMap), ...Object.keys(prev.spendMap)]));
      const diffs = all.map(brand => {
        const c = curr.spendMap[brand] || 0;
        const p = prev.spendMap[brand] || 0;
        const meta = curr.metaMap[brand] || prev.metaMap[brand];
        const diff = c - p;
        return { brand, type: meta?.type || 'PERFORMANCE', team: meta?.team || 'N/A', amount: diff, variance: p > 0 ? (diff / p) * 100 : (c > 0 ? 100 : 0), direction: diff >= 0 ? 'increase' : 'decrease' } as PerformanceShift;
      });
      return { gainers: diffs.filter(x => (x.amount || 0) > 0).sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 3), losers: diffs.filter(x => (x.amount || 0) < 0).sort((a, b) => (a.amount || 0) - (b.amount || 0)).slice(0, 3) };
    };

    const currMonthData = getDetails(monthlySpends.filter(d => d.month === targetMonth));
    const prevMonthData = getDetails(monthlySpends.filter(d => d.month === format(subMonths(parse(targetMonth, 'yyyy-MM', new Date()), 1), 'yyyy-MM')));
    const mShifts = calcShifts(currMonthData, prevMonthData);

    const weeks = Array.from(new Set(weeklySpends.map(s => s.week))).sort((a, b) => {
      try { return parse(b, 'dd-MM-yyyy', new Date()).getTime() - parse(a, 'dd-MM-yyyy', new Date()).getTime(); } catch(e) { return 0; }
    });
    const lastW = weeks[0] || '';
    const prevW = lastW ? format(subWeeks(parse(lastW, 'dd-MM-yyyy', new Date()), 1), 'dd-MM-yyyy') : '';
    
    const currWData = getDetails(weeklySpends.filter(d => d.week === lastW));
    const prevWData = getDetails(weeklySpends.filter(d => d.week === prevW));
    const wShifts = calcShifts(currWData, prevWData);

    return { month: targetMonth, monthName: format(parse(targetMonth, 'yyyy-MM', new Date()), 'MMMM').toUpperCase(), monthlyTotal: Object.values(currMonthData.spendMap).reduce((a, b) => a + b, 0), prevMonthTotal: Object.values(prevMonthData.spendMap).reduce((a, b) => a + b, 0), mGainers: mShifts.gainers, mLosers: mShifts.losers, weeklyTotal: Object.values(currWData.spendMap).reduce((a, b) => a + b, 0), prevWeeklyTotal: Object.values(prevWData.spendMap).reduce((a, b) => a + b, 0), wGainers: wShifts.gainers, wLosers: wShifts.losers, weeklyDate: lastW, yearlyTotal: monthlySpends.filter(d => d.month.startsWith(targetMonth.split('-')[0])).reduce((a, b) => a + (b.actualSpendsInr || 0), 0) };
  }, [monthlySpends, weeklySpends, mounted]);

  const { data: snapshotDoc, loading: sLoading } = useDoc<BusinessSnapshot>(stats ? `businessSnapshots/${stats.month}` : null);

  const isAdmin = userProfile?.role === 'Admin' || userProfile?.role === 'Cluster Lead';

  const handleRefresh = async () => {
    if (!stats?.month) return;
    setIsRefreshing(true);
    try {
      await refreshBusinessSnapshot(firestore, stats.month);
      toast({ title: "Data Updated" });
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Refresh Error", description: e.message });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportPdf = async () => {
    if (!snapshotRef.current) return;
    setIsRefreshing(true);
    try {
      await exportToPdf(snapshotRef.current, stats?.month || 'Snapshot');
      toast({ title: "Export Complete" });
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Export Failed", description: e.message });
    } finally {
      setIsRefreshing(false);
    }
  };

  if ((mLoading || wLoading) && !stats) return <div className="flex flex-1 items-center justify-center p-20"><CircleNotch className="h-8 w-8 animate-spin text-brand" /></div>;

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-ink pb-8">
        <div className="space-y-2">
          <div className="terminal-overline">Command Center</div>
          <h1 className="text-5xl lg:text-7xl font-black tracking-tighter uppercase">Snapshot</h1>
          <p className="text-[11px] font-mono text-secondary uppercase tracking-[0.2em]">Strategic Performance Review · {stats?.month || 'Initializing...'}</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Button variant="outline" className="h-12 px-6 border-ink hover:bg-cream transition-colors font-bold uppercase text-[10px] tracking-widest" onClick={handleRefresh} disabled={isRefreshing}>
              <ArrowsClockwise className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
              REGENERATE
            </Button>
          )}
          <Button className="h-12 px-8 bg-brand text-white hover:bg-ink font-bold uppercase text-[10px] tracking-widest" onClick={handleExportPdf} disabled={isRefreshing}>
            {isRefreshing ? <CircleNotch className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            EXPORT PDF
          </Button>
        </div>
      </div>

      {!stats ? (
        <div className="p-12 md:p-16 border border-dashed border-ink flex flex-col items-center justify-center text-center space-y-6 bg-white">
          <ChartBar className="h-12 w-12 text-secondary/20" />
          <h3 className="text-xl font-bold uppercase tracking-tighter">No intelligence record found</h3>
        </div>
      ) : (
        <div ref={snapshotRef} id="snapshot-content" className="space-y-16">
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 bg-white border border-ink p-10 space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-secondary">WEEKLY SPENDS PULSE</span>
                  <h2 className="text-3xl font-black tracking-tighter uppercase mt-1">12-Week Momentum</h2>
                </div>
                <div className="flex items-center gap-6"><div className="h-2 w-2 rounded-full bg-destructive" /><span className="text-[9px] font-black uppercase tracking-widest text-secondary">SPEND</span></div>
              </div>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={momentumData} margin={{ top: 24, right: 20, left: 4, bottom: 18 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.05} />
                    <XAxis
                      dataKey="week"
                      fontSize={10}
                      fontWeight="black"
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={8}
                    />
                    <YAxis fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 10000000).toFixed(1)}Cr`} />
                    <RechartsTooltip contentStyle={{ borderRadius: '0', border: '1px solid #000', boxShadow: '12px 12px 0px rgba(0,0,0,0.1)' }} formatter={(v: number) => [formatCurrency(v), 'Spend']} />
                    <Line type="monotone" dataKey="spend" stroke="hsl(var(--destructive))" strokeWidth={4} dot={{ r: 5, fill: 'hsl(var(--destructive))', strokeWidth: 0 }}>
                      <LabelList dataKey="spend" content={<MomentumSpendLabel />} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-ink flex flex-col h-[560px]">
              <div className="p-8 border-b border-ink flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-secondary">THIS WEEK · SNAPSHOTS</span>
                  <h2 className="text-2xl font-black tracking-tighter uppercase mt-1">Client Pulse</h2>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="divide-y divide-ink/5">
                  {newsFeed.length > 0 ? newsFeed.map((item, i) => (
                    <div key={i} className="p-8 space-y-4 hover:bg-cream transition-colors group">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><div className={cn("h-2 w-2 rounded-full", item.rag === 'Green' ? 'bg-success' : item.rag === 'Amber' ? 'bg-warning' : 'bg-destructive')} /><span className="text-sm font-black uppercase tracking-tight truncate max-w-[160px]">{item.client}</span></div>
                        <span className="text-[10px] font-mono font-bold opacity-30">{item.week}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed font-medium text-ink/70 italic line-clamp-3">{item.intelligence}</p>
                    </div>
                  )) : <div className="p-20 text-center text-[10px] font-black uppercase text-secondary/70 italic">No updates recorded.</div>}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* TACTICAL ANALYSIS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-ink border border-ink ">
              {/* Card 1: Channel Performance (Horizontal Bar Chart) */}
              <div className="bg-white p-10 flex flex-col space-y-8 min-h-[500px]">
                  <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">CHANNEL PERFORMANCE</p>
                      <h3 className="text-2xl font-black tracking-tighter uppercase">Depletion Pulse</h3>
                      <p className="text-[11px] font-medium text-secondary pt-1">
                        {channelSpendWeekLabel
                          ? `Spend by channel · ${channelSpendWeekLabel}`
                          : 'Spend by channel · latest available week'}
                      </p>
                  </div>
                  <div className="flex-1 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={channelSpends} 
                          layout="vertical"
                          margin={{ left: -10, right: 56 }}
                        >
                           <CartesianGrid strokeDasharray="3 3" horizontal={false} strokeOpacity={0.05} />
                           <XAxis type="number" hide />
                           <YAxis 
                             dataKey="name" 
                             type="category"
                             fontSize={10} 
                             fontWeight="black" 
                             axisLine={false} 
                             tickLine={false}
                             width={90}
                           />
                           <RechartsTooltip 
                             cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                             contentStyle={{ borderRadius: '0', border: '1px solid #000' }}
                             formatter={(v: number) => [formatCurrency(v), 'Spend']}
                           />
                           <Bar dataKey="value" radius={[0, 0, 0, 0]} barSize={24}>
                              {channelSpends.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                              <LabelList
                                dataKey="value"
                                position="right"
                                offset={8}
                                formatter={(v: number) => formatChartLabel(v)}
                                style={{
                                  fill: 'hsl(var(--ink))',
                                  fontSize: 9,
                                  fontWeight: 700,
                                  fontFamily: 'var(--font-mono), IBM Plex Mono, monospace',
                                }}
                              />
                           </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              {/* Card 2: Conversion Funnel (Sales Pipeline) */}
              <div className="bg-white p-10 flex flex-col space-y-8 min-h-[500px]">
                  <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">SALES PIPELINE</p>
                      <h3 className="text-2xl font-black tracking-tighter uppercase">Discovery → Won</h3>
                  </div>
                  <div className="flex-1 space-y-6 pt-4">
                      {pipelineData.length > 0 ? pipelineData.map((stage, i) => (
                        <div key={i} className="space-y-2">
                           <div className="flex items-center justify-between text-[10px] font-black uppercase">
                              <span className="tracking-widest">{stage.name}</span>
                              <span className="text-secondary">{stage.value} RECORDS</span>
                           </div>
                           <div className="h-6 bg-foreground/[0.03] relative overflow-hidden">
                              <div className="absolute inset-0 bg-brand/10" style={{ width: `${stage.percent}%` }} />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] font-black text-secondary">
                                 {stage.percent.toFixed(1)}%
                              </div>
                           </div>
                        </div>
                      )) : <p className="p-20 text-center text-[10px] font-black uppercase text-secondary/70 italic">No lead data available.</p>}
                  </div>
              </div>

              {/* Card 3: Accountability Pulse (Overdue Actions) */}
              <div className="bg-white p-10 flex flex-col space-y-8 min-h-[500px]">
                  <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">ACCOUNTABILITY PULSE</p>
                      <h3 className="text-2xl font-black tracking-tighter uppercase">Overdue & Critical</h3>
                  </div>
                  <div className="flex-1 space-y-4 pt-4 overflow-y-auto custom-scrollbar">
                      {accountabilityPulse.length > 0 ? accountabilityPulse.map((item, i) => (
                        <div key={i} className="group p-4 bg-foreground/[0.02] border border-foreground/5 hover:bg-foreground/[0.04] transition-colors">
                           <div className="flex items-center justify-between mb-3">
                              <span className="text-11px font-black uppercase tracking-tight">{item.section}</span>
                              <div className="flex gap-2">
                                 {item.overdue > 0 && (
                                   <Badge variant="destructive" className="h-5 px-1.5 text-[9px] font-black rounded-sm shadow-sm flex gap-1">
                                      <Warning className="h-2.5 w-2.5" /> {item.overdue}
                                   </Badge>
                                 )}
                                 {item.soon > 0 && (
                                   <Badge variant="warning" className="h-5 px-1.5 text-[9px] font-black rounded-sm shadow-sm flex gap-1">
                                      <Clock className="h-2.5 w-2.5" /> {item.soon}
                                   </Badge>
                                 )}
                              </div>
                           </div>
                           <div className="flex items-center gap-4">
                              <div className="flex-1 h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                                 <div 
                                    className="h-full bg-destructive" 
                                    style={{ width: `${(item.overdue / (item.overdue + item.soon || 1)) * 100}%` }} 
                                  />
                              </div>
                              <span className="text-[8px] font-black opacity-30 uppercase">Risk Level</span>
                           </div>
                        </div>
                      )) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                          <CheckCircle2 className="h-10 w-10 text-success/20" weight="bold" />
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-30">Tasks Clear<br/>No overdue task data</p>
                        </div>
                      )}
                  </div>
                  <div className="pt-6 border-t border-foreground/5 flex items-center justify-between">
                     <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full bg-destructive" />
                        <span className="text-[8px] font-black uppercase text-secondary tracking-widest">Overdue</span>
                     </div>
                     <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full bg-warning" />
                        <span className="text-[8px] font-black uppercase text-secondary tracking-widest">Due Soon (72h)</span>
                     </div>
                  </div>
              </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-3 px-1"><Globe className="h-5 w-5 text-brand" /><h2 className="text-sm font-black uppercase tracking-[0.2em] text-secondary">Spends Insights</h2></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-ink border border-ink ">
                <SnapshotWidget title={`ANNUAL SPENDS (${stats.month.split('-')[0]})`} value={formatCurrency(stats.yearlyTotal)} variance={0} varianceLabel="ANNUAL TOTAL" gainers={[]} losers={[]} />
                <SnapshotWidget title={`${stats.monthName} SPENDS`} value={formatCurrency(stats.monthlyTotal)} variance={stats.prevMonthTotal > 0 ? ((stats.monthlyTotal - stats.prevMonthTotal) / stats.prevMonthTotal) * 100 : 0} varianceLabel="MOM" gainers={stats.mGainers} losers={stats.mLosers} />
                <SnapshotWidget title={`WEEKLY PULSE (${stats.weeklyDate})`} value={formatCurrency(stats.weeklyTotal)} variance={stats.prevWeeklyTotal > 0 ? ((stats.weeklyTotal - stats.prevWeeklyTotal) / stats.prevWeeklyTotal) * 100 : 0} varianceLabel="WOW" gainers={stats.wGainers} losers={stats.wLosers} />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
             <div className="xl:col-span-2 bg-white p-12 border border-ink space-y-10">
                <div className="flex items-center justify-between border-b border-ink/10 pb-8"><div className="space-y-1"><p className="terminal-overline">AI STRATEGIC REVIEW</p><div className="flex items-center gap-2 font-mono text-[11px] font-black text-secondary"><Sparkle className="h-4 w-4 text-brand" />AZTEC_SYNTHESIS_ENGINE_V4</div></div></div>
                {sLoading ? (<div className="flex items-center gap-3 p-20 justify-center"><CircleNotch className="h-6 w-6 animate-spin text-brand" /><span className="text-[10px] font-black uppercase tracking-widest text-secondary">Updating AI analysis...</span></div>) : (<div className="whitespace-pre-wrap font-body text-[15px] leading-relaxed text-ink/80 border-l-[6px] border-brand pl-12 py-4">{snapshotDoc?.content || "Strategic analysis is being updated. Click 'REGENERATE' to refresh."}</div>)}
             </div>
             <div className="bg-cream p-10 border border-ink space-y-10">
                <div className="space-y-2"><p className="terminal-overline">Portfolio Intelligence</p><h3 className="text-xl font-black tracking-tighter uppercase">Strategic Health</h3>{snapshotDoc?.stats?.wbrCycleDate && (<div className="flex items-center gap-2 text-[9px] font-black text-secondary/60 uppercase tracking-widest bg-white/50 w-fit px-2 py-0.5 border border-ink/5"><Calendar className="h-3 w-3" />WBR Cycle: {snapshotDoc.stats.wbrCycleDate}</div>)}</div>
                <div className="space-y-10">
                    <div className="space-y-4"><p className="text-[10px] font-black uppercase tracking-widest text-secondary">Operational Health (P-RAG)</p><HealthGrid green={snapshotDoc?.stats?.performanceRag?.Green || 0} amber={snapshotDoc?.stats?.performanceRag?.Amber || 0} red={snapshotDoc?.stats?.performanceRag?.Red || 0} /></div>
                    <div className="space-y-4"><p className="text-[10px] font-black uppercase tracking-widest text-secondary">Engagement Health (E-RAG)</p><HealthGrid green={snapshotDoc?.stats?.engagementRag?.Green || 0} amber={snapshotDoc?.stats?.engagementRag?.Amber || 0} red={snapshotDoc?.stats?.engagementRag?.Red || 0} /></div>
                    <div className="pt-10 border-t border-ink/10 space-y-6"><p className="text-[10px] font-black uppercase tracking-widest text-secondary">Major Shifts Detected</p>
                        {[...(snapshotDoc?.stats?.ragAdvancements || []), ...(snapshotDoc?.stats?.ragRisks || [])].length > 0 ? (<div className="space-y-5">{[...(snapshotDoc?.stats?.ragAdvancements || []), ...(snapshotDoc?.stats?.ragRisks || [])].slice(0, 8).map((shift, i) => (<div key={i} className="flex flex-col gap-2 p-4 bg-white border border-ink/5 group hover:border-brand/20 transition-colors"><div className="flex items-center justify-between gap-4"><div className="min-w-0"><p className="text-xs font-black uppercase truncate">{shift.brand}</p><p className="text-[8px] font-bold text-secondary uppercase">{shift.team} • {shift.type}</p></div><div className={cn("text-[9px] font-mono font-black px-2 py-0.5 border h-fit", shift.direction === 'recovery' ? "bg-success/5 border-success/20 text-success" : "bg-destructive/5 border-destructive/20 text-destructive")}>{shift.from} → {shift.to}</div></div>{shift.reason && (<p className="text-[10px] leading-relaxed text-secondary italic border-l border-ink/10 pl-3 line-clamp-2">{shift.reason}</p>)}</div>))}</div>) : <p className="text-[10px] italic font-bold text-secondary/70">No significant shifts recorded WoW.</p>}
                    </div>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HealthGrid({ green, amber, red }: { green: number, amber: number, red: number }) {
    return (
        <div className="grid grid-cols-3 gap-px bg-ink border border-ink shadow-lg">
            <HealthBox count={green} label="GREEN" color="success" />
            <HealthBox count={amber} label="AMBER" color="warning" />
            <HealthBox count={red} label="RED" color="destructive" />
        </div>
    );
}

function HealthBox({ count, label, color }: { count: number, label: string, color: 'success' | 'warning' | 'destructive' }) {
    return (
        <div className="bg-white p-6 flex flex-col items-center justify-center space-y-4">
            <div className={cn("h-14 w-10 rounded-full border-[3px] flex items-center justify-center bg-white shadow-sm", color === 'success' ? "border-success text-success" : color === 'warning' ? "border-warning text-warning" : "border-destructive text-destructive")}><span className="text-xl font-black font-mono">{count}</span></div>
            <span className="text-[9px] font-black uppercase text-secondary tracking-[0.2em]">{label}</span>
        </div>
    );
}

function SnapshotWidget({ title, value, variance, varianceLabel, gainers, losers }: { title: string; value: string; variance: number; varianceLabel: string; gainers: PerformanceShift[]; losers: PerformanceShift[]; }) {
  return (
    <div className="bg-white p-10 flex flex-col h-full relative overflow-hidden">
      <div className="space-y-4 mb-8">
        <p className="text-[11px] font-black uppercase tracking-widest text-brand">{title}</p>
        <div className="space-y-2">
            <div className="text-6xl font-black font-headline tracking-tighter text-ink">{value}</div>
            <div className={cn("flex items-center gap-1.5 font-mono text-[11px] font-black uppercase", variance >= 0 ? "text-success" : "text-destructive")}>{variance > 0 ? <ArrowUpRight className="h-3 w-3" /> : variance < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}{Math.abs(variance).toFixed(1)}% {varianceLabel}</div>
        </div>
      </div>
      <Separator className="bg-ink/5 mb-8" />
      <div className="flex-1 grid grid-cols-2 gap-10">
            <div className="space-y-4"><span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-success"><ArrowUp className="h-3 w-3" /> TOP 3 GAINERS</span><div className="space-y-5">{gainers && gainers.length > 0 ? gainers.map((g, i) => (<div key={i} className="space-y-1"><p className="text-[14px] font-black text-ink leading-none truncate uppercase tracking-tight">{g.brand}</p><p className="text-[9px] font-bold text-secondary uppercase text-secondary">{g.type}</p><p className="text-[11px] font-black leading-none flex items-center justify-between text-success"><span>+{formatCurrency(g.amount || 0)}</span><span className="opacity-60 text-[9px]">({g.variance.toFixed(1)}%)</span></p></div>)) : <p className="text-[10px] font-bold text-secondary/20 italic">No significant gains</p>}</div></div>
            <div className="space-y-4"><span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-destructive"><ArrowDown className="h-3 w-3" /> TOP 3 LOSERS</span><div className="space-y-5">{losers && losers.length > 0 ? losers.map((l, i) => (<div key={i} className="space-y-1"><p className="text-[14px] font-black text-ink leading-none truncate uppercase tracking-tight">{l.brand}</p><p className="text-[9px] font-bold text-secondary uppercase text-secondary">{l.type}</p><p className="text-[11px] font-black leading-none flex items-center justify-between text-destructive"><span>{formatCurrency(l.amount || 0)}</span><span className="opacity-60 text-[9px]">({l.variance.toFixed(1)}%)</span></p></div>)) : <p className="text-[10px] font-bold text-secondary/20 italic">No significant losses</p>}</div></div>
      </div>
    </div>
  );
}

function CheckCircle2({ className, weight }: { className?: string, weight?: "bold" | "fill" | "duotone" | "light" | "thin" | "regular" }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={weight === 'bold' ? "3" : "2"} strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>;
}
