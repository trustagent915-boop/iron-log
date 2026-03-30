import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  hint,
  icon
}: {
  label: string;
  value: string | number;
  hint: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="kpi-card">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-5">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {label}
          </p>
          <CardTitle className="text-3xl sm:text-4xl">{value}</CardTitle>
        </div>
        {icon ? (
          <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-white/[0.05] text-primary">
            {icon}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
