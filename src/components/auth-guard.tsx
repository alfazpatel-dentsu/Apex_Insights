'use client';

import { useUser, useDoc } from '@/firebase';
import { UserProfile } from '@/lib/types';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getEffectivePagePermissions } from '@/lib/agencies';
import { DASHBOARD_NAV_ITEMS } from '@/lib/dashboard-navigation';
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
        const match = [...DASHBOARD_NAV_ITEMS]
          .sort((a, b) => b.href.length - a.href.length)
          .find(item => pathname === item.href || pathname.startsWith(`${item.href}/`));
        const permissions = getEffectivePagePermissions(userProfile);

        if (match && !permissions.includes(match.permission)) {
          const firstAllowed = DASHBOARD_NAV_ITEMS.find(item => permissions.includes(item.permission))?.href;
          router.replace(firstAllowed || '/');
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
