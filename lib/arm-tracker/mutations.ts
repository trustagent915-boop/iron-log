import { addDays, format, startOfToday } from "date-fns";

import { skippedNoteToken } from "@/lib/arm-tracker/selectors";
import { db } from "@/lib/arm-tracker/storage";
import type {
  CreateCustomSessionInput,
  CreateCustomSessionResult,
  ImportPlanInput,
  ImportPlanResult,
  ParsedRow,
  Plan,
  PlanExercise,
  PlanSession,
  SaveWorkoutLogInput,
  WorkoutExerciseLog,
  WorkoutLog
} from "@/lib/arm-tracker/types";
import { sanitizeText, slugify } from "@/lib/utils";

function getPlanNameFromFile(fileName: string) {
  const sanitizedFileName = sanitizeText(fileName, 120).replace(/\.[^.]+$/, "");
  return sanitizedFileName || "Nuovo programma";
}

function buildSessionGroupKey(row: ParsedRow) {
  return [row.date ?? "no-date", row.day ?? "no-day", row.week ?? "no-week"].join("__");
}

function deriveSessionDate(row: ParsedRow, sessionIndex: number, fallbackWarnings: string[]) {
  if (row.date) {
    return row.date;
  }

  const fallbackDate = format(addDays(startOfToday(), sessionIndex), "yyyy-MM-dd");
  const dayLabel = row.day ? ` (${row.day})` : "";
  fallbackWarnings.push(`Sessione senza data${dayLabel}: assegnata ${fallbackDate}.`);
  return fallbackDate;
}

function hasExerciseInput(exerciseLog: WorkoutExerciseLog) {
  return exerciseLog.actualSets !== null || exerciseLog.actualReps !== null || exerciseLog.actualWeight !== null;
}

function getActivePlanFromSnapshot(snapshot: ReturnType<typeof db.getSnapshot>) {
  return snapshot.plans.find((plan) => plan.status === "active") ?? null;
}

export function importParsedPlan(input: ImportPlanInput): ImportPlanResult {
  const snapshot = db.getSnapshot();
  const importedAt = new Date().toISOString();
  const fallbackWarnings: string[] = [];
  const activePlans = snapshot.plans.map((plan) => (plan.status === "active" ? { ...plan, status: "archived" as const } : plan));

  const plan: Plan = {
    id: crypto.randomUUID(),
    name: getPlanNameFromFile(input.fileName),
    sourceFileName: input.fileName,
    importedAt,
    status: "active"
  };

  const groupedRows = new Map<string, ParsedRow[]>();

  input.rows
    .filter((row) => row.valid)
    .sort((left, right) => left.rowIndex - right.rowIndex)
    .forEach((row) => {
      const key = buildSessionGroupKey(row);
      const existingRows = groupedRows.get(key);

      if (existingRows) {
        existingRows.push(row);
        return;
      }

      groupedRows.set(key, [row]);
    });

  const sessions: PlanSession[] = [];
  const exercises: PlanExercise[] = [];

  [...groupedRows.values()].forEach((rows, sessionIndex) => {
    const leadRow = rows[0];
    const sessionId = crypto.randomUUID();

    sessions.push({
      id: sessionId,
      planId: plan.id,
      sessionDate: deriveSessionDate(leadRow, sessionIndex, fallbackWarnings),
      dayLabel: leadRow.day ?? null,
      weekNumber: leadRow.week ?? null,
      notes: null,
      status: "planned",
      kind: "planned"
    });

    rows.forEach((row, exerciseIndex) => {
      exercises.push({
        id: crypto.randomUUID(),
        sessionId,
        exerciseName: row.exercise ?? `Esercizio-${slugify(String(exerciseIndex + 1))}`,
        plannedSets: row.sets,
        plannedReps: row.reps,
        plannedWeight: row.weight,
        plannedNotes: row.notes,
        sortOrder: exerciseIndex
      });
    });
  });

  const importRun = {
    id: crypto.randomUUID(),
    fileName: input.fileName,
    sheetName: input.sheetName,
    totalRows: input.totalRows,
    importedRows: exercises.length,
    skippedRows: input.totalRows - exercises.length,
    warnings: [...new Set([...input.warnings, ...fallbackWarnings])],
    createdAt: importedAt
  };

  db.setSnapshot({
    ...snapshot,
    plans: [...activePlans, plan],
    sessions: [...snapshot.sessions, ...sessions],
    exercises: [...snapshot.exercises, ...exercises],
    importRuns: [...snapshot.importRuns, importRun]
  });

  return {
    plan,
    sessions,
    exercises,
    importRun,
    warnings: importRun.warnings,
    importedRows: importRun.importedRows,
    skippedRows: importRun.skippedRows
  };
}

