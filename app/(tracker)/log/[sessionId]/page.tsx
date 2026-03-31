"use client";

import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingPanel } from "@/features/arm-tracker/loading-panel";
import { StatusBadge } from "@/features/arm-tracker/status-badge";
import { useArmTracker } from "@/features/arm-tracker/arm-tracker-provider";
import {
  formatCompactNumber,
  formatCompactWeight,
  formatDateLabel,
  isSkippedExerciseLog,
  parseInputNumber,
  stripSkippedToken
} from "@/lib/arm-tracker/selectors";

interface ExerciseDraft {
  actualSets: string;
  actualReps: string;
  actualWeight: string;
  notes: string;
  skipped: boolean;
}

function toFieldValue(value: number | null) {
  return value === null ? "" : String(value);
}

export default function LogWorkoutPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { findSessionDetails, isReady, saveWorkoutLog } = useArmTracker();
  const [performedDate, setPerformedDate] = useState("");
  const [overallNotes, setOverallNotes] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ExerciseDraft>>({});
  const [isSaving, setIsSaving] = useState(false);

  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;
  const details = sessionId ? findSessionDetails(sessionId) : null;

  useEffect(() => {
    const currentDetails = details;

    if (!currentDetails) {
      return;
    }

    setPerformedDate(currentDetails.workoutLog?.performedDate ?? currentDetails.session.sessionDate);
    setOverallNotes(currentDetails.workoutLog?.overallNotes ?? "");
    setDrafts(
      currentDetails.exercises.reduce<Record<string, ExerciseDraft>>((accumulator, exercise) => {
        const existingExerciseLog = currentDetails.exerciseLogs.find(
          (exerciseLog) => exerciseLog.planExerciseId === exercise.id
        );

        accumulator[exercise.id] = {
          actualSets: toFieldValue(existingExerciseLog?.actualSets ?? null),
          actualReps: toFieldValue(existingExerciseLog?.actualReps ?? null),
          actualWeight: toFieldValue(existingExerciseLog?.actualWeight ?? null),
          notes: stripSkippedToken(existingExerciseLog?.notes ?? null) ?? "",
          skipped: existingExerciseLog ? isSkippedExerciseLog(existingExerciseLog) : false
        };

        return accumulator;
      }, {})
    );
  }, [details]);

  if (!isReady) {
    return <LoadingPanel message="Caricamento sessione..." />;
  }

  if (!details) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Sessione non trovata.
        </CardContent>
      </Card>
    );
  }

  const sessionDetails = details;
  const isCustomWorkout = sessionDetails.session.kind === "custom";
  const hasPlannedSets = sessionDetails.exercises.some(
    (exercise) => exercise.plannedSets !== null
  );

  function updateDraft(exerciseId: string, patch: Partial<ExerciseDraft>) {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [exerciseId]: {
        ...currentDrafts[exerciseId],
        ...patch
      }
    }));
  }

  function handleSubmit() {
    setIsSaving(true);

    try {
      saveWorkoutLog({
        sessionId: sessionDetails.session.id,
        performedDate,
        overallNotes,
        exercises: sessionDetails.exercises.map((exercise) => {
          const draft = drafts[exercise.id];

          return {
            planExerciseId: exercise.id,
            actualSets: parseInputNumber(draft?.actualSets ?? ""),
            actualReps: parseInputNumber(draft?.actualReps ?? ""),
            actualWeight: parseInputNumber(draft?.actualWeight ?? ""),
            notes: draft?.notes ?? "",
            skipped: draft?.skipped ?? false
          };
        })
      });

      router.push("/" as Route);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-enter space-y-8">
      <PageHeader
        eyebrow={isCustomWorkout ? "Custom workout" : "Log allenamento"}
        title={sessionDetails.session.dayLabel ?? formatDateLabel(sessionDetails.session.sessionDate)}
        description={
          isCustomWorkout
            ? `Registra i dati reali del custom workout del ${formatDateLabel(sessionDetails.session.sessionDate)}.`
            : `Registra il risultato reale della sessione del ${formatDateLabel(sessionDetails.session.sessionDate)} e salva set, reps, peso e note.`
        }
        actions={<StatusBadge status={sessionDetails.session.status} />}
      />

      {!hasPlannedSets && !isCustomWorkout ? (
        <Card>
          <CardContent className="p-6 text-sm text-warning">
            Nessun set pianificato trovato in questa sessione. Se i dati arrivano
            incompleti, valuta una reimportazione del file Excel.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Dati generali</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <label htmlFor="performed-date" className="text-sm font-medium text-foreground">
              Data esecuzione
            </label>
            <Input
              id="performed-date"
              name="performed-date"
              type="date"
              value={performedDate}
              onChange={(event) => setPerformedDate(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="overall-notes" className="text-sm font-medium text-foreground">
              Note generali
            </label>
            <Textarea
              id="overall-notes"
              name="overall-notes"
              value={overallNotes}
              onChange={(event) => setOverallNotes(event.target.value)}
              placeholder="Come e andata la seduta, sensazioni, adattamenti o note utili per il prossimo allenamento."
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {sessionDetails.exercises.map((exercise) => {
          const draft = drafts[exercise.id] ?? {
            actualSets: "",
            actualReps: "",
            actualWeight: "",
            notes: "",
            skipped: false
          };

          return (
            <Card key={exercise.id}>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <CardTitle className="text-xl">{exercise.exerciseName}</CardTitle>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-secondary px-3 py-1 text-secondary-foreground">
                      {isCustomWorkout ? "Set target" : "Set previsti"}:{" "}
                      {formatCompactNumber(exercise.plannedSets)}
                    </span>
                    <span className="rounded-full bg-secondary px-3 py-1 text-secondary-foreground">
                      {isCustomWorkout ? "Reps target" : "Reps previste"}:{" "}
                      {formatCompactNumber(exercise.plannedReps)}
                    </span>
                    <span className="rounded-full bg-secondary px-3 py-1 text-secondary-foreground">
                      {isCustomWorkout ? "Peso target" : "Peso previsto"}:{" "}
                      {formatCompactWeight(exercise.plannedWeight)}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant={draft.skipped ? "secondary" : "outline"}
                  onClick={() => updateDraft(exercise.id, { skipped: !draft.skipped })}
                >
                  {draft.skipped ? "Ripristina esercizio" : "Salta esercizio"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label
                      htmlFor={`actual-sets-${exercise.id}`}
                      className="text-sm font-medium text-foreground"
                    >
                      Set effettivi
                    </label>
                    <Input
                      id={`actual-sets-${exercise.id}`}
                      name={`actual-sets-${exercise.id}`}
                      inputMode="numeric"
                      value={draft.actualSets}
                      onChange={(event) =>
                        updateDraft(exercise.id, { actualSets: event.target.value })
                      }
                      disabled={draft.skipped}
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor={`actual-reps-${exercise.id}`}
                      className="text-sm font-medium text-foreground"
                    >
                      Reps effettive
                    </label>
                    <Input
                      id={`actual-reps-${exercise.id}`}
                      name={`actual-reps-${exercise.id}`}
                      inputMode="numeric"
                      value={draft.actualReps}
                      onChange={(event) =>
                        updateDraft(exercise.id, { actualReps: event.target.value })
                      }
                      disabled={draft.skipped}
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor={`actual-weight-${exercise.id}`}
                      className="text-sm font-medium text-foreground"
                    >
                      Peso effettivo (kg)
                    </label>
                    <Input
                      id={`actual-weight-${exercise.id}`}
                      name={`actual-weight-${exercise.id}`}
                      inputMode="decimal"
                      value={draft.actualWeight}
                      onChange={(event) =>
                        updateDraft(exercise.id, { actualWeight: event.target.value })
                      }
                      disabled={draft.skipped}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor={`exercise-notes-${exercise.id}`}
                    className="text-sm font-medium text-foreground"
                  >
                    Note esercizio
                  </label>
                  <Textarea
                    id={`exercise-notes-${exercise.id}`}
                    name={`exercise-notes-${exercise.id}`}
                    value={draft.notes}
                    onChange={(event) =>
                      updateDraft(exercise.id, { notes: event.target.value })
                    }
                    disabled={draft.skipped}
                    placeholder="Tecnica, buffer, sensazioni o eventuali modifiche sul momento."
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleSubmit} disabled={isSaving || !performedDate}>
          {isSaving ? "Salvataggio..." : "Salva allenamento"}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            router.push(
              (
                sessionDetails.session.status === "planned"
                  ? "/program"
                  : `/history/${sessionDetails.session.id}`
              ) as Route
            )
          }
        >
          Annulla
        </Button>
      </div>
    </div>
  );
}
