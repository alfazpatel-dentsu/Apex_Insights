
'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { 
  Search, 
  Loader2, 
  CalendarDays, 
  FileSpreadsheet, 
  ChevronLeft, 
  ChevronRight, 
  ArrowRight,
  Lock,
  Unlock,
  Zap,
  Trophy,
  ShieldAlert
} from 'lucide-react';
import { format, startOfWeek, addDays, isAfter, isBefore, endOfDay, startOfDay, subWeeks, addWeeks, subMonths, parse, isValid } from 'date-fns';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { useCollection, useUser, useDoc } from '@/firebase';
import { Client, WbrEntry, UserProfile, KpiData } from '@/lib/types';
import { isPrimaryKpiType, meetsTarget, parseKpiDirection } from '@/lib/kpi-rag';
import { PageHeader } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { where } from 'firebase/firestore';
import { SendMomButton } from './send-mom-dialog';

const RAG_COLORS = {
  Green: 'bg-success text-success-foreground hover:bg-success/80',
  Amber: 'bg-warning text-warning-foreground hover:bg-warning/80',
  Red: 'bg-destructive text-destructive-foreground hover:bg-destructive/80',
  'N/A': 'bg-muted text-muted-foreground'
};

export default function WbrPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center p-20"><Loader2 className="animate-spin h-8 w-8 text-primary/40" /></div>}>
      <WbrPageContent />
    </Suspense>
  );
}

