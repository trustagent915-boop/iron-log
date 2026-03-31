import { Badge } from "@/components/ui/badge";
import type { SessionStatus } from "@/lib/arm-tracker/types";
import { cn } from "@/lib/utils";

const statusClasses: Record<SessionStatus, string> = {
  planned: "status-planned",
  completed: "status-completed",
  partial: "status-partial",
  skipped: "status-skipped"
};

const statusLabels: Record<SessionStatus, string> = {
  planned: "Pianificata",
  completed: "Completata",
  partial: "Parziale",
  skipped: "Saltata"
};

export function StatusBadge({ status, className }: { status: SessionStatus; className?: string }) {
  return (
    <Badge className={cn("border-transparent normal-case tracking-normal", statusClasses[status], className)}>
      {statusLabels[status]}
    </Badge>
  );
}
