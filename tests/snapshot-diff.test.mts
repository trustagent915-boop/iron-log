import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyArmTrackerData,
  diffArmTrackerSnapshots,
  fullSnapshotExerciseThreshold,
  protectProgrammeFromFullSnapshot,
  isEmptyArmTrackerDiff,
  mergeArmTrackerSnapshots
} from "../lib/arm-tracker/storage.ts";
import type { ArmTrackerData } from "../lib/arm-tracker/types.ts";

function programme(): ArmTrackerData {
  const data = createEmptyArmTrackerData();
  data.plans.push({ id: "p", name: "Blocco", sourceFileName: "x.csv", importedAt: "2026-08-01T00:00:00.000Z", status: "active" });
  data.sessions.push(
    { id: "a5", planId: "p", sessionDate: "2026-10-20", dayLabel: "A", weekNumber: 5, notes: null, status: "planned", kind: "planned" },
    { id: "bdf1", planId: "p", sessionDate: "2026-10-25", dayLabel: "BdF 1", weekNumber: 5, notes: null, status: "planned", kind: "planned" }
  );
  data.exercises.push(
    { id: "squat", sessionId: "a5", exerciseName: "Squat", plannedSets: 2, plannedReps: 5, plannedWeight: 90, plannedNotes: null, sortOrder: 0 },
    { id: "drill", sessionId: "bdf1", exerciseName: "Partenza test velocita", plannedSets: 1, plannedReps: 3, plannedWeight: null, plannedNotes: null, sortOrder: 0 }
  );
  return data;
}

test("a device left open with an old programme no longer undoes changes made meanwhile", () => {
  // Il telefono ha il programma vecchio.
  const phone = programme();

  // Nel frattempo il cloud cambia: sparring spostato, esercizio rinominato.
  const cloud = programme();
  cloud.sessions[1] = { ...cloud.sessions[1], sessionDate: "2026-10-23" };
  cloud.exercises[1] = { ...cloud.exercises[1], exerciseName: "Partenza isometrica con cinghia", plannedSets: 3, plannedReps: 2 };

  // Sul telefono si registra la seduta A.
  const after = structuredClone(phone);
  after.sessions[0] = { ...after.sessions[0], status: "completed" };
  after.workoutLogs.push({
    id: "w1", planSessionId: "a5", performedDate: "2026-10-20", bodyweightKg: null,
    overallNotes: null, completionStatus: "completed", createdAt: "2026-10-20T17:30:00.000Z"
  });

  const diff = diffArmTrackerSnapshots(phone, after);
  assert.deepEqual(diff.sessions.map((s) => s.id), ["a5"]);
  assert.deepEqual(diff.exercises, []);
  assert.deepEqual(diff.workoutLogs.map((w) => w.id), ["w1"]);

  const merged = mergeArmTrackerSnapshots(cloud, diff);
  assert.equal(merged.sessions.find((s) => s.id === "bdf1")?.sessionDate, "2026-10-23");
  assert.equal(merged.exercises.find((e) => e.id === "drill")?.exerciseName, "Partenza isometrica con cinghia");
  assert.equal(merged.sessions.find((s) => s.id === "a5")?.status, "completed");
  assert.equal(merged.workoutLogs.length, 1);

  // Prima della correzione il telefono inviava tutto, e annullava il cloud.
  const oldBehaviour = mergeArmTrackerSnapshots(cloud, after);
  assert.equal(oldBehaviour.sessions.find((s) => s.id === "bdf1")?.sessionDate, "2026-10-25");
});

test("new tombstones travel in the diff, old ones do not", () => {
  const before = programme();
  before.deletedIds.exerciseLogs.push("old");
  const after = structuredClone(before);
  after.deletedIds.exerciseLogs.push("new");
  assert.deepEqual(diffArmTrackerSnapshots(before, after).deletedIds.exerciseLogs, ["new"]);
});

test("no change means an empty diff", () => {
  const before = programme();
  const diff = diffArmTrackerSnapshots(before, structuredClone(before));
  assert.equal(isEmptyArmTrackerDiff(diff), true);
});

test("an old client sending the whole snapshot cannot rewrite the cloud programme", () => {
  const cloud = programme();
  cloud.sessions[1] = { ...cloud.sessions[1], sessionDate: "2026-10-23", status: "skipped" };
  cloud.exercises[1] = { ...cloud.exercises[1], exerciseName: "Partenza isometrica con cinghia" };

  // Client vecchio: programma superato, seduta A appena registrata, e tanti
  // esercizi come un vero snapshot intero.
  const oldClient = programme();
  for (let i = 0; i < fullSnapshotExerciseThreshold; i += 1) {
    const filler = { id: `x${i}`, sessionId: "a5", exerciseName: "Filler", plannedSets: 1, plannedReps: 1, plannedWeight: null, plannedNotes: null, sortOrder: i + 1 };
    oldClient.exercises.push(filler);
    cloud.exercises.push(filler);
  }
  oldClient.sessions[0] = { ...oldClient.sessions[0], status: "completed" };
  oldClient.workoutLogs.push({
    id: "w1", planSessionId: "a5", performedDate: "2026-10-20", bodyweightKg: null,
    overallNotes: null, completionStatus: "completed", createdAt: "2026-10-20T17:30:00.000Z"
  });
  oldClient.exercises.push({ id: "nuovo", sessionId: "a5", exerciseName: "Extra", plannedSets: 1, plannedReps: 1, plannedWeight: null, plannedNotes: null, sortOrder: 9999 });

  const merged = mergeArmTrackerSnapshots(cloud, protectProgrammeFromFullSnapshot(cloud, oldClient));
  const bdf1 = merged.sessions.find((s) => s.id === "bdf1");
  assert.equal(bdf1?.sessionDate, "2026-10-23");
  assert.equal(bdf1?.status, "skipped");
  assert.equal(merged.exercises.find((e) => e.id === "drill")?.exerciseName, "Partenza isometrica con cinghia");
  assert.equal(merged.sessions.find((s) => s.id === "a5")?.status, "completed");
  assert.equal(merged.workoutLogs.length, 1);
  assert.ok(merged.exercises.some((e) => e.id === "nuovo"));
});

test("a small diff passes the server guard untouched", () => {
  const cloud = programme();
  const diff = createEmptyArmTrackerData();
  diff.exercises.push({ ...cloud.exercises[0], plannedWeight: 100 });
  const merged = mergeArmTrackerSnapshots(cloud, protectProgrammeFromFullSnapshot(cloud, diff));
  assert.equal(merged.exercises.find((e) => e.id === "squat")?.plannedWeight, 100);
});
