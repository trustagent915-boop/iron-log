import type {
  ArmTrackerArchive,
  ArmTrackerArchiveExport,
  ArmTrackerArchiveImportResult,
  ArmTrackerData,
  ArmTrackerDataCounts,
  ArmTrackerDeletedIds,
  ImportRun,
  Plan,
  PlanExercise,
  PlanSession,
  WorkoutExerciseLog,
  WorkoutLog
} from "@/lib/arm-tracker/types";

const currentSchemaVersion = 3;
const maxDeletedIdsPerCollection = 1000;

const storageKeys = {
  root: "iron_log_db_v2",
  localBackups: "iron_log_db_v2_backups",
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

// Safari's localStorage quota per origin is ~5MB — much lower than
// Chrome's. A large snapshot (a few MB) plus multiple local backups used
// to blow past it and QuotaExceededError crashed every save, so the app
// showed nothing on iPad while working on desktop. Backups are now capped
// low and skipped entirely for big snapshots — the cloud already keeps
// versioned history in arm_tracker_snapshot_versions.
const maxLocalBackupCount = 2;
const maxBackupSnapshotBytes = 512 * 1024; // 0.5MB per backup ceiling

export const ARM_TRACKER_STORAGE_EVENT = "iron-log-storage-updated";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

// Write to localStorage without ever throwing. On a quota error we free
// space by dropping the (optional) local backups first, then retry once.
// If it still fails we silently give up — the cloud snapshot is the source
// of truth, so a full local cache never breaks the app.
function safeSetItem(key: string, value: string): boolean {
  if (!canUseStorage()) {
    return false;
  }
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    try {
      window.localStorage.removeItem(storageKeys.localBackups);
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
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
    bodyweightKg: asNullableNumber(raw.bodyweightKg),
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
    actualSeconds: asNullableNumber(raw.actualSeconds),
    notes: asNullableString(raw.notes),
    performedOrder: asNumber(raw.performedOrder)
  };
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of raw) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();

    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function normalizeDeletedIds(raw: unknown): ArmTrackerDeletedIds {
  const empty: ArmTrackerDeletedIds = {
    plans: [],
    sessions: [],
    exercises: [],
    workoutLogs: [],
    exerciseLogs: [],
    importRuns: []
  };

  if (!isRecord(raw)) {
    return empty;
  }

  return {
    plans: capDeletedIds(normalizeStringArray(raw.plans)),
    sessions: capDeletedIds(normalizeStringArray(raw.sessions)),
    exercises: capDeletedIds(normalizeStringArray(raw.exercises)),
    workoutLogs: capDeletedIds(normalizeStringArray(raw.workoutLogs)),
    exerciseLogs: capDeletedIds(normalizeStringArray(raw.exerciseLogs)),
    importRuns: capDeletedIds(normalizeStringArray(raw.importRuns))
  };
}

function capDeletedIds(ids: string[]): string[] {
  if (ids.length <= maxDeletedIdsPerCollection) {
    return ids;
  }
  return ids.slice(-maxDeletedIdsPerCollection);
}

function dropDeletedItems<T extends { id: string }>(items: T[], deletedIds: string[]): T[] {
  if (!deletedIds.length) {
    return items;
  }
  const deleted = new Set(deletedIds);
  return items.filter((item) => !deleted.has(item.id));
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
  const deletedIds = normalizeDeletedIds(rawSnapshot?.deletedIds);
  const plans = dropDeletedItems(
    dedupeById(
      (Array.isArray(rawSnapshot?.plans) ? rawSnapshot.plans : [])
        .map(normalizePlan)
        .filter((plan): plan is Plan => Boolean(plan))
    ),
    deletedIds.plans
  );
  const sessions = dropDeletedItems(
    dedupeById(
      (Array.isArray(rawSnapshot?.sessions) ? rawSnapshot.sessions : [])
        .map(normalizeSession)
        .filter((session): session is PlanSession => Boolean(session))
    ),
    deletedIds.sessions
  );
  const exercises = dropDeletedItems(
    dedupeById(
      (Array.isArray(rawSnapshot?.exercises) ? rawSnapshot.exercises : [])
        .map(normalizeExercise)
        .filter((exercise): exercise is PlanExercise => Boolean(exercise))
    ),
    deletedIds.exercises
  );
  const workoutLogs = dropDeletedItems(
    dedupeById(
      (Array.isArray(rawSnapshot?.workoutLogs) ? rawSnapshot.workoutLogs : [])
        .map(normalizeWorkoutLog)
        .filter((log): log is WorkoutLog => Boolean(log))
    ),
    deletedIds.workoutLogs
  );
  const importRuns = dropDeletedItems(
    dedupeById(
      (Array.isArray(rawSnapshot?.importRuns) ? rawSnapshot.importRuns : [])
        .map(normalizeImportRun)
        .filter((run): run is ImportRun => Boolean(run))
    ),
    deletedIds.importRuns
  );
  const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const exerciseLogs = dropDeletedItems(
    dedupeById(
      (Array.isArray(rawSnapshot?.exerciseLogs) ? rawSnapshot.exerciseLogs : [])
        .map((exerciseLog) => normalizeExerciseLog(exerciseLog, exerciseMap))
        .filter((exerciseLog): exerciseLog is WorkoutExerciseLog => Boolean(exerciseLog))
    ),
    deletedIds.exerciseLogs
  );
  const level100Watchlist = normalizeStringArray(rawSnapshot?.level100Watchlist);

  return {
    plans: normalizeActivePlanStatuses(plans),
    sessions,
    exercises,
    workoutLogs,
    exerciseLogs,
    importRuns,
    level100Watchlist,
    deletedIds
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

function readLocalBackups() {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(storageKeys.localBackups);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

function writeLocalBackup(snapshot: ArmTrackerData | null, reason: string) {
  if (!canUseStorage() || !snapshot || !hasStoredData(snapshot)) {
    return;
  }

  const createdAt = new Date().toISOString();
  const backup = {
    id: `${reason}-${createdAt}`,
    reason,
    createdAt,
    archive: buildArchive(snapshot, createdAt)
  };

  const serialized = JSON.stringify(backup);
  // Skip backups that would eat the tiny Safari quota. The cloud keeps
  // versioned snapshots, so a local safety backup for a multi-MB dataset
  // is not worth crashing localStorage over.
  if (serialized.length > maxBackupSnapshotBytes) {
    return;
  }

  safeSetItem(
    storageKeys.localBackups,
    JSON.stringify([backup, ...readLocalBackups()].slice(0, maxLocalBackupCount))
  );
}

function writeRootSnapshot(snapshot: ArmTrackerData) {
  if (!canUseStorage()) {
    return;
  }

  // The root snapshot is the priority cache. If it doesn't fit, safeSetItem
  // will drop the backups and retry; if it still doesn't fit (huge dataset
  // on Safari), we simply run from the in-memory copy — the cloud already
  // has the authoritative data.
  safeSetItem(storageKeys.root, JSON.stringify(buildArchive(snapshot)));
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

function mergeStringArrays(current: string[], incoming: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of [...current, ...incoming]) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function mergeDeletedIds(
  current: ArmTrackerDeletedIds,
  incoming: ArmTrackerDeletedIds
): ArmTrackerDeletedIds {
  return {
    plans: capDeletedIds(mergeStringArrays(current.plans, incoming.plans)),
    sessions: capDeletedIds(mergeStringArrays(current.sessions, incoming.sessions)),
    exercises: capDeletedIds(mergeStringArrays(current.exercises, incoming.exercises)),
    workoutLogs: capDeletedIds(mergeStringArrays(current.workoutLogs, incoming.workoutLogs)),
    exerciseLogs: capDeletedIds(mergeStringArrays(current.exerciseLogs, incoming.exerciseLogs)),
    importRuns: capDeletedIds(mergeStringArrays(current.importRuns, incoming.importRuns))
  };
}

function mergeSnapshots(current: ArmTrackerData, incoming: ArmTrackerData) {
  // Old cloud snapshots (schema v2) do not have deletedIds or level100Watchlist.
  // Normalize both sides so every field is guaranteed to exist before merging.
  const normalizedCurrent = normalizeSnapshot(current as Partial<ArmTrackerData>);
  const normalizedIncoming = normalizeSnapshot(incoming as Partial<ArmTrackerData>);
  const deletedIds = mergeDeletedIds(normalizedCurrent.deletedIds, normalizedIncoming.deletedIds);
  const level100Watchlist =
    normalizedIncoming.level100Watchlist.length > 0
      ? normalizedIncoming.level100Watchlist
      : normalizedCurrent.level100Watchlist;

  return normalizeSnapshot({
    plans: mergeById(normalizedCurrent.plans, normalizedIncoming.plans),
    sessions: mergeById(normalizedCurrent.sessions, normalizedIncoming.sessions),
    exercises: mergeById(normalizedCurrent.exercises, normalizedIncoming.exercises),
    workoutLogs: mergeById(normalizedCurrent.workoutLogs, normalizedIncoming.workoutLogs),
    exerciseLogs: mergeById(normalizedCurrent.exerciseLogs, normalizedIncoming.exerciseLogs),
    importRuns: mergeById(normalizedCurrent.importRuns, normalizedIncoming.importRuns),
    level100Watchlist,
    deletedIds
  });
}

export const mergeArmTrackerSnapshots = mergeSnapshots;

export function createEmptyArmTrackerData(): ArmTrackerData {
  return {
    plans: [],
    sessions: [],
    exercises: [],
    workoutLogs: [],
    exerciseLogs: [],
    importRuns: [],
    level100Watchlist: [],
    deletedIds: {
      plans: [],
      sessions: [],
      exercises: [],
      workoutLogs: [],
      exerciseLogs: [],
      importRuns: []
    }
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

export function exportArmTrackerLocalBackups() {
  const exportedAt = new Date().toISOString();
  const backups = readLocalBackups();

  return {
    fileName: `iron-log-safety-backups-${exportedAt.slice(0, 10)}.json`,
    payload: JSON.stringify(
      {
        app: "iron-log",
        type: "local-safety-backups",
        schemaVersion: currentSchemaVersion,
        exportedAt,
        backups
      },
      null,
      2
    ),
    exportedAt,
    count: backups.length
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

// In-memory copy of the current snapshot. This is the session source of
// truth for rendering. localStorage is only a persistence cache — when it
// can't hold the data (Safari quota) the app still works from memory, and
// the cloud still has the authoritative copy. Without this, a failed
// localStorage write on iPad made getSnapshot() read back empty and the
// whole UI rendered with no data.
let memorySnapshot: ArmTrackerData | null = null;

export const db = {
  getSnapshot(): ArmTrackerData {
    if (memorySnapshot) {
      return memorySnapshot;
    }

    const rootSnapshot = readRootSnapshot();

    if (rootSnapshot) {
      memorySnapshot = rootSnapshot;
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
    const currentSnapshot = memorySnapshot ?? readRootSnapshot();
    const normalizedSnapshot = normalizeSnapshot(snapshot);

    // Keep memory authoritative first so rendering always has the data
    // even if the localStorage writes below silently fail (Safari quota).
    memorySnapshot = normalizedSnapshot;

    // Root snapshot first (priority cache), then the best-effort backup.
    // None of these can throw anymore, so a full localStorage on Safari
    // never breaks a save — the change stays in memory and syncs to cloud.
    writeRootSnapshot(normalizedSnapshot);
    writeLocalBackup(currentSnapshot, "before-setSnapshot");
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
    safeSetItem(storageKeys.seedVersion, version);
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
