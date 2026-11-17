'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, parse, startOfWeek, subWeeks } from 'date-fns';
import {
  collection,
  doc,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  where,
  type DocumentData,
  type Firestore,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { ChartBar, CircleNotch, FileText, Sparkle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useDoc, useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { canonicalizeChannel, resolveActionStatus } from '@/lib/normalize';
import { getActiveAgency, getCollectionPath } from '@/lib/agencies';
import { coerceKpiNumber, isPrimaryKpiType, parseKpiDirection } from '@/lib/kpi-rag';
import { toSpendNumber } from '@/lib/spend-week';
import { exportToPdf } from '@/lib/pdf-export';
import { spendWeekStartKey } from '@/lib/spend-week';
import type {
  ActionItem,
  ExecutiveClientHealthAccount,
  ExecutiveClientHealthAction,
  ExecutiveClientHealthKpi,
  ExecutiveClientHealthReport,
  ExecutiveClientHealthWeek,
  KpiData,
  KpiWeeklyData,
  RagStatus,
  UserProfile,
  WeeklySpend,
  WbrEntry,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { generateExecutiveClientHealthSummary } from '@/ai/flows/executive-client-health-flow';

const PAGE_SIZE = 500;

async function fetchAll<T extends object>(
  db: Firestore,
  path: string,
  filters: QueryConstraint[] = []
): Promise<(T & { id: string })[]> {
  const rows: (T & { id: string })[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | undefined;

  while (true) {
    const constraints = [
      ...filters,
      orderBy(documentId()),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(PAGE_SIZE),
    ];
    const page = await getDocs(query(collection(db, path), ...constraints));
    if (page.empty) break;
    page.docs.forEach((entry) => rows.push({ id: entry.id, ...(entry.data() as T) }));
    if (page.size < PAGE_SIZE) break;
    cursor = page.docs[page.docs.length - 1];
  }

  return rows;
}

function getWeekPeriod(dateKey: string) {
  const date = parse(dateKey, 'yyyy-MM-dd', new Date());
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  const thursday = addDays(monday, 3);
  const month = format(thursday, 'yyyy-MM');
  let weekNumber = 1;
  let previousThursday = new Date(thursday);

  while (true) {
    previousThursday = subWeeks(previousThursday, 1);
    if (format(previousThursday, 'yyyy-MM') === month) weekNumber += 1;
    else break;
  }

  const sunday = addDays(monday, 6);
  return {
    month,
    weekNumber,
    weekStart: format(monday, 'yyyy-MM-dd'),
    weekEnd: format(sunday, 'yyyy-MM-dd'),
    label: `${format(monday, 'dd MMM')} - ${format(sunday, 'dd MMM yyyy')}`,
  };
}

function emptyWeek(dateKey: string): ExecutiveClientHealthWeek {
  const period = getWeekPeriod(dateKey);
  return {
    weekStartDate: period.weekStart,
    weekEndDate: period.weekEnd,
    label: period.label,
    spendsByChannel: [],
    kpis: [],
  };
}

function latestActionComment(action: ActionItem): { text: string; createdAt?: string } {
  const history = [...(action.commentHistory || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const latest = history[history.length - 1];
  return {
    text: latest?.text?.trim() || action.comment?.trim() || '',
    ...(latest?.createdAt ? { createdAt: latest.createdAt } : {}),
  };
}

function formatCurrency(value: number): string {
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absolute >= 10_000_000) return `₹${sign}${(absolute / 10_000_000).toFixed(2)} Cr`;
  if (absolute >= 100_000) return `₹${sign}${(absolute / 100_000).toFixed(2)} L`;
  return `₹${sign}${absolute.toLocaleString('en-IN')}`;
}

function isAtRisk(entry: WbrEntry): boolean {
  return ['Red', 'Amber'].includes(entry.performanceRag) || ['Red', 'Amber'].includes(entry.engagementRag);
}

function makeWeekEvidence(
  dateKey: string,
  spends: WeeklySpend[],
  kpis: KpiData[],
  weeklyKpis: KpiWeeklyData[]
): ExecutiveClientHealthWeek {
  const period = getWeekPeriod(dateKey);
  const spendByChannel = new Map<string, number>();
  spends.forEach((row) => {
    if (row.dataType === 'ORGANIC REVENUE') return;
    const channel = canonicalizeChannel(row.channelVendor);
    spendByChannel.set(channel, (spendByChannel.get(channel) || 0) + toSpendNumber(row.spendsInr));
  });

  const weeklyByKpi = new Map<string, KpiWeeklyData>();
  weeklyKpis.forEach((row) => {
    if (row.weekOfMonth === period.weekNumber) weeklyByKpi.set(row.kpiDataId, row);
  });

  const kpiRows: ExecutiveClientHealthKpi[] = kpis.flatMap((kpi) => {
    const week = weeklyByKpi.get(kpi.id);
    if (!week) return [];
    return [{
      id: kpi.id,
      channel: canonicalizeChannel(kpi.channel),
      name: kpi.kpi || 'KPI',
      lob: kpi.lob || 'General',
      kpiType: isPrimaryKpiType(kpi.kpiType) ? 'PRIMARY' : 'NON-PRIMARY',
      direction: parseKpiDirection(kpi.direction, kpi.kpi),
      target: coerceKpiNumber(week.target),
      achieved: coerceKpiNumber(week.achieved),
      ...(kpi.currency ? { unit: kpi.currency } : {}),
    }];
  });

  return {
    weekStartDate: period.weekStart,
    weekEndDate: period.weekEnd,
    label: period.label,
    spendsByChannel: Array.from(spendByChannel, ([channel, amount]) => ({ channel, amount }))
      .sort((a, b) => b.amount - a.amount),
    kpis: kpiRows.sort((a, b) =>
      a.channel.localeCompare(b.channel) ||
      a.name.localeCompare(b.name) ||
      a.lob.localeCompare(b.lob) ||
      a.kpiType.localeCompare(b.kpiType)
    ),
  };
}

function buildAction(action: ActionItem): ExecutiveClientHealthAction | null {
  const status = resolveActionStatus(action.status, action.dueDate);
  if (status === 'Completed') return null;
  const comment = latestActionComment(action);
  return {
    id: action.id,
    taskName: action.taskName || 'Untitled action',
    description: action.description || '',
    status,
    priority: action.priority || 'Medium',
    assignedTo: action.assignedTo || 'Unassigned',
    ...(action.dueDate ? { dueDate: action.dueDate } : {}),
    latestComment: comment.text,
    ...(comment.createdAt ? { latestCommentAt: comment.createdAt } : {}),
  };
}

function ragClass(rag: RagStatus) {
  if (rag === 'Red') return 'border-destructive/30 bg-destructive/10 text-destructive';
  if (rag === 'Amber') return 'border-warning/30 bg-warning/10 text-warning';
  if (rag === 'Green') return 'border-success/30 bg-success/10 text-success';
  return 'border-ink/20 bg-ink/5 text-secondary';
}

export function ExecutiveClientHealthReportPanel({ wbrDate }: { wbrDate: string }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { data: userProfile } = useDoc<UserProfile>(user ? `users/${user.uid}` : null);
  const agency = getActiveAgency(userProfile);
  const reportElement = useRef<HTMLElement>(null);
  const [cycleDates, setCycleDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(wbrDate);
  const [generatedReport, setGeneratedReport] = useState<ExecutiveClientHealthReport | null>(null);
  const [isLoadingCycles, setIsLoadingCycles] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => setSelectedDate(wbrDate), [wbrDate]);

  useEffect(() => {
    if (!agency) return;
    let cancelled = false;
    setIsLoadingCycles(true);
    fetchAll<{ wbrDate: string }>(
      firestore,
      getCollectionPath(agency, 'wbrEntries')!,
    ).then((rows) => {
      if (cancelled) return;
      const dates = Array.from(new Set(rows.map((row) => row.wbrDate).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))))
        .sort((a, b) => b.localeCompare(a));
      setCycleDates(dates);
      setSelectedDate((current) => dates.includes(current) ? current : dates.includes(wbrDate) ? wbrDate : dates[0] || '');
    }).catch((error) => {
      console.error('WBR history load failed:', error);
      toast({ variant: 'destructive', title: 'Unable to load WBR history', description: 'Check access and try again.' });
    }).finally(() => {
      if (!cancelled) setIsLoadingCycles(false);
    });
    return () => { cancelled = true; };
  }, [firestore, agency, toast, wbrDate]);

  const reportId = selectedDate ? `executive-client-health-v2-${selectedDate}` : '';
  const { data: savedReport } = useDoc<ExecutiveClientHealthReport>(
    reportId && agency ? `${getCollectionPath(agency, 'businessSnapshots')}/${reportId}` : null
  );
  const activeReport =
    generatedReport?.wbrDate === selectedDate
      ? generatedReport
      : savedReport?.schemaVersion === 2 && savedReport.wbrDate === selectedDate
        ? savedReport
        : null;

  const accountsById = useMemo(
    () => new Map((activeReport?.riskAccounts || []).map((account) => [account.clientId, account])),
    [activeReport]
  );
  const ragGroups = useMemo(() => {
    const groups = {
      performanceRed: [] as ExecutiveClientHealthAccount[],
      performanceAmber: [] as ExecutiveClientHealthAccount[],
      engagementRed: [] as ExecutiveClientHealthAccount[],
      engagementAmber: [] as ExecutiveClientHealthAccount[],
    };
    (activeReport?.riskAccounts || []).forEach((account) => {
      if (account.performanceRag === 'Red') groups.performanceRed.push(account);
      if (account.performanceRag === 'Amber') groups.performanceAmber.push(account);
      if (account.engagementRag === 'Red') groups.engagementRed.push(account);
      if (account.engagementRag === 'Amber') groups.engagementAmber.push(account);
    });
    return groups;
  }, [activeReport]);

  const handleCycleChange = (date: string) => {
    setSelectedDate(date);
    setGeneratedReport(null);
  };

  const handleGenerate = async () => {
    if (!agency || !selectedDate) return;
    setIsGenerating(true);
    try {
      const currentPeriod = getWeekPeriod(selectedDate);
      const previousDate = format(subWeeks(parse(selectedDate, 'yyyy-MM-dd', new Date()), 1), 'yyyy-MM-dd');
      const previousPeriod = getWeekPeriod(previousDate);
      const months = Array.from(new Set([previousPeriod.month, currentPeriod.month]));
      const spendMonthStart = format(subWeeks(parse(selectedDate, 'yyyy-MM-dd', new Date()), 1), 'yyyy-MM');
      const spendMonthEnd = format(addDays(parse(selectedDate, 'yyyy-MM-dd', new Date()), 6), 'yyyy-MM');

      const [wbrEntries, actionItems, weeklySpendRows, ...kpiAndWeeklyRows] = await Promise.all([
        fetchAll<WbrEntry>(
          firestore,
          getCollectionPath(agency, 'wbrEntries')!,
          [where('wbrDate', '==', selectedDate)]
        ),
        fetchAll<ActionItem>(firestore, getCollectionPath(agency, 'actionItems')!),
        fetchAll<WeeklySpend>(
          firestore,
          getCollectionPath(agency, 'weeklySpends')!,
          [where('month', '>=', spendMonthStart), where('month', '<=', spendMonthEnd), orderBy('month')]
        ),
        ...months.flatMap((month) => [
          fetchAll<KpiData>(firestore, getCollectionPath(agency, 'kpis')!, [where('month', '==', month)]),
          fetchAll<KpiWeeklyData>(firestore, getCollectionPath(agency, 'kpiWeeklyData')!, [where('month', '==', month)]),
        ]),
      ]);

      const kpisByMonth = new Map<string, KpiData[]>();
      const weeklyKpisByMonth = new Map<string, KpiWeeklyData[]>();
      months.forEach((month, index) => {
        kpisByMonth.set(month, kpiAndWeeklyRows[index * 2] as KpiData[]);
        weeklyKpisByMonth.set(month, kpiAndWeeklyRows[index * 2 + 1] as KpiWeeklyData[]);
      });

      const entriesByClient = new Map<string, WbrEntry>();
      wbrEntries.forEach((entry) => {
        if (entry.clientId) entriesByClient.set(entry.clientId, entry);
      });
      const entries = Array.from(entriesByClient.values());
      const riskEntries = entries.filter(isAtRisk);
      const riskIds = new Set(riskEntries.map((entry) => entry.clientId));
      const actionsByClient = new Map<string, ExecutiveClientHealthAction[]>();
      actionItems.forEach((action) => {
        if (!action.clientId || !riskIds.has(action.clientId)) return;
        const pending = buildAction(action);
        if (!pending) return;
        const rows = actionsByClient.get(action.clientId) || [];
        rows.push(pending);
        actionsByClient.set(action.clientId, rows);
      });

      const weeklyRowsByKey = new Map<string, WeeklySpend[]>();
      weeklySpendRows.forEach((row) => {
        if (row.dataType === 'ORGANIC REVENUE') return;
        const weekStart = spendWeekStartKey(row.week);
        if (!weekStart) return;
        const rows = weeklyRowsByKey.get(weekStart) || [];
        rows.push(row);
        weeklyRowsByKey.set(weekStart, rows);
      });

      const portfolio = {
        clientCount: entries.length,
        performance: {
          green: entries.filter((entry) => entry.performanceRag === 'Green').length,
          amber: entries.filter((entry) => entry.performanceRag === 'Amber').length,
          red: entries.filter((entry) => entry.performanceRag === 'Red').length,
        },
        engagement: {
          green: entries.filter((entry) => entry.engagementRag === 'Green').length,
          amber: entries.filter((entry) => entry.engagementRag === 'Amber').length,
          red: entries.filter((entry) => entry.engagementRag === 'Red').length,
        },
      };

      const riskAccounts: ExecutiveClientHealthAccount[] = riskEntries.map((entry): ExecutiveClientHealthAccount => {
        const previousKpis = (kpisByMonth.get(previousPeriod.month) || []).filter((row) => row.clientId === entry.clientId);
        const currentKpis = (kpisByMonth.get(currentPeriod.month) || []).filter((row) => row.clientId === entry.clientId);
        const challenges = [
          entry.contractStatus && entry.contractStatus !== 'Valid' ? `Contract status: ${entry.contractStatus}` : '',
          entry.organicOpportunities?.trim() ? `Organic opportunities: ${entry.organicOpportunities.trim()}` : '',
          entry.crossSellOpportunities?.trim() ? `Cross-sell opportunities: ${entry.crossSellOpportunities.trim()}` : '',
        ].filter(Boolean);

        return {
          clientId: entry.clientId,
          clientName: entry.clientName || entry.clientId,
          cluster: entry.cluster || 'Unassigned',
          performanceRag: entry.performanceRag || 'N/A',
          engagementRag: entry.engagementRag || 'N/A',
          contractStatus: entry.contractStatus || 'Not recorded',
          csmComments: entry.financeIssues || '',
          performanceSummary: entry.performanceSummary || '',
          executiveSummary: entry.summary || '',
          challenges,
          previousWeek: makeWeekEvidence(
            previousDate,
            weeklyRowsByKey.get(previousPeriod.weekStart)?.filter((row) => row.clientId === entry.clientId) || [],
            previousKpis,
            weeklyKpisByMonth.get(previousPeriod.month) || []
          ),
          currentWeek: makeWeekEvidence(
            selectedDate,
            weeklyRowsByKey.get(currentPeriod.weekStart)?.filter((row) => row.clientId === entry.clientId) || [],
            currentKpis,
            weeklyKpisByMonth.get(currentPeriod.month) || []
          ),
          pendingActions: (actionsByClient.get(entry.clientId) || []).sort((a, b) => {
            const priority = { Critical: 0, High: 1, Medium: 2, Low: 3 };
            return priority[a.priority] - priority[b.priority] || a.taskName.localeCompare(b.taskName);
          }),
        };
      }).sort((a, b) => {
        const aRed = a.performanceRag === 'Red' || a.engagementRag === 'Red';
        const bRed = b.performanceRag === 'Red' || b.engagementRag === 'Red';
        return Number(bRed) - Number(aRed) || a.clientName.localeCompare(b.clientName);
      });

      const summary = await generateExecutiveClientHealthSummary({
        cycleDate: selectedDate,
        previousWeekDate: previousDate,
        portfolio,
        riskAccounts,
      });
      setGeneratedReport({
        id: reportId,
        schemaVersion: 2,
        reportType: 'executive-client-health',
        wbrDate: selectedDate,
        previousWeekDate: previousDate,
        generatedAt: new Date().toISOString(),
        ...(user?.uid ? { generatedBy: user.uid } : {}),
        portfolio,
        riskAccounts,
        summary,
      });
      toast({ title: 'AI summary generated', description: `${riskAccounts.length} Red or Amber accounts included.` });
    } catch (error) {
      console.error('Executive WBR report generation failed:', error);
      toast({
        variant: 'destructive',
        title: 'Summary generation failed',
        description: error instanceof Error ? error.message : 'Unable to generate the report for this WBR cycle.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!activeReport || !agency) return;
    setIsSaving(true);
    try {
      const saved = { ...activeReport, savedAt: new Date().toISOString() };
      await setDoc(doc(firestore, getCollectionPath(agency, 'businessSnapshots')!, saved.id), saved);
      setGeneratedReport(saved);
      toast({ title: 'Summary saved', description: `Saved for WBR cycle ${saved.wbrDate}.` });
    } catch (error) {
      console.error('Executive WBR report save failed:', error);
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unable to save the summary.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    if (!reportElement.current || !activeReport) return;
    setIsExporting(true);
    try {
      await exportToPdf(reportElement.current, `WBR_Executive_Summary_${activeReport.wbrDate}`);
      toast({ title: 'Executive brief PDF exported' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Unable to export the summary.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="space-y-5 border border-foreground/15 bg-card/60 p-4 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-secondary">WBR cycle · AI executive report</p>
          <label htmlFor="executive-wbr-cycle" className="sr-only">Select report week</label>
          <select
            id="executive-wbr-cycle"
            value={selectedDate}
            onChange={(event) => handleCycleChange(event.target.value)}
            disabled={isLoadingCycles || cycleDates.length === 0}
            className="h-11 min-w-[220px] border border-foreground/20 bg-background px-3 text-sm font-bold"
          >
            {cycleDates.length
              ? cycleDates.map((date) => <option key={date} value={date}>{format(parse(date, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')}</option>)
              : <option value="">{isLoadingCycles ? 'Loading WBR history…' : 'No WBR history available'}</option>}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleGenerate} disabled={!selectedDate || isGenerating}>
            {isGenerating ? <CircleNotch className="mr-2 h-4 w-4 animate-spin" /> : <Sparkle className="mr-2 h-4 w-4" weight="fill" />}
            Generate AI Summary
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={!activeReport || isSaving}>
            {isSaving ? <CircleNotch className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            {activeReport?.savedAt ? 'Saved' : 'Save Summary'}
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={!activeReport || isExporting}>
            {isExporting ? <CircleNotch className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Download PDF
          </Button>
        </div>
      </div>

      {activeReport ? (
        <article ref={reportElement} id="wbr-executive-report" className="space-y-8 bg-background p-4 md:p-8">
          <header className="border-b border-foreground/20 pb-5">
            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-primary">Aztec Control Center · Weekly Review</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tight md:text-4xl">Executive Client Health</h2>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-secondary">
              Current week {getWeekPeriod(activeReport.wbrDate).label} · Compared with {getWeekPeriod(activeReport.previousWeekDate).label}
            </p>
          </header>

          <section className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest">Executive summary</h3>
            <p className="border-l-4 border-primary bg-primary/5 p-4 text-sm leading-relaxed">{activeReport.summary.executiveSummary}</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <RagRoster title="Performance · Red" accounts={ragGroups.performanceRed} />
              <RagRoster title="Performance · Amber" accounts={ragGroups.performanceAmber} />
              <RagRoster title="Engagement · Red" accounts={ragGroups.engagementRed} />
              <RagRoster title="Engagement · Amber" accounts={ragGroups.engagementAmber} />
            </div>
          </section>

          <AccountBulletSection title="Portfolio readout · account by account" bullets={activeReport.summary.portfolioReadout} accountsById={accountsById} />
          <AccountBulletSection title="Performance drivers · account by account" bullets={activeReport.summary.performanceReadout} accountsById={accountsById} />
          <AccountBulletSection title="Engagement & challenges · account by account" bullets={activeReport.summary.engagementReadout} accountsById={accountsById} />

          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest">Leadership priorities · pending account actions</h3>
              <p className="mt-1 text-[10px] text-secondary">Completed actions are excluded. The latest stored action comment is shown for each item.</p>
            </div>
            {activeReport.riskAccounts.some((account) => account.pendingActions.length) ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {activeReport.riskAccounts.flatMap((account) => account.pendingActions.map((action) => (
                  <article key={action.id} className="break-inside-avoid border border-foreground/15 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-black uppercase text-primary">{account.clientName}</p>
                        <h4 className="mt-1 text-sm font-bold">{action.taskName}</h4>
                      </div>
                      <span className="border border-foreground/15 px-2 py-1 text-[8px] font-black uppercase">{action.status} · {action.priority}</span>
                    </div>
                    {action.description && <p className="mt-2 text-xs leading-relaxed text-secondary">{action.description}</p>}
                    <p className="mt-2 text-[10px]"><strong>Owner:</strong> {action.assignedTo}{action.dueDate ? ` · Due ${action.dueDate}` : ''}</p>
                    <p className="mt-2 text-xs leading-relaxed"><strong>Latest comment:</strong> {action.latestComment || 'No comment recorded.'}</p>
                    {action.latestCommentAt && <p className="mt-1 text-[9px] text-secondary">{action.latestCommentAt}</p>}
                  </article>
                )))}
              </div>
            ) : <p className="border border-dashed border-foreground/20 p-4 text-sm text-secondary">No pending action items are linked to these Red or Amber accounts.</p>}
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest">Account-level evidence</h3>
              <p className="mt-1 text-[10px] text-secondary">Spend is by channel; weekly KPI values are the recorded target and achievement for that exact week. No month KPI totals are included.</p>
            </div>
            {activeReport.riskAccounts.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {activeReport.riskAccounts.map((account) => (
                  <AccountEvidence key={account.clientId} account={account} />
                ))}
              </div>
            ) : <p className="border border-dashed border-foreground/20 p-5 text-sm text-secondary">No Red or Amber clients were recorded for this WBR cycle.</p>}
          </section>
          <footer className="border-t border-foreground/15 pt-3 text-[8px] font-bold uppercase tracking-widest text-secondary">
            Aztec Control Center · Confidential leadership report · Generated {format(new Date(activeReport.generatedAt), 'dd MMM yyyy HH:mm')}
          </footer>
        </article>
      ) : (
        <div className="border border-dashed border-foreground/20 p-6 text-center">
          <ChartBar className="mx-auto h-8 w-8 text-secondary/50" />
          <h3 className="mt-3 text-sm font-black uppercase tracking-tight">Generate an executive WBR brief</h3>
          <p className="mt-1 text-xs text-secondary">The report lists each Red and Amber account, compares exact weekly spend and KPIs, summarizes the review notes, and surfaces pending actions.</p>
        </div>
      )}
    </section>
  );
}

function RagRoster({ title, accounts }: { title: string; accounts: ExecutiveClientHealthAccount[] }) {
  return (
    <div className="border border-foreground/15 p-3">
      <h4 className="text-[9px] font-black uppercase tracking-widest">{title} · {accounts.length}</h4>
      {accounts.length
        ? <ul className="mt-2 space-y-1 text-[10px]">{accounts.map((account) => <li key={account.clientId}>{account.clientName} <span className="text-secondary">({account.clientId})</span></li>)}</ul>
        : <p className="mt-2 text-[10px] text-secondary">None</p>}
    </div>
  );
}

function AccountBulletSection({
  title,
  bullets,
  accountsById,
}: {
  title: string;
  bullets: { clientId: string; bullet: string }[];
  accountsById: Map<string, ExecutiveClientHealthAccount>;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-black uppercase tracking-widest">{title}</h3>
      {bullets.length ? (
        <div className="grid gap-2 lg:grid-cols-2">
          {bullets.map((item) => {
            const account = accountsById.get(item.clientId);
            return (
              <p key={item.clientId} className="break-inside-avoid border border-foreground/10 p-3 text-xs leading-relaxed">
                <strong className="text-primary">{account?.clientName || item.clientId}:</strong> {item.bullet}
              </p>
            );
          })}
        </div>
      ) : <p className="text-xs text-secondary">No risk accounts in this WBR cycle.</p>}
    </section>
  );
}

function AccountEvidence({ account }: { account: ExecutiveClientHealthAccount }) {
  return (
    <article className="space-y-4 break-inside-avoid border border-foreground/20 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-black uppercase tracking-tight">{account.clientName}</h4>
          <p className="text-[9px] font-bold uppercase tracking-widest text-secondary">{account.clientId} · {account.cluster} · {account.contractStatus}</p>
        </div>
        <div className="flex flex-wrap gap-1 text-[8px] font-black uppercase">
          <span className={cn('border px-2 py-1', ragClass(account.performanceRag))}>Performance: {account.performanceRag}</span>
          <span className={cn('border px-2 py-1', ragClass(account.engagementRag))}>Engagement: {account.engagementRag}</span>
        </div>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <WeekEvidence title="Last week" week={account.previousWeek} />
        <WeekEvidence title="Current week" week={account.currentWeek} />
      </div>
      <div className="grid gap-3 border-t border-foreground/10 pt-3 md:grid-cols-2">
        <EvidenceText label="CSM comments" value={account.csmComments} />
        <EvidenceText label="Performance summary" value={account.performanceSummary} />
        <EvidenceText label="Executive summary" value={account.executiveSummary} />
        <EvidenceText label="Challenges / opportunities" value={account.challenges.join(' ')} />
      </div>
    </article>
  );
}

function WeekEvidence({ title, week }: { title: string; week: ExecutiveClientHealthWeek }) {
  const kpisByChannel = new Map<string, ExecutiveClientHealthKpi[]>();
  week.kpis.forEach((kpi) => {
    const rows = kpisByChannel.get(kpi.channel) || [];
    rows.push(kpi);
    kpisByChannel.set(kpi.channel, rows);
  });
  const channels = Array.from(new Set([
    ...week.spendsByChannel.map((row) => row.channel),
    ...Array.from(kpisByChannel.keys()),
  ])).sort((a, b) => a.localeCompare(b));

  return (
    <section className="space-y-2 border border-foreground/10 p-3">
      <h5 className="text-[9px] font-black uppercase tracking-widest">{title} · {week.label}</h5>
      {channels.length ? channels.map((channel) => {
        const spend = week.spendsByChannel.find((row) => row.channel === channel)?.amount;
        const kpis = kpisByChannel.get(channel) || [];
        return (
          <div key={channel} className="border-t border-foreground/10 pt-2">
            <p className="text-[10px] font-black uppercase">{channel} spend: {spend == null ? 'Not recorded' : formatCurrency(spend)}</p>
            {kpis.length ? (
              <ul className="mt-1 space-y-1">
                {kpis.map((kpi) => {
                  const missed = kpi.direction === 'DESC' ? kpi.achieved > kpi.target : kpi.achieved < kpi.target;
                  return (
                    <li key={kpi.id} className="flex flex-wrap items-baseline justify-between gap-x-2 text-[9px] leading-relaxed">
                      <span>{kpi.kpiType} · {kpi.name}{kpi.lob !== 'General' ? ` · ${kpi.lob}` : ''}{kpi.unit ? ` (${kpi.unit})` : ''}</span>
                      <strong className={missed ? 'text-destructive' : 'text-foreground'}>
                        Target {kpi.target.toLocaleString()} · Achieved {kpi.achieved.toLocaleString()}
                      </strong>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mt-1 text-[9px] text-secondary">No weekly KPI data recorded for this channel.</p>}
          </div>
        );
      }) : <p className="text-[10px] text-secondary">No spend or KPI data recorded for this week.</p>}
    </section>
  );
}

function EvidenceText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] font-black uppercase tracking-widest text-secondary">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed">{value.trim() || 'Not recorded for this WBR cycle.'}</p>
    </div>
  );
}
