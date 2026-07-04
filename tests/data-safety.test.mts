import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLevel100Dashboard,
  getLevel100Score,
  LEVEL_100_TARGET_EXERCISES
} from "../lib/arm-tracker/level-100.ts";
import { createEmptyArmTrackerData, mergeArmTrackerSnapshots } from "../lib/arm-tracker/storage.ts";
import type {
  ArmTrackerData,
  WorkoutExerciseLog,
  WorkoutLog
} from "../lib/arm-tracker/types.ts";

function makeSnapshot(overrides: Partial<ArmTrackerData> = {}): ArmTrackerData {
  return {
    ...createEmptyArmTrackerData(),
    ...overrides,
    deletedIds: {
      ...createEmptyArmTrackerData().deletedIds,
      ...(overrides.deletedIds ?? {})
    }
  };
}

function makeWorkoutLog(id: string, overrides: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id,
    planSessionId: "session-1",
    performedDate: "2026-06-01",
    bodyweightKg: 90,
    overallNotes: null,
    completionStatus: "completed",
    createdAt: "2026-06-01T10:00:00.000Z",
    ...overrides
  };
}

function makeExerciseLog(id: string, overrides: Partial<WorkoutExerciseLog> = {}): WorkoutExerciseLog {
  return {
    id,
    workoutLogId: "log-1",
    planExerciseId: "exercise-1",
    exerciseNameSnapshot: "Esercizio",
    plannedSetsSnapshot: null,
    plannedRepsSnapshot: null,
    plannedWeightSnapshot: null,
    plannedNotesSnapshot: null,
    actualWeight: null,
    actualReps: null,
    actualSets: null,
    actualSeconds: null,
    notes: null,
    performedOrder: 0,
    ...overrides
  };
}

test("one arm pull up iso validates a record with seconds >= 10 and counts toward the dashboard", () => {
  const exerciseLog = makeExerciseLog("ex-iso", {
    workoutLogId: "log-iso",
    exerciseNameSnapshot: "One Arm Pull Up Iso",
    actualWeight: 0,
    actualSeconds: 12
  });
  const workoutLog = makeWorkoutLog("log-iso", { bodyweightKg: 88 });

  const snapshot = makeSnapshot({
    workoutLogs: [workoutLog],
    exerciseLogs: [exerciseLog]
  });

  const dashboard = buildLevel100Dashboard(snapshot, {
    bodyweightKg: 88,
    pinnedExerciseNames: ["One Arm Pull Up Iso"]
  });

  const iso = dashboard.exercises.find((entry) => entry.exerciseName === "One Arm Pull Up Iso");
  assert.ok(iso, "Iso exercise must appear on the dashboard");
  assert.equal(iso?.validRecordCount, 1);
  assert.equal(iso?.bestValidSeconds, 12);
  assert.equal(
    iso?.level,
    getLevel100Score({ exerciseName: "One Arm Pull Up Iso", weight: 0, bodyweightKg: 88, seconds: 12 })
  );
});

test("one arm pull up iso under 10 seconds does not validate a record", () => {
  const exerciseLog = makeExerciseLog("ex-iso-short", {
    workoutLogId: "log-iso-short",
    exerciseNameSnapshot: "One Arm Pull Up Iso",
    actualWeight: 0,
    actualSeconds: 6
  });
  const workoutLog = makeWorkoutLog("log-iso-short", { bodyweightKg: 88 });

  const snapshot = makeSnapshot({
    workoutLogs: [workoutLog],
    exerciseLogs: [exerciseLog]
  });

  const dashboard = buildLevel100Dashboard(snapshot, {
    bodyweightKg: 88,
    pinnedExerciseNames: ["One Arm Pull Up Iso"]
  });

  const iso = dashboard.exercises.find((entry) => entry.exerciseName === "One Arm Pull Up Iso");
  assert.equal(iso?.validRecordCount, 0);
  assert.equal(iso?.level, 0);
});

