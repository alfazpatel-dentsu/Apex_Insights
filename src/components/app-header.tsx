'use client';

import { MagnifyingGlass, Bell, Command as CommandIcon, ChartBar } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { useUser, useDoc } from "@/firebase";
import { UserProfile } from "@/lib/types";
import { format, getWeek } from "date-fns";

export function AppHeader() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<string | null>(null);
  const [snapshotLabel, setSnapshotLabel] = useState<string | null>(null);
  const { user } = useUser();
  const { data: userProfile } = useDoc<UserProfile>(user ? `users/${user.uid}` : null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const update = () => {
      const d = new Date();
      // Indian Timezone IST
      setNow(
        d.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: 'Asia/Kolkata'
        })
      );

      // Dynamic Week + Date Label
      const weekNum = getWeek(d, { weekStartsOn: 1 });
      const dateStr = format(d, 'dd MMM yyyy').toUpperCase();
      setSnapshotLabel(`W${weekNum < 10 ? '0' + weekNum : weekNum} · ${dateStr}`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const initials = userProfile 
    ? (userProfile.displayName || userProfile.email).substring(0, 2).toUpperCase() 
    : "AP";

  return (
    <>
      <header
        className="h-16 bg-surface border-b border-ink flex items-center px-6 gap-4 sticky top-0 z-[50] w-full"
        data-testid="app-topbar"
        suppressHydrationWarning
      >
        <button
          onClick={() => setOpen(true)}
          data-testid="topbar-command-btn"
          className="group flex items-center gap-3 h-10 px-3 bg-surface border border-[#dcdcd4] hover:border-ink transition-colors min-w-[320px] text-left outline-none"
        >
          <MagnifyingGlass size={16} className="text-secondary" />
          <span className="text-sm text-secondary flex-1">
            Search clients, KPIs, weeks…
          </span>
          <kbd className="flex items-center gap-0.5 text-[10px] font-mono text-secondary border border-[#dcdcd4] px-1.5 py-0.5">
            <CommandIcon size={10} weight="bold" /> K
          </kbd>
        </button>

        <div className="flex-1" />

        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-surface border border-[#dcdcd4]">
          <span className="w-2 h-2 bg-[#00A675] pulse-dot" />
          <span className="text-[11px] font-mono tabular-nums text-secondary uppercase tracking-wider">
            Live · {mounted && now ? `${now} IST` : "--:--:--"}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-secondary">
          <ChartBar size={14} />
          <span className="uppercase tracking-widest">Snapshot · {mounted ? snapshotLabel : "--"}</span>
        </div>

        <button
          data-testid="topbar-notifications-btn"
          className="relative w-10 h-10 flex items-center justify-center bg-surface border border-[#dcdcd4] hover:border-ink transition-colors outline-none"
        >
          <Bell size={16} />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#D92218]" />
        </button>

        <button
          data-testid="topbar-user-btn"
          className="flex items-center gap-2.5 h-10 px-2.5 bg-surface border border-[#dcdcd4] hover:border-ink transition-colors outline-none"
        >
          <div className="w-6 h-6 bg-brand text-white flex items-center justify-center text-[11px] font-bold font-mono">
            {mounted ? initials : "--"}
          </div>
          <div className="hidden md:flex flex-col leading-tight text-left">
            <span className="text-xs font-semibold text-ink">{mounted ? (userProfile?.displayName || "Guest") : "Loading..."}</span>
            <span className="text-[10px] text-secondary uppercase tracking-wider">
              {mounted ? (userProfile?.role || "—") : "—"}
            </span>
          </div>
        </button>
      </header>

      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
