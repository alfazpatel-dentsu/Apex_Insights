/**
 * Freshdesk API helpers (server-only).
 * Domain: sokworks.freshdesk.com
 * KPI window: tickets from 2026-06-01 onward.
 * SLA violated = custom "Resolution Status" equals "SLA VIOLATED".
 * Team = Freshdesk Group.
 */

import {
  FRESHDESK_TRACK_FROM,
  FRESHDESK_SLA_TARGET_PCT,
  type FreshdeskTicketLite,
  type FreshdeskTeamStat,
  type FreshdeskTypeStat,
  type FreshdeskSummary,
  type FreshdeskTicketFilter,
} from '@/lib/freshdesk-types';

export {
  FRESHDESK_TRACK_FROM,
  FRESHDESK_SLA_TARGET_PCT,
  type FreshdeskTicketLite,
  type FreshdeskTeamStat,
  type FreshdeskTypeStat,
  type FreshdeskSummary,
  type FreshdeskTicketFilter,
};

const STATUS_LABELS: Record<number, string> = {
  2: 'Open',
  3: 'Pending',
  4: 'Resolved',
  5: 'Closed',
};

function getConfig() {
  const domain = (process.env.FRESHDESK_DOMAIN || 'sokworks.freshdesk.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const apiKey = process.env.FRESHDESK_API_KEY || '';
  const trackFrom = process.env.FRESHDESK_TRACK_FROM || FRESHDESK_TRACK_FROM;
  const slaTargetPct = Number(process.env.FRESHDESK_SLA_TARGET || FRESHDESK_SLA_TARGET_PCT);
  return { domain, apiKey, trackFrom, slaTargetPct, configured: Boolean(apiKey) };
}

function authHeader(apiKey: string) {
  const token = Buffer.from(`${apiKey}:X`).toString('base64');
  return {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json',
  };
}

async function fdFetch<T>(path: string, apiKey: string, domain: string): Promise<T> {
  const url = path.startsWith('http') ? path : `https://${domain}/api/v2${path}`;
  const res = await fetch(url, {
    headers: authHeader(apiKey),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Freshdesk ${res.status}: ${body.slice(0, 240) || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function normalizeResolutionStatus(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function isSlaViolated(resolutionStatus: string): boolean {
  const v = normalizeResolutionStatus(resolutionStatus);
  return v === 'SLA VIOLATED' || v.includes('SLA VIOLATED');
}

/** Discover custom field key for "Resolution Status". */
async function resolveResolutionStatusKey(apiKey: string, domain: string): Promise<string> {
  const envKey = process.env.FRESHDESK_RESOLUTION_STATUS_FIELD?.trim();
  if (envKey) return envKey;

  try {
    const fields = await fdFetch<any[]>(`/ticket_fields`, apiKey, domain);
    const match = fields.find((f) => {
      const label = String(f.label || f.name || '').toLowerCase();
      return label.includes('resolution status') || label === 'resolution_status';
    });
    if (match?.name) return String(match.name);
  } catch {
    /* fall through */
  }
  // Common Freshdesk custom-field naming
  return 'cf_resolution_status';
}

async function listGroups(apiKey: string, domain: string): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const groups = await fdFetch<Array<{ id: number; name: string }>>(`/groups`, apiKey, domain);
    groups.forEach((g) => map.set(g.id, g.name));
  } catch {
    /* optional */
  }
  return map;
}

/**
 * Pull tickets created on/after trackFrom.
 * Uses paginated list ordered by created_at desc; stops once past the floor.
 */
async function fetchTicketsSince(
  apiKey: string,
  domain: string,
  trackFrom: string,
  maxPages = 30
): Promise<any[]> {
  const sinceIso = `${trackFrom}T00:00:00Z`;
  const all: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const path = `/tickets?per_page=100&page=${page}&order_by=created_at&order_type=desc&updated_since=${encodeURIComponent(sinceIso)}`;
    const batch = await fdFetch<any[]>(path, apiKey, domain);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    const oldest = batch[batch.length - 1];
    if (oldest && String(oldest.created_at || '').slice(0, 10) < trackFrom) break;
    if (batch.length < 100) break;
  }
  return all;
}

function ticketCreatedOnOrAfter(ticket: any, trackFrom: string): boolean {
  const created = String(ticket.created_at || '').slice(0, 10);
  return created >= trackFrom;
}

function readResolutionStatus(ticket: any, fieldKey: string): string {
  const cf = ticket.custom_fields || {};
  const candidates = [
    cf[fieldKey],
    cf.cf_resolution_status,
    cf.resolution_status,
    cf['Resolution Status'],
    ticket.resolution_status,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim()) return String(c);
  }
  // Scan custom_fields for a key that looks like resolution status
  for (const [k, v] of Object.entries(cf)) {
    if (/resolution.?status/i.test(k) && v != null && String(v).trim()) {
      return String(v);
    }
  }
  return '';
}

function isOpenStatus(status: number): boolean {
  // Not Resolved (4) or Closed (5)
  return status !== 4 && status !== 5;
}

function isOverdueTicket(ticket: any): boolean {
  if (!isOpenStatus(Number(ticket.status))) return false;
  const due = ticket.due_by;
  if (!due) return false;
  return new Date(due).getTime() < Date.now();
}

function toLite(
  ticket: any,
  groups: Map<number, string>,
  resolutionFieldKey: string
): FreshdeskTicketLite {
  const status = Number(ticket.status);
  const groupId = ticket.group_id ?? null;
  const resolutionStatus = readResolutionStatus(ticket, resolutionFieldKey);
  const slaViolated = isSlaViolated(resolutionStatus);
  return {
    id: ticket.id,
    subject: ticket.subject || `Ticket #${ticket.id}`,
    status,
    statusLabel: STATUS_LABELS[status] || `Status ${status}`,
    type: ticket.type || 'Untitled',
    groupId,
    groupName: groupId != null ? groups.get(groupId) || `Group ${groupId}` : 'Unassigned',
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    dueBy: ticket.due_by || null,
    resolutionStatus: resolutionStatus || '—',
    slaViolated,
    isOpen: isOpenStatus(status),
    isOverdue: isOverdueTicket(ticket),
    priority: ticket.priority,
  };
}

function emptySummary(partial?: Partial<FreshdeskSummary>): FreshdeskSummary {
  const { domain, trackFrom, slaTargetPct, configured } = getConfig();
  return {
    configured,
    domain,
    trackFrom,
    slaTargetPct,
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
    ...partial,
  };
}

export async function getFreshdeskSummary(): Promise<FreshdeskSummary> {
  const { domain, apiKey, trackFrom, slaTargetPct, configured } = getConfig();
  if (!configured) {
    return emptySummary({
      error: 'Set FRESHDESK_API_KEY in environment to connect sokworks.freshdesk.com.',
    });
  }

  try {
    const [groups, resolutionFieldKey, rawTickets] = await Promise.all([
      listGroups(apiKey, domain),
      resolveResolutionStatusKey(apiKey, domain),
      fetchTicketsSince(apiKey, domain, trackFrom),
    ]);

    const tickets = rawTickets
      .filter((t) => ticketCreatedOnOrAfter(t, trackFrom))
      .map((t) => toLite(t, groups, resolutionFieldKey));

    const totalTickets = tickets.length;
    const slaViolated = tickets.filter((t) => t.slaViolated).length;
    const slaViolationPct = totalTickets > 0 ? (slaViolated / totalTickets) * 100 : 0;
    const openTickets = tickets.filter((t) => t.isOpen).length;
    const overdueTickets = tickets.filter((t) => t.isOverdue).length;
    const pendingTickets = tickets.filter((t) => t.status === 3).length;
    const resolvedTickets = tickets.filter((t) => t.status === 4).length;
    const closedTickets = tickets.filter((t) => t.status === 5).length;

    const teamMap = new Map<string, FreshdeskTeamStat>();
    tickets.forEach((t) => {
      const key = t.groupName;
      const row =
        teamMap.get(key) ||
        ({
          groupId: t.groupId,
          team: t.groupName,
          total: 0,
          violated: 0,
          violationPct: 0,
          flagged: false,
          open: 0,
          overdue: 0,
        } as FreshdeskTeamStat);
      row.total += 1;
      if (t.slaViolated) row.violated += 1;
      if (t.isOpen) row.open += 1;
      if (t.isOverdue) row.overdue += 1;
      teamMap.set(key, row);
    });
    const byTeam = Array.from(teamMap.values())
      .map((row) => {
        const violationPct = row.total > 0 ? (row.violated / row.total) * 100 : 0;
        return {
          ...row,
          violationPct,
          flagged: violationPct >= slaTargetPct,
        };
      })
      .sort((a, b) => b.violationPct - a.violationPct || b.total - a.total);

    const typeMap = new Map<string, FreshdeskTypeStat>();
    tickets.forEach((t) => {
      const key = t.type || 'Untitled';
      const row = typeMap.get(key) || { type: key, total: 0, violated: 0, violationPct: 0 };
      row.total += 1;
      if (t.slaViolated) row.violated += 1;
      typeMap.set(key, row);
    });
    const byType = Array.from(typeMap.values())
      .map((row) => ({
        ...row,
        violationPct: row.total > 0 ? (row.violated / row.total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      configured: true,
      domain,
      trackFrom,
      slaTargetPct,
      generatedAt: new Date().toISOString(),
      totalTickets,
      slaViolated,
      slaViolationPct,
      slaFlagged: slaViolationPct >= slaTargetPct,
      openTickets,
      overdueTickets,
      pendingTickets,
      resolvedTickets,
      closedTickets,
      byTeam,
      byType,
    };
  } catch (err: any) {
    return emptySummary({
      configured: true,
      error: err?.message || 'Freshdesk sync failed',
    });
  }
}

export async function getFreshdeskTickets(opts: {
  view?: FreshdeskTicketFilter;
  team?: string;
  type?: string;
  limit?: number;
}): Promise<{ configured: boolean; domain: string; tickets: FreshdeskTicketLite[]; error?: string }> {
  const { domain, apiKey, trackFrom, configured } = getConfig();
  if (!configured) {
    return {
      configured: false,
      domain,
      tickets: [],
      error: 'Set FRESHDESK_API_KEY in environment to connect sokworks.freshdesk.com.',
    };
  }

  try {
    const [groups, resolutionFieldKey, rawTickets] = await Promise.all([
      listGroups(apiKey, domain),
      resolveResolutionStatusKey(apiKey, domain),
      fetchTicketsSince(apiKey, domain, trackFrom),
    ]);

    let tickets = rawTickets
      .filter((t) => ticketCreatedOnOrAfter(t, trackFrom))
      .map((t) => toLite(t, groups, resolutionFieldKey));

    const view = opts.view || 'all';
    if (view === 'open') tickets = tickets.filter((t) => t.isOpen);
    if (view === 'overdue') tickets = tickets.filter((t) => t.isOverdue);
    if (view === 'sla_violated') tickets = tickets.filter((t) => t.slaViolated);
    if (view === 'pending') tickets = tickets.filter((t) => t.status === 3);
    if (view === 'resolved') tickets = tickets.filter((t) => t.status === 4);
    if (view === 'closed') tickets = tickets.filter((t) => t.status === 5);
    if (opts.team) {
      const team = opts.team.toLowerCase();
      tickets = tickets.filter((t) => t.groupName.toLowerCase() === team);
    }
    if (opts.type) {
      const type = opts.type.toLowerCase();
      tickets = tickets.filter((t) => t.type.toLowerCase() === type);
    }

    const limit = opts.limit ?? 200;
    return {
      configured: true,
      domain,
      tickets: tickets.slice(0, limit),
    };
  } catch (err: any) {
    return {
      configured: true,
      domain,
      tickets: [],
      error: err?.message || 'Freshdesk ticket fetch failed',
    };
  }
}
