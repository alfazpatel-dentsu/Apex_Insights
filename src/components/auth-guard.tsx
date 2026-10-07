'use client';

import { useUser, useDoc } from '@/firebase';
import { UserProfile } from '@/lib/types';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { hasAgencyAccess } from '@/lib/agencies';
import { needsOtpReVerification } from '@/lib/otp-service';
import { OtpVerificationModal } from './otp-verification-modal';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useUser();
  const { data: userProfile, loading: profileLoading } = useDoc<UserProfile>(user ? `users/${user.uid}` : null);
  const router = useRouter();
  const pathname = usePathname();
  const [showOtpModal, setShowOtpModal] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
      return;
    }

    if (userProfile) {
      // Pending users should only see the awaiting approval page
      if (userProfile.status === 'Pending' && pathname !== '/awaiting-approval') {
        router.push('/awaiting-approval');
        return;
      }

      // Approved users should not be on awaiting approval
      if (userProfile.status !== 'Pending' && pathname === '/awaiting-approval') {
        router.push('/dashboard');
        return;
      }

      // Check if user needs OTP re-verification when accessing dashboard
      if (pathname.startsWith('/dashboard') && needsOtpReVerification(userProfile.lastOtpVerifiedAt)) {
        setShowOtpModal(true);
      } else {
        setShowOtpModal(false);
      }

      if (pathname.startsWith('/dashboard')) {
        const isAdmin = userProfile.role === 'Admin';
        const hasExplicitPermissions = Array.isArray(userProfile.permissions) && userProfile.permissions.length > 0;
        const permissions = Array.isArray(userProfile.permissions) ? userProfile.permissions : [];

        // CRITICAL: Order matters here to prevent prefix matching overlaps
        // e.g. /dashboard/spends-dashboard should not be caught by /dashboard/spends
        const routeMapping = [
          { path: '/dashboard/spends-dashboard', key: 'dashboard' },
          { path: '/dashboard/spends-forecast', key: 'forecast' },
          { path: '/dashboard/spends', key: 'spends' },
          { path: '/dashboard/business-snapshot', key: 'snapshot' },
          { path: '/dashboard/sales-tracker', key: 'sales' },
          { path: '/dashboard/wbr', key: 'wbr' },
          { path: '/dashboard/kpi-tracking', key: 'tracker' },
          { path: '/dashboard/actions', key: 'actions' },
          { path: '/dashboard/admin', key: 'admin' },
        ];

        const match = routeMapping.find(m => pathname.startsWith(m.path));
        const requiredPermission = match?.key;

        // Allow access if: admin, has explicit permissions and includes required, or no explicit permissions (default access)
        if (requiredPermission && !isAdmin && hasExplicitPermissions && !permissions.includes(requiredPermission)) {
          // Find first allowed page, fallback to snapshot if none (though sidebar handles this visually)
          const firstAllowed = routeMapping.find(m => permissions.includes(m.key))?.path || '/dashboard/business-snapshot';
          router.push(firstAllowed);
        }
      }
    }
  }, [user, authLoading, userProfile, pathname, router, profileLoading]);

  if (authLoading || (user && profileLoading)) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <p className="animate-pulse text-sm font-medium">Verifying access...</p>
        </div>
    );
  }

  if (!user || !userProfile) {
      return null;
  }

  return (
    <>
      <OtpVerificationModal
        isOpen={showOtpModal}
        onVerified={() => setShowOtpModal(false)}
      />
      {!showOtpModal && children}
    </>
  );
}
