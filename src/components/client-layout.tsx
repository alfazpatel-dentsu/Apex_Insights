'use client';

import * as React from "react";
import { usePathname } from 'next/navigation';
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { cn } from "@/lib/utils";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Chrome (sidebar/header) is ONLY for authenticated /dashboard routes
  const isDashboard = pathname?.startsWith('/dashboard');
  
  // Auth/Public pages: /, /register, /awaiting-approval
  const isAuthPage = !isDashboard;

  // We only show the chrome after mounting and only on dashboard pages
  const showChrome = mounted && isDashboard;

  return (
    <div 
      className={isAuthPage ? "flex min-h-screen font-body antialiased bg-white" : "flex min-h-screen font-body antialiased bg-app"}
      suppressHydrationWarning
    >
      {showChrome && <AppSidebar />}
      
      <div 
        className="flex-1 flex flex-col min-w-0 relative"
        suppressHydrationWarning
      >
        {showChrome && <AppHeader />}
        
        <main 
          className={cn(
            "flex-1 min-w-0 relative",
            !isAuthPage && "tactical-grid", // Authenticated workspace gets the grid
            "opacity-0",
            mounted && "opacity-100 transition-opacity duration-700"
          )} 
          data-testid="app-main"
          suppressHydrationWarning
        >
          <div 
            className={cn(
              "w-full mx-auto",
              isAuthPage ? "h-full" : "max-w-[1920px] p-4 md:p-8 pt-6 pb-20"
            )}
            suppressHydrationWarning
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
