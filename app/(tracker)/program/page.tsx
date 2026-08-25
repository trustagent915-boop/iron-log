"use client";

import { format } from "date-fns";
import { ChevronRight, ClipboardList, Layers3, Sparkles, Swords, Target } from "lucide-react";
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
import {
  formatDateLabel,
  formatExercisePrescription,
  getCustomSessionsWithExercises,
  getPlanSessionsWithExercises,
  groupSessionsByWeek
} from "@/lib/arm-tracker/selectors";
import type { SessionStatus, SessionWithExercises } from "@/lib/arm-tracker/types";

// Un allenamento è "fatto" se completato o saltato. I fatti vanno in fondo,
// quelli ancora da fare restano in cima ordinati per data, così il prossimo
// allenamento è sempre il primo che vedi.
function isSessionDone(session: SessionWithExercises) {
  return session.status === "completed" || session.status === "skipped";
}

function sortSessionsPendingFirst(sessions: SessionWithExercises[]) {
  return [...sessions].sort((left, right) => {
    const doneDiff = Number(isSessionDone(left)) - Number(isSessionDone(right));
    if (doneDiff !== 0) {
      return doneDiff;
    }
    return left.sessionDate.localeCompare(right.sessionDate);
  });
}

const filterOptions: Array<{ value: "all" | SessionStatus; label: string }> = [
  { value: "all", label: "Tutti gli stati" },
  { value: "planned", label: "Pianificate" },
  { value: "completed", label: "Completate" },
  { value: "partial", label: "Parziali" },
  { value: "skipped", label: "Saltate" }
];

