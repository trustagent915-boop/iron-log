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
  if (row.date) return row.date;
  const fallbackDate = format(addDays(startOfToday(), sessionIndex), "yyyy-MM-dd");
  fallbackWarnings.push(`Sessione senza data: assegnata ${fallbackDate}.`);
  return fallbackDate;
}

export function importParsedPlan(input: ImportPlanInput): ImportPlanResult {
  const snapshot = db.getSnapshot();
  const importedAt = new Date().toISOString();
  const fallbackWarnings: string[] = [];
  const activePlans = snapshot.plans.map(plan => plan.status === "active" ? { ...plan, status: "archived" as const } : plan);
  const plan: Plan = { id: crypto.randomUUID(), name: input.fileName.replace(/\.[^.]+$/,"") || "Nuovo programma", sourceFileName: input.fileName, importedAt, status: "active" };
  return { plan, sessions: [], exercises: [], importRun: { id: crypto.randomUUID(), fileName: input.fileName, sheetName: input.sheetName, totalRows: input.totalRows, importedRows: 0, skippedRows: 0, warnings: [], createdAt: importedAt }, warnings: [], importedRows: 0, skippedRows: 0 };
}

export function createCustomSession(input: CreateCustomSessionInput): CreateCustomSessionResult {
  return { session: { id: crypto.randomUUID(), planId: "", sessionDate: input.sessionDate, dayLabel: null, weekNumber: null, notes: null, status: "planned", kind: "custom" }, exercises: [] };
}

export function saveWorkoutLogEntry(input: SaveWorkoutLogInput) {
  return { workoutLog: { id: crypto.randomUUID(), planSessionId: input.sessionId, performedDate: input.performedDate, overallNotes: null, completionStatus: "completed" as const, createdAt: new Date().toISOString() }, exerciseLogs: [], completionStatus: "completed" as const };
}
