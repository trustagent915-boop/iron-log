import type {
  ArmTrackerArchive,
  ArmTrackerArchiveExport,
  ArmTrackerArchiveImportResult,
  ArmTrackerData,
  ArmTrackerDataCounts,
  ImportRun,
  Plan,
  PlanExercise,
  PlanSession,
  WorkoutExerciseLog,
  WorkoutLog
} from "@/lib/arm-tracker/types";

const currentSchemaVersion = 2;

const storageKeys = {
  root: "iron_log_db_v2",
  seedVersion: "iron_log_seed_version",
  legacyPlans: "aw_plans",
  legacySessions: "aw_sessions",
  legacyExercises: "aw_exercises",
  legacyWorkoutLogs: "aw_workout_logs",
  legacyExerciseLogs: "aw_exercise_logs",
  legacyImportRuns: "aw_import_runs"
} as const;

const collectionKeys = [
  "plans",
  "sessions",
  "exercises",
  "workoutLogs",
  "exerciseLogs",
  "importRuns"
] as const;

export const ARM_TRACKER_STORAGE_EVENT = "iron-log-storage-updated";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createFallbackId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readLegacyCollection<T>(key: string): T[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? (parsedValue as T[]) : [];
  } catch {
    return [];
  }
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const map = new Map<string, T>();

  items.forEach((item) => {
    if (item.id) {
      map.set(item.id, item);
    }
  });

  return [...map.values()];
}

function normalizePlan(raw: unknown): Plan | null {
  if (!isRecord(raw)) {
    return null;
  }

  return {
    id: asString(raw.id, createFallbackId("plan")),
    name: asString(raw.name, "Programma"),
    sourceFileName: asString(raw.sourceFileName, "import.xlsx"),
    importedAt: asString(raw.importedAt, new Date(0).toISOString()),
    status: raw.status === "archived" ? "archived" : "active"
  };
}

function normalizeSession(raw: unknown): PlanSession | null {
  if (!isRecord(raw)) {
    return null;
  }

  return {
    id: asString(raw.id, createFallbackId("session")),
    planId: asString(raw.planId),
    sessionDate: asString(raw.sessionDate, new Date(0).toISOString().slice(0, 10)),
    dayLabel: asNullableString(raw.dayLabel),
    weekNumber: asNullableNumber(raw.weekNumber),
    notes: asNullableString(raw.notes),
    status:
      raw.status === "completed" || raw.status === "partial" || raw.status === "skipped"
        ? raw.status
        : "planned",
    kind: raw.kind === "custom" ? "custom" : "planned"
  };
}

function normalizeExercise(raw: unknown): PlanExercise | null {
  if (!isRecord(raw)) {
    return null;
  }

  return {
    id: asString(raw.id, createFallbackId("exercise")),
    sessionId: asString(raw.sessionId),
    exerciseName: asString(raw.exerciseName, "Esercizio"),
    plannedSets: asNullableNumber(raw.plannedSets),
    plannedReps: asNullableNumber(raw.plannedReps),
    plannedWeight: asNullableNumber(raw.plannedWeight),
    plannedNotes: asNullableString(raw.plannedNotes),
    sortOrder: asNumber(raw.sortOrder)
  };
}

function normalizeWorkoutLog(raw: unknown): WorkoutLog | null {
  if (!isRecord(raw)) {
    return null;
  }

  return {
    id: asString(raw.id, createFallbackId("workout")),
    planSessionId: asString(raw.planSessionId),
    performedDate: asString(raw.performedDate, new Date(0).toISOString().slice(0, 10)),
    overallNotes: asNullableString(raw.overallNotes),
    completionStatus:
      raw.completionStatus === "partial" || raw.completionStatus === "skipped"
        ? raw.completionStatus
        : "completed",
    createdAt: asString(raw.createdAt, new Date(0).toISOString())
  };
}

