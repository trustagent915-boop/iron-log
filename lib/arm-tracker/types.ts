export type PlanStatus = "active" | "archived";
export type SessionStatus = "planned" | "completed" | "partial" | "skipped";
export type WorkoutCompletionStatus = Exclude<SessionStatus, "planned">;
export type SessionKind = "planned" | "custom";

export interface Plan {
  id: string;
  name: string;
  sourceFileName: string;
  importedAt: string;
  status: PlanStatus;
}

export interface PlanSession {
  id: string;
  planId: string;
  sessionDate: string;
  dayLabel: string | null;
  weekNumber: number | null;
  notes: string | null;
  status: SessionStatus;
  kind: SessionKind;
}

export interface PlanExercise {
  id: string;
  sessionId: string;
  exerciseName: string;
  plannedSets: number | null;
  plannedReps: number | null;
  plannedWeight: number | null;
  plannedNotes: string | null;
  sortOrder: number;
}

export interface WorkoutLog {
  id: string;
  planSessionId: string;
  performedDate: string;
  overallNotes: string | null;
  completionStatus: WorkoutCompletionStatus;
  createdAt: string;
}

export interface WorkoutExerciseLog {
  id: string;
  workoutLogId: string;
  planExerciseId: string;
  exerciseNameSnapshot: string;
  plannedSetsSnapshot: number | null;
  plannedRepsSnapshot: number | null;
  plannedWeightSnapshot: number | null;
  plannedNotesSnapshot: string | null;
  actualWeight: number | null;
  actualReps: number | null;
  actualSets: number | null;
  notes: string | null;
  performedOrder: number;
}

export interface ArmTrackerData {
  plans: Plan[];
  sessions: PlanSession[];
  exercises: PlanExercise[];
  workoutLogs: WorkoutLog[];
  exerciseLogs: WorkoutExerciseLog[];
  importRuns: ImportRun[];
}

export interface ImportPlanInput {
  fileName: string;
  sheetName: string;
  rows: ParsedRow[];
  warnings: string[];
  totalRows: number;
}

export interface CreateCustomSessionInput {
  sessionDate: string;
  title: string | null;
  notes: string | null;
  exercises: Array<{ exerciseName: string; plannedSets: number|null; plannedReps: number|null; plannedWeight: number|null; plannedNotes: string|null }>;
}

export interface SaveWorkoutLogInput {
  sessionId: string;
  performedDate: string;
  overallNotes: string | null;
  exercises: Array<{ planExerciseId: string; actualWeight: number|null; actualReps: number|null; actualSets: number|null; notes: string|null; skipped: boolean }>;
}