test("merge keeps every plan and workout from both sides without dropping any (zero loss)", () => {
  const current = makeSnapshot({
    plans: [
      {
        id: "plan-1",
        name: "Programma A",
        sourceFileName: "a.xlsx",
        importedAt: "2026-05-01T00:00:00.000Z",
        status: "active"
      }
    ],
    workoutLogs: [makeWorkoutLog("log-1")]
  });
  const incoming = makeSnapshot({
    plans: [
      {
        id: "plan-2",
        name: "Programma B",
        sourceFileName: "b.xlsx",
        importedAt: "2026-05-15T00:00:00.000Z",
        status: "active"
      }
    ],
    workoutLogs: [makeWorkoutLog("log-2")]
  });

  const merged = mergeArmTrackerSnapshots(current, incoming);

  assert.equal(merged.plans.length, 2);
  assert.equal(merged.workoutLogs.length, 2);
});

test("merge does not resurrect items that have been tombstoned via deletedIds", () => {
  const current = makeSnapshot({
    workoutLogs: [makeWorkoutLog("keep")],
    deletedIds: {
      plans: [],
      sessions: [],
      exercises: [],
      workoutLogs: ["deleted-log"],
      exerciseLogs: [],
      importRuns: []
    }
  });
  const incoming = makeSnapshot({
    workoutLogs: [makeWorkoutLog("deleted-log"), makeWorkoutLog("incoming-only")]
  });

  const merged = mergeArmTrackerSnapshots(current, incoming);
  const ids = merged.workoutLogs.map((log) => log.id).sort();

  assert.deepEqual(ids, ["incoming-only", "keep"]);
  assert.ok(merged.deletedIds.workoutLogs.includes("deleted-log"));
});

test("watchlist level 100 from incoming wins when non-empty so the cloud is source of truth", () => {
  const current = makeSnapshot({ level100Watchlist: ["Squat", "Panca Piana"] });
  const incoming = makeSnapshot({ level100Watchlist: ["Squat", "Stacco da terra"] });

  const merged = mergeArmTrackerSnapshots(current, incoming);

  assert.deepEqual(merged.level100Watchlist, ["Squat", "Stacco da terra"]);
});

test("watchlist level 100 from current is preserved when incoming has an empty watchlist", () => {
  const current = makeSnapshot({ level100Watchlist: ["Squat", "Panca Piana"] });
  const incoming = makeSnapshot({ level100Watchlist: [] });

  const merged = mergeArmTrackerSnapshots(current, incoming);

  assert.deepEqual(merged.level100Watchlist, ["Squat", "Panca Piana"]);
});

test("merge preserves local edits when the incoming snapshot is missing the same id (no overwrite of local)", () => {
  const localOnlyLog = makeWorkoutLog("local-fresh", {
    overallNotes: "fresh local edit",
    createdAt: "2026-06-10T10:00:00.000Z"
  });
  const sharedLog = makeWorkoutLog("shared", { overallNotes: "remote version" });

  const current = makeSnapshot({ workoutLogs: [localOnlyLog, makeWorkoutLog("shared", { overallNotes: "local version" })] });
  const incoming = makeSnapshot({ workoutLogs: [sharedLog] });

  const merged = mergeArmTrackerSnapshots(current, incoming);
  const ids = merged.workoutLogs.map((log) => log.id).sort();

  assert.ok(ids.includes("local-fresh"), "Local-only log must survive a merge with a richer remote");
});

test("default target exercises are still exposed for the dashboard seed", () => {
  assert.ok(LEVEL_100_TARGET_EXERCISES.includes("Squat"));
  assert.ok(LEVEL_100_TARGET_EXERCISES.includes("One Arm Pull Up Iso"));
});

test("merge accepts legacy v2 snapshots (missing deletedIds/level100Watchlist) without crashing", () => {
  const legacyRemote = {
    plans: [
      {
        id: "plan-legacy",
        name: "Programma vecchio",
        sourceFileName: "old.xlsx",
        importedAt: "2026-04-01T00:00:00.000Z",
        status: "active"
      }
    ],
    sessions: [],
    exercises: [],
    workoutLogs: [makeWorkoutLog("legacy-log")],
    exerciseLogs: [],
    importRuns: []
  } as unknown as ArmTrackerData;

  const localFresh = makeSnapshot();
  const merged = mergeArmTrackerSnapshots(localFresh, legacyRemote);

  assert.equal(merged.plans.length, 1);
  assert.equal(merged.workoutLogs.length, 1);
  assert.deepEqual(merged.deletedIds.workoutLogs, []);
  assert.deepEqual(merged.level100Watchlist, []);
});
