'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, PlayCircle, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { DASHBOARD_NAV_ITEMS } from '@/lib/dashboard-navigation';

type GuidedTourPage = (typeof DASHBOARD_NAV_ITEMS)[number];
type TourStep = {
  target?: string;
  eyebrow: string;
  title: string;
  body: string;
};
type Spotlight = { top: number; left: number; width: number; height: number };
type CardPosition = { top: number | string; left: number | string; width?: number; transform?: string };

export const GUIDED_TOUR_REPLAY_EVENT = 'aztec:replay-guided-tour';

export function GuidedTourDialog({
  open,
  onOpenChange,
  pages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: GuidedTourPage[];
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const [cardPosition, setCardPosition] = useState<CardPosition>({
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  });

  const steps = useMemo<TourStep[]>(
    () => {
      const pageSteps = pages.map((page, index) => ({
        target: page.testId,
        eyebrow: `${String(index + 1).padStart(2, '0')} · ${page.label.toUpperCase()}`,
        title: page.label === 'Snapshot' ? 'Start here: the executive command view.' : page.label,
        body: page.description,
      }));
      const controlsStart = pages.length + 1;

      return [
        {
          eyebrow: 'AZTEC CONTROL CENTER',
          title: 'Welcome to your workspace.',
          body: 'This guided tour walks through the Control Center, one workspace at a time. The pages in your tour reflect your current effective access, including your active agency membership and page permissions; the tour itself is read-only.',
        },
        ...pageSteps,
        {
          target: 'topbar-command-btn',
          eyebrow: `${String(controlsStart).padStart(2, '0')} · COMMAND PALETTE`,
          title: 'Find a workspace or record faster.',
          body: 'Open search from the top bar to look across the Control Center without navigating through each page manually. On Windows, use Ctrl + K; on Mac, use ⌘ + K. Search results and available actions depend on the current application.',
        },
        {
          target: 'topbar-notifications-btn',
          eyebrow: `${String(controlsStart + 1).padStart(2, '0')} · NOTIFICATIONS`,
          title: 'Check updates addressed to you.',
          body: 'Open notifications to review messages and updates associated with your account. Selecting a notification may take you to the related workspace, while unread indicators help you spot items you have not reviewed yet.',
        },
        {
          target: 'topbar-user-btn',
          eyebrow: `${String(controlsStart + 2).padStart(2, '0')} · YOUR ACCOUNT`,
          title: 'Manage your profile and session.',
          body: 'Open your account menu to confirm the profile currently signed in, access profile management, or sign out when you are finished. Your role and access are assigned to your account and may determine which workspaces are available.',
        },
        {
          eyebrow: 'YOU ARE READY',
          title: 'Explore the workspaces available to you.',
          body: 'You have reached the end of the guided tour. Open a page from the sidebar to continue exploring, and replay this walkthrough from the sidebar or account menu whenever you need a refresher.',
        },
      ];
    },
    [pages]
  );
  const current = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setSpotlight(null);
      return;
    }

    let frame = 0;
    const update = () => {
      const target = current.target
        ? document.querySelector<HTMLElement>(`[data-testid="${current.target}"]`)
        : null;
      if (!target) {
        setSpotlight(null);
        setCardPosition({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
        return;
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      const rect = target.getBoundingClientRect();
      setSpotlight({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      const cardWidth = Math.min(420, window.innerWidth - 32);
      const cardHeight = Math.min(350, window.innerHeight - 32);
      if (window.innerWidth < 768) {
        let top = rect.bottom + 18;
        if (top + cardHeight > window.innerHeight - 16) {
          top = Math.max(16, rect.top - cardHeight - 18);
        }
        setCardPosition({ top, left: 16, width: window.innerWidth - 32 });
        return;
      }

      const left = Math.min(
        Math.max(16, rect.right + 18),
        Math.max(16, window.innerWidth - cardWidth - 16)
      );
      const top = Math.min(
        Math.max(16, rect.top),
        Math.max(16, window.innerHeight - cardHeight - 16)
      );
      setCardPosition({ top, left, width: cardWidth });
    };

    frame = window.requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [current, open]);

  if (!open || !current) return null;

  const close = () => onOpenChange(false);
  const next = () => {
    if (isLast) close();
    else setStepIndex((index) => index + 1);
  };

  return (
    <div
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-label="Aztec Control Center guided tour"
      data-testid="guided-tour"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px]" />
      {spotlight && (
        <div
          className="pointer-events-none fixed z-[201] border-2 border-brand bg-transparent transition-all duration-300"
          style={{
            top: spotlight.top - 5,
            left: spotlight.left - 5,
            width: spotlight.width + 10,
            height: spotlight.height + 10,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 4px rgba(255,255,255,0.08)',
          }}
        />
      )}

      <section
        className="fixed z-[202] max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] overflow-y-auto border border-ink bg-surface p-5 shadow-2xl transition-all duration-300 md:p-6"
        style={cardPosition}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">{current.eyebrow}</p>
            <p className="mt-1 text-[10px] font-mono text-secondary">{stepIndex + 1} / {steps.length}</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close guided tour"
            className="flex h-7 w-7 items-center justify-center border border-hairline text-secondary hover:border-ink hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        <h2 className="mt-5 font-headline text-xl font-black tracking-tight md:text-2xl">{current.title}</h2>
        <p className="mt-3 text-sm leading-6 text-secondary">{current.body}</p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={close}
            className="text-[10px] font-black uppercase tracking-widest text-secondary hover:text-ink"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
                className="h-9 rounded-none"
              >
                <ArrowLeft size={13} className="mr-1.5" /> Back
              </Button>
            )}
            <Button type="button" size="sm" onClick={next} className="h-9 rounded-none font-bold">
              {isLast ? (
                <><Check size={13} className="mr-1.5" /> Start exploring</>
              ) : (
                <>Next <ArrowRight size={13} className="ml-1.5" /></>
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function GuidedTourLauncher() {
  return (
    <button
      type="button"
      data-testid="guided-tour-replay"
      onClick={() => window.dispatchEvent(new Event(GUIDED_TOUR_REPLAY_EVENT))}
      className="flex w-full items-center gap-2 px-2.5 py-2 text-xs text-secondary transition-colors hover:bg-cream hover:text-ink"
    >
      <PlayCircle size={14} />
      <span>Replay guided tour</span>
    </button>
  );
}
