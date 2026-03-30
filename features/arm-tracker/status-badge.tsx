import { Badge } from "@/components/ui/badge";
import type { SessionStatus } from "@/lib/arm-tracker/types";
import { cn } from "@/lib/utils";
!
const statusClasses: Record<SessionStatus, string> = {
  planned: "status-planned",
  completed: "status-completed",
  partial: "status-partial",
  skipped: "status-skipped"
};

export function StatusBadge({ status, className }: { status: SessionStatus; className?: string }) {
  return (
    <Badge className={cn("border-transparent", statusClasses[status], className)}>{status}</Badge>
  );
}
