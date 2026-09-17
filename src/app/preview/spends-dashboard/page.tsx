'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { SpendsAnalytics } from '@/components/spends-analytics';

export default function SpendsDashboardPreviewPage() {
  const router = useRouter();
  const { user, loading } = useUser();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/?next=/preview/spends-dashboard');
    }
  }, [loading, router, user]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-20 text-sm font-medium text-secondary">
        Checking session…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center p-20 text-sm font-medium text-secondary">
        Redirecting to sign in…
      </div>
    );
  }

  return (
    <div data-testid="spends-dashboard-preview">
      <div className="mb-4 flex items-center gap-2 border border-ink/15 bg-cream px-3 py-2 text-[10px] font-black uppercase tracking-widest text-secondary">
        <span className="bg-brand px-1.5 py-0.5 text-white">Preview</span>
        Design mode · live Firestore spends
      </div>
      <SpendsAnalytics />
    </div>
  );
}
