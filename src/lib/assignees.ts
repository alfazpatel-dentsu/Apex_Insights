import type { ActionAssignee } from '@/lib/types';

export type { ActionAssignee };

export function assigneesFromItem(item: {
  assignedTo?: string;
  assignees?: ActionAssignee[];
}): ActionAssignee[] {
  if (item.assignees && item.assignees.length > 0) {
    return item.assignees.map((a) => ({
      name: String(a.name || '').trim(),
      email: String(a.email || '').trim().toLowerCase(),
      userId: a.userId ? String(a.userId) : undefined,
    }));
  }
  const raw = (item.assignedTo || '').trim();
  if (!raw) return [];
  return raw
    .split(/[,;&/]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part.includes('@')
        ? { name: part.split('@')[0] || part, email: part.toLowerCase() }
        : { name: part, email: '' }
    );
}

export function assignedToLabel(assignees: ActionAssignee[], fallback = ''): string {
  const label = assignees
    .map((a) => a.name || a.email)
    .filter(Boolean)
    .join(', ');
  return label || fallback;
}

export function displayAssigned(
  item: { assignedTo?: string; assignees?: ActionAssignee[] },
  empty = 'Unassigned'
): string {
  return assignedToLabel(assigneesFromItem(item), empty);
}

export function assigneeKey(a: ActionAssignee): string {
  if (a.userId) return `uid:${a.userId}`;
  if (a.email) return `email:${a.email.trim().toLowerCase()}`;
  return `name:${(a.name || '').trim().toLowerCase()}`;
}
