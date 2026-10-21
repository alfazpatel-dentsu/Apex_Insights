"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import {
  CaretDoubleLeft,
  CaretDoubleRight,
  SignOut,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useUser, useDoc, useAuth } from "@/firebase";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { UserProfile } from "@/lib/types";
import { getEffectivePagePermissions } from "@/lib/agencies";
import { DASHBOARD_NAV_ITEMS } from "@/lib/dashboard-navigation";
import { GuidedTourLauncher } from "@/components/guided-tour-dialog";

type AppSidebarProps = {
  mobile?: boolean;
  onNavigate?: () => void;
};

export function AppSidebar({ mobile = false, onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user } = useUser();
  const { data: profile } = useDoc<UserProfile>(user ? `users/${user.uid}` : null);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isPreview = pathname?.startsWith('/preview');

  const filteredNav = useMemo(() => {
    if (isPreview && !profile) return DASHBOARD_NAV_ITEMS;
    if (!profile) return [];
    const userPermissions = getEffectivePagePermissions(profile);
    return DASHBOARD_NAV_ITEMS.filter(item => userPermissions.includes(item.permission));
  }, [profile, isPreview]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      toast.success("Signed out");
      router.push(isPreview ? "/preview/spends-dashboard" : "/");
    } catch (e) {
      toast.error("Sign out failed");
    }
  };

  const isCollapsed = mobile ? false : collapsed;

  return (
    <aside
      className={cn(
        "shrink-0 bg-surface border-r border-ink flex flex-col transition-[width] z-[100]",
        mobile ? "h-full w-full border-r-0" : "h-screen sticky top-0",
        !mobile && (isCollapsed ? "w-[68px]" : "w-[248px]")
      )}
      data-testid="app-sidebar"
      suppressHydrationWarning
    >
      <div className="h-16 flex items-center px-4 border-b border-ink">
        <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onNavigate}>
          <div className="w-8 h-8 bg-ink text-cream flex items-center justify-center font-display font-black text-lg">
            A
          </div>
          {mounted && !isCollapsed && (
            <div className="flex flex-col leading-none">
              <span className="font-display font-bold text-[15px] text-ink tracking-tight">
                AZTEC
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-secondary mt-0.5">
                Control Center
              </span>
            </div>
          )}
        </Link>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto custom-scrollbar">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const previewSpendsDashboard =
            isPreview && item.href === '/dashboard/spends-dashboard';
          const href = previewSpendsDashboard ? '/preview/spends-dashboard' : item.href;
          const active =
            previewSpendsDashboard ||
            pathname === item.href ||
            pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={href}
              data-testid={item.testId}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm font-medium relative group transition-colors duration-100",
                active
                  ? "bg-cream text-ink"
                  : "text-secondary hover:text-ink hover:bg-cream"
              )}
            >
              {active && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-brand" />}
              <Icon size={18} weight={active ? "fill" : "regular"} />
              {mounted && !isCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink p-3" data-testid="sidebar-user-container">
        {mounted && profile ? (
          <div className={cn("flex items-center gap-3", isCollapsed && "justify-center")}>
            <div className="w-9 h-9 bg-brand text-white flex items-center justify-center text-xs font-bold font-mono shrink-0">
              {(profile.displayName || profile.email || "AP").substring(0, 2).toUpperCase()}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-ink truncate">{profile.displayName || "User"}</div>
                <div className="text-[10px] uppercase tracking-widest text-secondary">
                  {profile.role}
                </div>
              </div>
            )}
            {!isCollapsed && (
              <button
                onClick={handleSignOut}
                title="Sign out"
                aria-label="Sign out"
                className="w-8 h-8 flex items-center justify-center border border-hairline hover:border-ink hover:bg-ink hover:text-cream transition-colors"
              >
                <SignOut size={13} />
              </button>
            )}
          </div>
        ) : (
          <div className="h-9 w-full flex items-center justify-center">
            <div className="w-9 h-9 bg-brand/5 border border-brand/10 shrink-0" />
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div className="border-t border-ink px-2 py-2">
          <GuidedTourLauncher />
        </div>
      )}

      {!mobile && (
        <div className="border-t border-ink p-3" data-testid="sidebar-collapse-container">
          <button
            onClick={() => setCollapsed((c) => !c)}
            data-testid="sidebar-collapse-btn"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs uppercase tracking-widest text-secondary hover:text-ink transition-colors"
          >
            {mounted && isCollapsed ? (
              <CaretDoubleRight size={14} />
            ) : mounted ? (
              <>
                <CaretDoubleLeft size={14} /> <span className="font-bold">Collapse</span>
              </>
            ) : (
               <div className="h-4 w-4 bg-secondary/10" />
            )}
          </button>
        </div>
      )}
    </aside>
  );
}