export function createCustomSession(input: CreateCustomSessionInput): CreateCustomSessionResult {
  const snapshot = db.getSnapshot();
  const activePlan = getActivePlanFromSnapshot(snapshot);

  if (!activePlan) {
    throw new Error("Importa prima un programma attivo per aggiungere un custom workout.");
  }

  const sessionId = crypto.randomUUID();
  const session: PlanSession = {
    id: sessionId,
    planId: activePlan.id,
    sessionDate: input.sessionDate,
    dayLabel: sanitizeText(input.title ?? "", 80) || "Custom workout",
    weekNumber: null,
    notes: sanitizeText(input.notes ?? "", 400) || null,
    status: "planned",
    kind: "custom"
  };

  const exercises = input.exercises
    .map((exercise, index): PlanExercise | null => {
      const exerciseName = sanitizeText(exercise.exerciseName, 120);

      if (!exerciseName) {
        return null;
      }

      return {
        id: crypto.randomUUID(),
        sessionId,
        exerciseName,
        plannedSets: exercise.plannedSets,
        plannedReps: exercise.plannedReps,
        plannedWeight: exercise.plannedWeight,
        plannedNotes: sanitizeText(exercise.plannedNotes ?? "", 240) || null,
        sortOrder: index
      };
    })
    .filter((exercise): exercise is PlanExercise => Boolean(exercise));

  if (!exercises.length) {
    throw new Error("Aggiungi almeno un esercizio al custom workout.");
  }

  db.setSnapshot({
    ...snapshot,
    sessions: [...snapshot.sessions, session],
    exercises: [...snapshot.exercises, ...exercises]
  });

  return { session, exercises };
}

export function saveWorkoutLogEntry(input: SaveWorkoutLogInput) {
  const snapshot = db.getSnapshot();
  const session = snapshot.sessions.find((item) => item.id === input.sessionId);

  if (!session) {
    throw new Error("Sessione non trovata.");
  }

  const planExercises = snapshot.exercises.filter((exercise) => exercise.sessionId === session.id).sort((left, right) => left.sortOrder - right.sortOrder);
  const existingLogsForSession = snapshot.workoutLogs.filter((log) => log.planSessionId === session.id).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const latestLog = existingLogsForSession.at(-1) ?? null;
  const exerciseInputMap = new Map(input.exercises.map((exercise) => [exercise.planExerciseId, exercise]));
  const submittedAt = new Date().toISOString();
  const workoutLogId = latestLog?.id ?? crypto.randomUUID();

  const workoutLogExerciseEntries: WorkoutExerciseLog[] = planExercises.map((planExercise, index) => {
    const submittedExercise = exerciseInputMap.get(planExercise.id);
    const skipped = submittedExercise?.skipped ?? false;
    const trimmedNotes = sanitizeText(submittedExercise?.notes ?? "", 240) || null;
    const actualReps = skipped ? null : submittedExercise?.actualReps ?? null;
    const actualWeight = skipped ? null : submittedExercise?.actualWeight ?? null;
    const explicitSets = skipped ? null : submittedExercise?.actualSets ?? null;
    const actualSets = skipped || (explicitSets === null && actualReps === null && actualWeight === null) ? explicitSets : explicitSets ?? planExercise.plannedSets ?? null;

    return {
      id: crypto.randomUUID(),
      workoutLogId,
      planExerciseId: planExercise.id,
      exerciseNameSnapshot: planExercise.exerciseName,
      plannedSetsSnapshot: planExercise.plannedSets,
      plannedRepsSnapshot: planExercise.plannedReps,
      plannedWeightSnapshot: planExercise.plannedWeight,
      plannedNotesSnapshot: planExercise.plannedNotes,
      actualWeight,
      actualReps,
      actualSets,
      notes: skipped ? `${skippedNoteToken} ${trimmedNotes ?? ""}`.trim() : trimmedNotes,
      performedOrder: index
    };
  });

  const allExercisesSkipped = workoutLogExerciseEntries.every((exerciseLog) => exerciseLog.notes?.startsWith(skippedNoteToken));
  const everyExerciseHasData = workoutLogExerciseEntries.every((exerciseLog) => exerciseLog.notes?.startsWith(skippedNoteToken) || hasExerciseInput(exerciseLog));
  const completionStatus: WorkoutLog["completionStatus"] = allExercisesSkipped ? "skipped" : everyExerciseHasData ? "completed" : "partial";

  const workoutLog: WorkoutLog = {
    id: workoutLogId,
    planSessionId: session.id,
    performedDate: input.performedDate,
    overallNotes: sanitizeText(input.overallNotes ?? "", 400) || null,
    completionStatus,
    createdAt: latestLog?.createdAt ?? submittedAt
  };

  const retainedWorkoutLogs = snapshot.workoutLogs.filter((log) => log.planSessionId !== session.id);
  const retainedExerciseLogs = snapshot.exerciseLogs.filter((exerciseLog) => !existingLogsForSession.some((log) => log.id === exerciseLog.workoutLogId));
  const updatedSessions: PlanSession[] = snapshot.sessions.map((item) => (item.id === session.id ? { ...item, status: completionStatus } : item));

  db.setSnapshot({
    ...snapshot,
    sessions: updatedSessions,
    workoutLogs: [...retainedWorkoutLogs, workoutLog],
    exerciseLogs: [...retainedExerciseLogs, ...workoutLogExerciseEntries]
  });

  return { workoutLog, exerciseLogs: workoutLogExerciseEntries, completionStatus };
}