function normalizeImportRun(raw: unknown): ImportRun | null {
  if (!isRecord(raw)) {
    return null;
  }

  return {
    id: asString(raw.id, createFallbackId("import")),
    fileName: asString(raw.fileName, "import.xlsx"),
    sheetName: asString(raw.sheetName, "Foglio 1"),
    totalRows: asNumber(raw.totalRows),
    importedRows: asNumber(raw.importedRows),
    skippedRows: asNumber(raw.skippedRows),
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((warning): warning is string => typeof warning === "string")
      : [],
    createdAt: asString(raw.createdAt, new Date(0).toISOString())
  };
}

function normalizeExerciseLog(
  raw: unknown,
  exerciseMap: Map<string, PlanExercise>
): WorkoutExerciseLog | null {
  if (!isRecord(raw)) {
    return null;
  }

  const planExerciseId = asString(raw.planExerciseId);
  const plannedExercise = exerciseMap.get(planExerciseId);

  return {
    id: asString(raw.id, createFallbackId("exercise-log")),
    workoutLogId: asString(raw.workoutLogId),
    planExerciseId,
    exerciseNameSnapshot: asString(raw.exerciseNameSnapshot, plannedExercise?.exerciseName ?? "Esercizio"),
    plannedSetsSnapshot: asNullableNumber(raw.plannedSetsSnapshot) ?? plannedExercise?.plannedSets ?? null,
    plannedRepsSnapshot: asNullableNumber(raw.plannedRepsSnapshot) ?? plannedExercise?.plannedReps ?? null,
    plannedWeightSnapshot:
      asNullableNumber(raw.plannedWeightSnapshot) ?? plannedExercise?.plannedWeight ?? null,
    plannedNotesSnapshot: asNullableString(raw.plannedNotesSnapshot) ?? plannedExercise?.plannedNotes ?? null,
    actualWeight: asNullableNumber(raw.actualWeight),
    actualReps: asNullableNumber(raw.actualReps),
    actualSets: asNullableNumber(raw.actualSets),
    notes: asNullableString(raw.notes),
    performedOrder: asNumber(raw.performedOrder)
  };
}

function normalizeActivePlanStatuses(plans: Plan[]) {
  const activePlans = [...plans]
    .filter((plan) => plan.status === "active")
    .sort((left, right) => right.importedAt.localeCompare(left.importedAt));

  const preservedActivePlanId = activePlans[0]?.id ?? null;

  return plans.map((plan) =>
    plan.status === "active" && plan.id !== preservedActivePlanId ? { ...plan, status: "archived" as const } : plan
  );
}

function normalizeSnapshot(rawSnapshot: Partial<ArmTrackerData> | null | undefined): ArmTrackerData {
  const plans = dedupeById(
    (Array.isArray(rawSnapshot?.plans) ? rawSnapshot.plans : [])
      .map(normalizePlan)
      .filter((plan): plan is Plan => Boolean(plan))
  );
  const sessions = dedupeById(
    (Array.isArray(rawSnapshot?.sessions) ? rawSnapshot.sessions : [])
      .map(normalizeSession)
      .filter((session): session is PlanSession => Boolean(session))
  );
  const exercises = dedupeById(
    (Array.isArray(rawSnapshot?.exercises) ? rawSnapshot.exercises : [])
      .map(normalizeExercise)
      .filter((exercise): exercise is PlanExercise => Boolean(exercise))
  );
  const workoutLogs = dedupeById(
    (Array.isArray(rawSnapshot?.workoutLogs) ? rawSnapshot.workoutLogs : [])
      .map(normalizeWorkoutLog)
      .filter((log): log is WorkoutLog => Boolean(log))
  );
  const importRuns = dedupeById(
    (Array.isArray(rawSnapshot?.importRuns) ? rawSnapshot.importRuns : [])
      .map(normalizeImportRun)
      .filter((run): run is ImportRun => Boolean(run))
  );
  const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const exerciseLogs = dedupeById(
    (Array.isArray(rawSnapshot?.exerciseLogs) ? rawSnapshot.exerciseLogs : [])
      .map((exerciseLog) => normalizeExerciseLog(exerciseLog, exerciseMap))
      .filter((exerciseLog): exerciseLog is WorkoutExerciseLog => Boolean(exerciseLog))
  );

  return {
    plans: normalizeActivePlanStatuses(plans),
    sessions,
    exercises,
    workoutLogs,
    exerciseLogs,
    importRuns
  };
}

