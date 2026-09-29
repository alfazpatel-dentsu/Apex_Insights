'use client';

import { useDoc, useUser } from '@/firebase';
import { UserProfile } from '@/lib/types';
import { hasAgencyAccess } from '@/lib/agencies';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Safe holding page until tenant-scoped iProspect dashboards are released. */
export default function IProspectWorkspacePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useUser();
  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(user ? `users/${user.uid}` : null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
    if (!profileLoading && profile && !hasAgencyAccess(profile, 'iprospect')) router.replace('/');
  }, [authLoading, profile, profileLoading, router, user]);

  if (authLoading || profileLoading || !user || !profile) {
    return <div className="flex min-h-screen items-center justify-center bg-white"><p className="text-sm">Verifying access…</p></div>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6">
      <section className="w-full max-w-xl border border-ink bg-surface p-10 text-center">
        <p className="terminal-overline">iProspect</p>
        <h1 className="mt-3 text-4xl font-black tracking-tighter">Your access is active.</h1>
        <p className="mt-4 text-sm leading-6 text-secondary">
          The iProspect workspace is being configured. Agency-specific dashboards will appear here once their data and permissions are ready.
        </p>
      </section>
    </main>
  );
}
