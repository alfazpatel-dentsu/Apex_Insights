'use client';

import { SpendsAnalytics } from '@/components/spends-analytics';
import { getSpendsDashboardPreviewData } from '@/lib/spends-dashboard-preview-data';

const PREVIEW = getSpendsDashboardPreviewData();

export default function SpendsDashboardPreviewPage() {
  return (
    <div data-testid="spends-dashboard-preview">
      <div className="mb-4 flex items-center gap-2 border border-ink/15 bg-cream px-3 py-2 text-[10px] font-black uppercase tracking-widest text-secondary">
        <span className="bg-brand px-1.5 py-0.5 text-white">Preview</span>
        Design mode · mock spends data · not connected to Firestore
      </div>
      <SpendsAnalytics previewMonthly={PREVIEW.monthly} previewWeekly={PREVIEW.weekly} />
    </div>
  );
}
