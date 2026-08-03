'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CircleNotch,
  Headset,
  Warning,
  Clock,
  Ticket,
  CheckCircle,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { FreshdeskSummary } from '@/lib/freshdesk-types';

function MetricTile({
  label,
  value,
  hint,
  href,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  href: string;
  tone?: 'default' | 'danger' | 'warn' | 'success' | 'brand';
}) {
  return (
    <Link
      href={href}
      className="bg-white p-6 md:p-8 space-y-2 group transition-colors hover:bg-cream/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">{label}</p>
        <ArrowUpRight
          className="h-4 w-4 text-secondary/40 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand"
          weight="bold"
        />
      </div>
      <p
        className={cn(
          'text-4xl md:text-5xl font-black font-headline tracking-tighter tabular-nums',
          tone === 'danger' && 'text-destructive',
          tone === 'warn' && 'text-warning',
          tone === 'success' && 'text-success',
          tone === 'brand' && 'text-brand'
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-[10px] font-bold uppercase tracking-widest text-secondary/70">{hint}</p>
      ) : null}
    </Link>
  );
}

export function SupportPulse() {
  const [summary, setSummary] = useState<FreshdeskSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/freshdesk/summary', { cache: 'no-store' });
        const data = (await res.json()) as FreshdeskSummary;
        if (!cancelled) setSummary(data);
      } catch (err: any) {
        if (!cancelled) {
          setSummary({
            configured: false,
            domain: 'sokworks.freshdesk.com',
            trackFrom: '2026-06-01',
            slaTargetPct: 3.5,
            generatedAt: new Date().toISOString(),
            totalTickets: 0,
            slaViolated: 0,
            slaViolationPct: 0,
            slaFlagged: false,
            openTickets: 0,
            overdueTickets: 0,
            pendingTickets: 0,
            resolvedTickets: 0,
            closedTickets: 0,
            byTeam: [],
            byType: [],
            error: err?.message || 'Unable to load Freshdesk',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const slaPct = summary ? summary.slaViolationPct : 0;
  const slaLabel = `${slaPct.toFixed(1)}%`;
  const topTeams = (summary?.byTeam || []).slice(0, 5);

  return (
    <div className="bg-white border border-ink space-y-0 overflow-hidden" data-testid="support-pulse">
      <div className="bg-cream px-8 py-8 md:px-10 border-b border-ink flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2 min-w-0">
          <p className="terminal-overline">Support Operations</p>
          <h3 className="text-3xl md:text-4xl font-black tracking-tighter uppercase flex items-center gap-3">
            <Headset className="h-8 w-8 text-brand shrink-0" weight="bold" />
            Support Pulse
          </h3>
          <p className="text-[11px] font-medium text-secondary max-w-xl">
            Freshdesk tickets from {summary?.trackFrom || '2026-06-01'} · Team = Group · SLA violated when
            Resolution Status is SLA VIOLATED (target &lt; {summary?.slaTargetPct ?? 3.5}%). Support_Id
            inbox tickets are excluded.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {loading && (
            <div className="flex items-center gap-2 text-[9px] font-black text-secondary uppercase tracking-widest">
              <CircleNotch className="h-3.5 w-3.5 animate-spin text-brand" />
              Syncing…
            </div>
          )}
          <a
            href={`https://${summary?.domain || 'sokworks.freshdesk.com'}`}
            target="_blank"
            rel="noreferrer"
            className="text-[9px] font-black text-secondary uppercase tracking-widest bg-white px-3 py-1.5 border border-ink/10 hover:border-ink hover:text-ink transition-colors"
          >
            Open Freshdesk ↗
          </a>
          <Link
            href="/dashboard/freshdesk"
            className="text-[9px] font-black uppercase tracking-widest bg-ink text-cream px-3 py-1.5 hover:bg-brand transition-colors"
          >
            View all tickets →
          </Link>
        </div>
      </div>

      {summary?.error ? (
        <div className="px-8 py-6 border-b border-ink bg-white flex items-start gap-3">
          <Warning className="h-5 w-5 text-warning shrink-0 mt-0.5" weight="fill" />
          <div className="space-y-1">
            <p className="text-[11px] font-black uppercase tracking-widest text-ink">Freshdesk connection</p>
            <p className="text-[12px] text-secondary font-medium">{summary.error}</p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-px bg-ink border-b border-ink">
        <MetricTile
          label="Total"
          value={summary?.totalTickets ?? '—'}
          hint="Since track-from"
          href="/dashboard/freshdesk?view=all"
          tone="brand"
        />
        <MetricTile
          label="Open"
          value={summary?.openTickets ?? '—'}
          hint="Not resolved/closed"
          href="/dashboard/freshdesk?view=open"
        />
        <MetricTile
          label="Overdue"
          value={summary?.overdueTickets ?? '—'}
          hint="Past due date"
          href="/dashboard/freshdesk?view=overdue"
          tone={(summary?.overdueTickets || 0) > 0 ? 'danger' : 'default'}
        />
        <MetricTile
          label="SLA Violated"
          value={summary?.slaViolated ?? '—'}
          hint={summary ? `${slaLabel} of total` : 'Resolution Status'}
          href="/dashboard/freshdesk?view=sla_violated"
          tone={summary?.slaFlagged ? 'danger' : 'default'}
        />
        <MetricTile
          label="Pending"
          value={summary?.pendingTickets ?? '—'}
          href="/dashboard/freshdesk?view=pending"
          tone="warn"
        />
        <MetricTile
          label="Resolved"
          value={summary?.resolvedTickets ?? '—'}
          hint={`${summary?.closedTickets ?? 0} closed`}
          href="/dashboard/freshdesk?view=resolved"
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-ink">
        <div className="bg-white p-6 md:p-8 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">SLA Health</p>
              <p className="text-sm font-black uppercase tracking-tight">Violation rate vs {summary?.slaTargetPct ?? 3.5}% target</p>
            </div>
            <Link href="/dashboard/freshdesk?view=sla_violated" className="group">
              <ArrowUpRight className="h-4 w-4 text-secondary/40 group-hover:text-brand" weight="bold" />
            </Link>
          </div>
          <div className="flex items-end gap-4">
            <p
              className={cn(
                'text-5xl font-black font-headline tracking-tighter tabular-nums',
                summary?.slaFlagged ? 'text-destructive' : 'text-success'
              )}
            >
              {summary ? slaLabel : '—'}
            </p>
            <div className="pb-2 space-y-1">
              {summary?.slaFlagged ? (
                <p className="text-[10px] font-black uppercase tracking-widest text-destructive flex items-center gap-1.5">
                  <Warning className="h-3.5 w-3.5" weight="fill" /> Flagged ≥ target
                </p>
              ) : (
                <p className="text-[10px] font-black uppercase tracking-widest text-success flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" weight="fill" /> Within target
                </p>
              )}
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">
                {summary?.slaViolated ?? 0} / {summary?.totalTickets ?? 0} tickets
              </p>
            </div>
          </div>
          <div className="h-2 bg-foreground/[0.04] overflow-hidden">
            <div
              className={cn('h-full transition-all', summary?.slaFlagged ? 'bg-destructive' : 'bg-success')}
              style={{ width: `${Math.min(Math.max(slaPct, 0), 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-white p-6 md:p-8 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">By Team (Group)</p>
              <p className="text-sm font-black uppercase tracking-tight">Top teams by SLA pressure</p>
            </div>
            <Ticket className="h-4 w-4 text-secondary/40" weight="bold" />
          </div>
          {topTeams.length === 0 ? (
            <p className="py-8 text-center text-[10px] font-black uppercase tracking-widest text-secondary/50">
              {loading ? 'Loading teams…' : 'No team data yet'}
            </p>
          ) : (
            <div className="space-y-3">
              {topTeams.map((team) => (
                <Link
                  key={team.team}
                  href={`/dashboard/freshdesk?view=all&team=${encodeURIComponent(team.team)}`}
                  className="flex items-center justify-between gap-3 py-2 border-b border-ink/5 last:border-0 group hover:bg-cream/40 -mx-2 px-2 transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[12px] font-black uppercase tracking-tight truncate group-hover:text-brand">
                      {team.team}
                    </p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-secondary flex items-center gap-2">
                      <span>{team.total} tickets</span>
                      <span className="opacity-30">·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {team.open} open
                      </span>
                      {team.overdue > 0 && (
                        <>
                          <span className="opacity-30">·</span>
                          <span className="text-destructive">{team.overdue} overdue</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={cn(
                        'text-[13px] font-black tabular-nums',
                        team.flagged ? 'text-destructive' : 'text-ink'
                      )}
                    >
                      {team.violationPct.toFixed(1)}%
                    </p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-secondary">
                      {team.violated} violated
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
