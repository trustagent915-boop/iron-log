"use client";

import {
  BarChart3,
  CalendarDays,
  Dumbbell,
  History,
  LayoutDashboard,
  Plus,
  Upload
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useArmTracker } from "@/features/arm-tracker/arm-tracker-provider";
import { formatDateLabel, getHistoryEntries, getLastWorkoutDate, getPlanSessions } from "@/lib/arm-tracker/selectors";
import { cn } from "@/lib/utils";

const navItems: Array<{ href: Route; label: string; icon: typeof LayoutDashboard }> = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/program", label: "Programma", icon: CalendarDays },
  { href: "/history", label: "Storico", icon: History },
  { href: "/stats", label: "Statistiche", icon: BarChart3 },
  { href: "/import", label: "Importa", icon: Upload }
];

function isActivePath(currentPath: string, itemPath: string) {
  if (itemPath === "/") {
    return currentPath === "/";
  }

  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export function ArmTrackerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data, activePlan } = useArmTracker();
  const planSessions = activePlan ? getPlanSessions(data, activePlan.id) : [];
  const completedSessions = planSessions.filter((session) => session.status === "completed").length;
  const lastWorkoutDate = getLastWorkoutDate(data);
  const historyCount = getHistoryEntries(data).length;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,146,56,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(46,179,163,0.08),_transparent_22%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1500px] gap-5 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 md:px-6 md:pt-6 xl:px-8">
        <aside className="hidden w-[280px] shrink-0 lg:block">
          <div className="workspace-panel sticky top-6 flex flex-col gap-6 p-5">
            <Link href="/" className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-primary/15 text-primary">
                <Dumbbell className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Training cockpit
                </p>
                <p className="text-2xl font-semibold text-foreground">Iron Log</p>
              </div>
            </Link>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Navigazione
              </p>
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActivePath(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn("nav-item justify-between", active && "nav-item-active")}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="workspace-panel bg-white/[0.02] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Piano attivo
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {activePlan?.name ?? "Nessun piano importato"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {activePlan
                      ? "Overview rapido per decidere se entrare nel log, aprire il programma o registrare una sessione extra."
                      : "Importa un file Excel per attivare il cockpit e iniziare a registrare."}
                  </p>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Sessioni chiuse</span>
                    <span className="font-mono text-foreground">
                      {activePlan ? `${completedSessions}/${planSessions.length || 0}` : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Log salvati</span>
                    <span className="font-mono text-foreground">{historyCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Ultimo allenamento</span>
                    <span className="font-mono text-foreground">
                      {lastWorkoutDate ? formatDateLabel(lastWorkoutDate, "d MMM") : "-"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Azioni rapide
              </p>
              <div className="grid gap-3">
                <Button asChild>
                  <Link href={"/custom-workout/new" as Route}>
                    <Plus className="mr-2 h-4 w-4" />
                    Custom workout
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={"/import" as Route}>
                    <Upload className="mr-2 h-4 w-4" />
                    Importa programma
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="workspace-panel flex items-center justify-between gap-4 px-5 py-4 lg:hidden">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-primary/15 text-primary">
                <Dumbbell className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Iron Log
                </p>
                <p className="text-lg font-semibold text-foreground">
                  {activePlan?.name ?? "Pronto all'import"}
                </p>
              </div>
            </Link>

            <Button asChild variant="outline" size="sm">
              <Link href={"/custom-workout/new" as Route}>Extra</Link>
            </Button>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1">{children}</main>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-background/90 px-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
          <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "nav-item flex-col justify-center gap-1 px-2 py-2.5 text-center",
                    active && "nav-item-active"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-[11px]">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
