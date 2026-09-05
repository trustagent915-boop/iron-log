import assert from "node:assert/strict";
import test from "node:test";

import {
  getIsometryTargetSeconds,
  parsePrescribedHoldSeconds,
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

test("a hold prescribed in the programme notes wins over the estimate", () => {
  // Le note del blocco progrediscono 1s -> 2s -> 3s sulla iso a un braccio.
  // Una tenuta a un braccio al peso corporeo e quasi massimale: imporle il
  // default da 10s sarebbe irrealistico e renderebbe l'obiettivo inutile.
  assert.equal(
    getIsometryTargetSeconds(null, "5 tentativi da 1 secondo. Registra il peso corporeo."),
    1
  );
  assert.equal(getIsometryTargetSeconds(null, "5 tentativi da 2 secondi."), 2);
  assert.equal(getIsometryTargetSeconds(null, "5 tentativi da 3 secondi."), 3);
  // Su un intervallo conta il limite alto, che e il vero obiettivo.
  assert.equal(getIsometryTargetSeconds(null, "4 tentativi da 2-3 secondi."), 3);
  // La prescrizione batte anche la stima sulle reps.
  assert.equal(getIsometryTargetSeconds(6, "tenuta da 4 secondi"), 4);
});

test("notes without a prescribed hold fall back to the estimate", () => {
  assert.equal(getIsometryTargetSeconds(null, "5 tentativi puliti."), 10);
  assert.equal(getIsometryTargetSeconds(4, "3 negative leggere. Scarico."), 6);
  assert.equal(getIsometryTargetSeconds(4, null), 6);
});

test("parsePrescribedHoldSeconds reads only real prescriptions", () => {
  assert.equal(parsePrescribedHoldSeconds(null), null);
  assert.equal(parsePrescribedHoldSeconds("4 tentativi tecnici"), null);
  assert.equal(parsePrescribedHoldSeconds("tenuta da 10 secondi"), 10);
});
