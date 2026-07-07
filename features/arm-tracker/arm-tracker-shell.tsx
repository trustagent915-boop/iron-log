"use client";

import {
  BarChart3,
  CalendarDays,
  Cloud,
  Dumbbell,
  History,
  LayoutDashboard,
  Menu,
  Plus,
  Upload,
  X
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useArmTracker } from "@/features/arm-tracker/arm-tracker-provider";
import { getHistoryEntries, getPlanSessions } from "@/lib/arm-tracker/selectors";
import { cn } from "@/lib/utils";

interface NavItem {
  href: Route;
  label: string;
  icon: typeof LayoutDashboard;
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/program", label: "Programma", icon: CalendarDays },
  { href: "/history", label: "Storico", icon: History },
  { href: "/stats", label: "Statistiche", icon: BarChart3 },
  { href: "/sync", label: "Sync", icon: Cloud },
  { href: "/import", label: "Importa", icon: Upload }
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard Livello 100",
  "/program": "Programma",
  "/history": "Storico allenamenti",
  "/stats": "Statistiche",
  "/sync": "Sync e backup",
  "/import": "Importa dati",
  "/custom-workout/new": "Nuovo custom workout"
};

function isActivePath(currentPath: string, itemPath: string) {
  if (itemPath === "/") {
    return currentPath === "/";
  }

  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

function getPageTitle(pathname: string, fallback: string) {
  if (pageTitles[pathname]) {
    return pageTitles[pathname];
  }

  if (pathname.startsWith("/log/")) {
    return "Registra workout";
  }

  if (pathname.startsWith("/history/")) {
    return "Dettaglio sessione";
  }

  if (pathname.startsWith("/custom-workout/")) {
    return "Custom workout";
  }

  return fallback;
}


export function ArmTrackerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data, activePlan } = useArmTracker();
  const planSessions = activePlan ? getPlanSessions(data, activePlan.id) : [];
  const completedSessions = planSessions.filter((session) => session.status === "completed").length;
  const historyCount = getHistoryEntries(data).length;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pageTitle = getPageTitle(pathname, "Iron Log");

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.10),_transparent_40%)]" />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-white/[0.06] bg-[#0d1118] transition-transform duration-200",
          "sm:translate-x-0",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0"
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-white/[0.06] px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary/15 text-primary">
              <Dumbbell className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-foreground">Iron Log</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-white/[0.05] sm:hidden"
            aria-label="Chiudi menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-white/[0.06] text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div className="px-3 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Azioni rapide
          </div>
          <Link
            href={"/custom-workout/new" as Route}
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-white/[0.04] hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            <span>Nuovo workout</span>
          </Link>
        </nav>

        <div className="border-t border-white/[0.06] p-3 text-xs">
          <div className="rounded-lg bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                Piano attivo
              </span>
            </div>
            <p className="line-clamp-2 text-sm font-medium text-foreground">
              {activePlan?.name ?? "Nessun piano"}
            </p>
            <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
              <div className="flex justify-between">
                <span>Sessioni</span>
                <span className="font-mono text-foreground">
                  {activePlan ? `${completedSessions}/${planSessions.length || 0}` : "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Log salvati</span>
                <span className="font-mono text-foreground">{historyCount}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/60 sm:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <div className="relative sm:pl-[240px]">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-white/[0.06] bg-background/85 px-4 backdrop-blur-xl md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-white/[0.05] sm:hidden"
              aria-label="Apri menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                {pageTitle}
              </h1>
              {activePlan && pathname === "/" ? (
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  · {activePlan.name}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
              <Link href={"/custom-workout/new" as Route}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Nuovo workout
              </Link>
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6 md:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