function hasStoredData(snapshot: ArmTrackerData) {
  return collectionKeys.some((key) => snapshot[key].length > 0);
}

function buildArchive(snapshot: ArmTrackerData, exportedAt = new Date().toISOString()): ArmTrackerArchive {
  return {
    app: "iron-log",
    schemaVersion: currentSchemaVersion,
    exportedAt,
    data: normalizeSnapshot(snapshot)
  };
}

function writeRootSnapshot(snapshot: ArmTrackerData) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(storageKeys.root, JSON.stringify(buildArchive(snapshot)));
}

function clearLegacyKeys() {
  if (!canUseStorage()) {
    return;
  }

  [
    storageKeys.legacyPlans,
    storageKeys.legacySessions,
    storageKeys.legacyExercises,
    storageKeys.legacyWorkoutLogs,
    storageKeys.legacyExerciseLogs,
    storageKeys.legacyImportRuns
  ].forEach((key) => window.localStorage.removeItem(key));
}

function notifyStorageUpdate() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(ARM_TRACKER_STORAGE_EVENT));
}

function readRootSnapshot() {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKeys.root);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);

    if (isRecord(parsedValue) && isRecord(parsedValue.data)) {
      return normalizeSnapshot(parsedValue.data as Partial<ArmTrackerData>);
    }

    if (isRecord(parsedValue)) {
      return normalizeSnapshot(parsedValue as Partial<ArmTrackerData>);
    }

    return null;
  } catch {
    return null;
  }
}

function readLegacySnapshot() {
  return normalizeSnapshot({
    plans: readLegacyCollection<Plan>(storageKeys.legacyPlans),
    sessions: readLegacyCollection<PlanSession>(storageKeys.legacySessions),
    exercises: readLegacyCollection<PlanExercise>(storageKeys.legacyExercises),
    workoutLogs: readLegacyCollection<WorkoutLog>(storageKeys.legacyWorkoutLogs),
    exerciseLogs: readLegacyCollection<WorkoutExerciseLog>(storageKeys.legacyExerciseLogs),
    importRuns: readLegacyCollection<ImportRun>(storageKeys.legacyImportRuns)
  });
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const mergedMap = new Map<string, T>();

  current.forEach((item) => mergedMap.set(item.id, item));
  incoming.forEach((item) => mergedMap.set(item.id, item));

  return [...mergedMap.values()];
}

function mergeSnapshots(current: ArmTrackerData, incoming: ArmTrackerData) {
  return normalizeSnapshot({
    plans: mergeById(current.plans, incoming.plans),
    sessions: mergeById(current.sessions, incoming.sessions),
    exercises: mergeById(current.exercises, incoming.exercises),
    workoutLogs: mergeById(current.workoutLogs, incoming.workoutLogs),
    exerciseLogs: mergeById(current.exerciseLogs, incoming.exerciseLogs),
    importRuns: mergeById(current.importRuns, incoming.importRuns)
  });
}

export function createEmptyArmTrackerData(): ArmTrackerData {
  return {
    plans: [],
    sessions: [],
    exercises: [],
    workoutLogs: [],
    exerciseLogs: [],
    importRuns: []
  };
}

export function getDataCounts(snapshot: ArmTrackerData): ArmTrackerDataCounts {
  return {
    plans: snapshot.plans.length,
    sessions: snapshot.sessions.length,
    exercises: snapshot.exercises.length,
    workoutLogs: snapshot.workoutLogs.length,
    exerciseLogs: snapshot.exerciseLogs.length,
    importRuns: snapshot.importRuns.length
  };
}

export function hasStoredArmTrackerData(snapshot: ArmTrackerData) {
  return collectionKeys.some((key) => snapshot[key].length > 0);
}

