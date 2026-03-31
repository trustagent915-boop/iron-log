import type { ReactNode } from "react";

import { ArmTrackerProvider } from "@/features/arm-tracker/arm-tracker-provider";
import { ArmTrackerShell } from "@/features/arm-tracker/arm-tracker-shell";

export default function TrackerLayout({ children }: { children: ReactNode }) {
  return (
    <ArmTrackerProvider>
      <ArmTrackerShell>{children}</ArmTrackerShell>
    </ArmTrackerProvider>
  );
}
