'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowSquareOut,
  CircleNotch,
  Headset,
  MagnifyingGlass,
  Warning,
} from '@phosphor-icons/react';
import { format, parseISO, isValid } from 'date-fns';
import { PageHeader } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FreshdeskTicketFilter, FreshdeskTicketLite } from '@/lib/freshdesk-types';

const VIEWS: { id: FreshdeskTicketFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'sla_violated', label: 'SLA Violated' },
  { id: 'pending', label: 'Pending' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

function formatWhen(iso?: string | null) {
  if (!iso) return '—';
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, 'dd MMM yyyy HH:mm') : iso;
  } catch {
    return iso;
  }
}

function FreshdeskContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const view = (searchParams.get('view') || 'all') as FreshdeskTicketFilter;
  const team = searchParams.get('team') || '';
  const type = searchParams.get('type') || '';

  const [tickets, setTickets] = useState<FreshdeskTicketLite[]>([]);
  const [domain, setDomain] = useState('sokworks.freshdesk.com');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const setFilter = useCallback(
    (next: { view?: string; team?: string; type?: string }) => {
      const params = new URLSearchParams();
      const v = next.view ?? view;
      const t = next.team === undefined ? team : next.team;
      const ty = next.type === undefined ? type : next.type;
      if (v) params.set('view', v);
      if (t) params.set('team', t);
      if (ty) params.set('type', ty);
      const qs = params.toString();
      router.replace(qs ? `/dashboard/freshdesk?${qs}` : '/dashboard/freshdesk');
    },
    [router, view, team, type]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('view', view || 'all');
        if (team) params.set('team', team);
        if (type) params.set('type', type);
        params.set('limit', '300');
        const res = await fetch(`/api/freshdesk/tickets?${params.toString()}`, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        setTickets(Array.isArray(data.tickets) ? data.tickets : []);
        if (data.domain) setDomain(data.domain);
        if (data.error) setError(data.error);
      } catch (err: any) {
        if (!cancelled) {
          setTickets([]);
          setError(err?.message || 'Failed to load tickets');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [view, team, type]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) => {
      return (
        String(t.id).includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.groupName.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        t.resolutionStatus.toLowerCase().includes(q) ||
        t.statusLabel.toLowerCase().includes(q)
      );
    });
  }, [tickets, search]);

  const teams = useMemo(() => {
    const set = new Set<string>();
    tickets.forEach((t) => set.add(t.groupName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tickets]);

  return (
    <div className="space-y-6" data-testid="freshdesk-page">
      <PageHeader
        title="Support Desk"
        description="Freshdesk tickets from sokworks · Team = Group · SLA = Resolution Status SLA VIOLATED"
      >
        <Link
          href="/dashboard/business-snapshot"
          className="inline-flex items-center gap-2 h-9 px-3 text-[10px] font-black uppercase tracking-widest border border-ink/15 hover:border-ink hover:bg-cream transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" weight="bold" />
          Snapshot
        </Link>
        <a
          href={`https://${domain}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 h-9 px-3 text-[10px] font-black uppercase tracking-widest bg-ink text-cream hover:bg-brand transition-colors"
        >
          <Headset className="h-3.5 w-3.5" weight="bold" />
          Freshdesk
          <ArrowSquareOut className="h-3.5 w-3.5" />
        </a>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => {
          const active = (view || 'all') === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setFilter({ view: v.id })}
              className={cn(
                'h-8 px-3 text-[10px] font-black uppercase tracking-widest border transition-colors',
                active ? 'bg-ink text-cream border-ink' : 'bg-white border-ink/15 text-secondary hover:border-ink hover:text-ink'
              )}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search id, subject, team, type…"
            className="pl-9 rounded-none border-ink/15 h-10 text-sm"
          />
        </div>
        <select
          value={team}
          onChange={(e) => setFilter({ team: e.target.value })}
          className="h-10 px-3 text-[11px] font-bold uppercase tracking-widest border border-ink/15 bg-white min-w-[180px]"
        >
          <option value="">All teams (groups)</option>
          {team && !teams.includes(team) ? <option value={team}>{team}</option> : null}
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {type ? (
          <button
            type="button"
            onClick={() => setFilter({ type: '' })}
            className="h-10 px-3 text-[10px] font-black uppercase tracking-widest border border-ink/15 hover:border-ink"
          >
            Type: {type} ×
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="border border-warning/40 bg-warning/5 px-4 py-3 flex items-start gap-3">
          <Warning className="h-5 w-5 text-warning shrink-0 mt-0.5" weight="fill" />
          <p className="text-[12px] font-medium text-secondary">{error}</p>
        </div>
      ) : null}

      <div className="border border-ink bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-ink/10 flex items-center justify-between gap-3 bg-cream">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">
            {loading ? 'Loading…' : `${filtered.length} ticket${filtered.length === 1 ? '' : 's'}`}
          </p>
          {loading && <CircleNotch className="h-4 w-4 animate-spin text-brand" />}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left">
            <thead>
              <tr className="border-b border-ink/10 text-[9px] font-black uppercase tracking-widest text-secondary">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Resolution</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-[11px] font-black uppercase tracking-widest text-secondary/50">
                    No tickets for this filter
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} className="border-b border-ink/5 hover:bg-cream/40 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <a
                        href={`https://${domain}/a/tickets/${t.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[12px] font-bold text-brand hover:underline underline-offset-2"
                      >
                        #{t.id}
                      </a>
                    </td>
                    <td className="px-4 py-3 align-top max-w-[320px]">
                      <p className="text-[13px] font-semibold text-ink leading-snug line-clamp-2">{t.subject}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {t.slaViolated && (
                          <Badge className="rounded-none text-[8px] font-black uppercase tracking-widest bg-destructive text-white">
                            SLA Violated
                          </Badge>
                        )}
                        {t.isOverdue && (
                          <Badge className="rounded-none text-[8px] font-black uppercase tracking-widest bg-warning text-ink">
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <button
                        type="button"
                        onClick={() => setFilter({ team: t.groupName })}
                        className="text-[11px] font-bold uppercase tracking-wide text-secondary hover:text-brand text-left"
                      >
                        {t.groupName}
                      </button>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <button
                        type="button"
                        onClick={() => setFilter({ type: t.type })}
                        className="text-[11px] font-medium text-secondary hover:text-brand text-left"
                      >
                        {t.type}
                      </button>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="text-[11px] font-black uppercase tracking-widest">{t.statusLabel}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase tracking-wide',
                          t.slaViolated ? 'text-destructive' : 'text-secondary'
                        )}
                      >
                        {t.resolutionStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap text-[11px] font-mono text-secondary">
                      {formatWhen(t.dueBy)}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap text-[11px] font-mono text-secondary">
                      {formatWhen(t.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function FreshdeskPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-20">
          <CircleNotch className="h-8 w-8 animate-spin text-brand/40" />
        </div>
      }
    >
      <FreshdeskContent />
    </Suspense>
  );
}
