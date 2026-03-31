import { utils, type WorkBook } from "xlsx";

import type {
  ArmTrackerData,
  ImportRun,
  Plan,
  PlanExercise,
  PlanSession,
  PlanStatus,
  SessionKind,
  SessionStatus,
  WorkoutCompletionStatus,
  WorkoutExerciseLog,
  WorkoutLog
} from "@/lib/arm-tracker/types";

const requiredSheets = ["Plans", "Sessions", "Exercises", "ExerciseLogs", "ImportRuns"] as const;

type JsonRow = Record<string, unknown>;

function sheetToRows(workbook: WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    return [] as JsonRow[];
  }

  return utils.sheet_to_json<JsonRow>(sheet, {
    raw: true,
    defval: null
  });
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is JsonRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasTruthyValue(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function parsePlanStatus(value: unknown): PlanStatus {
  return value === "archived" ? "archived" : "active";
}

function parseSessionStatus(value: unknown): SessionStatus {
  if (value === "completed" || value === "partial" || value === "skipped") {
    return value;
  }

  return "planned";
}

function parseSessionKind(value: unknown): SessionKind {
  return value === "custom" ? "custom" : "planned";
}

function parseWorkoutCompletionStatus(value: unknown): WorkoutCompletionStatus {
  if (value === "partial" || value === "skipped") {
    return value;
  }

  return "completed";
}

export function isHistoricalWorkbook(workbook: WorkBook) {
  return requiredSheets.every((sheetName) => workbook.SheetNames.includes(sheetName));
}

export function parseHistoricalWorkbook(workbook: WorkBook): ArmTrackerData {
  if (!isHistoricalWorkbook(workbook)) {
    throw new Error("Questo file Excel non ha il formato storico Iron Log atteso.");
  }

  const plansRows = sheetToRows(workbook, "Plans");
  const sessionsRows = sheetToRows(workbook, "Sessions");
  const exercisesRows = sheetToRows(workbook, "Exercises");
  const workoutLogsRows = sheetToRows(workbook, "WorkoutLogs");
  const exerciseLogsRows = sheetToRows(workbook, "ExerciseLogs");
  const importRunsRows = sheetToRows(workbook, "ImportRuns");

  const plans: Plan[] = plansRows
    .filter(isRecord)
    .map((row) => ({
      id: asString(row.id),
      name: asString(row.name, "Programma storico"),
      sourceFileName: asString(row.sourceFileName, "iron-log-storico.xls"),
      importedAt: asString(row.importedAt, new Date(0).toISOString()),
      status: parsePlanStatus(row.status)
    }))
    .filter((plan) => Boolean(plan.id));

  const planNameToId = new Map(plans.map((plan) => [plan.name, plan.id]));

  function buildSessionLookupKey(row: JsonRow) {
    return [
      planNameToId.get(asString(row.planName)) ?? asString(row.planId),
      asString(row.sessionDate),
      asNullableString(row.dayLabel) ?? "",
      asNullableNumber(row.weekNumber) ?? ""
    ].join("|");
  }

  const sessions: PlanSession[] = sessionsRows
    .filter(isRecord)
    .map((row) => ({
      id: asString(row.id),
      planId: asString(row.planId),
      sessionDate: asString(row.sessionDate),
      dayLabel: asNullableString(row.dayLabel),
      weekNumber: asNullableNumber(row.weekNumber),
      notes: asNullableString(row.notes),
      status: parseSessionStatus(row.status),
      kind: parseSessionKind(row.kind)
    }))
    .filter((session) => Boolean(session.id && session.planId && session.sessionDate));

  const sessionLookup = new Map(
    sessionsRows
      .filter(isRecord)
      .map((row) => {
        const key = buildSessionLookupKey(row);
        const session = sessions.find((item) => item.id === asString(row.id)) ?? null;
        return [key, session] as const;
      })
      .filter((entry): entry is readonly [string, PlanSession] => Boolean(entry[1]))
  );

  const exercises: PlanExercise[] = exercisesRows
    .filter(isRecord)
    .map((row) => ({
      id: asString(row.id),
      sessionId: asString(row.sessionId),
      exerciseName: asString(row.exerciseName, "Esercizio"),
      plannedSets: asNullableNumber(row.plannedSets),
      plannedReps: asNullableNumber(row.plannedReps),
      plannedWeight: asNullableNumber(row.plannedWeight),
      plannedNotes: asNullableString(row.plannedNotes),
      sortOrder: asNumber(row.sortOrder)
    }))
    .filter((exercise) => Boolean(exercise.id && exercise.sessionId));

  const exerciseLookup = new Map(
    exercises.map((exercise) => [[exercise.sessionId, exercise.exerciseName].join("|"), exercise] as const)
  );

  const completionStatusBySessionKey = new Map(
    exerciseLogsRows
      .filter(isRecord)
      .map((row) => [buildSessionLookupKey(row), parseWorkoutCompletionStatus(row.workoutCompletionStatus)] as const)
  );

  const workoutLogs: WorkoutLog[] = workoutLogsRows.length
    ? workoutLogsRows
        .filter(isRecord)
        .map((row) => ({
          id: asString(row.id),
          planSessionId: asString(row.planSessionId),
          performedDate: asString(row.performedDate),
          overallNotes: asNullableString(row.overallNotes),
          completionStatus: parseWorkoutCompletionStatus(row.completionStatus),
          createdAt: asString(row.createdAt, new Date(0).toISOString())
        }))
        .filter((workoutLog) => Boolean(workoutLog.id && workoutLog.planSessionId && workoutLog.performedDate))
    : sessionsRows
        .filter(isRecord)
        .map((row) => {
          const session = sessions.find((item) => item.id === asString(row.id)) ?? null;

          if (!session || !hasTruthyValue(row.hasWorkoutLog)) {
            return null;
          }

          return {
            id: `log-${session.id}`,
            planSessionId: session.id,
            performedDate: session.sessionDate,
            overallNotes: session.notes,
            completionStatus:
              completionStatusBySessionKey.get(buildSessionLookupKey(row)) ??
              parseWorkoutCompletionStatus(session.status),
            createdAt: `${session.sessionDate}T12:00:00.000Z`
          };
        })
        .filter((workoutLog): workoutLog is WorkoutLog => Boolean(workoutLog));

  const workoutLogBySessionId = new Map(
    workoutLogs.map((workoutLog) => [workoutLog.planSessionId, workoutLog] as const)
  );

  const exerciseLogs: WorkoutExerciseLog[] = exerciseLogsRows
    .filter(isRecord)
    .map((row) => {
      const sessionKey = buildSessionLookupKey(row);
      const session = sessionLookup.get(sessionKey) ?? null;

      if (!session) {
        return null;
      }

      const exercise = exerciseLookup.get([session.id, asString(row.exerciseName)].join("|")) ?? null;
      const workoutLog = workoutLogBySessionId.get(session.id) ?? null;

      if (!exercise || !workoutLog) {
        return null;
      }

      return {
        id: `${exercise.id}-performed`,
        workoutLogId: workoutLog.id,
        planExerciseId: exercise.id,
        exerciseNameSnapshot: exercise.exerciseName,
        plannedSetsSnapshot: asNullableNumber(row.plannedSets),
        plannedRepsSnapshot: asNullableNumber(row.plannedReps),
        plannedWeightSnapshot: asNullableNumber(row.plannedWeight),
        plannedNotesSnapshot: exercise.plannedNotes,
        actualWeight: asNullableNumber(row.actualWeight),
        actualReps: asNullableNumber(row.actualReps),
        actualSets: asNullableNumber(row.actualSets),
        notes: asNullableString(row.notes),
        performedOrder: exercise.sortOrder
      };
    })
    .filter((exerciseLog): exerciseLog is WorkoutExerciseLog => Boolean(exerciseLog));

  const importRuns: ImportRun[] = importRunsRows
    .filter(isRecord)
    .map((row) => ({
      id: asString(row.id),
      fileName: asString(row.fileName, "iron-log-storico.xls"),
      sheetName: asString(row.sheetName, "Storico"),
      totalRows: asNumber(row.totalRows),
      importedRows: asNumber(row.importedRows),
      skippedRows: asNumber(row.skippedRows),
      warnings: [],
      createdAt: asString(row.createdAt, new Date(0).toISOString())
    }))
    .filter((importRun) => Boolean(importRun.id));

  return {
    plans,
    sessions,
    exercises,
    workoutLogs,
    exerciseLogs,
    importRuns
  };
}
