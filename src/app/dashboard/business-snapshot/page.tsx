
'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
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
import { BusinessSnapshot, UserProfile, PerformanceShift, MonthlySpend, WeeklySpend, KpiData, WbrEntry, ActionItem, ActionStatus, Client, Lead, RagStatus } from '@/lib/types';
import { canonicalizeChannel, resolveActionStatus } from '@/lib/normalize';
import { clientPathFromPrimaryKpis, kpiAttainmentPct, selectPrimaryKpisForPath, type ClientPath } from '@/lib/kpi-rag';
import { refreshBusinessSnapshot } from '@/lib/firestore-actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { where, query, collection, getDocs, orderBy, limit, startAfter, documentId, type Firestore, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
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
import { SupportPulse } from '@/components/support-pulse';

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

/** Mirror Action Items Kanban columns on Snapshot Accountability Pulse. */
const ACTION_BOARD_STATUSES: ActionStatus[] = [
  'Work-In Progress',
  'On-Hold',
  'Observation',
  'Overdue',
  'Completed',
];

const actionBoardAccent: Record<ActionStatus, string> = {
  'Work-In Progress': 'bg-brand',
  'On-Hold': 'bg-warning',
  Observation: 'bg-secondary',
  Overdue: 'bg-destructive',
  Completed: 'bg-success',
};

interface ClientHealthRow {
  clientId: string;
  clientName: string;
  cluster: string;
  lead: string;
  kpiName: string;
  channel: string;
  achieved: number;
  target: number;
  direction: 'ASC' | 'DESC';
  currency?: string;
  pathStatus: RagStatus;
  path: ClientPath;
  performanceRag: RagStatus;
  engagementRag: RagStatus;
  attainment: number | null;
}

const PATH_RANK: Record<ClientPath, number> = { 'off-path': 0, 'no-signal': 1, 'on-path': 2 };

const KPI_PAGE_SIZE = 500;

