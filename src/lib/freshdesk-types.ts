/** Shared Freshdesk types (safe for client + server). */

export const FRESHDESK_TRACK_FROM = '2026-06-01';
export const FRESHDESK_SLA_TARGET_PCT = 3.5;

export type FreshdeskTicketLite = {
  id: number;
  subject: string;
  status: number;
  statusLabel: string;
  type: string;
  groupId: number | null;
  groupName: string;
  createdAt: string;
  updatedAt: string;
  dueBy: string | null;
  resolutionStatus: string;
  slaViolated: boolean;
  isOpen: boolean;
  isOverdue: boolean;
  requesterName?: string;
  priority?: number;
};

export type FreshdeskTeamStat = {
  groupId: number | null;
  team: string;
  total: number;
  violated: number;
  violationPct: number;
  flagged: boolean;
  open: number;
  overdue: number;
};

export type FreshdeskTypeStat = {
  type: string;
  total: number;
  violated: number;
  violationPct: number;
};

export type FreshdeskSummary = {
  configured: boolean;
  domain: string;
  trackFrom: string;
  slaTargetPct: number;
  generatedAt: string;
  totalTickets: number;
  slaViolated: number;
  slaViolationPct: number;
  slaFlagged: boolean;
  openTickets: number;
  overdueTickets: number;
  pendingTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  byTeam: FreshdeskTeamStat[];
  byType: FreshdeskTypeStat[];
  error?: string;
};

export type FreshdeskTicketFilter =
  | 'all'
  | 'open'
  | 'overdue'
  | 'sla_violated'
  | 'pending'
  | 'resolved'
  | 'closed';
