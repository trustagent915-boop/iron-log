import assert from "node:assert/strict";
import test from "node:test";

import {
  getIsometryCompletion,
  getIsometrySummary,
  hasReachedIsometryTarget,
  isIsometryExerciseName,
  isometryTotalTargetSeconds,
  resolveIsometryTarget
} from "../lib/arm-tracker/isometry-target.ts";
import type { ArmTrackerData } from "../lib/arm-tracker/types.ts";

function emptyData(): ArmTrackerData {
  return {
    plans: [],
    sessions: [],
    exercises: [],
    workoutLogs: [],
    exerciseLogs: [],
    importRuns: [],
    level100Watchlist: [],
    isometryTargets: {},
    dashboardConfig: { pinned: [], hidden: [], order: [], updatedAt: "1970-01-01T00:00:00.000Z" },
    deletedIds: { plans: [], sessions: [], exercises: [], workoutLogs: [], exerciseLogs: [], importRuns: [] }
  };
}

function withSession(
  data: ArmTrackerData,
  date: string,
  entries: Array<{ name: string; record: number | null; volume: number | null; notes?: string | null }>
) {
  const workoutLogId = `log-${date}`;
  data.workoutLogs.push({
    id: workoutLogId,
    planSessionId: `session-${date}`,
    performedDate: date,
    bodyweightKg: 90,
    overallNotes: null,
    completionStatus: "completed",
    createdAt: `${date}T10:00:00.000Z`
  });
  entries.forEach((entry, index) => {
    data.exerciseLogs.push({
      id: `${workoutLogId}-${index}`,
      workoutLogId,
      planExerciseId: `plan-${index}`,
      exerciseNameSnapshot: entry.name,
      plannedSetsSnapshot: null,
      plannedRepsSnapshot: null,
      plannedWeightSnapshot: null,
      plannedNotesSnapshot: null,
      actualWeight: 40,
      actualReps: 4,
      actualSets: 3,
      actualSeconds: entry.record,
      actualHoldTotalSeconds: entry.volume,
      notes: entry.notes ?? null,
      performedOrder: index
    });
  });
  return data;
}

test("defaults: ten seconds of volume everywhere, a record goal only on pure isometries", () => {
  assert.equal(isometryTotalTargetSeconds, 10);
  const normal = resolveIsometryTarget({}, "Pull Up zavorrato");
  assert.equal(normal.volumeTargetSeconds, 10);
  assert.equal(normal.recordTargetSeconds, null);
  assert.equal(normal.isCustom, false);

  const iso = resolveIsometryTarget({}, "One Arm Pull Up Iso");
  assert.equal(iso.recordTargetSeconds, 10);
});

test("a per-exercise target overrides the default and is matched loosely on the name", () => {
  const targets = {
    "side pressure": { volumeTargetSeconds: 60, recordTargetSeconds: 15, updatedAt: "2026-09-12T00:00:00.000Z" }
  };
  const resolved = resolveIsometryTarget(targets, "  Side  Pressure ");
  assert.equal(resolved.volumeTargetSeconds, 60);
  assert.equal(resolved.recordTargetSeconds, 15);
  assert.equal(resolved.isCustom, true);
});

test("completion turns volume into a percentage and a training status", () => {
  assert.deepEqual(getIsometryCompletion(null, 60), { percent: 0, status: "nessun-dato" });
  assert.deepEqual(getIsometryCompletion(20, 60), { percent: 33, status: "insufficiente" });
  assert.deepEqual(getIsometryCompletion(45, 60), { percent: 75, status: "vicino" });
  assert.deepEqual(getIsometryCompletion(60, 60), { percent: 100, status: "raggiunto" });
  assert.deepEqual(getIsometryCompletion(80, 60), { percent: 133, status: "superato" });
});

test("record and volume are two different numbers from the same session", () => {
  // Tenute 20s, 25s, 18s -> record 25s (prestazione), volume 63s (lavoro).
  const data = withSession(emptyData(), "2026-09-08", [{ name: "Inside Pressure", record: 25, volume: 63 }]);
  const summary = getIsometrySummary(data, "Inside Pressure");

  assert.equal(summary.recordSeconds, 25);
  assert.equal(summary.lastVolumeSeconds, 63);
  assert.equal(summary.completion.status, "superato");
  assert.equal(summary.sessionsWithIsometry, 1);
});

test("the summary keeps the all-time record and the latest volume, as separate trends", () => {
  let data = emptyData();
  data = withSession(data, "2026-09-01", [{ name: "Cupping", record: 25, volume: 60 }]);
  data = withSession(data, "2026-09-05", [{ name: "Cupping", record: 31, volume: 85 }]);
  data = withSession(data, "2026-09-09", [{ name: "Cupping", record: 28, volume: 70 }]);

  const summary = getIsometrySummary(data, "Cupping");
  assert.equal(summary.recordSeconds, 31);
  assert.equal(summary.recordDate, "2026-09-05");
  assert.equal(summary.lastVolumeSeconds, 70);
  assert.equal(summary.lastVolumeDate, "2026-09-09");
  assert.equal(summary.bestVolumeSeconds, 85);
  assert.deepEqual(summary.recordTrend.map((point) => point.seconds), [25, 31, 28]);
  assert.deepEqual(summary.volumeTrend.map((point) => point.seconds), [60, 85, 70]);
});

test("skipped exercises and other exercises never leak into the summary", () => {
  let data = emptyData();
  data = withSession(data, "2026-09-01", [
    { name: "Cupping", record: 50, volume: 90, notes: "[[skipped]] infortunio" },
    { name: "Pronation", record: 40, volume: 80 }
  ]);
  const summary = getIsometrySummary(data, "Cupping");
  assert.equal(summary.recordSeconds, null);
  assert.equal(summary.lastVolumeSeconds, null);
  assert.equal(summary.completion.status, "nessun-dato");
});

test("isometry names are recognised, ordinary lifts are not", () => {
  assert.equal(isIsometryExerciseName("One Arm Pull Up Iso"), true);
  assert.equal(isIsometryExerciseName("Static Hold"), true);
  assert.equal(isIsometryExerciseName("Front Lever"), true);
  assert.equal(isIsometryExerciseName("Panca Piana"), false);
  assert.equal(hasReachedIsometryTarget(10), true);
  assert.equal(hasReachedIsometryTarget(9), false);
});
