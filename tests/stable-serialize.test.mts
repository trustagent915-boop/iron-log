import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyArmTrackerData,
  mergeArmTrackerSnapshots,
  normalizeArmTrackerSnapshot,
  stableSerializeArmTrackerData
} from "../lib/arm-tracker/storage.ts";
import type { ArmTrackerData } from "../lib/arm-tracker/types.ts";

function sample(): ArmTrackerData {
  const data = createEmptyArmTrackerData();
  data.plans.push({ id: "p", name: "Blocco", sourceFileName: "x.csv", importedAt: "2026-08-01T00:00:00.000Z", status: "active" });
  data.sessions.push({ id: "s", planId: "p", sessionDate: "2026-09-06", dayLabel: "B", weekNumber: 2, notes: null, status: "planned", kind: "planned" });
  data.exercises.push({ id: "e", sessionId: "s", exerciseName: "Panca Piana", plannedSets: 5, plannedReps: 5, plannedWeight: 100, plannedNotes: null, sortOrder: 0 });
  return data;
}

test("the same data serialises identically whatever the key order", () => {
  // jsonb restituisce le chiavi in un ordine diverso da quello del client:
  // e il motivo per cui l app riscriveva 3 MB a ogni apertura di pagina.
  const a = sample();
  const reordered = JSON.parse(
    JSON.stringify(a, (key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse())
        : value
    )
  ) as ArmTrackerData;

  assert.notEqual(JSON.stringify(a), JSON.stringify(reordered));
  assert.equal(stableSerializeArmTrackerData(a), stableSerializeArmTrackerData(reordered));
});

test("a normalised snapshot is a fixed point: merging it with nothing changes nothing", () => {
  const cloud = normalizeArmTrackerSnapshot(sample());
  const merged = mergeArmTrackerSnapshots(createEmptyArmTrackerData(), cloud);
  assert.equal(stableSerializeArmTrackerData(merged), stableSerializeArmTrackerData(cloud));
});

test("a real change is still detected", () => {
  const cloud = normalizeArmTrackerSnapshot(sample());
  const changed = normalizeArmTrackerSnapshot({ ...sample(), level100Watchlist: ["Squat"] });
  assert.notEqual(stableSerializeArmTrackerData(changed), stableSerializeArmTrackerData(cloud));
});
