'use client';

import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ChartSkeleton() {
  return (
    <Card className="workspace-panel overflow-hidden">
      <CardHeader>
        <div className="h-8 w-1/3 animate-pulse rounded bg-white/[0.08]"></div>
        <div className="mt-3 h-6 w-2/3 animate-pulse rounded bg-white/[0.06]"></div>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] animate-pulse rounded-[28px] bg-white/[0.03]"></div>
      </CardContent>
    </Card>
  );
}

export function MetricSkeleton() {
  return (
    <Card className="p-6">
      <div className="h-4 w-1/4 animate-pulse rounded bg-white/[0.08]"></div>
      <div className="mt-3 h-8 w-1/3 animate-pulse rounded bg-white/[0.06]"></div>
      <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-white/[0.04]"></div>
    </Card>
  );
}

export function HistorySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg border border-white/[0.08] bg-white/[0.02]"></div>
      ))}
    </div>
  );
}
