import assert from "node:assert/strict";
import test from "node:test";

import { getCustomWorkoutValidationState } from "../lib/arm-tracker/custom-workout-validation.ts";

test("blocks custom workout submit when no exercise has a name", () => {
  const state = getCustomWorkoutValidationState({
    sessionDate: "2026-06-08",
    exercises: [
      { exerciseName: "  " },
      { exerciseName: "" }
    ]
  });

  assert.equal(state.canSubmit, false);
  assert.equal(state.message, "Aggiungi almeno un esercizio al custom workout.");
});

test("allows custom workout submit when date and one exercise name are present", () => {
  const state = getCustomWorkoutValidationState({
    sessionDate: "2026-06-08",
    exercises: [
      { exerciseName: "" },
      { exerciseName: "Curl manubri" }
    ]
  });

  assert.equal(state.canSubmit, true);
  assert.equal(state.message, null);
});

test("blocks custom workout submit when the date is missing", () => {
  const state = getCustomWorkoutValidationState({
    sessionDate: "",
    exercises: [{ exerciseName: "Curl manubri" }]
  });

  assert.equal(state.canSubmit, false);
  assert.equal(state.message, "Inserisci la data della sessione.");
});
