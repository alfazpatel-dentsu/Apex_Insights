import { cn } from "@/lib/utils";

/**
 * Tactical "A" Block Logo based on Swiss High-Contrast vision.
 */
export function SokratiLogo({
  className,
  isCollapsed,
}: {
  className?: string;
  isCollapsed?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)} data-testid="app-logo">
      <div className="h-8 w-8 bg-[#0A0A0A] flex items-center justify-center text-white font-mono font-black text-lg select-none">
        A
      </div>
      {!isCollapsed && (
        <div className="flex flex-col">
          <span className="font-bold text-base tracking-tighter text-[#0A0A0A] leading-none uppercase font-headline">
            AZTEC
          </span>
          <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-[0.2em] leading-none mt-1 font-sans">
            Control Center
          </span>
        </div>
      )}
    </div>
  );
}
