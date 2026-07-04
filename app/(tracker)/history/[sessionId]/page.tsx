"use client";

import { Trash2 } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingPanel } from "@/features/arm-tracker/loading-panel";
import { StatusBadge } from "@/features/arm-tracker/status-badge";
import { useArmTracker } from "@/features/arm-tracker/arm-tracker-provider";
import {
  formatCompactNumber,
  formatCompactWeight,
  formatDateLabel,
  isSkippedExerciseLog,
  stripSkippedToken
} from "@/lib/arm-tracker/selectors";

function getDeltaClass(delta: number | null) {
  if (delta === null || delta === 0) {
    return "text-muted-foreground";
  }

  return delta > 0 ? "text-[hsl(var(--success))]" : "text-destructive";
}

function formatDelta(delta: number | null, suffix = "") {
  if (delta === null) {
    return "-";
  }

  if (delta === 0) {
    return `0${suffix}`;
  }

  return `${delta > 0 ? "+" : ""}${Number.isInteger(delta) ? delta : delta.toFixed(1)}${suffix}`;
}

export default function HistoryDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { findSessionDetails, isReady, syncStatus, deleteWorkoutLog } = useArmTracker();
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;
  const details = sessionId ? findSessionDetails(sessionId) : null;
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteWorkoutLog() {
    if (!details?.workoutLog) {
      return;
    }

    const confirmed = window.confirm(
      "Vuoi davvero cancellare questo allenamento? L'azione viene propagata anche agli altri dispositivi tramite il cloud."
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteWorkoutLog(details.workoutLog.id);
      router.push("/history" as Route);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Cancellazione non riuscita."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  if (!isReady) {
    return <LoadingPanel message="Caricamento dettaglio sessione..." />;
  }

  if (!details) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Dettaglio sessione non trovato.
        </CardContent>
      </Card>
    );
  }

  const isCustomWorkout = details.session.kind === "custom";

  return (
    <div className="page-enter space-y-8">
      <PageHeader
        eyebrow={isCustomWorkout ? "Custom workout" : "Dettaglio sessione"}
        title={details.session.dayLabel ?? formatDateLabel(details.session.sessionDate)}
        description={
          isCustomWorkout
            ? `Dettaglio del custom workout del ${formatDateLabel(details.session.sessionDate)}.`
            : `Confronto tra previsto ed eseguito per la seduta del ${formatDateLabel(details.session.sessionDate)}.`
        }
        actions={<StatusBadge status={details.session.status} />}
      />

      {!details.workoutLog ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {isCustomWorkout
                ? "Questo custom workout e ancora da registrare."
                : "Questa sessione e ancora pianificata e non ha un log salvato."}
            </p>
            <Button asChild>
              <Link href={`/log/${details.session.id}` as Route}>
                {isCustomWorkout ? "Registra custom workout" : "Registra allenamento"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <CardTitle className="text-xl">Riepilogo log</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Eseguito il {formatDateLabel(details.workoutLog.performedDate)} ·{" "}
                  {details.exerciseLogs.length} esercizi registrati
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={details.workoutLog.completionStatus} />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/15 hover:text-destructive"
                  onClick={handleDeleteWorkoutLog}
                  disabled={isDeleting || !syncStatus.canWrite}
                  title={
                    syncStatus.canWrite
                      ? "Cancella questo allenamento. La rimozione viene propagata via cloud."
                      : "Cloud bloccato: la cancellazione non e disponibile finche la sync non torna sana."
                  }
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {isDeleting ? "Cancello..." : "Cancella allenamento"}
                </Button>
              </div>
            </CardHeader>
            {details.workoutLog.overallNotes ? (
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {details.workoutLog.overallNotes}
                </p>
              </CardContent>
            ) : null}
            {deleteError ? (
              <CardContent>
                <p className="text-sm text-destructive">{deleteError}</p>
              </CardContent>
            ) : null}
          </Card>

          <div className="space-y-4">
            {details.exercises.map((exercise) => {
              const exerciseLog =
                details.exerciseLogs.find((item) => item.planExerciseId === exercise.id) ?? null;
              const skipped = exerciseLog ? isSkippedExerciseLog(exerciseLog) : false;
              const plannedSets = exerciseLog?.plannedSetsSnapshot ?? exercise.plannedSets;
              const plannedReps = exerciseLog?.plannedRepsSnapshot ?? exercise.plannedReps;
              const plannedWeight = exerciseLog?.plannedWeightSnapshot ?? exercise.plannedWeight;
              const plannedNotes = exerciseLog?.plannedNotesSnapshot ?? exercise.plannedNotes;
              const setDelta =
                exerciseLog &&
                !skipped &&
                plannedSets !== null &&
                exerciseLog.actualSets !== null
                  ? exerciseLog.actualSets - plannedSets
                  : null;
              const repsDelta =
                exerciseLog &&
                !skipped &&
                plannedReps !== null &&
                exerciseLog.actualReps !== null
                  ? exerciseLog.actualReps - plannedReps
                  : null;
              const weightDelta =
                exerciseLog &&
                !skipped &&
                plannedWeight !== null &&
                exerciseLog.actualWeight !== null
                  ? exerciseLog.actualWeight - plannedWeight
                  : null;

              return (
                <Card key={exercise.id}>
                  <CardHeader>
                    <CardTitle className="text-xl">{exercise.exerciseName}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          {isCustomWorkout ? "Schema" : "Previsto"}
                        </p>
                        <div className="mt-3 space-y-2 text-sm text-foreground">
                          <p>Set: {formatCompactNumber(plannedSets)}</p>
                          <p>Reps: {formatCompactNumber(plannedReps)}</p>
                          <p>Peso: {formatCompactWeight(plannedWeight)}</p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Eseguito
                        </p>
                        <div className="mt-3 space-y-2 text-sm text-foreground">
                          <p>
                            Set:{" "}
                            {skipped
                              ? "Saltato"
                              : formatCompactNumber(exerciseLog?.actualSets ?? null)}
                          </p>
                          <p>
                            Reps:{" "}
                            {skipped
                              ? "Saltato"
                              : formatCompactNumber(exerciseLog?.actualReps ?? null)}
                          </p>
                          <p>
                            Peso:{" "}
                            {skipped
                              ? "Saltato"
                              : formatCompactWeight(exerciseLog?.actualWeight ?? null)}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Delta
                        </p>
                        <div className="mt-3 space-y-2 text-sm">
                          <p className={getDeltaClass(setDelta)}>
                            Set: {skipped ? "-" : formatDelta(setDelta)}
                          </p>
                          <p className={getDeltaClass(repsDelta)}>
                            Reps: {skipped ? "-" : formatDelta(repsDelta)}
                          </p>
                          <p className={getDeltaClass(weightDelta)}>
                            Peso: {skipped ? "-" : formatDelta(weightDelta, " kg")}
                          </p>
                        </div>
                      </div>
                    </div>

                    {plannedNotes ? (
                      <p className="text-sm text-muted-foreground">
                        Note previste: {plannedNotes}
                      </p>
                    ) : null}
                    {exerciseLog?.notes ? (
                      <p className="text-sm text-muted-foreground">
                        Note esecuzione: {stripSkippedToken(exerciseLog.notes)}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
