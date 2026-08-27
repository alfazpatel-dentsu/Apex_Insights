import type { ActionItem, UserProfile } from '@/lib/types';

export type AssigneeOption = {
  name: string;
  email: string;
  userId?: string;
  status?: UserProfile['status'];
};

function personLabel(user: UserProfile): string {
  return (user.displayName || '').trim() || (user.email || '').trim();
}

function optionKey(name: string, email?: string, userId?: string): string {
  if (userId) return `uid:${userId}`;
  if (email?.includes('@')) return `email:${email.trim().toLowerCase()}`;
  return `name:${name.trim().toLowerCase()}`;
}

/**
 * Full assignee directory: every registry profile (Invite sent, registered, pending)
 * plus historical assignedTo / assignees names that are not in the registry.
 */
export function buildAssigneeOptions(
  users: UserProfile[] | null | undefined,
  extraNames: Array<string | undefined | null> = []
): AssigneeOption[] {
  const byKey = new Map<string, AssigneeOption>();

  const add = (name: string, email = '', userId?: string, status?: UserProfile['status']) => {
    const label = name.trim();
    if (!label && !email) return;
    const cleanEmail = email.trim().toLowerCase();
    const display = label || cleanEmail.split('@')[0] || cleanEmail;
    const key = optionKey(display, cleanEmail, userId);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        name: display,
        email: cleanEmail,
        userId,
        status,
      });
      return;
    }
    if (!existing.email && cleanEmail) existing.email = cleanEmail;
    if (!existing.userId && userId) existing.userId = userId;
    if (!existing.status && status) existing.status = status;
  };

  (users || []).forEach((user) => {
    const name = personLabel(user);
    if (!name) return;
    add(name, user.email || '', user.uid || user.id, user.status);
  });

  extraNames.forEach((raw) => {
    const name = (raw || '').trim();
    if (!name) return;
    if (name.includes('@')) add(name.split('@')[0] || name, name);
    else add(name);
  });

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function extraAssigneeNamesFromActions(
  actions: ActionItem[] | null | undefined
): string[] {
  if (!actions) return [];
  const names: string[] = [];
  actions.forEach((item) => {
    const raw = (item.assignedTo || '').trim();
    if (raw) {
      raw.split(/[,;&/]+/).forEach((part) => {
        const name = part.trim();
        if (name) names.push(name);
      });
    }
    (item.assignees || []).forEach((a) => {
      if (a.name) names.push(a.name);
      if (a.email) names.push(a.email);
    });
  });
  return names;
}
