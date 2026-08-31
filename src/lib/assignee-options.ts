import type { UserProfile } from '@/lib/types';

export type AssigneeOption = {
  name: string;
  email: string;
  userId?: string;
  status?: UserProfile['status'];
};

function personLabel(user: UserProfile): string {
  return (user.displayName || '').trim() || (user.email || '').trim();
}

function isInAppUser(user: UserProfile): boolean {
  const email = (user.email || '').trim().toLowerCase();
  if (!email.includes('@')) return false;
  if (user.status === 'Pending') return false;
  return true;
}

/**
 * Assignee search list: people who already have an app account
 * (Invite sent or User Registered). Guests are added separately in the picker.
 */
export function buildAssigneeOptions(
  users: UserProfile[] | null | undefined
): AssigneeOption[] {
  const byEmail = new Map<string, AssigneeOption>();

  (users || []).forEach((user) => {
    if (!isInAppUser(user)) return;
    const email = user.email.trim().toLowerCase();
    const name = personLabel(user) || email;
    const userId = user.uid || user.id;
    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, {
        name,
        email,
        ...(userId ? { userId } : {}),
        status: user.status,
      });
      return;
    }
    if (userId && !existing.userId) existing.userId = userId;
    if ((user.displayName || '').trim()) existing.name = user.displayName.trim();
    if (!existing.status && user.status) existing.status = user.status;
  });

  return Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name));
}
