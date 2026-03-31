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

export interface ImportRun {
  id: string;
  fileName: string;
  sheetName: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  warnings: string[];
  createdAt: string;
}

export interface ColumnMapping {
  date: string | null;
  day: string | null;
  week: string | null;
  exercise: string | null;
  sets: string | null;
  reps: string | null;
  weight: string | null;
  notes: string | null;
}

export interface ParsedRow {
  date: string | null;
  day: string | null;
  week: number | null;
  exercise: string | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  notes: string | null;
  rowIndex: number;
  warnings: string[];
  valid: boolean;
}

export interface ParsedSheetResult {
  headers: string[];
  rows: ParsedRow[];
  previewRows: ParsedRow[];
  warnings: string[];
  totalRows: number;
  importedRows: number;
  skippedRows: number;
}

export interface MappingCompleteness {
  missingRequired: Array<"exercise" | "date_or_day">;
  mappedCount: number;
  totalCount: number;
}

export interface ArmTrackerData {
  plans: Plan[];
  sessions: PlanSession[];
  exercises: PlanExercise[];
  workoutLogs: WorkoutLog[];
  exerciseLogs: WorkoutExerciseLog[];
  importRuns: ImportRun[];
}

export interface ArmTrackerDataCounts {
  plans: number;
  sessions: number;
  exercises: number;
  workoutLogs: number;
  exerciseLogs: number;
  importRuns: number;
}

export interface ArmTrackerArchive {
  app: "iron-log";
  schemaVersion: number;
  exportedAt: string;
  data: ArmTrackerData;
}

export interface ArmTrackerArchiveExport {
  fileName: string;
  payload: string;
  exportedAt: string;
  counts: ArmTrackerDataCounts;
}

export interface ArmTrackerArchiveImportResult {
  exportedAt: string | null;
  counts: ArmTrackerDataCounts;
  added: ArmTrackerDataCounts;
}

export interface SessionWithExercises extends PlanSession {
  exercises: PlanExercise[];
}

export interface WorkoutLogWithExercises extends WorkoutLog {
  exerciseLogs: WorkoutExerciseLog[];
}

export interface SessionDetails {
  session: PlanSession;
  plan: Plan | null;
  exercises: PlanExercise[];
  workoutLog: WorkoutLog | null;
  exerciseLogs: WorkoutExerciseLog[];
}

export interface ImportPlanInput {
  fileName: string;
  sheetName: string;
  rows: ParsedRow[];
  warnings: string[];
  totalRows: number;
}

export interface ImportPlanResult {
  plan: Plan;
  sessions: PlanSession[];
  exercises: PlanExercise[];
  importRun: ImportRun;
  warnings: string[];
  importedRows: number;
  skippedRows: number;
}

export interface CreateCustomSessionExerciseInput {
  exerciseName: string;
  plannedSets: number | null;
  plannedReps: number | null;
  plannedWeight: number | null;
  plannedNotes: string | null;
}

export interface CreateCustomSessionInput {
  sessionDate: string;
  title: string | null;
  notes: string | null;
  exercises: CreateCustomSessionExerciseInput[];
}

export interface CreateCustomSessionResult {
  session: PlanSession;
  exercises: PlanExercise[];
}

export interface WorkoutExerciseInput {
  planExerciseId: string;
  actualWeight: number | null;
  actualReps: number | null;
  actualSets: number | null;
  notes: string | null;
  skipped: boolean;
}

export interface SaveWorkoutLogInput {
  sessionId: string;
  performedDate: string;
  overallNotes: string | null;
  exercises: WorkoutExerciseInput[];
}
