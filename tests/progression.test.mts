import assert from "node:assert/strict";
import test from "node:test";

import {
  getProgressionStepKg,
  getProgressionVerdict,
  hasClearedTarget
} from "../lib/arm-tracker/progression.ts";

function sample(over: Partial<{ date: string; weight: number | null; reps: number | null; sets: number | null; seconds: number | null }> = {}) {
  return { date: "2026-09-01", weight: 50, reps: 4, sets: 5, seconds: null, ...over };
}

test("increments follow the steps the programme itself uses", () => {
  // Il blocco sale di 10 kg sui bilancieri grandi e di 5 su tutto il resto.
  assert.equal(getProgressionStepKg("Squat"), 10);
  assert.equal(getProgressionStepKg("Panca Piana"), 10);
  assert.equal(getProgressionStepKg("Rematore"), 10);
  assert.equal(getProgressionStepKg("Military Press"), 10);
  assert.equal(getProgressionStepKg("Pull Up zavorrato"), 5);
  assert.equal(getProgressionStepKg("Side Pressure"), 5);
  assert.equal(getProgressionStepKg("Static Hold"), 5);
  // Manubrio fisso: si progredisce a ripetizioni, non a chili.
  assert.equal(getProgressionStepKg("Hammer Curl"), 0);
});

test("clearing the target earns the next step", () => {
  const verdict = getProgressionVerdict({
    exerciseName: "Pull Up zavorrato",
    plannedWeight: 50,
    plannedReps: 4,
    history: [sample({ weight: 50, reps: 4 })]
  });

  assert.equal(verdict.action, "aumenta");
  assert.equal(verdict.suggestedWeight, 55);
});

test("a fixed dumbbell progresses on reps instead of kilos", () => {
  const verdict = getProgressionVerdict({
    exerciseName: "Hammer Curl",
    plannedWeight: 27.5,
    plannedReps: 7,
    history: [sample({ weight: 27.5, reps: 7 })]
  });

  assert.equal(verdict.action, "aumenta");
  assert.equal(verdict.suggestedWeight, 27.5);
  assert.equal(verdict.suggestedReps, 8);
});

test("one rep short holds the weight instead of pushing it", () => {
  const verdict = getProgressionVerdict({
    exerciseName: "Side Pressure",
    plannedWeight: 35,
    plannedReps: 4,
    history: [sample({ weight: 35, reps: 3 })]
  });

  assert.equal(verdict.action, "mantieni");
  assert.equal(verdict.suggestedWeight, 35);
});

test("missing two or more reps means the load is too high", () => {
  const verdict = getProgressionVerdict({
    exerciseName: "Back Pressure",
    plannedWeight: 40,
    plannedReps: 4,
    history: [sample({ weight: 40, reps: 2 })]
  });

  assert.equal(verdict.action, "riduci");
  assert.equal(verdict.suggestedWeight, 35);
});

test("two sessions stuck at the same weight trigger a deload", () => {
  const verdict = getProgressionVerdict({
    exerciseName: "Cupping",
    plannedWeight: 30,
    plannedReps: 5,
    history: [
      sample({ date: "2026-09-01", weight: 30, reps: 4 }),
      sample({ date: "2026-08-22", weight: 30, reps: 4 })
    ]
  });

  assert.equal(verdict.action, "riduci");
  assert.equal(verdict.suggestedWeight, 25);
  assert.match(verdict.reason, /ferme/);
});

test("no logged performance never invents a jump", () => {
  const verdict = getProgressionVerdict({
    exerciseName: "Pronation",
    plannedWeight: 25,
    plannedReps: 4,
    history: []
  });

  assert.equal(verdict.action, "dati-mancanti");
  assert.equal(verdict.suggestedWeight, 25);
});

test("beating the planned weight counts from what was actually lifted", () => {
  const verdict = getProgressionVerdict({
    exerciseName: "Rematore",
    plannedWeight: 100,
    plannedReps: 5,
    history: [sample({ weight: 110, reps: 5 })]
  });

  assert.equal(verdict.action, "aumenta");
  assert.equal(verdict.suggestedWeight, 120);
});

test("hasClearedTarget requires both the reps and the weight", () => {
  assert.equal(hasClearedTarget(sample({ weight: 50, reps: 4 }), 50, 4), true);
  assert.equal(hasClearedTarget(sample({ weight: 45, reps: 4 }), 50, 4), false);
  assert.equal(hasClearedTarget(sample({ weight: 50, reps: 3 }), 50, 4), false);
});

test("a pure hold progresses on seconds, never on the bodyweight it logs", () => {
  // La iso a un braccio registra il peso corporeo (93 kg). Trattarlo come
  // carico proponeva "sali a 98 kg", che non vuol dire niente.
  const senzaSecondi = getProgressionVerdict({
    exerciseName: "One Arm Pull Up Iso",
    plannedWeight: null,
    plannedReps: null,
    plannedHoldSeconds: 2,
    history: [sample({ weight: 93, reps: null, seconds: null })]
  });

  assert.equal(senzaSecondi.action, "dati-mancanti");
  assert.equal(senzaSecondi.suggestedWeight, null);
  assert.equal(senzaSecondi.suggestedSeconds, 2);

  const sottoTarget = getProgressionVerdict({
    exerciseName: "One Arm Pull Up Iso",
    plannedWeight: null,
    plannedReps: null,
    plannedHoldSeconds: 2,
    history: [sample({ weight: 93, reps: null, seconds: 1 })]
  });
  assert.equal(sottoTarget.action, "mantieni");

  const chiuso = getProgressionVerdict({
    exerciseName: "One Arm Pull Up Iso",
    plannedWeight: null,
    plannedReps: null,
    plannedHoldSeconds: 2,
    history: [sample({ weight: 93, reps: null, seconds: 2 })]
  });
  assert.equal(chiuso.action, "aumenta");
  assert.equal(chiuso.suggestedSeconds, 3);
  assert.equal(chiuso.suggestedWeight, null);
});
