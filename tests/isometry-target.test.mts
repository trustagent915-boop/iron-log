import assert from "node:assert/strict";
import test from "node:test";

import {
  getIsometryTargetSeconds,
  hasReachedIsometryTarget
} from "../lib/arm-tracker/isometry-target.ts";

test("the isometric target scales down as the set gets heavier", () => {
  // Meno ripetizioni previste = carico piu' vicino al massimale = tenuta piu'
  // breve. Un obiettivo unico da 10s sarebbe impossibile sulle triple.
  assert.equal(getIsometryTargetSeconds(3), 5);
  assert.equal(getIsometryTargetSeconds(4), 6);
  assert.equal(getIsometryTargetSeconds(5), 8);
  assert.equal(getIsometryTargetSeconds(6), 9);
  assert.equal(getIsometryTargetSeconds(8), 12);

  const pesante = getIsometryTargetSeconds(3);
  const leggero = getIsometryTargetSeconds(8);
  assert.ok(leggero > pesante, "piu' reps deve dare una tenuta piu' lunga");
});

test("the target stays inside the strength range", () => {
  // Tetto a 12s: oltre e' resistenza, non forza.
  assert.equal(getIsometryTargetSeconds(10), 12);
  assert.equal(getIsometryTargetSeconds(20), 12);
  // Pavimento a 5s: sotto non c'e' stimolo isometrico.
  assert.equal(getIsometryTargetSeconds(1), 5);
  assert.equal(getIsometryTargetSeconds(2), 5);
});

test("a pure hold targets the ten seconds that validate a record", () => {
  assert.equal(getIsometryTargetSeconds(null), 10);
  assert.equal(getIsometryTargetSeconds(undefined), 10);
  assert.equal(getIsometryTargetSeconds(0), 10);
});

test("the target is only reached from the target upwards", () => {
  assert.equal(hasReachedIsometryTarget(8, 8), true);
  assert.equal(hasReachedIsometryTarget(9, 8), true);
  assert.equal(hasReachedIsometryTarget(7, 8), false);
  assert.equal(hasReachedIsometryTarget(null, 8), false);
});
