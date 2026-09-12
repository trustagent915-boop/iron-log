import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyDashboardConfig,
  hideExercise,
  isSessionMarkerExerciseName,
  migrateWatchlistToDashboardConfig,
  moveExercise,
  normalizeDashboardConfig,
  pickNewerDashboardConfig,
  pinExercise,
  resolveDashboardSections,
  touchDashboardConfig,
  unhideExercise,
  unpinExercise
} from "../lib/arm-tracker/dashboard-config.ts";

const program = ["Panca Piana", "Side Pressure", "Cupping", "Allenamento braccio di ferro"];

test("migration: what was in the watchlist but not in the programme becomes a principal", () => {
  const config = migrateWatchlistToDashboardConfig(
    ["Panca Piana", "Stacco da terra", "One Arm Pull Up", "Side Pressure"],
    program
  );
  assert.deepEqual(config.pinned, ["Stacco da terra", "One Arm Pull Up"]);
  assert.deepEqual(config.hidden, []);
  assert.deepEqual(config.order, ["Stacco da terra", "One Arm Pull Up"]);
});

test("sections: principals first, then the programme, without session markers", () => {
  const config = pinExercise(createEmptyDashboardConfig(), "Stacco da terra");
  const sections = resolveDashboardSections(config, program);
  assert.deepEqual(sections.principali, ["Stacco da terra"]);
  assert.deepEqual(sections.programma, ["Panca Piana", "Side Pressure", "Cupping"]);
  assert.deepEqual(sections.nascosti, []);
  assert.equal(isSessionMarkerExerciseName("Allenamento braccio di ferro"), true);
});

test("hiding removes from the dashboard only; the name stays recoverable", () => {
  let config = hideExercise(createEmptyDashboardConfig(), "Cupping");
  let sections = resolveDashboardSections(config, program);
  assert.deepEqual(sections.programma, ["Panca Piana", "Side Pressure"]);
  assert.deepEqual(sections.nascosti, ["Cupping"]);

  config = unhideExercise(config, "Cupping");
  sections = resolveDashboardSections(config, program);
  assert.deepEqual(sections.programma, ["Panca Piana", "Side Pressure", "Cupping"]);
});

test("pinning a programme exercise moves it to the principals and out of the programme list", () => {
  const config = pinExercise(createEmptyDashboardConfig(), "Side Pressure");
  const sections = resolveDashboardSections(config, program);
  assert.deepEqual(sections.principali, ["Side Pressure"]);
  assert.deepEqual(sections.programma, ["Panca Piana", "Cupping"]);

  const back = unpinExercise(config, "Side Pressure");
  assert.deepEqual(resolveDashboardSections(back, program).programma, [
    "Panca Piana",
    "Side Pressure",
    "Cupping"
  ]);
});

test("principals can be reordered and the order survives a pin of a new one", () => {
  let config = createEmptyDashboardConfig();
  config = pinExercise(config, "A");
  config = pinExercise(config, "B");
  config = pinExercise(config, "C");
  config = moveExercise(config, "C", -1);
  assert.deepEqual(resolveDashboardSections(config, []).principali, ["A", "C", "B"]);
  config = moveExercise(config, "A", -1); // gia in cima: nessun cambiamento
  assert.deepEqual(resolveDashboardSections(config, []).principali, ["A", "C", "B"]);
  config = pinExercise(config, "D");
  assert.deepEqual(resolveDashboardSections(config, []).principali, ["A", "C", "B", "D"]);
});

test("normalisation drops garbage, duplicates and hidden/pinned conflicts", () => {
  const config = normalizeDashboardConfig({
    pinned: ["Squat", " squat ", 3, null],
    hidden: ["Squat", "Cupping"],
    order: ["Squat", "Squat"]
  });
  assert.deepEqual([config.pinned, config.hidden, config.order], [["Squat"], ["Cupping"], ["Squat"]]);
  const empty = normalizeDashboardConfig("nope");
  assert.deepEqual([empty.pinned, empty.hidden, empty.order], [[], [], []]);
});

test("an untouched empty config never overrides a real one, in either merge order", () => {
  const real = pinExercise(createEmptyDashboardConfig(), "Stacco da terra");
  const empty = createEmptyDashboardConfig();
  assert.deepEqual(pickNewerDashboardConfig(empty, real).pinned, ["Stacco da terra"]);
  assert.deepEqual(pickNewerDashboardConfig(real, empty).pinned, ["Stacco da terra"]);

  // Una modifica reale piu recente vince anche se svuota tutto (unpin di tutto).
  const cleared = touchDashboardConfig(unpinExercise(real, "Stacco da terra"), "2030-01-01T00:00:00.000Z");
  assert.deepEqual(pickNewerDashboardConfig(real, cleared).pinned, []);
});
