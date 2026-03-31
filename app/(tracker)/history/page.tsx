"use client";

import { CalendarRange, Download, Search, Sparkles, TimerReset } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadingPanel } from "@/features/arm-tracker/loading-panel";
import { StatusBadge } from "@/features/arm-tracker/status-badge";
import { useArmTracker } from "@/features/arm-tracker/arm-tracker-provider";
import { exportToCSV } from "@/lib/arm-tracker/export";
import { safeParseYear, safeParseQuery } from "@/lib/url-safe";
import {
  filterHistoryEntries,
  filterHistoryEntriesByYear,
  formatDateLabel,
  getAvailableHistoryYears,
  getHistoryDateRange,
  getHistoryEntries
} from "@/lib/arm-tracker/selectors";

export default function HistoryPage() {
  const { data, isReady } = useArmTracker();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState<"all" | `${number}`>("all");
  const availableYears = getAvailableHistoryYears(data);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryParam = safeParseQuery(params.get("q"));
    const requestedYear = safeParseYear(params.get("year"));
    const yearOption =
      requestedYear && availableYears.includes(Number(requestedYear))
        ? (requestedYear as `${number}`)
        : "all";

    setQuery(queryParam);
    setSelectedYear(yearOption);
  }, [availableYears]);

  function updateFilters(next: { query?: string; year?: "all" | `${number}` }) {
    const nextQuery = next.query ?? query;
    const nextYear = next.year ?? selectedYear;

    if (next.query !== undefined) {
      setQuery(nextQuery);
    }

    if (next.year !== undefined) {
      setSelectedYear(nextYear);
    }

    const params = new URLSearchParams(window.location.search);

    if (nextQuery.trim()) {
      params.set("q", nextQuery);
    } else {
      params.delete("q");
    }

    if (nextYear === "all") {
      params.delete("year");
    } else {
      params.set("year", nextYear);
    }

    const nextSearch = params.toString();
    window.history.replaceState(null, "", nextSearch ? `${pathname}?${nextSearch}` : pathname);
  }

  const allEntries = getHistoryEntries(data);
  const scopedEntries = filterHistoryEntriesByYear(
    allEntries,
    selectedYear === "all" ? "all" : Number(selectedYear)
  );
  const entries = filterHistoryEntries(scopedEntries, query);
  const customEntries = scopedEntries.filter((entry) => entry.session?.kind === "custom").length;
  const latestEntry = scopedEntries[0];
  const historyDateRange = getHistoryDateRange(data);

  if (!isReady) {
    return <LoadingPanel message="Caricamento storico allenamenti..." />;
  }

  return (
    <div className="page-enter space-y-8">
      <PageHeader
        eyebrow="Storico"
        title="Tutti gli allenamenti registrati"
        description="Ora puoi leggere lo storico anche per anno: filtro dedicato, ricerca persistente e accesso rapido ai dettagli delle sedute."
        actions={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="min-w-[170px]">
              <Select
                aria-label="Filtra storico per anno"
                value={selectedYear}
                onChange={(event) =>
                  updateFilters({ year: event.target.value as "all" | `${number}` })
                }
              >
                <option value="all">Tutti gli anni</option>
                {availableYears.map((year) => (
                  <option key={year} value={`${year}`}>{year}</option>
                ))}
              </Select>
            </div>
            <div className="relative w-full min-w-[260px] sm:w-[340px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="history-query"
                name="history-query"
                value={query}
                onChange={(event) => updateFilters({ query: event.target.value })}
                className="pl-10"
                placeholder="Cerca per esercizio, data o giorno"
                autoComplete="off"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(data)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Esporta CSV
            </Button>
            <Button asChild variant="outline">
              <Link href={"/custom-workout/new" as Route}>Nuovo custom workout</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Log nel periodo"
          value={scopedEntries.length}
          hint="Tutte le sessioni registrate nel filtro anno selezionato."
          icon={<TimerReset className="h-5 w-5" />}
        />
        <MetricCard
          label="Sedute extra"
          value={customEntries}
          hint="Workout custom salvati nello stesso storico del piano."
          icon={<Sparkles className="h-5 w-5" />}
        />
        <MetricCard
          label="Ultimo salvataggio"
          value={latestEntry ? formatDateLabel(latestEntry.log.performedDate, "d MMM yyyy") : "-"}
          hint="Allenamento piu recente nel periodo filtrato."
          icon={<CalendarRange className="h-5 w-5" />}
        />
        <MetricCard
          label="Anno attivo"
          value={selectedYear === "all" ? "Tutti" : selectedYear}
          hint="Usa il filtro anno per isolare blocchi storici diversi."
          icon={<Search className="h-5 w-5" />}
        />
      </div>

      {historyDateRange && availableYears.length === 1 ? (
        <Card>
          <CardContent className="p-6 pt-6 sm:p-7 sm:pt-7">
            <p className="text-sm leading-7 text-muted-foreground">
              Il workbook collegato al momento copre dal{" "}
              <span className="font-semibold text-foreground">
                {formatDateLabel(historyDateRange.start, "d MMMM yyyy")}
              </span>{" "}
              al{" "}
              <span className="font-semibold text-foreground">
                {formatDateLabel(historyDateRange.end, "d MMMM yyyy")}
              </span>
              . Per questo vedi solo il 2026 nel filtro anno, finche non aggiungiamo gli anni passati.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {(query || selectedYear !== "all") ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6 pt-6 sm:flex-row sm:items-center sm:justify-between sm:p-7 sm:pt-7">
            <p className="text-sm leading-7 text-muted-foreground">
              Vista filtrata su{" "}
              <span className="font-semibold text-foreground">
                {selectedYear === "all" ? "tutto lo storico" : `anno ${selectedYear}`}
              </span>
              {query ? (
                <>
                  {" "}con ricerca <span className="font-semibold text-foreground">{query}</span>
                </>
              ) : null}
              .
            </p>
            <Button type="button" variant="outline" onClick={() => updateFilters({ query: "", year: "all" })}>
              Reset filtri
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {entries.length ? (
        <div className="space-y-4">
          {entries.map((entry) => (
            <Link
              key={entry.log.id}
              href={(entry.session ? `/history/${entry.session.id}` : "/history") as Route}
              className="block"
            >
              <Card className="transition duration-200 hover:-translate-y-0.5 hover:border-primary/40">
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-2xl">
                        {formatDateLabel(entry.log.performedDate)}
                      </CardTitle>
                      {entry.session?.kind === "custom" ? (
                        <span className="data-chip">sessione extra</span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {entry.session?.dayLabel ?? "Seduta registrata"} - {entry.exerciseLogs.length} esercizi
                    </p>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {entry.exerciseNames.join(", ")}
                    </p>
                  </div>
                  <StatusBadge status={entry.log.completionStatus} />
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <p className="eyebrow">Nessun risultato</p>
            <CardTitle className="text-2xl">La vista corrente non trova allenamenti</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-7 text-muted-foreground">
              Prova a cambiare anno oppure a rimuovere la ricerca per allargare la vista dello storico.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={() => updateFilters({ query: "", year: "all" })}>
                Reset filtri
              </Button>
              <Button asChild>
                <Link href={"/custom-workout/new" as Route}>Nuovo custom workout</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
