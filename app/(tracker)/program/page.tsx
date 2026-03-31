"use client";

import { ClipboardList, Layers3, Sparkles, Target } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { LoadingPanel } from "@/features/arm-tracker/loading-panel";
import { StatusBadge } from "@/features/arm-tracker/status-badge";
import { useArmTracker } from "@/features/arm-tracker/arm-tracker-provider";
import {
  formatDateLabel,
  formatExercisePrescription,
  getCustomSessionsWithExercises,
  getPlanSessionsWithExercises,
  groupSessionsByWeek
} from "@/lib/arm-tracker/selectors";
import type { SessionStatus } from "@/lib/arm-tracker/types";

const filterOptions: Array<{ value: "all" | SessionStatus; label: string }> = [
  { value: "all", label: "Tutti gli stati" },
  { value: "planned", label: "Pianificate" },
  { value: "completed", label: "Completate" },
  { value: "partial", label: "Parziali" },
  { value: "skipped", label: "Saltate" }
];

export default function ProgramPage() {
  const { data, activePlan, isReady } = useArmTracker();
  const pathname = usePathname();
  const [selectedStatus, setSelectedStatus] =
    useState<(typeof filterOptions)[number]["value"]>("all");

  useEffect(() => {
    const statusParam = new URLSearchParams(window.location.search).get("status");

    if (filterOptions.some((option) => option.value === statusParam)) {
      setSelectedStatus(statusParam as (typeof filterOptions)[number]["value"]);
    }
  }, []);

  function updateStatus(nextStatus: (typeof filterOptions)[number]["value"]) {
    setSelectedStatus(nextStatus);
    const params = new URLSearchParams(window.location.search);

    if (nextStatus === "all") {
      params.delete("status");
    } else {
      params.set("status", nextStatus);
    }

    const query = params.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }

  if (!isReady) {
    return <LoadingPanel />;
  }

  if (!activePlan) {
    return (
      <div className="page-enter space-y-8">
        <PageHeader
          eyebrow="Programma"
          title="Nessun piano attivo"
          description="Importa un file Excel per trasformare il calendario degli allenamenti in una timeline leggibile e subito pronta per il log."
        />
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 pt-6 sm:flex-row sm:items-center sm:justify-between sm:p-7 sm:pt-7">
            <p className="text-sm leading-7 text-muted-foreground">
              Quando importi un file, qui compaiono settimane, sedute, esercizi e stato di
              avanzamento del piano attivo.
            </p>
            <Button asChild>
              <Link href={"/import" as Route}>Importa programma</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allPlannedSessions = getPlanSessionsWithExercises(data, activePlan.id);
  const allCustomSessions = getCustomSessionsWithExercises(data, activePlan.id);
  const plannedSessions = allPlannedSessions.filter(
    (session) => selectedStatus === "all" || session.status === selectedStatus
  );
  const customSessions = allCustomSessions.filter(
    (session) => selectedStatus === "all" || session.status === selectedStatus
  );
  const groupedSessions = groupSessionsByWeek(plannedSessions);
  const completedCount = [...allPlannedSessions, ...allCustomSessions].filter(
    (session) => session.status === "completed"
  ).length;
  const hasVisibleSessions = groupedSessions.length > 0 || customSessions.length > 0;

  return (
    <div className="page-enter space-y-8">
      <PageHeader
        eyebrow="Programma"
        title={activePlan.name}
        description="La timeline del piano e ora separata con chiarezza dalle sessioni extra, cosi la lettura rimane pulita anche quando fai workout fuori programma."
        actions={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="w-full min-w-[220px] sm:w-[240px]">
              <Select
                aria-label="Filtra sessioni per stato"
                value={selectedStatus}
                onChange={(event) =>
                  updateStatus(event.target.value as (typeof filterOptions)[number]["value"])
                }
              >
                {filterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button asChild variant="outline">
              <Link href={"/custom-workout/new" as Route}>Nuovo custom workout</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Sessioni pianificate"
          value={allPlannedSessions.length}
          hint="Sedute previste dal programma attivo."
          icon={<Layers3 className="h-5 w-5" />}
        />
        <MetricCard
          label="Workout extra"
          value={allCustomSessions.length}
          hint="Sessioni create fuori programma ma nello stesso storico."
          icon={<Sparkles className="h-5 w-5" />}
        />
        <MetricCard
          label="Completate"
          value={completedCount}
          hint="Somma delle sessioni chiuse tra piano e workout custom."
          icon={<Target className="h-5 w-5" />}
        />
        <MetricCard
          label="Filtro attivo"
          value={
            selectedStatus === "all"
              ? "Tutti"
              : filterOptions.find((option) => option.value === selectedStatus)?.label ?? "Tutti"
          }
          hint="Lo stato del filtro resta in URL e non si perde al refresh."
          icon={<ClipboardList className="h-5 w-5" />}
        />
      </div>

      {selectedStatus !== "all" ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6 pt-6 sm:flex-row sm:items-center sm:justify-between sm:p-7 sm:pt-7">
            <p className="text-sm leading-7 text-muted-foreground">
              Stai guardando solo le sessioni con stato{" "}
              <span className="font-semibold text-foreground">
                {filterOptions.find((option) => option.value === selectedStatus)?.label.toLowerCase()}
              </span>
              .
            </p>
            <Button type="button" variant="outline" onClick={() => updateStatus("all")}>
              Mostra tutto
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {customSessions.length ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="section-title">Custom workout</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sedute extra tenute separate dal calendario principale per non sporcare la lettura
                del piano.
              </p>
            </div>
            <span className="data-chip">{customSessions.length} sessioni extra</span>
          </div>

          <div className="space-y-4">
            {customSessions.map((session) => (
              <Card key={session.id}>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <CardTitle className="text-2xl">
                      {session.dayLabel ?? "Custom workout"}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {formatDateLabel(session.sessionDate)}
                    </p>
                    {session.notes ? (
                      <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                        {session.notes}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge status={session.status} />
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-3">
                    {session.exercises.map((exercise) => (
                      <div key={exercise.id} className="list-row">
                        <p className="font-medium text-foreground">{exercise.exerciseName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatExercisePrescription(exercise) || "Nessun target definito"}
                        </p>
                        {exercise.plannedNotes ? (
                          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            {exercise.plannedNotes}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <Link href={`/log/${session.id}` as Route}>
                        {session.status === "planned"
                          ? "Registra allenamento"
                          : "Aggiorna registrazione"}
                      </Link>
                    </Button>
                    {session.status !== "planned" ? (
                      <Button asChild variant="outline">
                        <Link href={`/history/${session.id}` as Route}>Apri dettaglio</Link>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {groupedSessions.length ? (
        <div className="space-y-8">
          {groupedSessions.map((group) => (
            <section key={group.title} className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="section-title">{group.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Timeline del programma attivo, pronta per il passaggio a log o storico.
                  </p>
                </div>
                <span className="data-chip">{group.sessions.length} sessioni</span>
              </div>

              <div className="space-y-4">
                {group.sessions.map((session) => (
                  <Card key={session.id}>
                    <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <CardTitle className="text-2xl">
                          {formatDateLabel(session.sessionDate)}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {session.dayLabel ?? "Sessione senza etichetta"}
                        </p>
                      </div>
                      <StatusBadge status={session.status} />
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="grid gap-3">
                        {session.exercises.map((exercise) => (
                          <div key={exercise.id} className="list-row">
                            <p className="font-medium text-foreground">{exercise.exerciseName}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {formatExercisePrescription(exercise)}
                            </p>
                            {exercise.plannedNotes ? (
                              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                {exercise.plannedNotes}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Button asChild>
                          <Link href={`/log/${session.id}` as Route}>
                            {session.status === "planned"
                              ? "Registra allenamento"
                              : "Aggiorna registrazione"}
                          </Link>
                        </Button>
                        {session.status !== "planned" ? (
                          <Button asChild variant="outline">
                            <Link href={`/history/${session.id}` as Route}>Apri dettaglio</Link>
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {!hasVisibleSessions ? (
        <Card>
          <CardContent className="space-y-4 p-6 pt-6 sm:p-7 sm:pt-7">
            <p className="text-sm leading-7 text-muted-foreground">
              Nessuna sessione corrisponde al filtro selezionato.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={() => updateStatus("all")}>
                Reset filtro
              </Button>
              <Button asChild>
                <Link href={"/custom-workout/new" as Route}>Nuovo custom workout</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