function WbrPageContent() {
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { data: userProfile } = useDoc<UserProfile>(user ? `users/${user.uid}` : null);
  
  const [mounted, setMounted] = useState(false);
  const [currentWbrDate, setCurrentWbrDate] = useState<Date | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string>('all');
  const [selectedLead, setSelectedLead] = useState<string>('all');
  const [selectedManager, setSelectedManager] = useState<string>('all');
  const [selectedPartner, setSelectedPartner] = useState<string>('all');
  const [selectedEngagementRag, setSelectedEngagementRag] = useState<string>(() => searchParams.get('engagementRag') || 'all');
  const [selectedPerfRag, setSelectedPerfRag] = useState<string>(() => searchParams.get('perfRag') || 'all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setMounted(true);
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const parsed = parse(dateParam, 'yyyy-MM-dd', new Date());
      if (isValid(parsed)) {
        setCurrentWbrDate(parsed);
        return;
      }
    }
    const today = new Date();
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    setCurrentWbrDate(addDays(monday, 1));
  }, [searchParams]);

  const { data: explicitClients, loading: clientsLoading } = useCollection<Client>('clients');
  
  // OPTIMIZATION RITUAL: Only fetch recent KPIs for discovery to prevent loading thousands of records
  const kpiDiscoveryConstraints = useMemo(() => [
    where('month', '>=', format(subMonths(currentWbrDate || new Date(), 2), 'yyyy-MM')),
    where('month', '<=', format(currentWbrDate || new Date(), 'yyyy-MM')),
  ], [currentWbrDate]);
  const { data: kpiRecords } = useCollection<KpiData>('kpis', kpiDiscoveryConstraints);
  
  const wbrConstraints = useMemo(() => {
    if (!currentWbrDate) return [null];
    return [
      where('wbrDate', '>=', format(subWeeks(currentWbrDate, 2), 'yyyy-MM-dd')),
      where('wbrDate', '<=', format(currentWbrDate, 'yyyy-MM-dd')),
    ];
  }, [currentWbrDate]);

  const { data: wbrEntries, loading: wbrLoading } = useCollection<WbrEntry>('wbrEntries', wbrConstraints);

  const allClients = useMemo(() => {
    const uniqueList: Client[] = [];
    const seenIds = new Set<string>();
    if (explicitClients) {
      explicitClients.forEach(c => {
        const uid = c.uniqueId?.toString();
        if (uid && !seenIds.has(uid)) { uniqueList.push(c); seenIds.add(uid); }
      });
    }
    if (kpiRecords) {
      kpiRecords.forEach(k => {
        const uid = k.clientId?.toString();
        if (uid && !seenIds.has(uid)) {
          uniqueList.push({ id: `discovered_${uid}`, uniqueId: uid, name: k.clientName, cluster: k.cluster || 'Unassigned', clusterLead: k.cduLead || 'No Lead', emcsm: k.emCsm || 'N/A', subEntity: k.lob || 'General' } as Client);
          seenIds.add(uid);
        }
      });
    }
    return uniqueList.sort((a, b) => a.name.localeCompare(b.name));
  }, [explicitClients, kpiRecords]);

  const isWindowOpen = useMemo(() => {
    if (!mounted || !currentWbrDate) return false;
    const today = new Date();
    const monday = startOfWeek(currentWbrDate, { weekStartsOn: 1 });
    const windowStart = startOfDay(monday);
    const windowEnd = endOfDay(addDays(monday, 1));
    return isAfter(today, windowStart) && isBefore(today, windowEnd);
  }, [currentWbrDate, mounted]);

  const clusters = useMemo(() => Array.from(new Set(allClients.map(c => c.cluster).filter(Boolean) || [])).sort(), [allClients]);
  const leads = useMemo(() => Array.from(new Set(allClients.map(c => c.clusterLead).filter(Boolean) || [])).sort(), [allClients]);
  const managers = useMemo(() => {
    const fromClients = allClients.map(c => c.emcsm);
    const fromEntries = (wbrEntries || []).map(e => e.emcsm);
    return Array.from(new Set([...fromClients, ...fromEntries].filter((v): v is string => !!v && v !== 'N/A'))).sort();
  }, [allClients, wbrEntries]);
  const partners = useMemo(() => {
    const fromClients = allClients.map(c => c.clientPartner);
    const fromEntries = (wbrEntries || []).map(e => e.clientPartner);
    return Array.from(new Set([...fromClients, ...fromEntries].filter((v): v is string => !!v && v !== 'N/A'))).sort();
  }, [allClients, wbrEntries]);

  const filteredClients = useMemo(() => {
    return allClients.filter(client => {
      const entry = wbrEntries?.find(e => e.clientId === client.uniqueId);
      const q = search.toLowerCase();
      const searchMatch = !search || client.name.toLowerCase().includes(q) || client.uniqueId.toLowerCase().includes(q);
      const clusterMatch = selectedCluster === 'all' || client.cluster === selectedCluster;
      const leadMatch = selectedLead === 'all' || client.clusterLead === selectedLead;
      const managerMatch = selectedManager === 'all' || client.emcsm === selectedManager || entry?.emcsm === selectedManager;
      const partnerMatch = selectedPartner === 'all' || client.clientPartner === selectedPartner || entry?.clientPartner === selectedPartner;
      const eRagMatch = selectedEngagementRag === 'all' || entry?.engagementRag === selectedEngagementRag;
      const pRagMatch = selectedPerfRag === 'all' || entry?.performanceRag === selectedPerfRag;
      return searchMatch && clusterMatch && leadMatch && managerMatch && partnerMatch && eRagMatch && pRagMatch;
    });
  }, [allClients, wbrEntries, search, selectedCluster, selectedLead, selectedManager, selectedPartner, selectedEngagementRag, selectedPerfRag]);

  const latestKpiMonths = useMemo(() => {
    return Array.from(new Set((kpiRecords || []).map((record) => record.month).filter(Boolean)))
      .sort()
      .slice(-2);
  }, [kpiRecords]);

  const clientCategories = useMemo(() => {
    const entriesByClient = new Map<string, WbrEntry[]>();
    (wbrEntries || []).forEach((entry) => {
      const entries = entriesByClient.get(entry.clientId) || [];
      entries.push(entry);
      entriesByClient.set(entry.clientId, entries);
    });

    const kpisByClient = new Map<string, KpiData[]>();
    (kpiRecords || []).forEach((record) => {
      const records = kpisByClient.get(record.clientId) || [];
      records.push(record);
      kpisByClient.set(record.clientId, records);
    });

    const categories = new Map<string, 'top' | 'alert' | 'rest'>();
    allClients.forEach((client) => {
      const entries = (entriesByClient.get(client.uniqueId) || [])
        .sort((a, b) => String(b.wbrDate || '').localeCompare(String(a.wbrDate || '')))
        .slice(0, 3);
      const topRag = entries.length === 3 &&
        entries.every((entry) => entry.engagementRag === 'Green') &&
        entries.every((entry) => entry.performanceRag === 'Green');
      const alertRag = entries.length === 2 &&
        entries.every((entry) =>
          [entry.engagementRag, entry.performanceRag].some((rag) => rag === 'Red' || rag === 'Amber')
        );

      const primaryKpis = (kpisByClient.get(client.uniqueId) || []).filter(
        (record) => isPrimaryKpiType(record.kpiType) && latestKpiMonths.includes(record.month)
      );
      const kpisByMonth = new Map<string, KpiData[]>();
      primaryKpis.forEach((record) => {
        const monthRecords = kpisByMonth.get(record.month) || [];
        monthRecords.push(record);
        kpisByMonth.set(record.month, monthRecords);
      });
      const latestKpiMonth = latestKpiMonths[latestKpiMonths.length - 1];
      const hasBothKpiMonths = latestKpiMonths.length === 2 &&
        latestKpiMonths.every((month) => (kpisByMonth.get(month) || []).length > 0);
      const hasLatestKpiMonth = !!latestKpiMonth && (kpisByMonth.get(latestKpiMonth) || []).length > 0;
      const achievedAllKpis = hasBothKpiMonths && primaryKpis.every((record) =>
        meetsTarget(
          record.achievedMonthTillYesterday,
          record.targetMonth,
          parseKpiDirection(record.direction, record.kpi)
        )
      );
      const missedAnyKpi = hasLatestKpiMonth && primaryKpis.some((record) =>
        !meetsTarget(
          record.achievedMonthTillYesterday,
          record.targetMonth,
          parseKpiDirection(record.direction, record.kpi)
        )
      );

      categories.set(client.uniqueId, topRag && achievedAllKpis ? 'top' : alertRag && missedAnyKpi ? 'alert' : 'rest');
    });
    return categories;
  }, [allClients, kpiRecords, latestKpiMonths, wbrEntries]);

  const categorizedClients = useMemo(() => {
    const groups = { top: [] as Client[], alert: [] as Client[], rest: [] as Client[] };
    filteredClients.forEach((client) => groups[clientCategories.get(client.uniqueId) || 'rest'].push(client));
    return groups;
  }, [clientCategories, filteredClients]);

  const handleExport = async () => {
    if (!allClients.length || !currentWbrDate) return;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`WBR_${format(currentWbrDate, 'yyyy-MM-dd')}`);
    worksheet.columns = [
      { header: 'Unique ID', key: 'uniqueId', width: 15 }, { header: 'Client Name', key: 'name', width: 25 }, { header: 'Cluster', key: 'cluster', width: 15 }, { header: 'Lead', key: 'clusterLead', width: 20 }, { header: 'Manager', key: 'emcsm', width: 20 }, { header: 'Contract Status', key: 'contractStatus', width: 15 }, { header: 'Finance Issues', key: 'financeIssues', width: 30 }, { header: 'Engagement RAG', key: 'engagementRag', width: 15 }, { header: 'Performance RAG', key: 'performanceRag', width: 15 }, { header: 'Performance Summary', key: 'performanceSummary', width: 40 }, { header: 'Summary', key: 'summary', width: 40 },
    ];
    worksheet.getRow(1).font = { bold: true };
    filteredClients.forEach(client => {
      const entry = wbrEntries?.find(e => e.clientId === client.uniqueId);
      worksheet.addRow({ uniqueId: client.uniqueId, name: client.name, cluster: client.cluster, clusterLead: client.clusterLead, emcsm: client.emcsm || entry?.emcsm || '', clientPartner: client.clientPartner || entry?.clientPartner || '', contractStatus: entry?.contractStatus || 'N/A', financeIssues: entry?.financeIssues || '', engagementRag: entry?.engagementRag || 'N/A', performanceRag: entry?.performanceRag || 'N/A', performanceSummary: entry?.performanceSummary || '', summary: entry?.summary || '' });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Aztec_WBR_Export_${format(currentWbrDate, 'yyyy-MM-dd')}.xlsx`);
  };

  if (!mounted || !currentWbrDate) return <div className="flex flex-1 items-center justify-center p-20"><Loader2 className="animate-spin h-8 w-8 text-primary/40" /></div>;

  const isLoading = clientsLoading || wbrLoading;

  return (
    <div className="flex flex-1 flex-col gap-8 pb-10">
      <PageHeader title="WEEKLY WBR" description="Collaborative workspace for account engagement and risk review.">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-none bg-white/40 dark:bg-white/5 p-2 backdrop-blur-md shadow-inner border border-white/20">
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-none" onClick={() => setCurrentWbrDate(subWeeks(currentWbrDate, 1))}><ChevronLeft className="h-5 w-5" /></Button>
            <div className="px-6 font-black text-sm uppercase tracking-widest text-foreground min-w-[180px] text-center flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />{format(currentWbrDate, "dd MMM yyyy")}</div>
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-none" onClick={() => setCurrentWbrDate(addWeeks(currentWbrDate, 1))}><ChevronRight className="h-5 w-5" /></Button>
          </div>
          <SendMomButton wbrDate={currentWbrDate} />
          <Button variant="outline" className="h-14 px-6 rounded-3xl glass gap-2 font-bold shadow-lg" onClick={handleExport}><FileSpreadsheet className="h-5 w-5 text-primary" /> Export</Button>
          <div className={cn("flex items-center gap-2 px-6 h-14 rounded-3xl border shadow-lg", isWindowOpen ? "bg-success/10 border-success/20 text-success" : "bg-destructive/10 border-destructive/20 text-destructive")}>{isWindowOpen ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}<span className="text-xs font-black uppercase tracking-widest">{isWindowOpen ? 'Edit Window Open' : 'Historical Lock Active'}</span></div>
        </div>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-4 bg-white/30 dark:bg-black/20 p-4 rounded-none backdrop-blur-3xl border border-white/10 "><div className="relative flex-1 min-w-[200px]"><Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" /><Input placeholder="Search account name..." className="pl-12 rounded-none glass h-12 text-sm shadow-inner" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <FilterGroup label="Cluster" value={selectedCluster} onChange={setSelectedCluster} options={clusters} />
        <FilterGroup label="Lead" value={selectedLead} onChange={setSelectedLead} options={leads} />
        <FilterGroup label="EM / CSM Manager" value={selectedManager} onChange={setSelectedManager} options={managers} />
        <FilterGroup label="Client Partner" value={selectedPartner} onChange={setSelectedPartner} options={partners} />
        <FilterGroup label="Engagement" value={selectedEngagementRag} onChange={setSelectedEngagementRag} options={['Green', 'Amber', 'Red']} isRag />
        <FilterGroup label="Risk" value={selectedPerfRag} onChange={setSelectedPerfRag} options={['Green', 'Amber', 'Red']} isRag />
        <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setSelectedCluster('all'); setSelectedLead('all'); setSelectedManager('all'); setSelectedPartner('all'); setSelectedEngagementRag('all'); setSelectedPerfRag('all'); }} className="text-[10px] font-black uppercase tracking-widest text-destructive">Reset</Button>
      </div>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 md:p-16 gap-4"><Loader2 className="animate-spin h-10 w-10 text-primary/40" /><span className="text-xs font-black uppercase tracking-widest text-secondary">Loading weekly reviews…</span></div>
      ) : filteredClients.length > 0 ? (
        <div className="space-y-10 animate-in fade-in duration-700">
          {([
            ['top', 'TOP PERFORMING CLIENTS', 'Clients with three weeks of green RAGs and all primary KPIs achieved for the past two months.'],
            ['alert', 'HIGH ALERT CLIENTS', 'Clients with two weeks where either RAG is amber/red and any primary KPI target missed in the latest month.'],
            ['rest', 'OTHER CLIENTS', 'Clients outside the top-performing and high-alert criteria.'],
          ] as const).map(([category, title, description]) => {
            const clients = categorizedClients[category];
            if (!clients.length) return null;
            return (
              <section key={category} aria-labelledby={`wbr-${category}-heading`}>
                <div className="mb-4">
                  <h2 id={`wbr-${category}-heading`} className="text-lg font-black uppercase tracking-tight font-headline">{title}</h2>
                  <p className="text-xs text-secondary mt-1">{description}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {clients.map((client) => {
                    const href = `/dashboard/wbr/${client.uniqueId}?date=${format(currentWbrDate, 'yyyy-MM-dd')}`;
                    return <WbrClientCard key={client.uniqueId} client={client} entry={wbrEntries?.find(e => e.clientId === client.uniqueId && e.wbrDate === format(currentWbrDate, 'yyyy-MM-dd'))} href={href} category={category} />;
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (<div className="flex flex-col items-center justify-center p-12 md:p-16 glass-card border-dashed"><Zap className="h-12 w-12 text-primary/20 mb-4" /><h3 className="text-xl font-bold font-headline">No Accounts Found</h3><p className="text-sm text-muted-foreground">Adjust filters or ensure KPI records are being synchronized.</p></div>)}
    </div>
  );
}

function FilterGroup({ label, value, onChange, options, isRag }: { label: string, value: string, onChange: (v: string) => void, options: string[], isRag?: boolean }) {
  return (
    <div className="flex items-center gap-2 bg-white/40 dark:bg-white/5 rounded-none p-1 px-4 backdrop-blur-md shadow-inner border border-white/20"><span className="text-[10px] font-black uppercase tracking-widest text-secondary whitespace-nowrap">{label}:</span><Select value={value} onValueChange={onChange}><SelectTrigger className="h-8 min-w-[80px] max-w-[180px] border-none bg-transparent shadow-none text-[10px] font-black uppercase p-0 focus:ring-0"><SelectValue /></SelectTrigger><SelectContent className="rounded-none glass "><SelectItem value="all" className="text-[10px] font-bold">ALL</SelectItem>{options.map(opt => (<SelectItem key={opt} value={opt} className={cn("text-[10px] font-bold uppercase", isRag && opt === 'Red' && 'text-destructive', isRag && opt === 'Green' && 'text-success', isRag && opt === 'Amber' && 'text-warning')}>{opt}</SelectItem>))}</SelectContent></Select></div>
  );
}

function WbrClientCard({ client, entry, href, category }: { client: Client, entry?: WbrEntry, href: string, category: 'top' | 'alert' | 'rest' }) {
  return (
    <Link href={href} className="block">
    <Card className="glass-card cursor-pointer transition-all duration-500 hover:-translate-y-2 hover: group overflow-hidden relative"><div className="absolute top-0 right-0 p-5 opacity-0 group-hover:opacity-100 transition-opacity"><div className="h-10 w-10 rounded-none bg-primary/10 flex items-center justify-center text-primary"><ArrowRight className="h-5 w-5" /></div></div>
      <CardHeader className="pb-4"><div className="flex flex-col items-start gap-1">{category === 'top' ? <Badge className="h-6 gap-1 rounded-md bg-success text-[9px] font-black uppercase text-success-foreground"><Trophy className="h-3 w-3" /> Top Performer</Badge> : category === 'alert' ? <Badge className="h-6 gap-1 rounded-md bg-destructive text-[9px] font-black uppercase text-destructive-foreground"><ShieldAlert className="h-3 w-3" /> High Alert</Badge> : null}<span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">{client.uniqueId}</span><CardTitle className="text-xl font-black font-headline truncate leading-tight">{client.name}</CardTitle><div className="flex items-center gap-2 mt-2"><Badge className={cn("text-[9px] font-black uppercase h-5 rounded-md", RAG_COLORS[entry?.engagementRag || 'N/A'])}>E: {entry?.engagementRag || 'N/A'}</Badge><Badge className={cn("text-[9px] font-black uppercase h-5 rounded-md", RAG_COLORS[entry?.performanceRag || 'N/A'])}>P: {entry?.performanceRag || 'N/A'}</Badge></div></div></CardHeader>
      <CardContent className="space-y-4"><div className="h-[1px] bg-foreground/5" /><div className="grid grid-cols-2 gap-4"><div className="space-y-1"><span className="text-[8px] font-black uppercase text-secondary">Contract</span><span className={cn("block text-[10px] font-bold", entry?.contractStatus === 'Expired' && 'text-destructive', entry?.contractStatus === 'Negotiation' && 'text-warning')}>{entry?.contractStatus || 'N/A'}</span></div><div className="space-y-1"><span className="text-[8px] font-black uppercase text-secondary">Billing</span><span className="block text-[10px] font-bold truncate">{entry?.financeIssues ? 'Issue Reported' : 'Clear'}</span></div></div><div className="pt-2"><span className="text-[8px] font-black uppercase text-secondary block mb-1">Strategic Summary</span><p className="text-[11px] leading-relaxed line-clamp-2 font-medium opacity-70 italic">{entry?.summary || 'No review entry for this week.'}</p></div></CardContent>
    </Card>
    </Link>
  );
}
