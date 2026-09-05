import assert from "node:assert/strict";
import test from "node:test";

import {
  getIsometryTargetSeconds,
  hasReachedIsometryTarget,
  isometryTotalTargetSeconds
} from "../lib/arm-tracker/isometry-target.ts";

test("every exercise carries the same ten second isometric total", () => {
  // Obiettivo unico e cumulativo: su un carico pesante ci arrivi con due
  // tenute da 5s, su un gesto quasi massimale con cinque da 2s. Una durata
  // scalata per esercizio chiedeva tenute singole impossibili sul pesante.
  assert.equal(isometryTotalTargetSeconds, 10);
  assert.equal(getIsometryTargetSeconds(), 10);
});

test("the target is reached on the accumulated total, however it is split", () => {
  assert.equal(hasReachedIsometryTarget(10), true);
  assert.equal(hasReachedIsometryTarget(12), true);
  assert.equal(hasReachedIsometryTarget(9), false);
  assert.equal(hasReachedIsometryTarget(0), false);
  assert.equal(hasReachedIsometryTarget(null), false);
});