/** Load every KPI row for a month (Firestore queries are capped; paginate past the first page). */
async function fetchAllKpisForMonth(db: Firestore, month: string): Promise<KpiData[]> {
  const results: KpiData[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | undefined;

  while (true) {
    const constraints = [
      where('month', '==', month),
      orderBy(documentId()),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(KPI_PAGE_SIZE),
    ];
    const snap = await getDocs(query(collection(db, 'kpis'), ...constraints));
    if (snap.empty) break;
    for (const d of snap.docs) {
      results.push({ id: d.id, ...(d.data() as object) } as KpiData);
    }
    if (snap.size < KPI_PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  return results;
}

/**
 * Path MTD month should follow KPI Tracker (current month when data exists),
 * not lag behind the latest spends month.
 */
async function resolveHealthKpiMonth(db: Firestore, spendsMonth: string): Promise<string> {
  const calendarMonth = format(new Date(), 'yyyy-MM');
  const calSnap = await getDocs(query(collection(db, 'kpis'), where('month', '==', calendarMonth), limit(1)));
  if (!calSnap.empty) return calendarMonth;

  const latestSnap = await getDocs(query(collection(db, 'kpis'), orderBy('month', 'desc'), limit(1)));
  const latestMonth = latestSnap.docs[0]?.data()?.month as string | undefined;
  if (latestMonth && /^\d{4}-\d{2}$/.test(latestMonth)) return latestMonth;

  return spendsMonth;
}

export default function BusinessSnapshotPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { data: userProfile } = useDoc<UserProfile>(user ? `users/${user.uid}` : null);
  
  const [mounted, setMounted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [statsWindow, setStatsWindow] = useState<any[]>([]);
  const [monthlyWindow, setMonthlyWindow] = useState<any[]>([]);
  const snapshotRef = useRef<HTMLDivElement>(null);

  // INTELLIGENCE STATE
  const [newsFeed, setNewsFeed] = useState<any[]>([]);
  const [momentumData, setMomentumData] = useState<any[]>([]);
  const [channelSpends, setChannelSpends] = useState<any[]>([]);
  const [channelSpendWeekLabel, setChannelSpendWeekLabel] = useState<string | null>(null);
  const [pipelineData, setPipelineData] = useState<any[]>([]);
  const [accountabilityPulse, setAccountabilityPulse] = useState<any[]>([]);
  const [clientHealth, setClientHealth] = useState<ClientHealthRow[]>([]);
  const [clientHealthLoading, setClientHealthLoading] = useState(false);
  const [healthCycleDate, setHealthCycleDate] = useState<string | null>(null);
  const [healthKpiMonth, setHealthKpiMonth] = useState<string | null>(null);
  const [wbrRagSummary, setWbrRagSummary] = useState({
    pGreen: 0,
    pAmber: 0,
    pRed: 0,
    eGreen: 0,
    eAmber: 0,
    eRed: 0,
  });

  useEffect(() => {
    setMounted(true);
    // Weekly/momentum: recent window
    const weeklyStart = format(subMonths(new Date(), 6), 'yyyy-MM');
    setStatsWindow([where('month', '>=', weeklyStart)]);
    // Monthly: include prior-year YTD so Annual can compare same months YoY
    const ytdCompareStart = format(new Date(new Date().getFullYear() - 1, 0, 1), 'yyyy-MM');
    setMonthlyWindow([where('month', '>=', ytdCompareStart)]);
  }, []);

  const { data: monthlySpends, loading: mLoading } = useCollection<MonthlySpend>('monthlySpends', monthlyWindow);
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
                const channel = canonicalizeChannel(s.channelVendor);
                channelTotals[channel] = (channelTotals[channel] || 0) + (s.spendsInr || 0);
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

        // 5. ACCOUNTABILITY PULSE — Kanban status board counts
        const statusCounts: Record<ActionStatus, number> = {
          'Work-In Progress': 0,
          'On-Hold': 0,
          Observation: 0,
          Overdue: 0,
          Completed: 0,
        };
        actions.forEach((a) => {
          const status = resolveActionStatus(a.status, a.dueDate);
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        const totalActions = Object.values(statusCounts).reduce((sum, n) => sum + n, 0) || 1;
        const pulse = ACTION_BOARD_STATUSES.map((status) => ({
          status,
          count: statusCounts[status] || 0,
          percent: ((statusCounts[status] || 0) / totalActions) * 100,
        }));
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

    const year = targetMonth.split('-')[0];
    const prevYear = String(Number(year) - 1);
    const throughMonth = parseInt(targetMonth.split('-')[1], 10); // e.g. 6 for June
    const isSamePeriodYtd = (monthKey: string, y: string) => {
      if (!monthKey.startsWith(`${y}-`)) return false;
      const m = parseInt(monthKey.split('-')[1], 10);
      return m >= 1 && m <= throughMonth;
    };
    // Compare YTD through the latest uploaded month vs the same months last year
    const ytdCurrRows = monthlySpends.filter(d => isSamePeriodYtd(d.month, year));
    const ytdPrevRows = monthlySpends.filter(d => isSamePeriodYtd(d.month, prevYear));
    const yearlyTotal = ytdCurrRows.reduce((a, b) => a + (b.actualSpendsInr || 0), 0);
    const prevYearlyTotal = ytdPrevRows.reduce((a, b) => a + (b.actualSpendsInr || 0), 0);
    const yShifts = calcShifts(getDetails(ytdCurrRows), getDetails(ytdPrevRows));
    const ytdThroughLabel = format(parse(targetMonth, 'yyyy-MM', new Date()), 'MMM');

    return {
      month: targetMonth,
      monthName: format(parse(targetMonth, 'yyyy-MM', new Date()), 'MMMM').toUpperCase(),
      monthlyTotal: Object.values(currMonthData.spendMap).reduce((a, b) => a + b, 0),
      prevMonthTotal: Object.values(prevMonthData.spendMap).reduce((a, b) => a + b, 0),
      mGainers: mShifts.gainers,
      mLosers: mShifts.losers,
      weeklyTotal: Object.values(currWData.spendMap).reduce((a, b) => a + b, 0),
      prevWeeklyTotal: Object.values(prevWData.spendMap).reduce((a, b) => a + b, 0),
      wGainers: wShifts.gainers,
      wLosers: wShifts.losers,
      weeklyDate: lastW,
      yearlyTotal,
      prevYearlyTotal,
      yGainers: yShifts.gainers,
      yLosers: yShifts.losers,
      ytdThroughLabel,
    };
  }, [monthlySpends, weeklySpends, mounted]);

  const { data: snapshotDoc } = useDoc<BusinessSnapshot>(stats ? `businessSnapshots/${stats.month}` : null);

  useEffect(() => {
    if (!mounted || !firestore || !stats?.month) return;

    const loadClientHealth = async () => {
      setClientHealthLoading(true);
      try {
        const looksLikeClientId = (value?: string | null, cid?: string) => {
          if (!value?.trim()) return true;
          const v = value.trim();
          if (cid && v === cid) return true;
          return /^CLID\d+$/i.test(v);
        };

        // Latest WBR cycle — prefer snapshot regenerate date, else discover from recent entries
        let cycleDate = snapshotDoc?.stats?.wbrCycleDate || '';
        if (!cycleDate) {
          const recentWbr = await getDocs(
            query(collection(firestore, 'wbrEntries'), orderBy('wbrDate', 'desc'), limit(50))
          );
          const dates = Array.from(new Set(recentWbr.docs.map((d) => d.data().wbrDate).filter(Boolean))).sort().reverse();
          cycleDate = dates[0] || '';
        }
        setHealthCycleDate(cycleDate || null);

        const kpiMonth = await resolveHealthKpiMonth(firestore, stats.month);
        setHealthKpiMonth(kpiMonth);

        const [kpiRows, clientSnap, wbrSnap] = await Promise.all([
          fetchAllKpisForMonth(firestore, kpiMonth),
          getDocs(collection(firestore, 'clients')),
          cycleDate
            ? getDocs(
                query(collection(firestore, 'wbrEntries'), where('wbrDate', '==', cycleDate), limit(500))
              )
            : Promise.resolve(null),
        ]);

        const nameById: Record<string, string> = {};
        const clusterById: Record<string, string> = {};
        const leadById: Record<string, string> = {};
        clientSnap.forEach((d) => {
          const c = d.data() as Client;
          if (c.uniqueId && c.name && !looksLikeClientId(c.name, c.uniqueId)) {
            nameById[c.uniqueId] = c.name;
          }
          if (c.uniqueId) {
            clusterById[c.uniqueId] = c.cluster || 'Unassigned';
            leadById[c.uniqueId] = c.clusterLead || '';
          }
        });

        const wbrByClient = new Map<string, WbrEntry>();
        const rag = { pGreen: 0, pAmber: 0, pRed: 0, eGreen: 0, eAmber: 0, eRed: 0 };
        (wbrSnap?.docs || []).forEach((d) => {
          const w = { id: d.id, ...(d.data() as object) } as WbrEntry;
          if (!w.clientId) return;
          wbrByClient.set(w.clientId, w);
          if (w.clientName && !looksLikeClientId(w.clientName, w.clientId)) {
            nameById[w.clientId] = w.clientName;
          }
          if (w.cluster) clusterById[w.clientId] = w.cluster;
          if (w.clusterLead) leadById[w.clientId] = w.clusterLead;

          if (w.performanceRag === 'Green') rag.pGreen += 1;
          else if (w.performanceRag === 'Amber') rag.pAmber += 1;
          else if (w.performanceRag === 'Red') rag.pRed += 1;
          if (w.engagementRag === 'Green') rag.eGreen += 1;
          else if (w.engagementRag === 'Amber') rag.eAmber += 1;
          else if (w.engagementRag === 'Red') rag.eRed += 1;
        });
        setWbrRagSummary(rag);

        // Group all KPI rows for the month by client, then roll up Primary MTD path
        const kpisByClient = new Map<string, KpiData[]>();
        kpiRows.forEach((kpi) => {
          if (!kpi.clientId) return;
          if (kpi.clientName && !looksLikeClientId(kpi.clientName, kpi.clientId)) {
            nameById[kpi.clientId] = kpi.clientName;
          }
          if (kpi.cluster) clusterById[kpi.clientId] = kpi.cluster;
          if (kpi.cduLead) leadById[kpi.clientId] = kpi.cduLead;
          const list = kpisByClient.get(kpi.clientId) || [];
          list.push(kpi);
          kpisByClient.set(kpi.clientId, list);
        });

        // Path tiles are Primary-KPI clients only (WBR-only accounts must not inflate No Signal)
        const rows: ClientHealthRow[] = Array.from(kpisByClient.entries()).flatMap(([clientId, clientKpis]) => {
          if (!selectPrimaryKpisForPath(clientKpis).length) return [];

          const rolled = clientPathFromPrimaryKpis(clientKpis);
          const kpi = rolled.representative;
          const wbr = wbrByClient.get(clientId);
          const { achieved, target, direction, pathStatus, path } = rolled;

          return [{
            clientId,
            clientName: nameById[clientId] || wbr?.clientName || kpi?.clientName || clientId,
            cluster: clusterById[clientId] || wbr?.cluster || kpi?.cluster || 'Unassigned',
            lead: leadById[clientId] || wbr?.clusterLead || kpi?.cduLead || '—',
            kpiName: kpi?.kpi || 'No primary KPI',
            channel: kpi?.channel || '—',
            achieved,
            target,
            direction,
            currency: kpi?.currency,
            pathStatus,
            path,
            performanceRag: (wbr?.performanceRag || 'N/A') as RagStatus,
            engagementRag: (wbr?.engagementRag || 'N/A') as RagStatus,
            attainment: kpi ? kpiAttainmentPct(achieved, target, direction) : null,
          }];
        });

        rows.sort((a, b) => {
          const pathDiff = PATH_RANK[a.path] - PATH_RANK[b.path];
          if (pathDiff !== 0) return pathDiff;
          return a.clientName.localeCompare(b.clientName);
        });

        setClientHealth(rows);
      } catch (err) {
        console.error('Client health load failed:', err);
        setClientHealth([]);
        setWbrRagSummary({ pGreen: 0, pAmber: 0, pRed: 0, eGreen: 0, eAmber: 0, eRed: 0 });
        setHealthKpiMonth(null);
      } finally {
        setClientHealthLoading(false);
      }
    };

    loadClientHealth();
  }, [mounted, firestore, stats?.month, snapshotDoc?.stats?.wbrCycleDate]);

  const clientHealthSummary = useMemo(() => {
    const summary = {
      onPath: 0,
      offPath: 0,
      noSignal: 0,
      ...wbrRagSummary,
    };
    clientHealth.forEach((row) => {
      if (row.path === 'on-path') summary.onPath += 1;
      else if (row.path === 'off-path') summary.offPath += 1;
      else summary.noSignal += 1;
    });
    return summary;
  }, [clientHealth, wbrRagSummary]);

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
                              <span className="text-secondary">{stage.value} OPPORTUNITIES</span>
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

              {/* Card 3: Accountability Pulse (Action Kanban Status) */}
              <Link
                href="/dashboard/actions"
                aria-label="Open Action Items Kanban Board"
                className="bg-white p-10 flex flex-col space-y-8 min-h-[500px] group cursor-pointer transition-colors hover:bg-cream/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
              >
                  <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">ACCOUNTABILITY PULSE</p>
                          <h3 className="text-2xl font-black tracking-tighter uppercase">Action Board</h3>
                      </div>
                      <ArrowUpRight className="h-5 w-5 text-secondary shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand" weight="bold" />
                  </div>
                  <div className="flex-1 space-y-5 pt-2">
                      {accountabilityPulse.some((item: any) => item.count > 0) ? accountabilityPulse.map((item: any) => (
                        <div key={item.status} className="space-y-2">
                           <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase">
                              <span className="tracking-widest truncate">{item.status}</span>
                              <span className={cn(
                                "shrink-0 tabular-nums",
                                item.status === 'Overdue' && item.count > 0 ? "text-destructive" : "text-secondary"
                              )}>
                                {item.count}
                              </span>
                           </div>
                           <div className="h-2 bg-foreground/[0.04] overflow-hidden">
                              <div
                                className={cn("h-full transition-all", actionBoardAccent[item.status as ActionStatus] || 'bg-brand')}
                                style={{ width: `${Math.max(item.percent, item.count > 0 ? 4 : 0)}%` }}
                              />
                           </div>
                        </div>
                      )) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                          <CheckCircle2 className="h-10 w-10 text-success/20" weight="bold" />
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-30">No action items yet</p>
                        </div>
                      )}
                  </div>
                  <div className="pt-6 border-t border-foreground/5 grid grid-cols-2 gap-x-3 gap-y-2">
                     {ACTION_BOARD_STATUSES.map((status) => (
                       <div key={status} className="flex items-center gap-1.5 min-w-0">
                          <div className={cn("h-2 w-2 shrink-0", actionBoardAccent[status])} />
                          <span className="text-[8px] font-black uppercase text-secondary tracking-widest truncate">{status}</span>
                       </div>
                     ))}
                  </div>
              </Link>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-3 px-1"><Globe className="h-5 w-5 text-brand" /><h2 className="text-sm font-black uppercase tracking-[0.2em] text-secondary">Spends Insights</h2></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-ink border border-ink min-w-0">
                <SnapshotWidget
                  title={`ANNUAL SPENDS YTD (${stats.month.split('-')[0]} · JAN–${stats.ytdThroughLabel.toUpperCase()})`}
                  value={formatCurrency(stats.yearlyTotal)}
                  variance={stats.prevYearlyTotal > 0 ? ((stats.yearlyTotal - stats.prevYearlyTotal) / stats.prevYearlyTotal) * 100 : 0}
                  varianceAmount={stats.prevYearlyTotal > 0 ? stats.yearlyTotal - stats.prevYearlyTotal : undefined}
                  varianceLabel={stats.prevYearlyTotal > 0 ? "YTD YOY" : "YTD TOTAL"}
                  gainers={stats.yGainers}
                  losers={stats.yLosers}
                />
                <SnapshotWidget
                  title={`${stats.monthName} SPENDS`}
                  value={formatCurrency(stats.monthlyTotal)}
                  variance={stats.prevMonthTotal > 0 ? ((stats.monthlyTotal - stats.prevMonthTotal) / stats.prevMonthTotal) * 100 : 0}
                  varianceAmount={stats.monthlyTotal - stats.prevMonthTotal}
                  varianceLabel="MOM"
                  gainers={stats.mGainers}
                  losers={stats.mLosers}
                />
                <SnapshotWidget
                  title={`WEEKLY PULSE (${stats.weeklyDate})`}
                  value={formatCurrency(stats.weeklyTotal)}
                  variance={stats.prevWeeklyTotal > 0 ? ((stats.weeklyTotal - stats.prevWeeklyTotal) / stats.prevWeeklyTotal) * 100 : 0}
                  varianceAmount={stats.weeklyTotal - stats.prevWeeklyTotal}
                  varianceLabel="WOW"
                  gainers={stats.wGainers}
                  losers={stats.wLosers}
                />
            </div>
          </div>

          {/* Portfolio client health — Primary KPI path + weekly WBR RAGs */}
          <div className="bg-white border border-ink space-y-0 overflow-hidden">
            <div className="bg-cream px-8 py-8 md:px-10 border-b border-ink flex flex-wrap items-end justify-between gap-6">
              <div className="space-y-2 min-w-0">
                <p className="terminal-overline">Portfolio Intelligence</p>
                <h3 className="text-3xl md:text-4xl font-black tracking-tighter uppercase">Client Health Board</h3>
                <p className="text-[11px] font-medium text-secondary max-w-xl">
                  Designated Primary KPI MTD sets the path (same formula as KPI Tracker). Performance &amp; Engagement RAG reflect the current WBR week.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {clientHealthLoading && (
                  <div className="flex items-center gap-2 text-[9px] font-black text-secondary uppercase tracking-widest">
                    <CircleNotch className="h-3.5 w-3.5 animate-spin text-brand" />
                    Syncing…
                  </div>
                )}
                {healthCycleDate && (
                  <div className="flex items-center gap-2 text-[9px] font-black text-secondary uppercase tracking-widest bg-white px-3 py-1.5 border border-ink/10">
                    <Calendar className="h-3.5 w-3.5" />
                    WBR Cycle:{' '}
                    {(() => {
                      try {
                        const d = parse(healthCycleDate, 'yyyy-MM-dd', new Date());
                        return isValid(d) ? format(d, 'dd MMM yyyy') : healthCycleDate;
                      } catch {
                        return healthCycleDate;
                      }
                    })()}
                  </div>
                )}
                {healthKpiMonth && (
                  <div className="text-[9px] font-black text-secondary uppercase tracking-widest bg-white px-3 py-1.5 border border-ink/10">
                    KPI Month: {format(parse(healthKpiMonth, 'yyyy-MM', new Date()), 'MMM yyyy').toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-ink border-b border-ink">
              <PathSummaryTile
                label="On Path"
                hint="Primary KPI on target"
                count={clientHealthSummary.onPath}
                tone="success"
                href={healthKpiMonth ? `/dashboard/kpi-tracking?primary=1&path=on&month=${healthKpiMonth}` : '/dashboard/kpi-tracking?primary=1&path=on'}
              />
              <PathSummaryTile
                label="Off Path"
                hint="Primary KPI behind target"
                count={clientHealthSummary.offPath}
                tone="destructive"
                href={healthKpiMonth ? `/dashboard/kpi-tracking?primary=1&path=off&month=${healthKpiMonth}` : '/dashboard/kpi-tracking?primary=1&path=off'}
              />
              <PathSummaryTile
                label="No Signal"
                hint="Primary KPI MTD N/A"
                count={clientHealthSummary.noSignal}
                tone="secondary"
                href={healthKpiMonth ? `/dashboard/kpi-tracking?primary=1&path=none&month=${healthKpiMonth}` : '/dashboard/kpi-tracking?primary=1&path=none'}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-ink">
              <RagSummaryStrip
                title="Performance RAG · This Week"
                green={clientHealthSummary.pGreen}
                amber={clientHealthSummary.pAmber}
                red={clientHealthSummary.pRed}
                baseHref={healthCycleDate ? `/dashboard/wbr?date=${healthCycleDate}` : '/dashboard/wbr'}
                ragParam="perfRag"
              />
              <RagSummaryStrip
                title="Engagement RAG · This Week"
                green={clientHealthSummary.eGreen}
                amber={clientHealthSummary.eAmber}
                red={clientHealthSummary.eRed}
                baseHref={healthCycleDate ? `/dashboard/wbr?date=${healthCycleDate}` : '/dashboard/wbr'}
                ragParam="engagementRag"
              />
            </div>
          </div>

          <SupportPulse />
        </div>
      )}
    </div>
  );
}

function PathSummaryTile({
  label,
  hint,
  count,
  tone,
  href,
}: {
  label: string;
  hint: string;
  count: number;
  tone: 'success' | 'destructive' | 'secondary';
  href: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white p-8 space-y-3 group transition-colors hover:bg-cream/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">{label}</p>
        <ArrowUpRight className="h-4 w-4 text-secondary/40 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand" weight="bold" />
      </div>
      <p
        className={cn(
          'text-5xl font-black font-headline tracking-tighter',
          tone === 'success' && 'text-success',
          tone === 'destructive' && 'text-destructive',
          tone === 'secondary' && 'text-secondary'
        )}
      >
        {count}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-secondary/70">{hint}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-brand/70 opacity-0 group-hover:opacity-100 transition-opacity">
        Open KPI Tracker →
      </p>
    </Link>
  );
}

function RagSummaryStrip({
  title,
  green,
  amber,
  red,
  baseHref,
  ragParam,
}: {
  title: string;
  green: number;
  amber: number;
  red: number;
  baseHref: string;
  ragParam: 'perfRag' | 'engagementRag';
}) {
  const total = Math.max(green + amber + red, 1);
  const join = baseHref.includes('?') ? '&' : '?';
  return (
    <div className="bg-white p-6 md:p-8 space-y-4">
      <Link
        href={baseHref}
        className="flex items-center justify-between gap-3 group focus-visible:outline-none"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary group-hover:text-brand transition-colors">{title}</p>
        <ArrowUpRight className="h-4 w-4 text-secondary/40 group-hover:text-brand transition-colors" weight="bold" />
      </Link>
      <Link href={baseHref} className="flex h-3 w-full overflow-hidden bg-foreground/[0.04] hover:opacity-90 transition-opacity">
        <div className="bg-success h-full" style={{ width: `${(green / total) * 100}%` }} />
        <div className="bg-warning h-full" style={{ width: `${(amber / total) * 100}%` }} />
        <div className="bg-destructive h-full" style={{ width: `${(red / total) * 100}%` }} />
      </Link>
      <div className="flex flex-wrap gap-4 text-[10px] font-black uppercase tracking-widest">
        <Link href={`${baseHref}${join}${ragParam}=Green`} className="text-success hover:underline underline-offset-4">
          {green} Green
        </Link>
        <Link href={`${baseHref}${join}${ragParam}=Amber`} className="text-warning hover:underline underline-offset-4">
          {amber} Amber
        </Link>
        <Link href={`${baseHref}${join}${ragParam}=Red`} className="text-destructive hover:underline underline-offset-4">
          {red} Red
        </Link>
      </div>
    </div>
  );
}

function SnapshotWidget({
  title,
  value,
  variance,
  varianceAmount,
  varianceLabel,
  gainers,
  losers,
}: {
  title: string;
  value: string;
  variance: number;
  varianceAmount?: number;
  varianceLabel: string;
  gainers: PerformanceShift[];
  losers: PerformanceShift[];
}) {
  const isUp = variance > 0 || (varianceAmount != null && varianceAmount > 0);
  const isDown = variance < 0 || (varianceAmount != null && varianceAmount < 0);
  const amountPrefix = varianceAmount != null && varianceAmount > 0 ? '+' : '';

  return (
    <div className="bg-white p-5 md:p-6 xl:p-8 flex flex-col h-full min-w-0 overflow-hidden">
      <div className="space-y-3 mb-6 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-brand leading-snug break-words">
          {title}
        </p>
        <div className="space-y-2 min-w-0">
            <div
              className="text-3xl md:text-4xl xl:text-[2.75rem] font-black font-headline tracking-tighter text-ink leading-[1.05] py-0.5 break-all"
              title={value}
            >
              {value}
            </div>
            <div className={cn(
              "flex flex-wrap items-center gap-1.5 font-mono text-[10px] font-black uppercase relative z-10",
              isDown ? "text-destructive" : "text-success"
            )}>
              {isUp ? <ArrowUpRight className="h-3 w-3 shrink-0" /> : isDown ? <ArrowDownRight className="h-3 w-3 shrink-0" /> : null}
              {varianceAmount != null && (
                <span className="break-all">{amountPrefix}{formatCurrency(varianceAmount)}</span>
              )}
              {varianceAmount != null && <span className="opacity-40">·</span>}
              <span>{Math.abs(variance).toFixed(1)}%</span>
              <span>{varianceLabel}</span>
            </div>
        </div>
      </div>
      <Separator className="bg-ink/5 mb-6" />
      <div className="flex-1 grid grid-cols-2 gap-4 min-w-0">
            <div className="space-y-3 min-w-0">
              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-success">
                <ArrowUp className="h-3 w-3 shrink-0" /> TOP 3 GAINERS
              </span>
              <div className="space-y-4">
                {gainers && gainers.length > 0 ? gainers.map((g, i) => (
                  <div key={i} className="space-y-1 min-w-0">
                    <p className="text-[12px] font-black text-ink leading-tight truncate uppercase tracking-tight" title={g.brand}>{g.brand}</p>
                    <p className="text-[8px] font-bold text-secondary uppercase truncate">{g.type}</p>
                    <p className="text-[10px] font-black leading-none flex items-center justify-between gap-1 text-success min-w-0">
                      <span className="truncate">+{formatCurrency(g.amount || 0)}</span>
                      <span className="opacity-60 text-[8px] shrink-0">({g.variance.toFixed(1)}%)</span>
                    </p>
                  </div>
                )) : <p className="text-[10px] font-bold text-secondary/20 italic">No significant gains</p>}
              </div>
            </div>
            <div className="space-y-3 min-w-0">
              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-destructive">
                <ArrowDown className="h-3 w-3 shrink-0" /> TOP 3 LOSERS
              </span>
              <div className="space-y-4">
                {losers && losers.length > 0 ? losers.map((l, i) => (
                  <div key={i} className="space-y-1 min-w-0">
                    <p className="text-[12px] font-black text-ink leading-tight truncate uppercase tracking-tight" title={l.brand}>{l.brand}</p>
                    <p className="text-[8px] font-bold text-secondary uppercase truncate">{l.type}</p>
                    <p className="text-[10px] font-black leading-none flex items-center justify-between gap-1 text-destructive min-w-0">
                      <span className="truncate">{formatCurrency(l.amount || 0)}</span>
                      <span className="opacity-60 text-[8px] shrink-0">({l.variance.toFixed(1)}%)</span>
                    </p>
                  </div>
                )) : <p className="text-[10px] font-bold text-secondary/20 italic">No significant losses</p>}
              </div>
            </div>
      </div>
    </div>
  );
}

function CheckCircle2({ className, weight }: { className?: string, weight?: "bold" | "fill" | "duotone" | "light" | "thin" | "regular" }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={weight === 'bold' ? "3" : "2"} strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>;
}
