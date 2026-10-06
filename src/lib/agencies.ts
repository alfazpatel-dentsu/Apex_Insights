import { AGENCIES, type AgencyId, type UserProfile } from './types';

export { AGENCIES };
export type { AgencyId };

export const DEFAULT_AGENCY: AgencyId = 'sokrati';
export const GROUP_REPORTING_PERMISSION = 'group_reporting';
export const PLATFORM_ADMIN_EMAILS = [
  'alfaz.patel@dentsu.com',
  'hasnain.rasiwalla1@dentsu.com',
  'mehul.kulkarni@dentsu.com',
] as const;

export const PAGE_PERMISSIONS = [
  'snapshot', 'sales', 'tracker', 'spends', 'dashboard', 'forecast', 'wbr', 'actions', 'admin',
] as const;
export type PagePermission = typeof PAGE_PERMISSIONS[number];

export const AGENCY_LABELS: Record<AgencyId, string> = {
  sokrati: 'Sokrati',
  iprospect: 'iProspect',
};

const ALLOWED_EMAIL_DOMAINS = ['dentsu.com', 'iprospect.com'] as const;

export function isAllowedWorkEmail(value: string): boolean {
  const email = value.trim().toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((domain) => email.endsWith(`@${domain}`));
}

export function agencyCollectionPath(agencyId: AgencyId, collectionName: string): string {
  return `agencies/${agencyId}/${collectionName}`;
}

export function hasAgencyAccess(profile: UserProfile | null | undefined, agencyId: AgencyId): boolean {
  const membership = profile?.memberships?.[agencyId];
  if (membership) return membership.status === 'active';

  // Transitional compatibility for existing approved Sokrati profiles. Remove
  // after every legacy profile has been backfilled with memberships.sokrati.
  // Only apply backward compat if user has NO memberships (legacy profiles).
  const hasAnyMembership = profile?.memberships && Object.keys(profile.memberships).length > 0;
  if (hasAnyMembership) return false;

  return agencyId === 'sokrati' && Boolean(profile?.status && profile.status !== 'Pending');
}

export function canViewGroupReporting(profile: UserProfile | null | undefined): boolean {
  return Boolean(
    profile?.groupPermissions?.includes(GROUP_REPORTING_PERMISSION) &&
      hasAgencyAccess(profile, 'sokrati') &&
      hasAgencyAccess(profile, 'iprospect')
  );
}

export function getActiveAgency(profile: UserProfile | null | undefined): AgencyId | null {
  if (!profile) return null;

  const memberships = profile.memberships || {};
  const activeAgencies = AGENCIES.filter((agency) => hasAgencyAccess(profile, agency));

  // If user has only one active agency, use it.
  if (activeAgencies.length === 1) {
    return activeAgencies[0];
  }

  // If user has multiple agencies, return Sokrati (or implement agency switcher logic later).
  if (activeAgencies.length > 1) {
    return 'sokrati';
  }

  // Fallback: no active agency.
  return null;
}
