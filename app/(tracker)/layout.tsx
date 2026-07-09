import type { ReactNode } from "react";

import { ArmTrackerProvider } from "@/features/arm-tracker/arm-tracker-provider";
import { ArmTrackerShell } from "@/features/arm-tracker/arm-tracker-shell";
import { CacheKiller } from "@/features/arm-tracker/cache-killer";

// Force these routes to be server-rendered on demand, not pre-rendered
// at build time. Static pages were being cached at the Vercel edge for
// hours, so iPad Safari kept getting stale HTML that referenced JS
// chunks from an older build (with auth required).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function TrackerLayout({ children }: { children: ReactNode }) {
  return (
    <ArmTrackerProvider>
      <CacheKiller />
      <ArmTrackerShell>{children}</ArmTrackerShell>
    </ArmTrackerProvider>
  );
}
