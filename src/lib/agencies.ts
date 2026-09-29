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
  return agencyId === 'sokrati' && Boolean(profile?.status && profile.status !== 'Pending');
}

export function canViewGroupReporting(profile: UserProfile | null | undefined): boolean {
  return Boolean(
    profile?.groupPermissions?.includes(GROUP_REPORTING_PERMISSION) &&
      hasAgencyAccess(profile, 'sokrati') &&
      hasAgencyAccess(profile, 'iprospect')
  );
}