export function importArmTrackerSnapshot(
  snapshot: ArmTrackerData,
  exportedAt: string | null = null
): ArmTrackerArchiveImportResult {
  const currentSnapshot = db.getSnapshot();
  const nextSnapshot = mergeSnapshots(currentSnapshot, snapshot);
  const beforeCounts = getDataCounts(currentSnapshot);
  const nextCounts = getDataCounts(nextSnapshot);

  db.setSnapshot(nextSnapshot);

  return {
    exportedAt,
    counts: nextCounts,
    added: {
      plans: nextCounts.plans - beforeCounts.plans,
      sessions: nextCounts.sessions - beforeCounts.sessions,
      exercises: nextCounts.exercises - beforeCounts.exercises,
      workoutLogs: nextCounts.workoutLogs - beforeCounts.workoutLogs,
      exerciseLogs: nextCounts.exerciseLogs - beforeCounts.exerciseLogs,
      importRuns: nextCounts.importRuns - beforeCounts.importRuns
    }
  };
}

export function exportArmTrackerArchive(snapshot = db.getSnapshot()): ArmTrackerArchiveExport {
  const exportedAt = new Date().toISOString();
  const archive = buildArchive(snapshot, exportedAt);

  return {
    fileName: `iron-log-archive-${exportedAt.slice(0, 10)}.json`,
    payload: JSON.stringify(archive, null, 2),
    exportedAt,
    counts: getDataCounts(archive.data)
  };
}

export function importArmTrackerArchive(payload: string): ArmTrackerArchiveImportResult {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(payload);
  } catch {
    throw new Error("Il backup non e un JSON valido.");
  }

  if (!isRecord(parsedValue)) {
    throw new Error("Il file selezionato non contiene un archivio Iron Log valido.");
  }

  if ("app" in parsedValue && parsedValue.app !== "iron-log") {
    throw new Error("Questo archivio non appartiene a Iron Log.");
  }

  const incomingSnapshot = normalizeSnapshot(
    isRecord(parsedValue.data) ? (parsedValue.data as Partial<ArmTrackerData>) : (parsedValue as Partial<ArmTrackerData>)
  );
  return importArmTrackerSnapshot(
    incomingSnapshot,
    typeof parsedValue.exportedAt === "string" ? parsedValue.exportedAt : null
  );
}

