/**
 * Revisione della progressione: confronta quello che il piano prescrive per le
 * prossime sedute con quello che e' stato davvero eseguito, e propone il carico
 * meritato esercizio per esercizio.
 *
 *   node --experimental-strip-types scripts/revisione-progressione.mts
 *   node --experimental-strip-types scripts/revisione-progressione.mts --sedute 2
 *   node --experimental-strip-types scripts/revisione-progressione.mts --applica
 *
 * Senza --applica non scrive nulla: mostra solo la proposta.
 */
import { getProgressionVerdict, type PerformanceSample } from "../lib/arm-tracker/progression.ts";
import { isometryTotalTargetSeconds } from "../lib/arm-tracker/isometry-target.ts";

const API = "https://iron-log-deploy.vercel.app/api/arm-tracker/snapshot";

const args = process.argv.slice(2);
const applica = args.includes("--applica");
const seduteDaRivedere = Number(args[args.indexOf("--sedute") + 1]) || 1;

function normalize(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

const risposta = await fetch(`${API}?t=${Date.now()}`);
const payload = await risposta.json();
const snap = payload.snapshot;

const plan = snap.plans.find((p: any) => p.status === "active");
if (!plan) throw new Error("Nessun piano attivo");

const oggi = new Date().toISOString().slice(0, 10);
const workoutLogs = new Map(snap.workoutLogs.map((w: any) => [w.id, w]));

// Storico per esercizio, dal piu' recente
const storico = new Map<string, PerformanceSample[]>();
for (const log of snap.exerciseLogs) {
  if (log.notes && String(log.notes).startsWith("[[skipped]]")) continue;
  const w: any = workoutLogs.get(log.workoutLogId);
  if (!w) continue;
  const key = normalize(log.exerciseNameSnapshot);
  const arr = storico.get(key) ?? [];
  arr.push({ date: w.performedDate, weight: log.actualWeight, reps: log.actualReps, sets: log.actualSets, seconds: log.actualSeconds });
  storico.set(key, arr);
}
for (const arr of storico.values()) arr.sort((a, b) => b.date.localeCompare(a.date));

const prossime = snap.sessions
  .filter((s: any) => s.planId === plan.id && s.status === "planned" && s.sessionDate >= oggi)
  .sort((a: any, b: any) => a.sessionDate.localeCompare(b.sessionDate))
  .slice(0, seduteDaRivedere);

if (!prossime.length) {
  console.log("Nessuna seduta pianificata da oggi in poi.");
  process.exit(0);
}

let modifiche = 0;
console.log(`PIANO: ${plan.name}\n`);

for (const sessione of prossime) {
  console.log(`=== ${sessione.sessionDate} — ${sessione.dayLabel} ===`);
  console.log(
    "  " +
      "ESERCIZIO".padEnd(32) +
      "PREVISTO".padEnd(14) +
      "ULTIMA VOLTA".padEnd(20) +
      "AZIONE".padEnd(15) +
      "PROPOSTA"
  );

  const esercizi = snap.exercises
    .filter((e: any) => e.sessionId === sessione.id)
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  for (const ex of esercizi) {
    const history = storico.get(normalize(ex.exerciseName)) ?? [];
    const verdetto = getProgressionVerdict({
      exerciseName: ex.exerciseName,
      plannedWeight: ex.plannedWeight,
      plannedReps: ex.plannedReps,
      plannedHoldSeconds: ex.plannedWeight === null ? isometryTotalTargetSeconds : null,
      history
    });

    const ultima = history[0];
    const ultimaTxt = ultima
      ? `${ultima.weight ?? "-"}kg x${ultima.reps ?? "-"} (${ultima.date.slice(5)})`
      : "mai registrato";
    const propostaTxt =
      verdetto.suggestedWeight !== ex.plannedWeight || verdetto.suggestedReps !== ex.plannedReps
        ? `${verdetto.suggestedWeight ?? "-"}kg x${verdetto.suggestedReps ?? "-"}`
        : "invariato";

    console.log(
      "  " +
        ex.exerciseName.slice(0, 30).padEnd(32) +
        `${ex.plannedWeight ?? "-"}kg x${ex.plannedReps ?? "-"}`.padEnd(14) +
        ultimaTxt.padEnd(20) +
        verdetto.action.padEnd(15) +
        propostaTxt
    );
    console.log("      " + verdetto.reason);

    if (applica && (verdetto.action === "aumenta" || verdetto.action === "riduci")) {
      ex.plannedWeight = verdetto.suggestedWeight;
      ex.plannedReps = verdetto.suggestedReps;
      modifiche += 1;
    }
  }
  console.log("");
}

if (applica) {
  if (!modifiche) {
    console.log("Nessuna modifica da applicare.");
    process.exit(0);
  }
  const invio = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot: snap, seedVersion: payload.seedVersion })
  });
  if (!invio.ok) throw new Error(`POST fallito: ${invio.status}`);
  console.log(`Applicate ${modifiche} modifiche al piano.`);
} else {
  console.log("Anteprima: nessuna modifica scritta. Rilancia con --applica per confermare.");
}
