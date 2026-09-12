import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyArmTrackerData, mergeArmTrackerSnapshots } from "../lib/arm-tracker/storage.ts";
import type { ArmTrackerData } from "../lib/arm-tracker/types.ts";

function cloudLikeSnapshot(): Partial<ArmTrackerData> {
  return {
    plans: [{ id: "plan-1", name: "Blocco", sourceFileName: "x.csv", importedAt: "2026-08-01T00:00:00.000Z", status: "active" }],
    sessions: [
      { id: "s-1", planId: "plan-1", sessionDate: "2026-09-06", dayLabel: "B", weekNumber: 2, notes: null, status: "planned", kind: "planned" }
    ],
    exercises: [
      { id: "e-1", sessionId: "s-1", exerciseName: "Panca Piana", plannedSets: 5, plannedReps: 5, plannedWeight: 100, plannedNotes: null, sortOrder: 0 },
      { id: "e-2", sessionId: "s-1", exerciseName: "Side Pressure", plannedSets: 5, plannedReps: 4, plannedWeight: 35, plannedNotes: null, sortOrder: 1 }
    ],
    workoutLogs: [],
    exerciseLogs: [],
    importRuns: [],
    level100Watchlist: ["Panca Piana", "Stacco da terra", "One Arm Pull Up", "Side Pressure"]
  };
}

test("first load on a new device: the watchlist becomes the principals, whichever side is empty", () => {
  const cloud = cloudLikeSnapshot() as ArmTrackerData;

  const fromEmptyLocal = mergeArmTrackerSnapshots(createEmptyArmTrackerData(), cloud);
  assert.deepEqual(fromEmptyLocal.dashboardConfig.pinned, ["Stacco da terra", "One Arm Pull Up"]);

  const fromCloudFirst = mergeArmTrackerSnapshots(cloud, createEmptyArmTrackerData());
  assert.deepEqual(fromCloudFirst.dashboardConfig.pinned, ["Stacco da terra", "One Arm Pull Up"]);
});

test("an explicit empty config that was never touched is repaired from the watchlist", () => {
  // Il residuo lasciato sul cloud da un merge andato male: config presente,
  // vuota, senza updatedAt. Non e una scelta dell utente.
  const cloud = { ...cloudLikeSnapshot(), dashboardConfig: { pinned: [], hidden: [], order: [] } } as unknown as ArmTrackerData;
  const merged = mergeArmTrackerSnapshots(createEmptyArmTrackerData(), cloud);
  assert.deepEqual(merged.dashboardConfig.pinned, ["Stacco da terra", "One Arm Pull Up"]);
});

test("a config the user emptied on purpose stays empty", () => {
  const cloud = {
    ...cloudLikeSnapshot(),
    dashboardConfig: { pinned: [], hidden: [], order: [], updatedAt: "2026-09-12T10:00:00.000Z" }
  } as unknown as ArmTrackerData;
  const merged = mergeArmTrackerSnapshots(createEmptyArmTrackerData(), cloud);
  assert.deepEqual(merged.dashboardConfig.pinned, []);
  assert.equal(merged.dashboardConfig.updatedAt, "2026-09-12T10:00:00.000Z");
});

test("legacy single-field isometry logs are split into record and volume", () => {
  const cloud = {
    ...cloudLikeSnapshot(),
    workoutLogs: [
      { id: "w-1", planSessionId: "s-1", performedDate: "2026-09-06", bodyweightKg: 90, overallNotes: null, completionStatus: "completed", createdAt: "2026-09-06T10:00:00.000Z" }
    ],
    exerciseLogs: [
      // esercizio normale: il vecchio numero era il TOTALE
      { id: "l-1", workoutLogId: "w-1", planExerciseId: "e-1", exerciseNameSnapshot: "Panca Piana", plannedSetsSnapshot: 5, plannedRepsSnapshot: 5, plannedWeightSnapshot: 100, plannedNotesSnapshot: null, actualWeight: 100, actualReps: 5, actualSets: 5, actualSeconds: 10, notes: null, performedOrder: 0 },
      // isometria pura: il vecchio numero era la tenuta singola
      { id: "l-2", workoutLogId: "w-1", planExerciseId: "e-2", exerciseNameSnapshot: "Static Hold", plannedSetsSnapshot: 3, plannedRepsSnapshot: null, plannedWeightSnapshot: 35, plannedNotesSnapshot: null, actualWeight: 35, actualReps: 1, actualSets: 3, actualSeconds: 5, notes: null, performedOrder: 1 },
      // gia nel formato nuovo: resta com e
      { id: "l-3", workoutLogId: "w-1", planExerciseId: "e-2", exerciseNameSnapshot: "Side Pressure", plannedSetsSnapshot: 5, plannedRepsSnapshot: 4, plannedWeightSnapshot: 35, plannedNotesSnapshot: null, actualWeight: 35, actualReps: 4, actualSets: 5, actualSeconds: 8, actualHoldTotalSeconds: 24, notes: null, performedOrder: 2 }
    ]
  } as unknown as ArmTrackerData;

  const merged = mergeArmTrackerSnapshots(createEmptyArmTrackerData(), cloud);
  const byId = new Map(merged.exerciseLogs.map((log) => [log.id, log]));
  assert.deepEqual([byId.get("l-1")?.actualSeconds, byId.get("l-1")?.actualHoldTotalSeconds], [null, 10]);
  assert.deepEqual([byId.get("l-2")?.actualSeconds, byId.get("l-2")?.actualHoldTotalSeconds], [5, 5]);
  assert.deepEqual([byId.get("l-3")?.actualSeconds, byId.get("l-3")?.actualHoldTotalSeconds], [8, 24]);
});
