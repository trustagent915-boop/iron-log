"use client";

import { format } from "date-fns";
import { ClipboardPenLine, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingPanel } from "@/features/arm-tracker/loading-panel";
import { useArmTracker } from "@/features/arm-tracker/arm-tracker-provider";
import {
  getCustomSessionsWithExercises,
  getExerciseLibraryOptions,
  getPlanSessions,
  parseInputNumber
} from "@/lib/arm-tracker/selectors";

interface ExerciseDraft {
  id: string;
  exerciseName: string;
  plannedSets: string;
  plannedReps: string;
  plannedWeight: string;
  plannedNotes: string;
}

function createEmptyExercise(id: string): ExerciseDraft {
  return {
    id,
    exerciseName: "",
    plannedSets: "",
    plannedReps: "",
    plannedWeight: "",
    plannedNotes: ""
  };
}

export default function NewCustomWorkoutPage() {
  const router = useRouter();
  const { activePlan, createCustomSession, data, isReady } = useArmTracker();
  const [sessionDate, setSessionDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState<ExerciseDraft[]>(() => [
    createEmptyExercise("exercise-1"),
    createEmptyExercise("exercise-2")
  ]);
  const [nextExerciseIndex, setNextExerciseIndex] = useState(3);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isReady) {
    return <LoadingPanel message="Preparazione custom workout..." />;
  }

  if (!activePlan) {
    return (
      <div className="page-enter space-y-8">
        <PageHeader
          eyebrow="Custom Workout"
          title="Serve un programma attivo"
          description="Le sessioni extra vengono agganciate al piano corrente cosi restano nello stesso storico e nelle stesse statistiche."
        />

        <Card>
          <CardContent className="flex flex-col gap-4 p-6 pt-6 sm:flex-row sm:items-center sm:justify-between sm:p-7 sm:pt-7">
            <p className="text-sm leading-7 text-muted-foreground">
              Importa prima un programma; subito dopo puoi creare sedute extra senza toccare il
              calendario pianificato.
            </p>
            <Button asChild>
              <Link href={"/import" as Route}>Importa programma</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const exerciseOptions = getExerciseLibraryOptions(data);
  const planSessions = getPlanSessions(data, activePlan.id);
  const customSessions = getCustomSessionsWithExercises(data, activePlan.id);
  const namedExercises = exercises.filter((exercise) => exercise.exerciseName.trim()).length;

  function updateExercise(exerciseId: string, patch: Partial<ExerciseDraft>) {
    setExercises((currentExercises) =>
      currentExercises.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, ...patch } : exercise
      )
    );
  }

  function addExercise() {
    setExercises((currentExercises) => [
      ...currentExercises,
      createEmptyExercise(`exercise-${nextExerciseIndex}`)
    ]);
    setNextExerciseIndex((currentIndex) => currentIndex + 1);
  }

  function removeExercise(exerciseId: string) {
    setExercises((currentExercises) =>
      currentExercises.length > 1
        ? currentExercises.filter((exercise) => exercise.id !== exerciseId)
        : currentExercises
    );
  }

  function handleSubmit() {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = createCustomSession({
        sessionDate,
        title,
        notes,
        exercises: exercises.map((exercise) => ({
          exerciseName: exercise.exerciseName,
          plannedSets: parseInputNumber(exercise.plannedSets),
          plannedReps: parseInputNumber(exercise.plannedReps),
          plannedWeight: parseInputNumber(exercise.plannedWeight),
          plannedNotes: exercise.plannedNotes
        }))
      });

      router.push(`/log/${result.session.id}` as Route);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Non sono riuscito a creare il custom workout."
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-enter space-y-8">
      <PageHeader
        eyebrow="Custom Workout"
        title="Crea una sessione fuori programma"
        description="Il composer e stato reso piu guidato: imposti contesto, scegli gli esercizi e poi entri direttamente nel log per registrare i dati reali."
        actions={
          <Button asChild variant="outline">
            <Link href={"/program" as Route}>Torna al programma</Link>
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <p className="eyebrow">Step 1</p>
            <CardTitle className="mt-3 text-2xl">Contesto della sessione</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              <label htmlFor="custom-session-date" className="text-sm font-medium text-foreground">
                Data sessione
              </label>
              <Input
                id="custom-session-date"
                name="custom-session-date"
                type="date"
                value={sessionDate}
                onChange={(event) => setSessionDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="custom-session-title" className="text-sm font-medium text-foreground">
                Titolo
              </label>
              <Input
                id="custom-session-title"
                name="custom-session-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Upper body extra, richiamo braccia, cardio..."
                autoComplete="off"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="custom-session-notes" className="text-sm font-medium text-foreground">
                Note sessione
              </label>
              <Textarea
                id="custom-session-notes"
                name="custom-session-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Obiettivo della seduta, contesto o modifiche rispetto al programma..."
                autoComplete="off"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Snapshot</p>
              <CardTitle className="mt-3 text-2xl">Come si aggancia al piano attivo</CardTitle>
            </div>
            <Sparkles className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
            <div className="list-row">
              <p className="font-medium text-foreground">{activePlan.name}</p>
              <p>{planSessions.length} sessioni pianificate nel piano attuale.</p>
            </div>
            <div className="list-row">
              <p className="font-medium text-foreground">Storico condiviso</p>
              <p>{customSessions.length} custom workout gia salvati nello stesso workspace.</p>
            </div>
            <div className="list-row">
              <p className="font-medium text-foreground">Bozza in corso</p>
              <p>
                {namedExercises} esercizi nominati su {exercises.length} card totali.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="section-title">Esercizi</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Puoi usare solo il nome oppure definire anche target e note. Le card sono pensate
              per essere compilate rapidamente da mobile.
            </p>
          </div>

          <Button type="button" variant="outline" onClick={addExercise}>
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi esercizio
          </Button>
        </div>

        {exercises.map((exercise, index) => (
          <Card key={exercise.id}>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow">Step 2.{index + 1}</p>
                <CardTitle className="mt-3 text-2xl">Esercizio {index + 1}</CardTitle>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => removeExercise(exercise.id)}
                disabled={exercises.length === 1}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Rimuovi
              </Button>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor={`exercise-name-${exercise.id}`}
                  className="text-sm font-medium text-foreground"
                >
                  Nome esercizio
                </label>
                <Input
                  id={`exercise-name-${exercise.id}`}
                  name={`exercise-name-${exercise.id}`}
                  list="exercise-library"
                  value={exercise.exerciseName}
                  onChange={(event) =>
                    updateExercise(exercise.id, { exerciseName: event.target.value })
                  }
                  placeholder="Panca piana, curl manubri, trazioni..."
                  autoComplete="off"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label
                    htmlFor={`exercise-sets-${exercise.id}`}
                    className="text-sm font-medium text-foreground"
                  >
                    Set target
                  </label>
                  <Input
                    id={`exercise-sets-${exercise.id}`}
                    name={`exercise-sets-${exercise.id}`}
                    inputMode="numeric"
                    value={exercise.plannedSets}
                    onChange={(event) =>
                      updateExercise(exercise.id, { plannedSets: event.target.value })
                    }
                    placeholder="4"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor={`exercise-reps-${exercise.id}`}
                    className="text-sm font-medium text-foreground"
                  >
                    Reps target
                  </label>
                  <Input
                    id={`exercise-reps-${exercise.id}`}
                    name={`exercise-reps-${exercise.id}`}
                    inputMode="numeric"
                    value={exercise.plannedReps}
                    onChange={(event) =>
                      updateExercise(exercise.id, { plannedReps: event.target.value })
                    }
                    placeholder="8"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor={`exercise-weight-${exercise.id}`}
                    className="text-sm font-medium text-foreground"
                  >
                    Peso target (kg)
                  </label>
                  <Input
                    id={`exercise-weight-${exercise.id}`}
                    name={`exercise-weight-${exercise.id}`}
                    inputMode="decimal"
                    value={exercise.plannedWeight}
                    onChange={(event) =>
                      updateExercise(exercise.id, { plannedWeight: event.target.value })
                    }
                    placeholder="32.5"
                    autoComplete="off"
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
                  value={exercise.plannedNotes}
                  onChange={(event) =>
                    updateExercise(exercise.id, { plannedNotes: event.target.value })
                  }
                  placeholder="Tempo, fermo, RPE, varianti tecniche..."
                  autoComplete="off"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {errorMessage ? (
        <Card>
          <CardContent className="p-6 pt-6 text-sm text-destructive sm:p-7 sm:pt-7">
            {errorMessage}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Step 3</p>
            <CardTitle className="mt-3 text-2xl">Conferma e apri il log</CardTitle>
          </div>
          <ClipboardPenLine className="h-5 w-5 text-primary" />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-7 text-muted-foreground">
            Dopo la creazione vieni portato direttamente nel log della nuova sessione per
            registrare i dati reali.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSubmit} disabled={isSubmitting || !sessionDate}>
              {isSubmitting ? "Creazione..." : "Crea e apri il log"}
            </Button>
            <Button asChild variant="outline">
              <Link href={"/program" as Route}>Annulla</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <datalist id="exercise-library">
        {exerciseOptions.map((exerciseName) => (
          <option key={exerciseName} value={exerciseName} />
        ))}
      </datalist>
    </div>
  );
}