export default function ProgramPage() {
  const { data, activePlan, isReady, logArmwrestlingSession } = useArmTracker();
  const pathname = usePathname();
  const [selectedStatus, setSelectedStatus] =
    useState<(typeof filterOptions)[number]["value"]>("all");
  const [awDate, setAwDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [awDuration, setAwDuration] = useState("");
  const [awNotes, setAwNotes] = useState("");
  const [awSaving, setAwSaving] = useState(false);
  const [awMessage, setAwMessage] = useState<string | null>(null);
  // Settimane e singoli allenamenti sono richiudibili: la pagina si apre
  // con l'elenco compatto delle settimane e apri solo quella che ti serve.
  const [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>({});
  const [openSessions, setOpenSessions] = useState<Record<string, boolean>>({});
  const [didAutoOpenWeek, setDidAutoOpenWeek] = useState(false);

  function toggleWeek(weekKey: string) {
    setOpenWeeks((current) => ({ ...current, [weekKey]: !(current[weekKey] ?? false) }));
  }

  function toggleSession(sessionId: string) {
    setOpenSessions((current) => ({ ...current, [sessionId]: !(current[sessionId] ?? false) }));
  }

  async function handleLogArmwrestling() {
    setAwSaving(true);
    setAwMessage(null);
    try {
      const parsedDuration = Number(awDuration.replace(",", "."));
      await logArmwrestlingSession({
        sessionDate: awDate,
        durationMinutes: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null,
        notes: awNotes
      });
      setAwDuration("");
      setAwNotes("");
      setAwMessage("Allenamento di braccio di ferro registrato.");
    } catch (error) {
      setAwMessage(
        error instanceof Error ? error.message : "Non sono riuscito a registrare la sessione."
      );
    } finally {
      setAwSaving(false);
    }
  }

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
          description="Importa un CSV per trasformare il calendario degli allenamenti in una timeline leggibile e subito pronta per il log."
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
  // Le settimane nascono dalle sessioni pianificate (che portano il
  // weekNumber). I workout extra (es. braccio di ferro) non hanno un
  // weekNumber, quindi li assegno alla settimana che copre la loro data:
  // vanno letti dentro il blocco della settimana, non in cima alla pagina.
  const baseWeekGroups = groupSessionsByWeek(plannedSessions).map((group) => {
    const dates = group.sessions.map((session) => session.sessionDate).sort();
    return {
      title: group.title,
      sessions: [...group.sessions],
      weekNumber: group.sessions[0]?.weekNumber ?? null,
      startDate: dates[0] ?? null,
      endDate: dates[dates.length - 1] ?? null
    };
  });
  const weeksByNumber = [...baseWeekGroups].sort((left, right) => {
    if (left.weekNumber === null) return right.weekNumber === null ? 0 : 1;
    if (right.weekNumber === null) return -1;
    return left.weekNumber - right.weekNumber;
  });

  function dayDistance(left: string, right: string) {
    const leftTime = new Date(`${left}T00:00:00`).getTime();
    const rightTime = new Date(`${right}T00:00:00`).getTime();
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.abs(leftTime - rightTime) / 86_400_000;
  }

  // Assegno l'extra alla settimana dell'allenamento pianificato più vicino
  // come data. Usare l'intervallo min-max della settimana era fragile:
  // basta una seduta con data anomala per allargare il range di una
  // settimana e catturare sessioni che appartengono altrove.
  function findWeekForDate(sessionDate: string) {
    let bestWeek: (typeof weeksByNumber)[number] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const week of weeksByNumber) {
      for (const planned of week.sessions) {
        const distance = dayDistance(sessionDate, planned.sessionDate);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestWeek = week;
        }
      }
    }

    return bestWeek;
  }

  const orphanCustomSessions: SessionWithExercises[] = [];
  customSessions.forEach((session) => {
    const week = findWeekForDate(session.sessionDate);
    if (week) {
      week.sessions.push(session);
    } else {
      orphanCustomSessions.push(session);
    }
  });

  // Dentro ogni settimana: allenamenti da fare in cima, completati in fondo.
  // Tra settimane: quelle ancora aperte prima di quelle chiuse, ma sempre
  // in ordine numerico crescente (Settimana 1, 2, 3...) — altrimenti
  // l'ordine seguirebbe quello dei dati e le settimane apparirebbero
  // mescolate.
  const groupedSessions = baseWeekGroups
    .map((group) => ({
      ...group,
      sessions: sortSessionsPendingFirst(group.sessions)
    }))
    .sort((left, right) => {
      const leftPending = left.sessions.some((session) => !isSessionDone(session));
      const rightPending = right.sessions.some((session) => !isSessionDone(session));
      if (leftPending !== rightPending) {
        return leftPending ? -1 : 1;
      }
      // Settimane senza numero sempre in fondo al proprio blocco
      if (left.weekNumber === null) return right.weekNumber === null ? 0 : 1;
      if (right.weekNumber === null) return -1;
      return left.weekNumber - right.weekNumber;
    });
  // Restano fuori solo se non esiste nessuna settimana (piano senza timeline)
  const sortedCustomSessions = sortSessionsPendingFirst(orphanCustomSessions);
  // Apri automaticamente la prima settimana ancora da completare, una sola
  // volta: così atterri sulla settimana corrente senza dover cliccare.
  const firstPendingWeekTitle =
    groupedSessions.find((group) => group.sessions.some((session) => !isSessionDone(session)))?.title ??
    groupedSessions[0]?.title ??
    null;

  if (!didAutoOpenWeek && firstPendingWeekTitle) {
    setDidAutoOpenWeek(true);
    setOpenWeeks((current) => ({ ...current, [firstPendingWeekTitle]: true }));
  }

  const completedCount = [...allPlannedSessions, ...allCustomSessions].filter(
    (session) => session.status === "completed"
  ).length;
  const hasVisibleSessions = groupedSessions.length > 0 || sortedCustomSessions.length > 0;

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

      <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 text-primary" />
            <CardTitle className="text-lg">Allenamento braccio di ferro</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Voce singola: nessun set o peso da compilare.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[170px_150px_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label htmlFor="aw-date" className="text-xs font-medium text-muted-foreground">
                Data
              </label>
              <Input
                id="aw-date"
                type="date"
                value={awDate}
                onChange={(event) => setAwDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="aw-duration" className="text-xs font-medium text-muted-foreground">
                Durata (min)
              </label>
              <Input
                id="aw-duration"
                inputMode="numeric"
                placeholder="es. 60"
                value={awDuration}
                onChange={(event) => setAwDuration(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="aw-notes" className="text-xs font-medium text-muted-foreground">
                Note (opzionale)
              </label>
              <Input
                id="aw-notes"
                placeholder="Sparring, tecnica, con chi, sensazioni..."
                value={awNotes}
                onChange={(event) => setAwNotes(event.target.value)}
              />
            </div>
            <Button type="button" onClick={handleLogArmwrestling} disabled={awSaving || !awDate}>
              {awSaving ? "Salvo..." : "Registra"}
            </Button>
          </div>
          {awMessage ? <p className="text-xs text-muted-foreground">{awMessage}</p> : null}
        </CardContent>
      </Card>

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

      {sortedCustomSessions.length ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="section-title">Sessioni fuori blocco</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sedute extra la cui data non rientra in nessuna settimana del piano attivo.
              </p>
            </div>
            <span className="data-chip">{sortedCustomSessions.length} sessioni</span>
          </div>

          <div className="space-y-4">
            {sortedCustomSessions.map((session) => (
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
        <div className="space-y-3">
          {groupedSessions.map((group) => {
            const weekKey = group.title;
            const doneInWeek = group.sessions.filter(isSessionDone).length;
            const isWeekOpen = openWeeks[weekKey] ?? false;

            return (
            <section key={group.title} className="surface overflow-hidden">
              <button
                type="button"
                onClick={() => toggleWeek(weekKey)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
                aria-expanded={isWeekOpen}
              >
                <div className="flex items-center gap-3">
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      isWeekOpen ? "rotate-90" : ""
                    }`}
                  />
                  <div>
                    <h2 className="text-base font-semibold text-foreground">{group.title}</h2>
                    <p className="text-[11px] text-muted-foreground">
                      {group.sessions.length} allenamenti · {doneInWeek} completati
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {doneInWeek === group.sessions.length ? (
                    <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-medium text-success">
                      Completata
                    </span>
                  ) : (
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-muted-foreground">
                      {group.sessions.length - doneInWeek} da fare
                    </span>
                  )}
                </div>
              </button>

              {isWeekOpen ? (
              <div className="space-y-2 border-t border-white/[0.06] p-3">
                {group.sessions.map((session) => {
                  const isSessionOpen = openSessions[session.id] ?? false;

                  return (
                    <div
                      key={session.id}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.02]"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSession(session.id)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.03]"
                        aria-expanded={isSessionOpen}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <ChevronRight
                            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                              isSessionOpen ? "rotate-90" : ""
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                              <span className="truncate">
                                {session.dayLabel ?? "Sessione senza etichetta"}
                              </span>
                              {session.kind === "custom" ? (
                                <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                  Extra
                                </span>
                              ) : null}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatDateLabel(session.sessionDate)} · {session.exercises.length} esercizi
                            </p>
                          </div>
                        </div>
                        <StatusBadge status={session.status} />
                      </button>

                      {isSessionOpen ? (
                        <div className="space-y-3 border-t border-white/[0.06] p-3">
                          <div className="grid gap-2">
                            {session.exercises.map((exercise) => (
                              <div
                                key={exercise.id}
                                className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                              >
                                <p className="text-sm font-medium text-foreground">
                                  {exercise.exerciseName}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {formatExercisePrescription(exercise) || "Nessun target definito"}
                                </p>
                                {exercise.plannedNotes ? (
                                  <p className="mt-1 text-[11px] text-muted-foreground/80">
                                    {exercise.plannedNotes}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button asChild size="sm">
                              <Link href={`/log/${session.id}` as Route}>
                                {session.status === "planned"
                                  ? "Registra allenamento"
                                  : "Aggiorna registrazione"}
                              </Link>
                            </Button>
                            {session.status !== "planned" ? (
                              <Button asChild size="sm" variant="outline">
                                <Link href={`/history/${session.id}` as Route}>Apri dettaglio</Link>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              ) : null}
            </section>
            );
          })}
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
