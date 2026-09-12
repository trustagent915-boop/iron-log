import { canonicalizeLevel100ExerciseName, type Level100Exercise } from "@/lib/arm-tracker/level-100";

/** Scala 0-130: sotto 60 rosso, 60-79 arancio, 80-100 verde, oltre 100 "neon". */
export function getLevelNumberClassName(level: number) {
  if (level > 100) return "text-fuchsia-300 drop-shadow-[0_0_14px_rgba(217,70,239,0.95)]";
  if (level >= 80) return "text-emerald-400";
  if (level >= 60) return "text-orange-400";
  return "text-red-400";
}

export function getLevelBarClassName(level: number) {
  if (level > 100) return "bg-fuchsia-300 shadow-[0_0_18px_rgba(217,70,239,0.95)]";
  if (level >= 80) return "bg-emerald-400";
  if (level >= 60) return "bg-orange-400";
  return "bg-red-400";
}

export function getLevelTierLabel(level: number) {
  if (level > 100) return "Neon";
  if (level >= 80) return "Pronto";
  if (level >= 60) return "In corsa";
  return "Da migliorare";
}

export function getLevelProgressPercent(level: number) {
  return Math.min(100, Math.round((Math.max(0, level) / 130) * 100));
}

export function formatRecordMeta(exercise: Level100Exercise) {
  if (exercise.validRecordCount === 0) return "Da segnare";
  if (exercise.bestValidWeight !== null) return `${exercise.bestValidWeight} kg`;
  if (exercise.bestValidReps !== null) return `${exercise.bestValidReps} reps`;
  if (exercise.bestValidSeconds !== null) return `${exercise.bestValidSeconds}s`;
  return "Record valido";
}

/** Esercizi che chiedono attenzione: senza record valido o sotto la soglia "in corsa". */
export function needsAttention(exercise: Level100Exercise) {
  return exercise.validRecordCount === 0 || exercise.level < 60;
}

export function normalizeDashboardName(value: string) {
  return canonicalizeLevel100ExerciseName(value).trim();
}

export function getDashboardExerciseKey(value: string) {
  return normalizeDashboardName(value).toLowerCase();
}