export const db = {
  getSnapshot(): ArmTrackerData {
    const rootSnapshot = readRootSnapshot();

    if (rootSnapshot) {
      return rootSnapshot;
    }

    const legacySnapshot = readLegacySnapshot();

    if (hasStoredData(legacySnapshot)) {
      this.setSnapshot(legacySnapshot);
      return legacySnapshot;
    }

    return createEmptyArmTrackerData();
  },

  setSnapshot(snapshot: ArmTrackerData) {
    const normalizedSnapshot = normalizeSnapshot(snapshot);

    writeRootSnapshot(normalizedSnapshot);
    clearLegacyKeys();
    notifyStorageUpdate();
  },

  hasUserData(snapshot?: ArmTrackerData) {
    return hasStoredArmTrackerData(snapshot ?? this.getSnapshot());
  },

  getSeedVersion() {
    if (!canUseStorage()) {
      return null;
    }

    const rawValue = window.localStorage.getItem(storageKeys.seedVersion);
    return rawValue?.trim() ? rawValue : null;
  },

  setSeedVersion(version: string) {
    if (!canUseStorage()) {
      return;
    }

    window.localStorage.setItem(storageKeys.seedVersion, version);
  },

  getPlans() {
    return this.getSnapshot().plans;
  },

  getActivePlan() {
    return this.getSnapshot().plans.find((plan) => plan.status === "active") ?? null;
  },

  savePlan(plan: Plan) {
    const snapshot = this.getSnapshot();

    this.setSnapshot({
      ...snapshot,
      plans: [...snapshot.plans.filter((item) => item.id !== plan.id), plan]
    });
  },

  archivePlan(planId: string) {
    const snapshot = this.getSnapshot();

    this.setSnapshot({
      ...snapshot,
      plans: snapshot.plans.map((plan) => (plan.id === planId ? { ...plan, status: "archived" as const } : plan))
    });
  },

  getSessions(planId?: string) {
    const sessions = this.getSnapshot().sessions;
    return planId ? sessions.filter((session) => session.planId === planId) : sessions;
  },

  getSession(sessionId: string) {
    return this.getSnapshot().sessions.find((session) => session.id === sessionId) ?? null;
  },

  saveSessions(sessions: PlanSession[]) {
    const snapshot = this.getSnapshot();

    this.setSnapshot({
      ...snapshot,
      sessions: [
        ...snapshot.sessions.filter(
          (existingSession) => !sessions.some((nextSession) => nextSession.id === existingSession.id)
        ),
        ...sessions
      ]
    });
  },

  updateSession(sessionId: string, updates: Partial<PlanSession>) {
    const snapshot = this.getSnapshot();

    this.setSnapshot({
      ...snapshot,
      sessions: snapshot.sessions.map((session) =>
        session.id === sessionId ? { ...session, ...updates } : session
      )
    });
  },

  getExercises(sessionId?: string) {
    const exercises = this.getSnapshot().exercises;
    return sessionId ? exercises.filter((exercise) => exercise.sessionId === sessionId) : exercises;
  },

  saveExercises(exercises: PlanExercise[]) {
    const snapshot = this.getSnapshot();

    this.setSnapshot({
      ...snapshot,
      exercises: [
        ...snapshot.exercises.filter(
          (existingExercise) => !exercises.some((nextExercise) => nextExercise.id === existingExercise.id)
        ),
        ...exercises
      ]
    });
  },

  getWorkoutLogs() {
    return this.getSnapshot().workoutLogs;
  },

  getWorkoutLog(logId: string) {
    return this.getSnapshot().workoutLogs.find((log) => log.id === logId) ?? null;
  },

  getWorkoutLogBySession(sessionId: string) {
    const logs = this.getSnapshot().workoutLogs
      .filter((log) => log.planSessionId === sessionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    return logs.at(-1) ?? null;
  },

  saveWorkoutLog(workoutLog: WorkoutLog) {
    const snapshot = this.getSnapshot();

    this.setSnapshot({
      ...snapshot,
      workoutLogs: [...snapshot.workoutLogs.filter((log) => log.id !== workoutLog.id), workoutLog]
    });
  },

  getExerciseLogs(workoutLogId?: string) {
    const exerciseLogs = this.getSnapshot().exerciseLogs;
    return workoutLogId ? exerciseLogs.filter((log) => log.workoutLogId === workoutLogId) : exerciseLogs;
  },

  saveExerciseLogs(exerciseLogs: WorkoutExerciseLog[]) {
    const snapshot = this.getSnapshot();

    this.setSnapshot({
      ...snapshot,
      exerciseLogs: [
        ...snapshot.exerciseLogs.filter(
          (existingExerciseLog) =>
            !exerciseLogs.some((nextExerciseLog) => nextExerciseLog.id === existingExerciseLog.id)
        ),
        ...exerciseLogs
      ]
    });
  },

  getImportRuns() {
    return this.getSnapshot().importRuns;
  },

  saveImportRun(importRun: ImportRun) {
    const snapshot = this.getSnapshot();

    this.setSnapshot({
      ...snapshot,
      importRuns: [...snapshot.importRuns.filter((run) => run.id !== importRun.id), importRun]
    });
  },

  getAllExerciseNames() {
    const snapshot = this.getSnapshot();
    const planExerciseNames = snapshot.exercises.map((exercise) => exercise.exerciseName);
    const loggedExerciseNames = snapshot.exerciseLogs.map((exerciseLog) => exerciseLog.exerciseNameSnapshot);

    return [...new Set([...planExerciseNames, ...loggedExerciseNames].filter(Boolean))].sort((left, right) =>
      left.localeCompare(right, "it")
    );
  }
};
